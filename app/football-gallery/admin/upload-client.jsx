'use client';
import {useRef,useState} from 'react';
import {probeExif} from '../../../lib/football-gallery-exif';
const endpoint='/api/football-gallery/admin/upload';
const RESUME_KEY='fg_upload_resume_v1';
const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}return {ok:r.ok,status:r.status,data:d}};
const fmtBytes=n=>n>=1e9?(n/1e9).toFixed(2)+' GB':(n/1e6).toFixed(1)+' MB';
const fingerprint=(eventId,f)=>[eventId,f.name,f.size,f.lastModified].join('|');
const readResume=()=>{try{return JSON.parse(localStorage.getItem(RESUME_KEY)||'{}')}catch{return {}}};
const writeResume=(key,value)=>{try{const all=readResume();if(value)all[key]=value;else delete all[key];localStorage.setItem(RESUME_KEY,JSON.stringify(all))}catch{}};

// SHA-256 and CRC32 in one pass over the file. SHA-256 is later confirmed against storage;
// CRC32 is what ZIP downloads need, so they can be streamed without re-reading the original.
async function digest(file,onProgress){
 const {createSHA256,createCRC32}=await import('hash-wasm');
 const sha=await createSHA256(),crc=await createCRC32();sha.init();crc.init();
 const chunk=4*1024*1024;
 for(let pos=0;pos<file.size;pos+=chunk){const bytes=new Uint8Array(await file.slice(pos,pos+chunk).arrayBuffer());sha.update(bytes);crc.update(bytes);onProgress?.(Math.min(1,(pos+chunk)/file.size))}
 return {sha256:sha.digest('hex'),crc32:crc.digest('hex').padStart(8,'0')};
}
// Google Drive answers 308 (Resume Incomplete) for every chunk but the last one.
function put(url,body,contentType,onProgress,signal,headers={}){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('PUT',url);if(contentType)xhr.setRequestHeader('Content-Type',contentType);
  for(const [k,v] of Object.entries(headers))xhr.setRequestHeader(k,v);
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded)};
  xhr.onload=()=>(xhr.status>=200&&xhr.status<300)||xhr.status===308?resolve(xhr.status):reject(Error('Storage ตอบกลับ '+xhr.status));
  xhr.onerror=()=>reject(Error('การเชื่อมต่อขาดระหว่างอัปโหลด'));xhr.onabort=()=>reject(Error('ยกเลิกการอัปโหลด'));
  signal?.addEventListener('abort',()=>xhr.abort(),{once:true});
  xhr.send(body);
 });
}
async function withRetry(task,attempts=4){
 let error;
 for(let i=0;i<attempts;i++){try{return await task()}catch(e){error=e;if(e.message==='ยกเลิกการอัปโหลด')throw e;await new Promise(r=>setTimeout(r,800*2**i))}}
 throw error;
}
async function createPreview(file){
 const image=await createImageBitmap(file);const ratio=Math.min(1,640/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('สร้างภาพตัวอย่างไม่สำเร็จ')),'image/jpeg',.78));
}
// Poster frame for videos the browser can decode (H.264 MP4/MOV). Other codecs simply get no preview.
function videoPoster(file){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),video=document.createElement('video');
  const done=(fn,v)=>{URL.revokeObjectURL(url);fn(v)};
  video.muted=true;video.playsInline=true;video.preload='metadata';video.src=url;
  const timer=setTimeout(()=>done(reject,Error('อ่านวิดีโอไม่ได้')),15000);
  video.onerror=()=>{clearTimeout(timer);done(reject,Error('เบราว์เซอร์นี้เปิดวิดีโอไม่ได้'))};
  video.onloadedmetadata=()=>{video.currentTime=Math.min(1,(video.duration||2)/2)};
  video.onseeked=()=>{clearTimeout(timer);const ratio=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*ratio));c.height=Math.max(1,Math.round(video.videoHeight*ratio));c.getContext('2d').drawImage(video,0,0,c.width,c.height);c.toBlob(b=>b?done(resolve,b):done(reject,Error('สร้างภาพตัวอย่างไม่สำเร็จ')),'image/jpeg',.78)};
 });
}
async function savePreview(mediaId,blob){
 const {sha256}=await digest(blob);
 const init=await post('/api/football-gallery/admin/preview',{action:'init',mediaId,bytes:blob.size,sha256});
 if(init.status===409&&init.data.exists)return;
 if(!init.ok)throw Error(init.data.message||'สร้างภาพตัวอย่างไม่สำเร็จ');
 if(init.data.mode==='drive')await withRetry(()=>put(init.data.uploadUrl,blob,null,null,null,{'Content-Range':`bytes 0-${blob.size-1}/${blob.size}`}));
 else await withRetry(()=>put(init.data.url,blob,'image/jpeg'));
 const complete=await post('/api/football-gallery/admin/preview',{action:'complete',mediaId});
 if(!complete.ok)throw Error(complete.data.message||'ยืนยันภาพตัวอย่างไม่สำเร็จ');
}
async function verify(fileId,onProgress){
 for(let i=0;i<5000;i++){
  const r=await withRetry(async()=>{const x=await post('/api/football-gallery/admin/verify-file',{fileId});if(x.status>=500)throw Error(x.data.message||'ตรวจสอบไม่สำเร็จ');return x});
  if(r.status===202){onProgress?.(r.data.offset/r.data.bytes);continue}
  if(r.ok&&r.data.verified)return true;
  throw Error(r.data.message||'SHA-256 ไม่ตรงกับต้นฉบับ');
 }
 throw Error('ตรวจสอบนานเกินไป');
}
// Resumable upload straight to Google Drive. After any failure the server asks Google how many
// bytes it really holds and the upload continues from there (never from a guess in the browser).
async function driveUpload(info,f,signal,onProgress){
 let offset=info.offset||0,url=info.uploadUrl,failures=0;
 while(offset<f.size){
  const end=Math.min(f.size,offset+info.chunkSize);
  try{await put(url,f.slice(offset,end),null,n=>onProgress(offset+n),signal,{'Content-Range':`bytes ${offset}-${end-1}/${f.size}`});offset=end;failures=0;onProgress(offset)}
  catch(e){
   if(e.message==='ยกเลิกการอัปโหลด'||++failures>6)throw e;
   await new Promise(r=>setTimeout(r,800*2**failures));
   const s=await post(endpoint,{action:'drive-status',fileId:info.fileId});
   if(!s.ok)throw Error(s.data.message||'ตรวจสถานะอัปโหลดไม่สำเร็จ');
   if(s.data.completed)return;
   url=s.data.uploadUrl;offset=s.data.offset;onProgress(offset);
  }
 }
}
async function exifOf(file){
 if(!/\.(jpe?g|arw|cr2|nef|dng|pef|srw|3fr|iiq|orf|rw2)$/i.test(file.name))return null;
 try{return probeExif(new Uint8Array(await file.slice(0,262144).arrayBuffer()))}catch{return null}
}

