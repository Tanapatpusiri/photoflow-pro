'use client';
import {useEffect,useState} from 'react';
const api='/api/football-gallery/admin';
async function send(body){const r=await fetch(api+'/album-front',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.message||'บันทึกไม่สำเร็จ');return d}
// Covers are resized in the browser to a JPEG of at most 1600 px, like the photo previews.
async function toJpeg(file){
 const image=await createImageBitmap(file);const ratio=Math.min(1,1600/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('แปลงรูปไม่สำเร็จ')),'image/jpeg',.85));
}
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');

// Front-page card of one album: lock setting and cover (uploaded, or chosen from the album).
export default function AlbumFront({event,onChanged}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[choosing,setChoosing]=useState(false),[photos,setPhotos]=useState([]),[photoPage,setPhotoPage]=useState(0),[hasMorePhotos,setHasMorePhotos]=useState(false),[version,setVersion]=useState(0),[coverOk,setCoverOk]=useState(true);
 const hasCover=!!(event.cover_media_id||event.has_custom_cover);
 useEffect(()=>{setChoosing(false);setPhotos([]);setPhotoPage(0);setHasMorePhotos(false);setError('');setInfo('');setCoverOk(true)},[event.id]);
 useEffect(()=>{setCoverOk(true)},[version,event.cover_media_id,event.has_custom_cover]);
 const run=async(task,ok)=>{if(busy)return;setBusy(true);setError('');setInfo('');try{await task();await onChanged?.();setVersion(v=>v+1);if(ok)setInfo(ok)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const setLocked=locked=>{
  if(!locked&&!confirm('เปิดอัลบั้มนี้ให้ทุกคน?\n\nใครก็ได้ที่เข้าเว็บจะเปิดอัลบั้ม ดูภาพที่อนุมัติแล้ว และดาวน์โหลดไฟล์ต้นฉบับได้ โดยไม่ต้องใช้รหัส'))return;
  run(()=>send({action:locked?'lock':'unlock',event:event.id}),locked?'ล็อกอัลบั้มแล้ว คนที่เปิดโดยไม่ใช้รหัสจะเข้าไม่ได้ทันที':'เปิดอัลบั้มให้ทุกคนแล้ว');
 };
 const upload=file=>run(async()=>{
  if(!file)return;
  const blob=await toJpeg(file),sha256=hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
  const init=await send({action:'cover-init',event:event.id,bytes:blob.size,sha256});
  const r=await fetch(init.uploadUrl,{method:'PUT',headers:{'Content-Range':`bytes 0-${blob.size-1}/${blob.size}`},body:blob});
  if(!r.ok)throw Error('อัปโหลดหน้าปกไม่สำเร็จ ('+r.status+')');
  await send({action:'cover-complete',event:event.id});
 },'ตั้งรูปหน้าปกแล้ว');
 const loadPhotos=(page=1)=>run(async()=>{const r=await fetch(api+'/media?event='+encodeURIComponent(event.id)+'&page='+page,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.message||'โหลดภาพไม่สำเร็จ');const approved=(d.items||[]).filter(i=>i.thumb&&i.status==='published'&&i.publish_allowed!==false);setPhotos(previous=>page===1?approved:[...previous,...approved]);setPhotoPage(page);setHasMorePhotos(!!d.hasMore);setChoosing(true)});
 const openChooser=()=>loadPhotos(1);
 const choose=id=>run(async()=>{await send({action:'cover-media',event:event.id,mediaId:id});setChoosing(false)},'ตั้งรูปหน้าปกแล้ว');
 return <section className="fga-card fga-front">
  <h2>การ์ดบนหน้าแรก</h2>
  <p>{event.status==='published'?'อัลบั้มนี้แสดงเป็นการ์ดบนหน้าแรกของเว็บ':'การ์ดจะแสดงบนหน้าแรกหลังจากเผยแพร่อัลบั้ม'}</p>
  {error&&<div className="fga-message" role="alert">{error}</div>}
  {info&&<div className="fga-message fga-ok" role="status">{info}</div>}
  <div className="fga-front-row">
   <div className="fga-front-card">
    {hasCover&&coverOk?<img src={`${api}/album-front?event=${event.id}&v=${version}`} alt="หน้าปกอัลบั้ม" onError={()=>setCoverOk(false)}/>:<div className="fga-front-empty">{hasCover?'โหลดหน้าปกไม่ได้':event.locked?'ยังไม่มีหน้าปก':'ใช้ภาพแรกที่เผยแพร่'}</div>}
    <strong>{event.title}</strong>{event.locked&&<span>🔒 ล็อก</span>}
   </div>
   <div className="fga-front-controls">
    <fieldset className="fga-front-lock"><legend>ใครเข้าอัลบั้มนี้ได้</legend>
     <label className="fga-check"><input type="radio" name={'lock-'+event.id} checked={!!event.locked} disabled={busy} onChange={()=>setLocked(true)}/><span><b>ล็อก</b> · ต้องใช้รหัสหรือลิงก์จากผู้จัดงาน</span></label>
     <label className="fga-check"><input type="radio" name={'lock-'+event.id} checked={!event.locked} disabled={busy} onChange={()=>setLocked(false)}/><span><b>เปิดให้ทุกคน</b> · ใครก็ดูและดาวน์โหลดได้ ไม่ต้องใช้รหัส</span></label>
    </fieldset>
    <p className="fga-hint">รูปปกจะแสดงบนหน้าแรกของเว็บไซต์แม้อัลบั้มจะล็อกอยู่ กรุณาเลือกรูปที่ได้รับอนุญาตให้เผยแพร่เป็นหน้าปกแล้วเท่านั้น</p>
    <div className="fga-actions">
     <label className="fga-chip fga-file-chip">{busy?'กำลังบันทึก…':'อัปโหลดรูปหน้าปก'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" disabled={busy} onChange={e=>{upload(e.target.files?.[0]);e.target.value=''}}/></label>
     <button className="fga-chip" disabled={busy} onClick={openChooser}>เลือกจากภาพในอัลบั้ม</button>
     {hasCover&&<button className="fga-chip" disabled={busy} onClick={()=>run(()=>send({action:'cover-clear',event:event.id}),'ล้างหน้าปกแล้ว')}>ไม่ใช้หน้าปก</button>}
    </div>
    {event.locked&&!hasCover&&<p className="fga-hint">อัลบั้มที่ล็อกจะไม่แสดงภาพใดเป็นหน้าปกจนกว่าคุณจะเลือกเอง</p>}
   </div>
  </div>
  {choosing&&<div className="fga-front-chooser">
   <div className="fga-row"><strong>แตะภาพที่ต้องการใช้เป็นหน้าปก</strong><button className="fga-chip" onClick={()=>setChoosing(false)}>ปิด</button></div>
   {photos.length===0?<p>ยังไม่มีภาพที่มีภาพตัวอย่างในอัลบั้มนี้</p>:<div className="fga-review-grid">{photos.map(p=><button key={p.id} className={'fga-review-tile'+(event.cover_media_id===p.id?' picked':'')} disabled={busy} onClick={()=>choose(p.id)}><img src={p.thumb} alt="" loading="lazy"/><strong>{p.title||'รูปภาพ'}</strong></button>)}</div>}{hasMorePhotos&&<button className="fga-chip" disabled={busy} onClick={()=>loadPhotos(photoPage+1)}>โหลดภาพเพิ่ม</button>}
  </div>}
 </section>;
}
