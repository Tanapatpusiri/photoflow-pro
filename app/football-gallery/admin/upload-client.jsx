'use client';
import {useRef,useState} from 'react';
import {probeExif} from '../../../lib/football-gallery-exif';
import {formatBytes as fmtBytes} from '../../../lib/football-gallery-format';
const endpoint='/api/football-gallery/admin/upload';
const RESUME_KEY='fg_upload_resume_v1';
const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}return {ok:r.ok,status:r.status,data:d}};
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
  throw Error(r.data.message||'ไฟล์ที่อัปโหลดไม่ตรงกับต้นฉบับ กรุณาลองใหม่');
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

// Album status: what is already in the album, independent of the files picked now.
function AlbumStatus({album,onReview}){
 const n=v=>v.toLocaleString('th-TH');
 return <div className="fga-album-status" role="note">
  <strong>สถานะอัลบั้มตอนนี้</strong>
  <p>{album.media>0?`มีภาพ/วิดีโอในอัลบั้มแล้ว ${n(album.media)} รายการ · รอตรวจ ${n(album.pending)} · ${album.live?'อัลบั้มเผยแพร่แล้ว':'ยังไม่เผยแพร่'}`:'อัลบั้มนี้ยังไม่มีภาพ'}</p>
  {album.pending>0&&onReview&&<button className="fga-link" onClick={onReview}>ไปตรวจภาพที่ค้างอยู่ ›</button>}
 </div>;
}
// Steps of this upload round only: they start fresh every time new files are chosen.
function Steps({files,running,progress,summary,album}){
 const uploaded=!!summary&&!summary.stopped&&summary.failed===0&&summary.skipped===0;
 const reviewed=uploaded&&album.pending===0;
 const done=[files>0,uploaded,reviewed,reviewed&&album.live];
 // Only the first unfinished step is the current one.
 const current=done.indexOf(false);
 const n=v=>v.toLocaleString('th-TH');
 const notes=[files>0?n(files)+' ไฟล์':'ยังไม่ได้เลือก',running?`${n(progress)}/${n(files)} ไฟล์`:summary&&summary.failed?`ไม่สำเร็จ ${n(summary.failed)} ไฟล์`:summary&&(summary.stopped||summary.skipped)?'หยุดไว้':'',uploaded&&album.pending>0?`รอตรวจ ${n(album.pending)}`:'',''];
 const steps=['เลือกไฟล์','อัปโหลด','ตรวจภาพ','เผยแพร่'].map((label,i)=>[label,done[i]&&(current===-1||i<current)?'done':i===current?'now':'todo',notes[i]]);
 return <div className="fga-round"><small className="fga-round-title">ขั้นตอนของรอบอัปโหลดนี้</small><ol className="fga-steps" aria-label="ขั้นตอนของรอบอัปโหลดนี้">{steps.map(([label,state,note],i)=><li key={label} className={state} aria-current={state==='now'?'step':undefined}><span>{state==='done'?'✓':i+1}</span><strong>{label}</strong>{note&&<small>{note}</small>}</li>)}</ol></div>;
}

