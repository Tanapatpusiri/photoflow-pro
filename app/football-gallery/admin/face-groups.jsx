"use client";
import {useEffect,useRef,useState} from 'react';
import {addFaces,faceModel} from './face-model';

const api='/api/football-gallery/admin';
async function read(path,options){
 const response=await fetch(api+path,{cache:'no-store',...options});
 if(!response.ok){
  const data=await response.json().catch(()=>({}));
  throw Error(data.message||'ดำเนินการไม่สำเร็จ');
 }
 return response;
}
function facePortrait(image,box){
 const [x,y,w,h]=box;
 const size=Math.min(Math.max(w,h)*1.35,image.width,image.height);
 const left=Math.min(Math.max(0,x+(w-size)/2),image.width-size);
 const top=Math.min(Math.max(0,y+(h-size)/2),image.height-size);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=112;
 canvas.getContext('2d').drawImage(image,left,top,size,size,0,0,112,112);
 return canvas.toDataURL('image/jpeg',0.8);
}

export default function FaceGroups({eventId,players,autoStart,onStarted,onTagged}){
 const [groups,setGroups]=useState([]),[group,setGroup]=useState(null),[excluded,setExcluded]=useState(new Set()),[player,setPlayer]=useState('');
 const [status,setStatus]=useState(''),[error,setError]=useState(''),[scanning,setScanning]=useState(false),[saving,setSaving]=useState(false);
 const run=useRef(null);
 const processedRequest=useRef(0);
 const saveLock=useRef(false);
 useEffect(()=>()=>run.current?.abort(),[]);
 useEffect(()=>{
  if(autoStart&&autoStart!==processedRequest.current){processedRequest.current=autoStart;onStarted?.();scan()}
 },[autoStart]);

 async function scan(){
  if(run.current||saveLock.current)return;
  const controller=new AbortController(),signal=controller.signal;
  run.current=controller;
  setScanning(true);setError('');setGroup(null);setGroups([]);setStatus('กำลังเตรียมระบบจัดกลุ่มใบหน้า…');
  let checked=0,failed=0;
  const working=[];
  try{
   const model=await faceModel();
   let cursor=null;
   do{
    signal.throwIfAborted();
    const query=new URLSearchParams({event:eventId});
    if(cursor)query.set('cursor',cursor);
    const data=await (await read('/media?'+query,{signal})).json();
    for(const photo of data.items){
     if(photo.kind!=='photo'||!photo.thumb||!['review','published'].includes(photo.status))continue;
     signal.throwIfAborted();
     let image;
     try{
      const path='/face-preview?'+new URLSearchParams({event:eventId,media:photo.id});
      image=await createImageBitmap(await (await read(path,{signal})).blob());
      const result=await model.detect(image);
      const faces=result.face||[];
      addFaces(working,faces,{id:photo.id,thumb:photo.thumb,title:photo.title},model.match.similarity,box=>facePortrait(image,box));
     }catch(err){if(signal.aborted)throw err;failed++}
     finally{image?.close()}
     checked++;
     setStatus('ตรวจแล้ว '+checked.toLocaleString('th-TH')+' รูป · พบ '+working.length.toLocaleString('th-TH')+' กลุ่ม');
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    cursor=data.nextCursor;
   }while(cursor);
   signal.throwIfAborted();
  }catch(err){if(!signal.aborted)setError(err.message)}
  finally{
   if(run.current===controller){
    run.current=null;
    if(!signal.aborted||checked){
     setGroups(working.map(({id,portrait,photos})=>({id,portrait,photos:[...photos.values()]})));
     setStatus((signal.aborted?'หยุดตรวจ · ':'')+'ตรวจ '+checked+' รูป · พบ '+working.length+' กลุ่ม'+(failed?' · โหลดหรือตรวจไม่สำเร็จ '+failed+' รูป':''));
    }else setStatus('หยุดตรวจแล้ว');
    setScanning(false);
   }
  }
 }
 function openGroup(next){
  setGroup(next);setExcluded(new Set());setPlayer('');setError('');
 }
 async function apply(){
  if(saveLock.current||!group||!player)return;
  const ids=group.photos.filter(photo=>!excluded.has(photo.id)).map(photo=>photo.id);
  if(!ids.length)return;
  saveLock.current=true;setSaving(true);setError('');
  let tagged=0;
  try{
   for(let index=0;index<ids.length;index+=500){
    const mediaIds=ids.slice(index,index+500);
    await read('/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'tag-many',eventId,playerId:player,mediaIds})});
    tagged+=mediaIds.length;
   }
   setStatus('บันทึกแท็กแล้ว '+tagged+' รูป');setGroup(null);
   await onTagged?.();
  }catch(err){setError(err.message+(tagged?' · บันทึกแล้ว '+tagged+' รูป':''))}
  finally{saveLock.current=false;setSaving(false)}
 }
 return <section className="fga-face-groups" aria-label="จัดกลุ่มใบหน้า">
  <h3>จัดกลุ่มใบหน้า</h3>
  <p>ระบบเสนอรูปที่น่าจะเป็นคนเดียวกัน เปิดกลุ่มเพื่อตรวจรูป แล้วเลือกนักเตะก่อนบันทึกแท็ก</p>
  <div className="fga-actions">
   {scanning?<button className="fga-chip" type="button" onClick={()=>run.current?.abort()}>หยุดจัดกลุ่ม</button>
    :<button className="fga-chip" type="button" disabled={saving} onClick={scan}>{groups.length?'จัดกลุ่มใหม่':'เริ่มจัดกลุ่มใบหน้า'}</button>}
  </div>
  {status&&<p role="status">{status}</p>}
  {error&&<p className="fga-message" role="alert">{error}</p>}
  {!group&&groups.length>0&&<div className="fga-face-grid">{groups.map(item=>
   <button key={item.id} type="button" onClick={()=>openGroup(item)}><img src={item.portrait} alt="" loading="lazy"/><strong>บุคคลที่ {item.id}</strong><span>{item.photos.length} รูป</span></button>
  )}</div>}
  {group&&<>
   <button className="fga-link" type="button" disabled={saving} onClick={()=>setGroup(null)}>‹ ทุกบุคคล</button>
   <h4>บุคคลที่ {group.id}</h4>
   <div className="fga-face-grid">{group.photos.map(photo=>
    <label key={photo.id}><img src={photo.thumb} alt={photo.title||'รูปในกลุ่ม'} loading="lazy"/><span><input type="checkbox" checked={!excluded.has(photo.id)} disabled={saving} onChange={()=>setExcluded(previous=>{const next=new Set(previous);if(next.has(photo.id))next.delete(photo.id);else next.add(photo.id);return next})}/>ใช้รูปนี้</span></label>
   )}</div>
   <label>เลือกนักเตะ<select value={player} onChange={e=>setPlayer(e.target.value)} disabled={saving||!players.length}>
    <option value="">เลือกชื่อ</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}{p.jersey?' #'+p.jersey:''}</option>)}
   </select></label>
   {!players.length&&<p>เพิ่มรายชื่อนักเตะในอัลบั้มก่อนบันทึกแท็ก</p>}
   <button className="fga-primary" type="button" disabled={saving||!player||excluded.size===group.photos.length} onClick={apply}>{saving?'กำลังบันทึก…':'บันทึกแท็ก '+(group.photos.length-excluded.size)+' รูป'}</button>
  </>}
 </section>;
}
