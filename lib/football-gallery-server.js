import {Pool} from 'pg';
import {S3Client,GetObjectCommand,PutObjectCommand,HeadObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,ListPartsCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

// Each variable is validated by its own rule. A single shared length rule rejected
// valid short R2 bucket names (for example "fg-originals"), which disabled the whole system.
const isUrl=v=>{try{const u=new URL(v);return ['http:','https:','postgres:','postgresql:'].includes(u.protocol)}catch{return false}};
const envRules={
 DATABASE_URL:v=>isUrl(v),
 R2_ENDPOINT:v=>isUrl(v),
 R2_BUCKET:v=>/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(v),
 R2_ACCESS_KEY_ID:v=>v.length>=16,
 R2_SECRET_ACCESS_KEY:v=>v.length>=16,
 FG_SESSION_SECRET:v=>v.length>=32
};
const envNames=Object.keys(envRules);
export const startupBlockers=()=>envNames.filter(k=>typeof process.env[k]!=='string'||!envRules[k](process.env[k]));
export const configured=()=>startupBlockers().length===0;

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
const bucket=()=>process.env.R2_BUCKET;

export const sha256=t=>createHash('sha256').update(t).digest('hex');
const hmac=s=>createHmac('sha256',process.env.FG_SESSION_SECRET).update(s).digest('base64url');
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid=v=>typeof v==='string'&&UUID.test(v);

// Original file types. The MIME type is decided by the server from the extension;
// the browser-reported type is never trusted or signed into the upload.
const ORIGINAL_TYPES={
 jpg:['JPEG','image/jpeg'],jpeg:['JPEG','image/jpeg'],
 arw:['RAW','image/x-sony-arw'],cr2:['RAW','image/x-canon-cr2'],cr3:['RAW','image/x-canon-cr3'],nef:['RAW','image/x-nikon-nef'],
 raf:['RAW','image/x-fuji-raf'],dng:['RAW','image/x-adobe-dng'],orf:['RAW','image/x-olympus-orf'],rw2:['RAW','image/x-panasonic-rw2'],
 pef:['RAW','image/x-pentax-pef'],srw:['RAW','image/x-samsung-srw'],'3fr':['RAW','image/x-hasselblad-3fr'],iiq:['RAW','image/x-phaseone-iiq'],
 mov:['VIDEO_ORIGINAL','video/quicktime'],mp4:['VIDEO_ORIGINAL','video/mp4'],m4v:['VIDEO_ORIGINAL','video/x-m4v']
};
export function originalType(filename){
 if(typeof filename!=='string')return null;
 const dot=filename.lastIndexOf('.');
 if(dot<1)return null;
 const ext=filename.slice(dot+1).toLowerCase(),entry=ORIGINAL_TYPES[ext];
 return entry?{ext,variant:entry[0],mime:entry[1],base:filename.slice(0,dot)}:null;
}

// CSRF defence for cookie-authenticated mutations: the browser Origin must equal this site.
export function sameOrigin(request){
 const origin=request.headers.get('origin');
 if(!origin||origin==='null')return false;
 try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}
}
export const clientIp=request=>request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';

// Each event has its own grant cookie so opening a second album does not remove access to the first.
export const grantCookieName=eventId=>'fg_g_'+String(eventId).replace(/-/g,'').toLowerCase();
export const GRANT_MAX_AGE=12*3600;
export function issueGrant(eventId,codeId){
 if(!configured())throw Error('Not configured');
 const payload=Buffer.from(JSON.stringify({eventId,codeId,until:Date.now()+GRANT_MAX_AGE*1000,nonce:randomBytes(12).toString('hex')})).toString('base64url');
 return payload+'.'+hmac(payload);
}
export function setGrantCookie(response,eventId,grantId){
 response.cookies.set(grantCookieName(eventId),issueGrant(eventId,grantId),{httpOnly:true,secure:true,sameSite:'lax',maxAge:GRANT_MAX_AGE,path:'/'});
 return response;
}
export function readGrant(cookie){
 if(!configured()||!cookie||typeof cookie!=='string'||cookie.length>1500)return null;
 const [payload,signature,...extra]=cookie.split('.');
 if(extra.length||!payload||!signature)return null;
 const expected=hmac(payload);
 if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
 try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return Number.isFinite(data.until)&&data.until>Date.now()&&isUuid(data.eventId)&&isUuid(data.codeId)?data:null}catch{return null}
}
// Revocation, expiry, suspension and retention are re-checked in the database on every request.
export async function validateGrant(cookie,eventId){
 const grant=readGrant(cookie);
 if(!grant||grant.eventId!==eventId)return null;
 const q=await db().query(`SELECT 1 FROM fg_events e WHERE e.id=$1 AND e.status='published' AND e.privacy_approved_at IS NOT NULL AND (e.retention_until IS NULL OR e.retention_until>=CURRENT_DATE) AND EXISTS(SELECT 1 FROM fg_event_codes c WHERE c.id=$2 AND c.event_id=e.id AND c.revoked_at IS NULL AND c.expires_at>NOW() UNION ALL SELECT 1 FROM fg_invites i WHERE i.id=$2 AND i.event_id=e.id AND i.revoked_at IS NULL AND i.expires_at>NOW())`,[eventId,grant.codeId]);
 return q.rowCount?grant:null;
}
export const grantFor=(request,eventId)=>validateGrant(request.cookies.get(grantCookieName(eventId))?.value,eventId);

