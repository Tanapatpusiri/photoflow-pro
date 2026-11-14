'use client';
import {useState} from 'react';
const endpoint='/api/football-gallery/admin/upload';
async function digest(file){
 const {createSHA256}=await import('hash-wasm');
 const hasher=await createSHA256();hasher.init();
 const chunk=2*1024*1024;
 for(let pos=0;pos<file.size;pos+=chunk){const bytes=new Uint8Array(await file.slice(pos,pos+chunk).arrayBuffer());hasher.update(bytes)}
 return hasher.digest('hex');
}
function uploadR2(url,file,onProgress){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.floor(e.loaded/e.total*100))};
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('R2 rejected upload: '+xhr.status));
  xhr.onerror=()=>reject(Error('Upload connection interrupted'));xhr.onabort=()=>reject(Error('Upload interrupted'));xhr.send(file);
 });
}
export default function Uploader({eventId}){
 const [files,setFiles]=useState([]),[camera,setCamera]=useState(''),[running,setRunning]=useState(false),[errors,setErrors]=useState([]),[results,setResults]=useState({});
 async function run(){
  if(!eventId||files.length===0||running)return;setRunning(true);setErrors([]);
  const batch=crypto.randomUUID();let cursor=0;
  const worker=async()=>{
   while(cursor<files.length){
    const index=cursor++,f=files[index],key=f.name+'-'+index;
    try{
     setResults(s=>({...s,[key]:'คำนวณ SHA-256…'}));
     const sha256=await digest(f);
     const init=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'init',event:eventId,filename:f.name,bytes:f.size,sha256,mime:f.type||'application/octet-stream',batch,camera})});
     const info=await init.json();if(!init.ok)throw Error(info.message||'เริ่มอัปโหลดไม่สำเร็จ');
     let error;
     for(let attempt=0;attempt<3;attempt++){
      try{await uploadR2(info.url,f,p=>setResults(s=>({...s,[key]:p+'%'})));error=null;break}catch(e){error=e}
     }
     if(error)throw error;
     const complete=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete',fileId:info.fileId})});
     const verified=await complete.json();if(!complete.ok)throw Error(verified.message||'ยืนยันไฟล์ไม่สำเร็จ');
     setResults(s=>({...s,[key]:'อัปโหลดสำเร็จ · รอตรวจสอบสิทธิ์เผยแพร่'}));
    }catch(e){setResults(s=>({...s,[key]:'ผิดพลาด'}));setErrors(s=>[...s,f.name+': '+e.message])}
   }
  };
  await Promise.all([worker(),worker(),worker()]);setRunning(false);
 }
 return <div className="fga-uploader">
  <label>กล้อง/ชุดไฟล์ (ช่วยจับคู่ JPEG + RAW)<input value={camera} onChange={e=>setCamera(e.target.value)} placeholder="ตัวอย่าง: Canon R6 กล้อง 1"/></label>
  <label>เลือก JPEG / RAW / MOV / MP4<input type="file" multiple accept=".jpg,.jpeg,.arw,.cr2,.cr3,.nef,.raf,.dng,.orf,.rw2,.pef,.srw,.3fr,.iiq,.mov,.mp4,.m4v" onChange={e=>{setFiles(Array.from(e.target.files||[]));setResults({});setErrors([])}}/></label>
  <p>{files.length.toLocaleString('th-TH')} ไฟล์ · {(files.reduce((n,f)=>n+f.size,0)/1e9).toFixed(2)} GB</p>
  <button disabled={running||files.length===0} onClick={run}>{running?'กำลังอัปโหลด…':'เริ่มอัปโหลดต้นฉบับ'}</button>
  {files.length>0&&<div className="fga-upload-list">{files.slice(0,100).map((f,i)=><div key={i}><span>{f.name}</span><small>{results[f.name+'-'+i]||'รออัปโหลด'}</small></div>)}{files.length>100&&<p>แสดงสถานะ 100 ไฟล์แรกจาก {files.length} ไฟล์</p>}</div>}
  {errors.length>0&&<div role="alert">{errors.slice(0,12).map((e,i)=><p key={i} className="fga-message">{e}</p>)}</div>}
  <p>ต้นฉบับถูกส่งเข้า Private R2 โดยตรง ไม่ย่อหรือแก้ไขข้อมูลสี ไฟล์จะยังไม่เผยแพร่จนกว่าแอดมินตรวจสอบ SHA-256, Metadata และสิทธิ์ภาพเด็กเสร็จ</p>
 </div>
}