export default function Uploader({eventId,onUploaded}){
 const [files,setFiles]=useState([]),[camera,setCamera]=useState(''),[running,setRunning]=useState(false),[errors,setErrors]=useState([]),[status,setStatus]=useState({}),[summary,setSummary]=useState(null);
 const controller=useRef(null);
 const set=(key,value)=>setStatus(s=>({...s,[key]:value}));
 async function uploadOne(f,key,batch,signal){
  const resumeKey=fingerprint(eventId,f),saved=readResume()[resumeKey];
  set(key,'กำลังตรวจ Metadata…');
  const exif=await exifOf(f);
  set(key,'คำนวณ SHA-256…');
  const sums=saved?.sha256&&saved?.crc32?saved:await digest(f,p=>set(key,'คำนวณ SHA-256 '+Math.floor(p*100)+'%'));
  const {sha256,crc32}=sums;
  let info=null;
  if(saved?.fileId){const r=await post(endpoint,{action:'list-parts',fileId:saved.fileId});if(r.ok&&!r.data.completed)info={...r.data,resumed:true};else if(r.ok&&r.data.completed)info={fileId:saved.fileId,mediaId:r.data.mediaId,done:true};else writeResume(resumeKey,null)}
  if(!info){
   const capturedAt=exif?.capturedAt||(f.lastModified?new Date(f.lastModified).toISOString():undefined);
   const init=await post(endpoint,{action:'init',event:eventId,filename:f.name,bytes:f.size,sha256,crc32,batch,camera,capturedAt,hasGps:typeof exif?.hasGps==='boolean'?exif.hasGps:undefined});
   if(init.status===409&&init.data.duplicate){set(key,'มีไฟล์นี้ในงานแล้ว · ข้าม');return 'duplicate'}
   if(!init.ok)throw Error(init.data.message||'เริ่มอัปโหลดไม่สำเร็จ');
   info=init.data;writeResume(resumeKey,{fileId:info.fileId,sha256,crc32});
  }
  if(!info.done){
   if(info.mode==='drive'){
    await driveUpload(info,f,signal,n=>set(key,(info.resumed?'อัปโหลดต่อ ':'อัปโหลด ')+Math.floor(n/f.size*100)+'%'));
   }else if(info.mode==='single'){
    await withRetry(()=>put(info.url,f,info.contentType,n=>set(key,'อัปโหลด '+Math.floor(n/f.size*100)+'%'),signal));
   }else{
    const done=new Set((info.uploaded||[]).map(p=>p.number)),total=info.partCount,size=info.partSize;
    let sent=[...done].reduce((n,p)=>n+Math.min(size,f.size-(p-1)*size),0);
    const todo=Array.from({length:total},(_,i)=>i+1).filter(n=>!done.has(n));
    const inflight={};
    const report=()=>set(key,(info.resumed?'อัปโหลดต่อ ':'อัปโหลด ')+Math.floor((sent+Object.values(inflight).reduce((a,b)=>a+b,0))/f.size*100)+'%');
    while(todo.length){
     const group=todo.splice(0,12);
     const signed=await withRetry(async()=>{const s=await post(endpoint,{action:'sign-parts',fileId:info.fileId,parts:group});if(!s.ok)throw Error(s.data.message||'ขอสิทธิ์อัปโหลดไม่สำเร็จ');return s.data.urls});
     let next=0;
     await Promise.all([0,1,2,3].map(async()=>{while(next<group.length){const n=group[next++],start=(n-1)*size,blob=f.slice(start,Math.min(f.size,start+size));
      await withRetry(()=>put(signed[n],blob,null,b=>{inflight[n]=b;report()},signal));
      delete inflight[n];sent+=blob.size;report();}}));
    }
   }
   set(key,'ยืนยันไฟล์กับ Storage…');
   const complete=await withRetry(async()=>{const c=await post(endpoint,{action:'complete',fileId:info.fileId});if(c.status>=500)throw Error(c.data.message);return c});
   if(!complete.ok)throw Error(complete.data.message||'ยืนยันไฟล์ไม่สำเร็จ');
  }
  set(key,'ตรวจ SHA-256 จาก Storage…');
  await verify(info.fileId,p=>set(key,'ตรวจ SHA-256 '+Math.floor(p*100)+'%'));
  writeResume(resumeKey,null);
  try{
   if(/\.jpe?g$/i.test(f.name))await savePreview(info.mediaId,await createPreview(f));
   else if(/\.(mp4|mov|m4v)$/i.test(f.name))await savePreview(info.mediaId,await videoPoster(f));
  }catch(e){setErrors(s=>[...s,f.name+': '+e.message+' (ไฟล์ต้นฉบับอัปโหลดครบแล้ว)'])}
  set(key,'เสร็จ · รอตรวจสิทธิ์ก่อนเผยแพร่');
  return 'ok';
 }
 async function run(){
  if(!eventId||files.length===0||running)return;
  setRunning(true);setErrors([]);setSummary(null);
  controller.current=new AbortController();
  // JPEG and RAW of the same frame must be in the same batch to be paired into one item.
  const batch=crypto.randomUUID();let cursor=0;const counts={ok:0,duplicate:0,failed:0};
  const worker=async()=>{
   while(cursor<files.length&&!controller.current.signal.aborted){
    const index=cursor++,f=files[index],key=f.name+'-'+index;
    try{counts[await uploadOne(f,key,batch,controller.current.signal)]++}
    catch(e){counts.failed++;set(key,'ผิดพลาด · กดเริ่มอีกครั้งเพื่ออัปโหลดต่อ');setErrors(s=>[...s,f.name+': '+e.message])}
   }
  };
  await Promise.all([worker(),worker(),worker()]);
  setRunning(false);setSummary(counts);onUploaded?.();
 }
 const total=files.reduce((n,f)=>n+f.size,0);
 return <div className="fga-uploader">
  <label>กล้อง/ชุดไฟล์ (ช่วยจับคู่ JPEG + RAW)<input value={camera} onChange={e=>setCamera(e.target.value)} placeholder="ตัวอย่าง: Canon R6 กล้อง 1" disabled={running}/></label>
  <label>เลือก JPEG / RAW / MOV / MP4<input type="file" multiple disabled={running} accept=".jpg,.jpeg,.arw,.cr2,.cr3,.nef,.raf,.dng,.orf,.rw2,.pef,.srw,.3fr,.iiq,.mov,.mp4,.m4v" onChange={e=>{setFiles(Array.from(e.target.files||[]));setStatus({});setErrors([]);setSummary(null)}}/></label>
  <p>{files.length.toLocaleString('th-TH')} ไฟล์ · {fmtBytes(total)} · เลือก JPEG และ RAW ของชุดเดียวกันพร้อมกันเพื่อจับคู่เป็นรายการเดียว</p>
  {running?<button onClick={()=>controller.current?.abort()} className="fga-quiet-btn">หยุดชั่วคราว (อัปโหลดต่อได้ภายหลัง)</button>:<button disabled={files.length===0} onClick={run}>{Object.keys(status).length?'อัปโหลดต่อ / ลองใหม่':'เริ่มอัปโหลดต้นฉบับ'}</button>}
  {summary&&<p role="status" className="fga-message">สำเร็จ {summary.ok} · ซ้ำ {summary.duplicate} · ผิดพลาด {summary.failed}</p>}
  {files.length>0&&<div className="fga-upload-list">{files.slice(0,200).map((f,i)=><div key={i}><span>{f.name} · {fmtBytes(f.size)}</span><small>{status[f.name+'-'+i]||'รออัปโหลด'}</small></div>)}{files.length>200&&<p>แสดงสถานะ 200 ไฟล์แรกจาก {files.length.toLocaleString('th-TH')} ไฟล์</p>}</div>}
  {errors.length>0&&<div role="alert">{errors.slice(-12).map((e,i)=><p key={i} className="fga-message">{e}</p>)}</div>}
  <p>ต้นฉบับถูกส่งจากเครื่องนี้เข้าที่เก็บส่วนตัวโดยตรงแบบ byte-for-byte ไม่ย่อ ไม่บีบอัด ไม่แก้สีหรือ Metadata ไฟล์ใหญ่แบ่งส่วนและอัปโหลดต่อจากจุดเดิมได้ ไฟล์จะยังไม่เผยแพร่จนกว่าตรวจ SHA-256 และสิทธิ์ภาพเด็กครบ</p>
 </div>
}