const safeFilename=name=>String(name).replace(/[\r\n"\\/]/g,'_').slice(0,180);
export const contentDisposition=(kind,name)=>`${kind}; filename="${safeFilename(name).replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(safeFilename(name))}`;
export async function presignOriginal(key,filename){
 return getSignedUrl(r2(),new GetObjectCommand({Bucket:bucket(),Key:key,ResponseContentDisposition:contentDisposition('attachment',filename)}),{expiresIn:90});
}
export async function presignInline(key){return getSignedUrl(r2(),new GetObjectCommand({Bucket:bucket(),Key:key,ResponseContentDisposition:'inline'}),{expiresIn:90});}
export async function presignUpload(key,mime){
 return getSignedUrl(r2(),new PutObjectCommand({Bucket:bucket(),Key:key,ContentType:mime}),{expiresIn:600});
}
export async function verifyObject(key){return r2().send(new HeadObjectCommand({Bucket:bucket(),Key:key}));}
export async function streamPrivateObject(key,range){return r2().send(new GetObjectCommand({Bucket:bucket(),Key:key,...(range?{Range:range}:{})}));}

// Multipart upload: the upload id stays on the server; the browser only receives short-lived part URLs.
export async function startMultipart(key,mime){
 const r=await r2().send(new CreateMultipartUploadCommand({Bucket:bucket(),Key:key,ContentType:mime}));
 return r.UploadId;
}
export async function presignPart(key,uploadId,partNumber){
 return getSignedUrl(r2(),new UploadPartCommand({Bucket:bucket(),Key:key,UploadId:uploadId,PartNumber:partNumber}),{expiresIn:3600});
}
export async function listUploadedParts(key,uploadId){
 const parts=[];let marker;
 for(let page=0;page<20;page++){
  const r=await r2().send(new ListPartsCommand({Bucket:bucket(),Key:key,UploadId:uploadId,PartNumberMarker:marker,MaxParts:1000}));
  for(const p of r.Parts||[])parts.push({number:p.PartNumber,etag:p.ETag,size:Number(p.Size)});
  if(!r.IsTruncated)break;
  marker=r.NextPartNumberMarker;
 }
 return parts.sort((a,b)=>a.number-b.number);
}
export async function finishMultipart(key,uploadId,parts){
 return r2().send(new CompleteMultipartUploadCommand({Bucket:bucket(),Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts.map(p=>({PartNumber:p.number,ETag:p.etag}))}}));
}
export async function abortMultipart(key,uploadId){return r2().send(new AbortMultipartUploadCommand({Bucket:bucket(),Key:key,UploadId:uploadId}));}

export const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

// Fixed-window rate limit stored in PostgreSQL so it holds across serverless instances.
export async function rateLimit(scope,identity,max,minutes){
 const key=sha256(process.env.FG_SESSION_SECRET+':'+scope+':'+identity);
 const q=await db().query(`INSERT INTO fg_rate_limits(key,attempts,reset_at) VALUES($1,1,NOW()+make_interval(mins=>$2::int)) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN fg_rate_limits.reset_at<NOW() THEN 1 ELSE fg_rate_limits.attempts+1 END, reset_at=CASE WHEN fg_rate_limits.reset_at<NOW() THEN NOW()+make_interval(mins=>$2::int) ELSE fg_rate_limits.reset_at END RETURNING attempts`,[key,minutes]);
 if(Math.random()<0.02)db().query(`DELETE FROM fg_rate_limits WHERE reset_at<NOW()-INTERVAL '1 day'`).catch(()=>{});
 return q.rows[0].attempts<=max;
}
// Reads a window without counting this request (used to count only failed sign-ins per account).
export async function rateLimitCount(scope,identity){
 const key=sha256(process.env.FG_SESSION_SECRET+':'+scope+':'+identity);
 const q=await db().query('SELECT attempts FROM fg_rate_limits WHERE key=$1 AND reset_at>NOW()',[key]);
 return q.rows[0]?.attempts||0;
}
