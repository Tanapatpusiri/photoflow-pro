// Google Drive storage driver for original files.
// Scope is drive.file: the app can only see files and folders it created itself,
// never the rest of the owner's Drive. The OAuth refresh token is stored encrypted
// (AES-256-GCM) in fg_settings and never leaves the server; the download Worker only
// receives short-lived access tokens over an authenticated internal call.
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {db} from './football-gallery-server';

export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const AUTH_URL=()=>process.env.GOOGLE_OAUTH_AUTH_URL||'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL=()=>process.env.GOOGLE_OAUTH_TOKEN_URL||'https://oauth2.googleapis.com/token';
export const DRIVE_API=()=>(process.env.GOOGLE_DRIVE_API_BASE||'https://www.googleapis.com').replace(/\/$/,'');
export const DRIVE_CHUNK=8*1024*1024; // resumable chunks must be multiples of 256 KiB
const ROOT_FOLDER_NAME='Football Gallery (PhotoFlow Pro)';

export class DriveError extends Error{constructor(code,status){super(code);this.code=code;this.status=status}}

// ---------- encrypted settings
const settingsKey=()=>createHash('sha256').update(process.env.FG_SESSION_SECRET+':settings-key:v1').digest();
function seal(text){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',settingsKey(),iv);const ct=Buffer.concat([c.update(text,'utf8'),c.final()]);return 'v1:'+Buffer.concat([iv,c.getAuthTag(),ct]).toString('base64')}
function unseal(value){const b=Buffer.from(value.replace(/^v1:/,''),'base64'),d=createDecipheriv('aes-256-gcm',settingsKey(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')}
export async function getSetting(key,{secret=false}={}){
 const q=await db().query('SELECT value FROM fg_settings WHERE key=$1',[key]);
 if(!q.rowCount)return null;
 return secret?unseal(q.rows[0].value):q.rows[0].value;
}
export async function setSetting(key,value,{secret=false}={}){
 await db().query('INSERT INTO fg_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[key,secret?seal(value):value]);
}
export async function deleteSettings(prefix){await db().query("DELETE FROM fg_settings WHERE key LIKE $1",[prefix+'%'])}

// ---------- OAuth (owner connects Drive once from the admin page)
const stateMac=data=>createHmac('sha256',process.env.FG_SESSION_SECRET).update('drive-oauth:'+data).digest('base64url');
export function oauthState(adminId){
 const payload=Buffer.from(JSON.stringify({a:adminId,exp:Date.now()+10*60*1000,n:randomBytes(9).toString('hex')})).toString('base64url');
 return payload+'.'+stateMac(payload);
}
export function readOauthState(state){
 if(typeof state!=='string'||state.length>600)return null;
 const [payload,mac]=state.split('.');
 if(!payload||!mac)return null;
 const expected=stateMac(payload);
 if(mac.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;
 try{const d=JSON.parse(Buffer.from(payload,'base64url').toString());return d.exp>Date.now()?d:null}catch{return null}
}
export const redirectUri=origin=>process.env.GOOGLE_OAUTH_REDIRECT_URI||new URL('/api/football-gallery/admin/google/callback',origin).toString();
export function authorizeUrl(origin,state){
 const u=new URL(AUTH_URL());
 u.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri(origin),response_type:'code',scope:DRIVE_SCOPE,access_type:'offline',prompt:'consent',include_granted_scopes:'false',state}).toString();
 return u.toString();
}
async function tokenRequest(params){
 const r=await fetch(TOKEN_URL(),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,...params})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new DriveError(d.error==='invalid_grant'?'DRIVE_TOKEN_REVOKED':'DRIVE_TOKEN_ERROR',r.status);
 return d;
}
export async function connectWithCode(code,origin){
 const t=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:redirectUri(origin)});
 if(!t.refresh_token)throw new DriveError('DRIVE_NO_REFRESH_TOKEN',400);
 if(typeof t.scope==='string'&&!t.scope.split(' ').includes(DRIVE_SCOPE))throw new DriveError('DRIVE_SCOPE_MISSING',400);
 await setSetting('drive.refresh_token',t.refresh_token,{secret:true});
 cache={token:t.access_token,exp:Date.now()+(Number(t.expires_in)||3600)*1000};
 await setSetting('drive.access_token',JSON.stringify(cache),{secret:true});
 const info=await about().catch(()=>null);
 if(info?.user?.emailAddress)await setSetting('drive.account',info.user.emailAddress);
 await ensureRootFolder(true);
 return info;
}
export async function disconnect(){
 const refresh=await getSetting('drive.refresh_token',{secret:true}).catch(()=>null);
 if(refresh)await fetch((process.env.GOOGLE_OAUTH_REVOKE_URL||'https://oauth2.googleapis.com/revoke')+'?token='+encodeURIComponent(refresh),{method:'POST'}).catch(()=>{});
 cache={token:null,exp:0};
 await db().query("DELETE FROM fg_settings WHERE key IN('drive.refresh_token','drive.access_token','drive.account')");
}

// ---------- access token (cached per instance and in the database for other instances)
let cache={token:null,exp:0};
export async function accessToken({force=false}={}){
 if(!force&&cache.token&&cache.exp>Date.now()+120000)return cache;
 if(!force){
  const stored=await getSetting('drive.access_token',{secret:true}).catch(()=>null);
  if(stored){try{const s=JSON.parse(stored);if(s.token&&s.exp>Date.now()+120000){cache=s;return cache}}catch{}}
 }
 const refresh=await getSetting('drive.refresh_token',{secret:true});
 if(!refresh)throw new DriveError('DRIVE_NOT_CONNECTED',503);
 const t=await tokenRequest({grant_type:'refresh_token',refresh_token:refresh});
 cache={token:t.access_token,exp:Date.now()+(Number(t.expires_in)||3600)*1000};
 await setSetting('drive.access_token',JSON.stringify(cache),{secret:true});
 return cache;
}
async function api(path,{method='GET',headers={},body,json=true,retry=true}={}){
 const {token}=await accessToken();
 const r=await fetch(DRIVE_API()+path,{method,headers:{authorization:'Bearer '+token,...headers},body});
 if(r.status===401&&retry){await accessToken({force:true});return api(path,{method,headers,body,json,retry:false})}
 if(!r.ok){
  const d=await r.json().catch(()=>({}));
  const reason=d?.error?.errors?.[0]?.reason||d?.error?.status||'';
  throw new DriveError(r.status===404?'DRIVE_NOT_FOUND':reason==='storageQuotaExceeded'?'DRIVE_FULL':/rate|quota/i.test(reason)?'DRIVE_RATE_LIMITED':'DRIVE_API_'+r.status,r.status);
 }
 return json?r.json():r;
}
export const about=()=>api('/drive/v3/about?fields='+encodeURIComponent('user(emailAddress,displayName),storageQuota(limit,usage)'));
export async function driveStatus(){
 const connected=!!(await getSetting('drive.refresh_token').catch(()=>null));
 if(!connected)return {connected:false};
 try{const a=await about();return {connected:true,account:a.user?.emailAddress||await getSetting('drive.account'),quota:a.storageQuota||null}}
 catch(e){return {connected:true,error:e.code||'DRIVE_ERROR',account:await getSetting('drive.account').catch(()=>null)}}
}

// ---------- folders (one root folder + one folder per event)
async function createFolder(name,parent,role=parent?'event':'root'){
 const f=await api('/drive/v3/files?fields=id',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',...(parent?{parents:[parent]}:{}),appProperties:{fgRole:role}})});
 return f.id;
}
export async function ensureRootFolder(forceCheck=false){
 const id=await getSetting('drive.root_folder');
 if(id&&!forceCheck)return id;
 if(id){try{const f=await api('/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,trashed');if(!f.trashed)return id}catch(e){if(e.code!=='DRIVE_NOT_FOUND')throw e}}
 const created=await createFolder(ROOT_FOLDER_NAME,null);
 await setSetting('drive.root_folder',created);
 return created;
}
export async function ensureEventFolder(eventId){
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const ev=await client.query('SELECT slug,title,drive_folder_id FROM fg_events WHERE id=$1 FOR UPDATE',[eventId]);
  if(!ev.rowCount)throw new DriveError('EVENT_NOT_FOUND',404);
  let folder=ev.rows[0].drive_folder_id;
  if(!folder){
   folder=await createFolder(ev.rows[0].title.slice(0,80),await ensureRootFolder());
   await client.query('UPDATE fg_events SET drive_folder_id=$2 WHERE id=$1',[eventId,folder]);
  }
  await client.query('COMMIT');
  return folder;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}

// Serialize preview folder creation per event, so concurrent uploads share one folder.
export async function ensurePreviewFolder(eventId){
 const eventFolder=await ensureEventFolder(eventId),key='drive.preview_folder.'+eventId;
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const event=await client.query('SELECT id FROM fg_events WHERE id=$1 FOR UPDATE',[eventId]);
  if(!event.rowCount)throw new DriveError('EVENT_NOT_FOUND',404);
  const setting=await client.query('SELECT value FROM fg_settings WHERE key=$1',[key]);
  let folder=setting.rows[0]?.value;
  if(!folder){
   folder=await createFolder('ภาพตัวอย่าง',eventFolder,'previews');
   await client.query('INSERT INTO fg_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[key,folder]);
  }
  await client.query('COMMIT');
  return folder;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}

// ---------- resumable uploads: the browser sends bytes straight to Google with the session URI
export async function createUploadSession({name,mime,size,parent,appProperties,origin}){
 const {token}=await accessToken();
 const r=await fetch(DRIVE_API()+'/upload/drive/v3/files?uploadType=resumable&fields='+encodeURIComponent('id,size,sha256Checksum,appProperties'),{
  method:'POST',
  headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8','x-upload-content-type':mime,'x-upload-content-length':String(size),...(origin?{origin}:{})},
  body:JSON.stringify({name,mimeType:mime,parents:[parent],appProperties})
 });
 const location=r.headers.get('location');
 if(!r.ok||!location)throw new DriveError(r.status===403?'DRIVE_FULL_OR_FORBIDDEN':'DRIVE_SESSION_FAILED',r.status||502);
 const u=new URL(location);
 if(u.origin!==new URL(DRIVE_API()).origin)throw new DriveError('DRIVE_SESSION_ORIGIN',502);
 return location;
}
// Asks Google how much of the session it has stored. {done:true,file} | {done:false,offset} | {expired:true}
export async function sessionStatus(sessionUri,size){
 const r=await fetch(sessionUri,{method:'PUT',headers:{'content-range':`bytes */${size}`,'content-length':'0'}});
 if(r.status===200||r.status===201)return {done:true,file:await r.json()};
 if(r.status===308){const range=r.headers.get('range');const m=/bytes=0-(\d+)/.exec(range||'');return {done:false,offset:m?Number(m[1])+1:0}}
 if(r.status===404||r.status===410)return {expired:true};
 throw new DriveError('DRIVE_STATUS_'+r.status,502);
}
export async function cancelSession(sessionUri){await fetch(sessionUri,{method:'DELETE'}).catch(()=>{})}
export const fileMeta=id=>api('/drive/v3/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent('id,name,size,mimeType,sha256Checksum,md5Checksum,appProperties,trashed'));
export async function deleteFile(id){try{await api('/drive/v3/files/'+encodeURIComponent(id),{method:'DELETE',json:false})}catch(e){if(e.code!=='DRIVE_NOT_FOUND')throw e}}
export async function readRange(id,start,end){
 const r=await api('/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{range:`bytes=${start}-${end}`},json:false});
 return Buffer.from(await r.arrayBuffer());
}
// Verifies a finished upload against what the browser declared: same app record, size and SHA-256
// as computed by Google from the stored bytes.
export function checkUploaded(file,{fileId,size,sha256}){
 if(!file||file.trashed)return {ok:false,reason:'MISSING'};
 if(file.appProperties?.fgFileId!==fileId)return {ok:false,reason:'WRONG_FILE'};
 if(Number(file.size)!==Number(size))return {ok:false,reason:'SIZE_MISMATCH'};
 if(!file.sha256Checksum)return {ok:false,reason:'CHECKSUM_PENDING',pending:true};
 if(String(file.sha256Checksum).toLowerCase()!==String(sha256).toLowerCase())return {ok:false,reason:'SHA256_MISMATCH'};
 return {ok:true};
}
