// End-to-end test for Football Gallery over HTTP: admin -> upload (single + resumable multipart)
// -> SHA-256 verification -> preview -> tagging/privacy -> publish -> LINE invite/code -> parent
// browsing -> original + ZIP downloads with SHA-256 round trip -> revocation/removal/permissions.
//
// It creates its own events and uploads its own media. Run it only against a local or
// preview environment that uses a dedicated database and bucket:
//   FG_E2E_BASE=http://localhost:3100 FG_E2E_ADMIN_EMAIL=... FG_E2E_ADMIN_PASSWORD=... \
//   FG_E2E_MEDIA=/path/to/media FG_E2E_THUMBS=/path/to/thumbs node tests/football-gallery-e2e.mjs
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import zlib from 'node:zlib';
import {probeExif} from '../lib/football-gallery-exif.js';

const base=process.env.FG_E2E_BASE||'http://localhost:3100';
const media=process.env.FG_E2E_MEDIA,thumbs=process.env.FG_E2E_THUMBS;
const ADMIN_EMAIL=process.env.FG_E2E_ADMIN_EMAIL,ADMIN_PASSWORD=process.env.FG_E2E_ADMIN_PASSWORD;
if(!media||!thumbs||!ADMIN_EMAIL||!ADMIN_PASSWORD){console.error('Set FG_E2E_MEDIA, FG_E2E_THUMBS, FG_E2E_ADMIN_EMAIL, FG_E2E_ADMIN_PASSWORD');process.exit(2)}
const work='/tmp/fg-e2e-work-'+Date.now();await mkdir(work,{recursive:true});