export default function Uploader({eventId,album={media:0,pending:0,live:false},onUploaded,onReview,onPublish}){
 const [files,setFiles]=useState([]),[camera,setCamera]=useState(''),[running,setRunning]=useState(false),[errors,setErrors]=useState([]),[status,setStatus]=useState({}),[summary,setSummary]=useState(null),[progress,setProgress]=useState(0),[failedNames,setFailedNames]=useState([]);
 const controller=useRef(null);
 const set=(key,value)=>setStatus(s=>({...s,[key]:value}));
 async function uploadOne(f,key,batch,signal){
  const resumeKey=fingerprint(eventId,f),saved=readResume()[resumeKey];
  set(key,'กำลังตรวจ Metadata…');
  const exif=await exifOf(f);
  set(key,'กำลังเตรียมไฟล์…');
  const sums=saved?.sha256&&saved?.crc32?saved:await digest(f,p=>set(key,'กำลังเตรียมไฟล์ '+Math.floor(p*100)+'%'));
  const {sha256,crc32}=sums;
  let info=null;
  if(saved?.fileId){const r=await post(endpoint,{action:'list-parts',fileId:saved.fileId});if(r.ok&&!r.data.completed)info={...r.data,resumed:true};else if(r.ok&&r.data.completed)info={fileId:saved.fileId,mediaId:r.data.mediaId,done:true};else writeResume(resumeKey,null)}
  if(!info){
   const capturedAt=exif?.capturedAt||(f.lastModified?new Date(f.lastModified).toISOString():undefined);
   const init=await post(endpoint,{action:'init',event:eventId,filename:f.name,bytes:f.size,sha256,crc32,batch,camera,capturedAt,hasGps:typeof exif?.hasGps==='boolean'?exif.hasGps:undefined});
   if(init.status===409&&init.data.duplicate){set(key,'มีไฟล์นี้ในงานแล้ว · ข้าม');return 'duplicate'}
   if(init.status===409&&init.data.resumable){
    const r=await post(endpoint,{action:'list-parts',fileId:init.data.fileId});
    if(!r.ok)throw Error(r.data.message||'ตรวจสถานะอัปโหลดไม่สำเร็จ');
    info=r.data.completed?{fileId:init.data.fileId,mediaId:r.data.mediaId,done:true}:{...r.data,resumed:true};
   }else{
    if(!init.ok)throw Error(init.data.message||'เริ่มอัปโหลดไม่สำเร็จ');
    info=init.data;
   }
   writeResume(resumeKey,{fileId:info.fileId,sha256,crc32});
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
  set(key,'กำลังตรวจว่าไฟล์ครบถ้วน…');
  await verify(info.fileId,p=>set(key,'ตรวจความครบถ้วน '+Math.floor(p*100)+'%'));
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
  setRunning(true);setErrors([]);setSummary(null);setProgress(0);setFailedNames([]);
  controller.current=new AbortController();
  // JPEG and RAW of the same frame must be in the same batch to be paired into one item.
  const batch=crypto.randomUUID();let cursor=0;const counts={ok:0,duplicate:0,failed:0};
  const worker=async()=>{
   while(cursor<files.length&&!controller.current.signal.aborted){
    const index=cursor++,f=files[index],key=f.name+'-'+index;
    try{counts[await uploadOne(f,key,batch,controller.current.signal)]++}
    catch(e){counts.failed++;setFailedNames(s=>[...s,f.name]);set(key,'ผิดพลาด · กดเริ่มอีกครั้งเพื่ออัปโหลดต่อ');setErrors(s=>[...s,f.name+': '+e.message])}
    setProgress(n=>n+1);
   }
  };
  await Promise.all([worker(),worker(),worker()]);
  const stopped=controller.current.signal.aborted;setRunning(false);setSummary({...counts,skipped:files.length-counts.ok-counts.duplicate-counts.failed,stopped});onUploaded?.();
 }
 const total=files.reduce((n,f)=>n+f.size,0);
 return <div className="fga-uploader">
  <AlbumStatus album={album} onReview={!summary&&!running?onReview:null}/>
  <Steps files={files.length} running={running} progress={progress} summary={summary} album={album}/>
  <label>ชื่อกล้อง (ไม่บังคับ)<input value={camera} onChange={e=>setCamera(e.target.value)} placeholder="เช่น Canon R6 กล้อง 1" disabled={running}/></label>
  <label>เลือกรูปหรือวิดีโอ (เลือกได้หลายไฟล์พร้อมกัน)<input type="file" multiple disabled={running} accept=".jpg,.jpeg,.arw,.cr2,.cr3,.nef,.raf,.dng,.orf,.rw2,.pef,.srw,.3fr,.iiq,.mov,.mp4,.m4v" onChange={e=>{setFiles(Array.from(e.target.files||[]));setStatus({});setErrors([]);setSummary(null)}}/></label>
  <p>เลือกแล้ว {files.length.toLocaleString('th-TH')} ไฟล์ · {fmtBytes(total)} · ถ้ามีไฟล์ JPEG และ RAW ของรูปเดียวกัน ให้เลือกพร้อมกัน ระบบจะรวมเป็นรูปเดียว</p>
  {running?<button onClick={()=>controller.current?.abort()} className="fga-quiet-btn">หยุดชั่วคราว (อัปโหลดต่อได้ภายหลัง)</button>:<button disabled={files.length===0} onClick={run}>{Object.keys(status).length?'อัปโหลดต่อ / ลองใหม่':'เริ่มอัปโหลด'}</button>}
  {running&&<div className="fga-progress" role="progressbar" aria-valuemin={0} aria-valuemax={files.length} aria-valuenow={progress} aria-label="ความคืบหน้าการอัปโหลด"><i style={{width:(files.length?progress/files.length*100:0)+'%'}}/></div>}
  {summary&&<div role="status" className="fga-summary">
   <strong>{summary.stopped?'หยุดอัปโหลดไว้ชั่วคราว':summary.failed?'อัปโหลดเสร็จ แต่มีบางไฟล์ไม่สำเร็จ':'อัปโหลดเสร็จแล้ว'}</strong>
   <dl><div><dt>สำเร็จ</dt><dd>{summary.ok.toLocaleString('th-TH')}</dd></div><div><dt>มีอยู่แล้ว (ข้าม)</dt><dd>{summary.duplicate.toLocaleString('th-TH')}</dd></div><div className={summary.failed?'bad':''}><dt>ไม่สำเร็จ</dt><dd>{summary.failed.toLocaleString('th-TH')}</dd></div>{summary.skipped>0&&<div><dt>ยังไม่ได้เริ่ม</dt><dd>{summary.skipped.toLocaleString('th-TH')}</dd></div>}</dl>
   {failedNames.length>0&&<p>ไฟล์ที่ไม่สำเร็จ: {failedNames.slice(0,10).join(', ')}{failedNames.length>10?` และอีก ${failedNames.length-10} ไฟล์`:''} · กด "อัปโหลดต่อ / ลองใหม่" ระบบจะอัปโหลดเฉพาะไฟล์ที่ยังไม่ครบ ไฟล์ที่สำเร็จแล้วจะถูกข้าม</p>}
   {summary.duplicate>0&&<p>ไฟล์ที่ "มีอยู่แล้ว" คือไฟล์เดียวกันที่เคยอัปโหลดเข้าอัลบั้มนี้ ระบบไม่เก็บซ้ำ</p>}
   {(summary.ok>0||album.pending>0)&&onReview&&<button className="fga-primary" onClick={onReview}>ไปตรวจภาพ{album.pending>0?` (รอตรวจ ${album.pending.toLocaleString('th-TH')})`:''} ›</button>}
  </div>}
  {!summary&&!running&&files.length===0&&album.media>0&&album.pending===0&&!album.live&&onPublish&&<button className="fga-quiet-btn" onClick={onPublish}>ตรวจครบแล้ว ไปเผยแพร่ ›</button>}
  {files.length>0&&<div className="fga-upload-list">{files.slice(0,200).map((f,i)=><div key={i}><span>{f.name} · {fmtBytes(f.size)}</span><small>{status[f.name+'-'+i]||'รออัปโหลด'}</small></div>)}{files.length>200&&<p>แสดงสถานะ 200 ไฟล์แรกจาก {files.length.toLocaleString('th-TH')} ไฟล์</p>}</div>}
  {errors.length>0&&<div role="alert">{errors.slice(-12).map((e,i)=><p key={i} className="fga-message">{e}</p>)}</div>}
  <p>ระบบเก็บไฟล์ต้นฉบับตามจริง ไม่ย่อขนาดและไม่แก้ไขรูป ถ้าอัปโหลดค้างหรือหยุดไว้ กลับมากดอัปโหลดต่อได้ ผู้ปกครองจะยังมองไม่เห็นรูปจนกว่าคุณจะตรวจภาพและกดเผยแพร่</p>
 </div>
}
