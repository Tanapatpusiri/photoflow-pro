import {Pool} from 'pg';
import {S3Client,GetObjectCommand,PutObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

const envNames=['DATABASE_URL','R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','FG_SESSION_SECRET'];
export const configured=()=>envNames.every(k=>typeof process.env[k]==='string'&&process.env[k].length>12);
export const startupBlockers=()=>envNames.filter(k=>!process.env[k]||process.env[k].length<=12);
let pool;
export function db(){
 if(!configured())throw Error('Football Gallery infrastructure not configured');
 if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:8000,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
 return pool;
}
let storage;
function r2(){
 if(!configured())throw Error('Private R2 storage not configured');
 if(!storage)storage=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},forcePathStyle:true});
 return storage;
}
export const sha256=t=>createHash('sha256').update(t).digest('hex');
const hmac=s=>createHmac('sha256',process.env.FG_SESSION_SECRET).update(s).digest('base64url');
export function issueGrant(eventId,codeId){
 if(!configured())throw Error('Not configured');
 const payload=Buffer.from(JSON.stringify({eventId,codeId,until:Date.now()+12*3600000,nonce:randomBytes(12).toString('hex')})).toString('base64url');
 return payload+'.'+hmac(payload);
}
export function readGrant(cookie){
 if(!configured()||!cookie||typeof cookie!=='string'||cookie.length>1500)return null;
 const [payload,signature,...extra]=cookie.split('.');
 if(extra.length||!payload||!signature)return null;
 const expected=hmac(payload);
 if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
 try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return Number.isFinite(data.until)&&data.until>Date.now()&&typeof data.eventId==='string'&&typeof data.codeId==='string'?data:null}catch{return null}
}
export async function validateGrant(cookie,eventId){
 const grant=readGrant(cookie);
 if(!grant||grant.eventId!==eventId)return null;
 const q=await db().query(`SELECT 1 FROM fg_events e WHERE e.id=$1 AND e.status='published' AND EXISTS(SELECT 1 FROM fg_event_codes c WHERE c.id=$2 AND c.event_id=e.id AND c.revoked_at IS NULL AND c.expires_at>NOW() UNION SELECT 1 FROM fg_invites i WHERE i.id=$2 AND i.event_id=e.id AND i.revoked_at IS NULL AND i.expires_at>NOW())`,[eventId,grant.codeId]);
 return q.rowCount?grant:null;
}
export async function presignOriginal(key,filename){
 if(!configured())throw Error('Not configured');
 const safeName=filename.replace(/[\r\n"\\]/g,'_').slice(0,180);
 return getSignedUrl(r2(),new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,ResponseContentDisposition:`attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`}),{expiresIn:90});
}
export async function presignUpload(key,mime){
 return getSignedUrl(r2(),new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,ContentType:mime}),{expiresIn:600});
}
export async function verifyObject(key){return r2().send(new HeadObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}));}
export const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};

export async function streamPrivateObject(key){return r2().send(new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}));}