const results=[];
function check(name,ok,detail=''){results.push({name,ok:!!ok,detail:String(detail).slice(0,300)});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail&&!ok?'  — '+detail:''}`)}
const sha=b=>createHash('sha256').update(b).digest('hex');
const crc32=b=>zlib.crc32(b).toString(16).padStart(8,'0');
// Follows one app redirect manually (keeping headers such as Range), as a browser does.
async function follow(client,path,headers={}){
 const r=await client.req(path,{headers});
 if(r.status<300||r.status>=400)return r;
 const res=await fetch(r.headers.get('location'),{headers});
 const ct=res.headers.get('content-type')||'';
 return {status:res.status,headers:res.headers,res,body:ct.includes('json')?await res.json():null,location:r.headers.get('location')};
}
// Google Drive resumable upload exactly like the browser uploader: aligned chunks with Content-Range.
async function driveChunks(uploadUrl,bytes,from,to,chunkSize,total){
 for(let pos=from;pos<to;pos+=chunkSize){
  const end=Math.min(to,pos+chunkSize);
  const r=await fetch(uploadUrl,{method:'PUT',headers:{'content-range':`bytes ${pos}-${end-1}/${total}`},body:bytes.subarray(pos,end)});
  if(![200,201,308].includes(r.status))throw Error('drive chunk '+r.status+' '+await r.text());
 }
}

class Client{
 constructor(ip){this.jar=new Map();this.ip=ip}
 async req(path,{method='GET',json,headers={},origin=true,redirect='manual'}={}){
  const h={...headers};
  if(json!==undefined)h['content-type']='application/json';
  if(origin===true&&method!=='GET')h.origin=base;else if(typeof origin==='string')h.origin=origin;
  if(this.ip)h['x-real-ip']=this.ip;
  const cookie=[...this.jar].map(([k,v])=>k+'='+v).join('; ');if(cookie)h.cookie=cookie;
  const r=await fetch(path.startsWith('http')?path:base+path,{method,headers:h,body:json!==undefined?JSON.stringify(json):undefined,redirect});
  for(const c of r.headers.getSetCookie()){const kv=c.split(';')[0],i=kv.indexOf('='),k=kv.slice(0,i),v=kv.slice(i+1);if(/max-age=0/i.test(c)||!v)this.jar.delete(k);else this.jar.set(k,v)}
  const ct=r.headers.get('content-type')||'';
  const body=ct.includes('json')?await r.json():null;
  return {status:r.status,body,headers:r.headers,res:r};
 }
}
const admin=new Client('10.0.0.1');

// ---------- upload helper (same protocol as app/football-gallery/admin/upload-client.jsx)
async function upload(eventId,name,{batch,camera='',interruptAfter=0,lie}={}){
 const bytes=await readFile(media+'/'+name);
 const probe=probeExif(new Uint8Array(bytes.subarray(0,262144)))||{};
 const declared=lie?.sha||sha(bytes),declaredBytes=lie?.bytes??bytes.length;
 const init=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'init',event:eventId,filename:lie?.filename||name,bytes:declaredBytes,sha256:declared,crc32:crc32(bytes),batch,camera,capturedAt:probe.capturedAt||undefined,hasGps:typeof probe.hasGps==='boolean'?probe.hasGps:undefined}});
 if(init.status!==201)return {init};
 const info=init.body;let resumed=false;
 if(info.mode==='drive'){
  const total=declaredBytes,cut=interruptAfter?Math.min(bytes.length,interruptAfter*info.chunkSize):bytes.length;
  // A file whose real size differs from the declared size cannot finish on Google's side.
  await driveChunks(info.uploadUrl,bytes,0,cut,info.chunkSize,total).catch(e=>{if(!lie)throw e});
  if(interruptAfter){
   const early=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'complete',fileId:info.fileId}});
   check(`${name}: completing an unfinished Drive upload is refused`,early.status===409,JSON.stringify(early.body));
   const st=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'drive-status',fileId:info.fileId}});
   check(`${name}: resume continues from the offset Google reports (${cut} bytes)`,st.body.offset===cut,JSON.stringify(st.body));
   await driveChunks(st.body.uploadUrl,bytes,st.body.offset,bytes.length,info.chunkSize,total);resumed=true;
  }
 }else if(info.mode==='single'){
  const put=await fetch(info.url,{method:'PUT',headers:{'content-type':info.contentType},body:bytes});
  if(!put.ok)throw Error('PUT '+put.status);
 }else{
  const total=info.partCount,size=info.partSize;
  const sendParts=async numbers=>{
   for(let i=0;i<numbers.length;i+=10){
    const batchNums=numbers.slice(i,i+10);
    const s=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'sign-parts',fileId:info.fileId,parts:batchNums}});
    if(s.status!==200)throw Error('sign '+s.status);
    await Promise.all(batchNums.map(async n=>{const r=await fetch(s.body.urls[n],{method:'PUT',body:bytes.subarray((n-1)*size,Math.min(bytes.length,n*size))});if(!r.ok)throw Error('part '+n+' '+r.status)}));
   }
  };
  const all=Array.from({length:total},(_,i)=>i+1);
  if(interruptAfter){
   await sendParts(all.slice(0,interruptAfter)); // connection "lost" here
   const early=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'complete',fileId:info.fileId}});
   check(`${name}: completing an unfinished multipart upload is refused`,early.status===409,JSON.stringify(early.body));
   const listed=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'list-parts',fileId:info.fileId}});
   const done=new Set(listed.body.uploaded.map(p=>p.number));
   check(`${name}: resume lists ${interruptAfter}/${total} parts already stored`,done.size===interruptAfter,JSON.stringify(listed.body.uploaded?.length));
   await sendParts(all.filter(n=>!done.has(n)));resumed=true;
  }else await sendParts(all);
 }
 const complete=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'complete',fileId:info.fileId}});
 let steps=0,verify;
 if(complete.status===200){
  do{verify=await admin.req('/api/football-gallery/admin/verify-file',{method:'POST',json:{fileId:info.fileId}});steps++}while(verify.status===202&&steps<200);
 }
 return {init,info,complete,verify,steps,resumed,sha:sha(bytes),bytes:bytes.length};
}
async function preview(mediaId,file){
 const jpeg=await readFile(thumbs+'/'+file);
 const i=await admin.req('/api/football-gallery/admin/preview',{method:'POST',json:{action:'init',mediaId,bytes:jpeg.length,sha256:sha(jpeg)}});
 if(i.status!==201)return i;
 const put=i.body.mode==='drive'
  ?await fetch(i.body.uploadUrl,{method:'PUT',headers:{'content-range':`bytes 0-${jpeg.length-1}/${jpeg.length}`},body:jpeg})
  :await fetch(i.body.url,{method:'PUT',headers:{'content-type':'image/jpeg'},body:jpeg});
 if(!put.ok)return {status:put.status};
 return admin.req('/api/football-gallery/admin/preview',{method:'POST',json:{action:'complete',mediaId}});
}
const review=(json)=>admin.req('/api/football-gallery/admin/review',{method:'POST',json});

// ================= 1. admin authentication + CSRF
check('admin API without session -> 401',(await new Client('10.0.0.9').req('/api/football-gallery/admin/events')).status===401);
check('admin login wrong password -> 401',(await admin.req('/api/football-gallery/admin/login',{method:'POST',json:{email:ADMIN_EMAIL,password:'wrong-password-xx'}})).status===401);
const login=await admin.req('/api/football-gallery/admin/login',{method:'POST',json:{email:ADMIN_EMAIL,password:ADMIN_PASSWORD}});
check('admin login -> 200 + httpOnly session cookie',login.status===200&&admin.jar.has('fg_admin'),login.status);
const storage=await admin.req('/api/football-gallery/admin/google');
const DRIVE=storage.body?.driver==='drive';
console.log('storage driver:',DRIVE?'Google Drive':'S3/R2');
if(DRIVE){
 check('Drive: not connected before the owner authorises',storage.body.connected===false);
 const start=await admin.req('/api/football-gallery/admin/google/connect');
 const google=new URL(start.headers.get('location'));
 check('Drive: connect asks Google only for drive.file (offline, consent)',google.searchParams.get('scope')==='https://www.googleapis.com/auth/drive.file'&&google.searchParams.get('access_type')==='offline');
 const consent=await fetch(google,{redirect:'manual'});
 const back=new URL(consent.headers.get('location'));
 const forged=await new Client('10.0.0.66').req(back.pathname+back.search);
 check('Drive: callback without the starting browser cookie is rejected',forged.headers.get('location')?.includes('drive=invalid-state'));
 const cb=await admin.req(back.pathname+back.search);
 check('Drive: owner connects Google Drive',cb.headers.get('location')?.includes('drive=connected'),cb.headers.get('location'));
 const after=await admin.req('/api/football-gallery/admin/google');
 check('Drive: status shows the connected account and quota',after.body.connected&&after.body.account&&after.body.quota,JSON.stringify(after.body));
}
check('CSRF: mutation without Origin -> 403',(await admin.req('/api/football-gallery/admin/events',{method:'POST',json:{title:'x'},origin:false})).status===403);
check('CSRF: mutation from foreign Origin -> 403',(await admin.req('/api/football-gallery/admin/events',{method:'POST',json:{title:'x'},origin:'https://evil.example'})).status===403);
check('CSRF: Origin "null" -> 403 (not a 500)',(await admin.req('/api/football-gallery/admin/events',{method:'POST',json:{title:'x'},origin:'null'})).status===403);

// ================= 2. event + players
const evA=(await admin.req('/api/football-gallery/admin/events',{method:'POST',json:{title:'U10 Bangkok Cup 2026',venue:'สนามกีฬากลาง',date:'2026-11-08'}})).body.event;
check('create event (draft)',evA?.status==='draft',JSON.stringify(evA));
const players={};
for(const [name,jersey] of [['น้องเอ','7'],['น้องบี','10'],['น้องซี','3']]){const r=await admin.req('/api/football-gallery/admin/players',{method:'POST',json:{event:evA.id,name,jersey,team:'Tigers'}});players[name]=r.body.player}
check('create 3 players',Object.values(players).every(p=>p?.id));

// ================= 3. uploads (3 parallel workers like the browser uploader)
const batch1=randomUUID(),batch2=randomUUID();
const queue=[['DSC0001.JPG',batch1,'Sony A1'],['DSC0001.ARW',batch1,'Sony A1'],['DSC0002.ARW',batch1,'Sony A1'],['DSC0002.JPG',batch1,'Sony A1'],['DSC0003.JPG',batch1,'Sony A1'],['PHONE_0042.MP4',batch2,'iPhone'],['IMG_9001.jpg',batch2,'iPhone']];
const up={};
await Promise.all([0,1,2].map(async()=>{while(queue.length){const [n,b,c]=queue.shift();up[n]=await upload(evA.id,n,{batch:b,camera:c})}}));
up['CLIP0001.MOV']=await upload(evA.id,'CLIP0001.MOV',{batch:batch2,camera:'Sony A1',interruptAfter:3});
for(const [n,u] of Object.entries(up))check(`upload ${n}: stored, size + SHA-256 verified from storage`,u.complete?.status===200&&u.verify?.status===200&&u.verify.body.verified&&u.verify.body.sha256===u.sha,`${u.init?.status} ${u.complete?.status} ${JSON.stringify(u.verify?.body)}`);
check('CLIP0001.MOV (150 MB) used a resumable upload and resumed after interruption',['multipart','drive'].includes(up['CLIP0001.MOV'].info?.mode)&&up['CLIP0001.MOV'].resumed,up['CLIP0001.MOV'].info?.mode);
if(DRIVE)check('Drive: SHA-256 confirmed from Google without downloading the file again',up['CLIP0001.MOV'].steps===1);
else check('CLIP0001.MOV verified in several resumable steps (>100 MB no longer blocked)',up['CLIP0001.MOV'].steps>1,`steps=${up['CLIP0001.MOV'].steps}`);
check('JPEG+RAW with same name in one batch are ONE gallery item (DSC0001)',up['DSC0001.JPG'].info.mediaId===up['DSC0001.ARW'].info.mediaId);
check('RAW uploaded before its JPEG still pairs (DSC0002)',up['DSC0002.JPG'].info.mediaId===up['DSC0002.ARW'].info.mediaId);
check('different photos stay separate items',new Set([up['DSC0001.JPG'].info.mediaId,up['DSC0002.JPG'].info.mediaId,up['DSC0003.JPG'].info.mediaId]).size===3);
const dup=await upload(evA.id,'DSC0002.JPG',{batch:randomUUID(),camera:'Sony A1'});
check('re-uploading an identical original is detected as duplicate (409)',dup.init.status===409&&dup.init.body.duplicate===true,dup.init.status);
const evil=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'init',event:evA.id,filename:'index.html',bytes:100,sha256:'a'.repeat(64),batch:'b'}});
check('non-media file types are rejected (index.html -> 400)',evil.status===400);
const evil2=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'init',event:evA.id,filename:'photo.jpg.exe',bytes:100,sha256:'a'.repeat(64),batch:'b'}});
check('double extension rejected (photo.jpg.exe -> 400)',evil2.status===400);
const tampered=await upload(evA.id,'IMG_9001.jpg',{batch:randomUUID(),lie:{filename:'TAMPERED.JPG',sha:sha(Buffer.from('different content'))}});
check('content that does not match its declared SHA-256 fails verification (409)',tampered.complete.status===200&&tampered.verify.status===409&&tampered.verify.body.verified===false,JSON.stringify(tampered.verify?.body));
const short=await upload(evA.id,'IMG_9001.jpg',{batch:randomUUID(),lie:{filename:'SHORT.JPG',sha:'b'.repeat(64),bytes:2668469+1}});
check('stored size differs from declared size -> completion refused (409)',short.complete.status===409,short.complete.status);

// ================= 4. previews
for(const [n,t] of [['DSC0001.JPG','DSC0001.jpg'],['DSC0002.JPG','DSC0002.jpg'],['DSC0003.JPG','DSC0003.jpg'],['IMG_9001.jpg','IMG_9001.jpg'],['PHONE_0042.MP4','PHONE_0042.jpg']]){
 const r=await preview(up[n].info.mediaId,t);check(`preview for ${n}`,r.status===200,r.status);
}
const firstTry=await admin.req('/api/football-gallery/admin/preview',{method:'POST',json:{action:'init',mediaId:up['CLIP0001.MOV'].info.mediaId,bytes:5000,sha256:'c'.repeat(64)}});
const retry=await preview(up['CLIP0001.MOV'].info.mediaId,'PHONE_0042.jpg');
check('preview can be retried after an abandoned attempt (was a UNIQUE violation)',firstTry.status===201&&retry.status===200,`${firstTry.status}/${retry.status}`);
const fake=await preview(up['TAMPERED.JPG']?.info?.mediaId||tampered.info.mediaId,'fake.jpg');
check('a non-JPEG preview is refused (415)',fake.status===415,fake.status);

// ================= 5. review, privacy evidence, approval
const list=await admin.req(`/api/football-gallery/admin/media?event=${evA.id}`);
const item=id=>list.body.items.find(i=>i.id===id);
check('GPS metadata is flagged for review (DSC0001 has GPS)',item(up['DSC0001.JPG'].info.mediaId)?.has_gps===true&&item(up['DSC0002.JPG'].info.mediaId)?.has_gps===false);
const A=players['น้องเอ'].id,B=players['น้องบี'].id,C=players['น้องซี'].id;
const ok=r=>r.status===200;
const evidence={basis:'ความยินยอมผู้ปกครอง (แบบฟอร์ม)',evidence:'FORM-2026-U10-001',confirmed:true};
check('tag one photo with two children (no file copies)',ok(await review({action:'tag',eventId:evA.id,mediaId:up['DSC0001.JPG'].info.mediaId,players:[A,B]})));
const early=await review({action:'approve',eventId:evA.id,mediaId:up['DSC0001.JPG'].info.mediaId,...evidence});
check('approval blocked until every tagged child has a privacy record',early.status===409&&early.body.code==='PLAYER_RIGHTS_NOT_RECORDED',JSON.stringify(early.body));
check('record privacy basis for child A',ok(await review({action:'player-privacy',eventId:evA.id,playerId:A,...evidence})));
check('record privacy basis for child B',ok(await review({action:'player-privacy',eventId:evA.id,playerId:B,...evidence})));
check('approve DSC0001 (JPEG+RAW)',ok(await review({action:'approve',eventId:evA.id,mediaId:up['DSC0001.JPG'].info.mediaId,...evidence})));
await review({action:'tag',eventId:evA.id,mediaId:up['DSC0002.JPG'].info.mediaId,players:[B]});
check('approve DSC0002',ok(await review({action:'approve',eventId:evA.id,mediaId:up['DSC0002.JPG'].info.mediaId,...evidence})));
await review({action:'tag',eventId:evA.id,mediaId:up['DSC0003.JPG'].info.mediaId,players:[C]});
check('DSC0003 (child C, no privacy record) cannot be approved',(await review({action:'approve',eventId:evA.id,mediaId:up['DSC0003.JPG'].info.mediaId,...evidence})).status===409);
await review({action:'tag',eventId:evA.id,mediaId:up['IMG_9001.jpg'].info.mediaId,players:[A]});
check('approve IMG_9001',ok(await review({action:'approve',eventId:evA.id,mediaId:up['IMG_9001.jpg'].info.mediaId,...evidence})));
await review({action:'tag',eventId:evA.id,mediaId:up['CLIP0001.MOV'].info.mediaId,players:[A]});
check('approve CLIP0001.MOV (150 MB video)',ok(await review({action:'approve',eventId:evA.id,mediaId:up['CLIP0001.MOV'].info.mediaId,...evidence})));
check('approve PHONE_0042.MP4',ok(await review({action:'approve',eventId:evA.id,mediaId:up['PHONE_0042.MP4'].info.mediaId,...evidence})));
const bad=await review({action:'approve',eventId:evA.id,mediaId:tampered.info.mediaId,...evidence});
check('file that failed SHA-256 cannot be approved',bad.status===409&&bad.body.code==='INTEGRITY_NOT_VERIFIED',JSON.stringify(bad.body));

// ================= 6. publish + grants
check('LINE link cannot be created before PDPA publish (409)',(await admin.req('/api/football-gallery/admin/grants',{method:'POST',json:{event:evA.id,type:'invite'}})).status===409);
const notice='ผู้ควบคุมข้อมูล: ทีม Tigers ใช้ภาพเพื่อแจกจ่ายให้ผู้ปกครองนักกีฬาในงานนี้เท่านั้น ขอถอดภาพได้ทุกเมื่อผ่านปุ่มในอัลบั้ม';
check('publish without retention date -> 400',(await review({action:'publish-event',eventId:evA.id,notice,confirmed:true})).status===400);
const retention=new Date(Date.now()+180*86400000).toISOString().slice(0,10);
check('publish event with Privacy Notice + retention date',ok(await review({action:'publish-event',eventId:evA.id,notice,retentionUntil:retention,confirmed:true})));
const invite=await admin.req('/api/football-gallery/admin/grants',{method:'POST',json:{event:evA.id,type:'invite',label:'กลุ่ม LINE ผู้ปกครอง U10',days:14}});
check('create LINE invite link (+ openExternalBrowser variant)',invite.status===201&&invite.body.url.includes('/football-gallery/invite/')&&invite.body.externalUrl.includes('openExternalBrowser=1'));
const code=await admin.req('/api/football-gallery/admin/grants',{method:'POST',json:{event:evA.id,type:'code',days:14}});
check('create event code (readable groups, no look-alike characters)',code.status===201&&/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){2}$/.test(code.body.code),code.body.code);
const grants=await admin.req(`/api/football-gallery/admin/grants?event=${evA.id}`);
check('grant list shows metadata only (no token/code values)',grants.body.grants.length===2&&!JSON.stringify(grants.body).includes(code.body.code.replace(/-/g,'')));

// ================= 7. parent via LINE invite
const parent=new Client('10.0.1.1');
const badInvite=await parent.req('/football-gallery/invite/'+'x'.repeat(43));
check('invalid invite -> redirect to access page, no cookie',badInvite.status>=300&&badInvite.status<400&&badInvite.headers.get('location').includes('invite=invalid')&&parent.jar.size===0);
const inv=await parent.req(new URL(invite.body.url).pathname);
check('valid invite -> redirect to album + event-scoped cookie (no sign-up/OTP)',inv.status>=300&&inv.status<400&&inv.headers.get('location').endsWith('/football-gallery/'+evA.slug)&&parent.jar.has('fg_g_'+evA.id.replace(/-/g,'')));
const page=await parent.req('/football-gallery/'+evA.slug);
check('album page renders (200, noindex)',page.status===200);
const ev=await parent.req('/api/football-gallery/events/'+evA.slug);
check('album shows only approved items: 3 photos, 2 videos',ev.status===200&&ev.body.event.photos===3&&ev.body.event.videos===2,JSON.stringify(ev.body?.event));
check('player directory lists only children with a privacy record (A, B; not C)',ev.body.players.map(p=>p.name).sort().join(',')===['น้องบี','น้องเอ'].sort().join(','));
check('event exposes the Privacy Notice and retention date to parents',ev.body.event.privacyNotice===notice&&!!ev.body.event.retentionUntil);
const photos=await parent.req(`/api/football-gallery/events/${evA.slug}/media?kind=photo`);
check('photo list ordered by capture time',photos.body.items.map(i=>i.title).join(',')==='DSC0001,DSC0002,IMG_9001',photos.body.items.map(i=>i.title).join(','));
check('unapproved DSC0003 not listed',!photos.body.items.some(i=>i.id===up['DSC0003.JPG'].info.mediaId));
const pairItem=photos.body.items.find(i=>i.id===up['DSC0001.JPG'].info.mediaId);
check('paired item offers JPEG + RAW originals + preview',['JPEG','RAW','THUMB'].every(v=>pairItem.files.some(f=>f.variant===v)));
const playerA=await parent.req(`/api/football-gallery/events/${evA.slug}/media?kind=photo&player=${A}`);
check('player A photos: DSC0001 + IMG_9001',playerA.body.items.length===2);
const playerAv=await parent.req(`/api/football-gallery/events/${evA.slug}/media?kind=video&player=${A}`);
check('player A videos: CLIP0001',playerAv.body.items.length===1);

async function download(client,path){
 const r=await client.req(path);
 if(r.status!==302)return {status:r.status};
 const signed=await fetch(r.headers.get('location'));
 return {status:signed.status,bytes:Buffer.from(await signed.arrayBuffer()),disposition:signed.headers.get('content-disposition'),location:r.headers.get('location'),type:signed.headers.get('content-type')};
}
for(const n of ['DSC0001.JPG','DSC0001.ARW','CLIP0001.MOV','PHONE_0042.MP4']){
 const d=await download(parent,`/api/football-gallery/events/${evA.slug}/files/${up[n].info.fileId}`);
 check(`download original ${n}: byte-for-byte identical (SHA-256 round trip)`,d.status===200&&sha(d.bytes)===up[n].sha&&d.bytes.length===up[n].bytes,`${d.status} ${d.bytes?.length}`);
 check(`download ${n} is an attachment with the original filename`,d.disposition?.includes('attachment')&&d.disposition.includes(n));
}
const thumbFile=pairItem.files.find(f=>f.variant==='THUMB');
const t=await download(parent,`/api/football-gallery/events/${evA.slug}/files/${thumbFile.id}`);
check('preview is a separate small inline JPEG',t.status===200&&t.bytes.length<200000&&t.bytes[0]===0xff&&t.bytes[1]===0xd8&&t.disposition?.includes('inline'));
const signedOnce=t.location;
if(DRIVE){
 const ttl=JSON.parse(Buffer.from(signedOnce.split('/').pop().split('.')[0],'base64url').toString()).x-Date.now()/1000;
 check('download links are short-lived signed tickets (<= 15 min)',ttl>0&&ttl<=900,ttl);
}else check('signed storage URLs are short-lived (<= 90 s)',/X-Amz-Expires=(\d+)/.exec(signedOnce)?.[1]<=90);
const blocked=await parent.req(`/api/football-gallery/events/${evA.slug}/files/${up['DSC0003.JPG'].info.fileId}`);
check('unapproved original cannot be downloaded even with a valid grant (404)',blocked.status===404);

// ================= 8. Download All (ZIP)
async function zipJob(client,json){return client.req(`/api/football-gallery/events/${evA.slug}/archive`,{method:'POST',json})}
const all=await zipJob(parent,{scope:'event',formats:{jpeg:true,raw:true,video:true}});
check('Download All job: split into several ZIP parts (64 MiB test limit)',all.status===201&&all.body.parts.length>=3,JSON.stringify(all.body?.parts?.map(p=>[p.files,p.bytes])));
const expected=new Map(Object.values(up).filter(u=>u.info).map(u=>[u.sha,u]));
let zipOk=true,zipFiles=0;
for(const p of all.body.parts){
 const r=await follow(parent,p.url);
 const buf=Buffer.from(await r.res.arrayBuffer());
 const file=`${work}/part-${p.index}.zip`;await writeFile(file,buf);
 const lenOk=Number(r.headers.get('content-length'))===buf.length&&buf.length===p.bytes;
 let test='';try{test=execFileSync('unzip',['-t',file]).toString()}catch(e){test='ERR '+e.message}
 const out=`${work}/x${p.index}`;execFileSync('unzip',['-q','-o',file,'-d',out]);
 const sums=(await readFile(out+'/SHA256SUMS.txt','utf8')).trim().split('\n');
 for(const line of sums){const [h,...rest]=line.split('  ');const f=await readFile(out+'/'+rest.join('  '));if(sha(f)!==h||!expected.has(h))zipOk=false;zipFiles++}
 check(`ZIP part ${p.index+1}/${all.body.parts.length}: exact Content-Length, valid archive`,r.status===200&&lenOk&&test.includes('No errors detected'),`${r.status} ${buf.length}/${p.bytes}`);
}
check(`ZIP contents: ${zipFiles} originals byte-identical to uploads (SHA256SUMS.txt)`,zipOk&&zipFiles===all.body.files,`${zipFiles}/${all.body.files}`);
const big=all.body.parts.find(p=>p.bytes>100e6);
const head=await follow(parent,big.url,{range:'bytes=0-999'}),rest=await follow(parent,big.url,{range:'bytes=1000-'});
const joined=Buffer.concat([Buffer.from(await head.res.arrayBuffer()),Buffer.from(await rest.res.arrayBuffer())]);
const whole=await readFile(`${work}/part-${big.index}.zip`);
check('interrupted ZIP download can resume with HTTP Range (206)',head.status===206&&rest.status===206&&Buffer.compare(joined,whole)===0);
const childB=await zipJob(parent,{scope:'player',playerId:B,formats:{jpeg:true,raw:true}});
check('Download all for one child (B): JPEG + RAW of DSC0001, DSC0002',childB.status===201&&childB.body.files===4,childB.body?.files);
const jpegOnly=await zipJob(parent,{scope:'event',formats:{jpeg:true}});
check('JPEG-only export contains 3 JPEG originals',jpegOnly.body.files===3,jpegOnly.body?.files);
const sel=await zipJob(parent,{scope:'selection',mediaIds:[up['IMG_9001.jpg'].info.mediaId],formats:{jpeg:true,raw:true,video:true}});
check('selected-items export',sel.body.files===1);
check('ZIP export without any format -> 400',(await zipJob(parent,{scope:'event',formats:{}})).status===400);
if(DRIVE){
 const many=all.body.parts.every(p=>p.files<=45);
 check('Drive: ZIP parts stay within the Worker Free plan subrequest budget (<= 45 files)',many);
 const fileTicketUrl=(await parent.req(`/api/football-gallery/events/${evA.slug}/files/${up['DSC0002.JPG'].info.fileId}`)).headers.get('location');
 const tampered=fileTicketUrl.replace(/.$/,c=>c==='A'?'B':'A');
 check('Drive: a tampered download ticket is rejected by the Worker',(await fetch(tampered)).status===403);
 globalThis.__staleOriginal=fileTicketUrl;
 globalThis.__staleZip=(await parent.req(childB.body.parts[0].url)).headers.get('location');
}

// ================= 9. permissions
const stranger=new Client('10.0.2.2');
check('no grant: album API -> 403',(await stranger.req('/api/football-gallery/events/'+evA.slug)).status===403);
check('no grant: media list -> 403',(await stranger.req(`/api/football-gallery/events/${evA.slug}/media`)).status===403);
check('no grant: original download -> 403',(await stranger.req(`/api/football-gallery/events/${evA.slug}/files/${up['DSC0001.JPG'].info.fileId}`)).status===403);
check('no grant: ZIP part of someone else\'s job -> 403',(await stranger.req(all.body.parts[0].url)).status===403);
const forged=new Client('10.0.2.3');forged.jar.set('fg_g_'+evA.id.replace(/-/g,''),parent.jar.get('fg_g_'+evA.id.replace(/-/g,'')).replace(/.$/,c=>c==='A'?'B':'A'));
check('tampered grant cookie -> 403',(await forged.req('/api/football-gallery/events/'+evA.slug)).status===403);
const wrongCode=await stranger.req('/api/football-gallery/access',{method:'POST',json:{code:'ZZZZ-ZZZZ-ZZZZ'}});
check('wrong event code -> 403',wrongCode.status===403);
const parent2=new Client('10.0.3.3');
const viaCode=await parent2.req('/api/football-gallery/access',{method:'POST',json:{code:' '+code.body.code.toLowerCase().replace(/-/g,' ')+' '}});
check('event code works typed in lowercase with spaces (backup access)',viaCode.status===200&&viaCode.body.redirect==='/football-gallery/'+evA.slug);
let limited=0;const guesser=new Client('10.0.4.4');
for(let i=0;i<10;i++){const r=await guesser.req('/api/football-gallery/access',{method:'POST',json:{code:'WRONG'+i+'CODE'}});if(r.status===429)limited++}
check('event code guessing is rate limited (429)',limited>0,`429 count ${limited}`);

// ================= 10. second event keeps first access
const evB=(await admin.req('/api/football-gallery/admin/events',{method:'POST',json:{title:'U12 Friendly',date:'2026-11-09'}})).body.event;
const upB=await upload(evB.id,'IMG_9001.jpg',{batch:randomUUID()});
check('same file in a different event is allowed (not a duplicate)',upB.verify?.status===200);
await review({action:'approve',eventId:evB.id,mediaId:upB.info.mediaId,...evidence});
await review({action:'publish-event',eventId:evB.id,notice,retentionUntil:retention,confirmed:true});
const codeB=(await admin.req('/api/football-gallery/admin/grants',{method:'POST',json:{event:evB.id,type:'code'}})).body.code;
check('parent enters a second event code',(await parent.req('/api/football-gallery/access',{method:'POST',json:{code:codeB}})).status===200);
check('access to event A is kept after joining event B (separate cookies)',(await parent.req('/api/football-gallery/events/'+evA.slug)).status===200&&(await parent.req('/api/football-gallery/events/'+evB.slug)).status===200);
const crossCookie=new Client('10.0.5.5');crossCookie.jar.set('fg_g_'+evB.id.replace(/-/g,''),parent.jar.get('fg_g_'+evA.id.replace(/-/g,'')));
check('grant for event A does not open event B',(await crossCookie.req('/api/football-gallery/events/'+evB.slug)).status===403);

// ================= 11. removal request
check('removal request without same-origin -> 403',(await parent.req(`/api/football-gallery/events/${evA.slug}/removal`,{method:'POST',json:{description:'please remove'},origin:false})).status===403);
const rem=await parent.req(`/api/football-gallery/events/${evA.slug}/removal`,{method:'POST',json:{mediaId:up['IMG_9001.jpg'].info.mediaId,description:'ขอถอดภาพนี้ เนื่องจากเห็นหน้าเด็กชัดเจน',contact:'LINE: parent01'}});
check('parent submits removal request',rem.status===201&&rem.body.reference);
const rl=await admin.req(`/api/football-gallery/admin/removals?event=${evA.id}`);
check('admin sees the removal request',rl.body.requests.length===1&&rl.body.requests[0].state==='new');
check('admin completes removal (file hidden)',ok(await admin.req('/api/football-gallery/admin/removals',{method:'POST',json:{id:rl.body.requests[0].id,state:'done',resolution:'ซ่อนภาพแล้ว'}})));
const afterRemoval=await parent.req(`/api/football-gallery/events/${evA.slug}/media?kind=photo`);
check('removed photo no longer listed',!afterRemoval.body.items.some(i=>i.id===up['IMG_9001.jpg'].info.mediaId));
check('removed photo cannot be downloaded',(await parent.req(`/api/football-gallery/events/${evA.slug}/files/${up['IMG_9001.jpg'].info.fileId}`)).status===404);
check('an earlier ZIP containing the removed photo is refused (410)',(await parent.req(sel.body.parts[0].url)).status===410);

// ================= 12. consent withdrawal, suspension, revocation
check('withdraw child B consent',ok(await review({action:'revoke-player-privacy',eventId:evA.id,playerId:B})));
const afterWithdraw=await parent.req('/api/football-gallery/events/'+evA.slug);
check('photos showing child B go back to review; B hidden from directory',afterWithdraw.body.event.photos===0&&!afterWithdraw.body.players.some(p=>p.id===B),JSON.stringify(afterWithdraw.body.event));
check('suspend event',ok(await review({action:'suspend-event',eventId:evA.id})));
check('suspended event is closed to parents',(await parent.req('/api/football-gallery/events/'+evA.slug)).status===404);
check('resume event',ok(await review({action:'resume-event',eventId:evA.id})));
check('resumed event reopens',(await parent.req('/api/football-gallery/events/'+evA.slug)).status===200);
check('revoke the LINE invite',ok(await admin.req('/api/football-gallery/admin/grants',{method:'POST',json:{event:evA.id,action:'revoke',type:'invite',grantId:invite.body.id}})));
check('device that joined via the revoked invite loses access immediately',(await parent.req('/api/football-gallery/events/'+evA.slug)).status===403);
check('revoked invite link no longer works',(await new Client('10.0.6.6').req(new URL(invite.body.url).pathname)).headers.get('location')?.includes('invite=invalid'));
check('code-based access (not revoked) still works',(await parent2.req('/api/football-gallery/events/'+evA.slug)).status===200);
if(DRIVE){
 check('Drive: an already-issued original link stops working once the invite is revoked',(await fetch(globalThis.__staleOriginal)).status===403);
 check('Drive: an already-issued ZIP link stops working once the invite is revoked',(await fetch(globalThis.__staleZip)).status===403);
}

// ================= 13. abort, audit, logout, admin rate limit
const abortInit=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'init',event:evA.id,filename:'BIG_ABORT.MOV',bytes:200*1024*1024,sha256:'d'.repeat(64),crc32:'deadbeef',batch:'abort'}});
const aborted=await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'abort',fileId:abortInit.body.fileId}});
check('abandoned large upload can be aborted and removed',['multipart','drive'].includes(abortInit.body.mode)&&aborted.status===200&&(await admin.req('/api/football-gallery/admin/upload',{method:'POST',json:{action:'list-parts',fileId:abortInit.body.fileId}})).status===404);
const auditLog=await admin.req(`/api/football-gallery/admin/audit?event=${evA.id}`);
const actions=new Set(auditLog.body.entries.map(e=>e.action));
check('audit log records uploads, approvals, grants, downloads, removals',['upload.confirmed','original.integrity-verified','review.approve','grant.create-invite','grant.revoke-invite','download.original','download.archive','removal.requested','removal.done','review.suspend-event'].every(a=>actions.has(a)),[...actions].join(','));
check('admin logout clears the session',ok(await admin.req('/api/football-gallery/admin/login',{method:'DELETE'}))&&(await admin.req('/api/football-gallery/admin/events')).status===401);
const brute=new Client('10.0.7.7');let adminLimited=false;
for(let i=0;i<7;i++){const r=await brute.req('/api/football-gallery/admin/login',{method:'POST',json:{email:ADMIN_EMAIL,password:'guess-'+i+'-xxxxxxxx'}});if(r.status===429)adminLimited=true}
check('admin password guessing is rate limited (429)',adminLimited);
const owner=new Client('10.0.8.8');
check('the real owner can still sign in from another device (no account lockout)',(await owner.req('/api/football-gallery/admin/login',{method:'POST',json:{email:ADMIN_EMAIL,password:ADMIN_PASSWORD}})).status===200);

await rm(work,{recursive:true,force:true});
const failed=results.filter(r=>!r.ok);
console.log(`\n${results.length-failed.length}/${results.length} checks passed`);
await writeFile(process.env.FG_E2E_REPORT||'/tmp/fg-e2e-report.json',JSON.stringify({base,at:new Date().toISOString(),results},null,1));
process.exit(failed.length?1:0);
