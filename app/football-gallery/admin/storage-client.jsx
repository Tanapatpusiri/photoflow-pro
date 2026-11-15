'use client';
import {useEffect,useState} from 'react';
const api='/api/football-gallery/admin/google';
const RESULT={connected:'เชื่อม Google Drive แล้ว',denied:'ยกเลิกการอนุญาต Google Drive',['invalid-state']:'ลิงก์เชื่อมต่อหมดอายุหรือไม่ได้เริ่มจากเบราว์เซอร์นี้ กรุณากดเชื่อมใหม่',failed:'เชื่อม Google Drive ไม่สำเร็จ กรุณาลองใหม่',['no-refresh-token']:'Google ไม่ส่งสิทธิ์ระยะยาว กรุณาถอดสิทธิ์แอปใน Google Account แล้วเชื่อมใหม่',['not-configured']:'ยังไม่ได้ตั้งค่า Google OAuth บนเซิร์ฟเวอร์',forbidden:'เฉพาะเจ้าของระบบเท่านั้นที่เชื่อม Google Drive ได้'};
const tb=n=>(Number(n)/1e12).toFixed(2)+' TB';
// Shown only when FG_STORAGE=drive: lets the owner connect the Google Drive that stores originals.
export default function StorageCard(){
 const [state,setState]=useState(null),[message,setMessage]=useState(''),[ok,setOk]=useState(false),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch(api,{cache:'no-store'});setState(r.ok?await r.json():null)}catch{setState(null)}}
 useEffect(()=>{
  const q=new URLSearchParams(location.search).get('drive');
  if(q){setMessage(RESULT[q]||'');setOk(q==='connected');history.replaceState(null,'',location.pathname)}
  load();
 },[]);
 async function disconnect(){
  if(busy||!confirm('ยกเลิกการเชื่อม Google Drive? ไฟล์เดิมยังอยู่ใน Drive แต่ระบบจะอัปโหลดและให้ดาวน์โหลดไม่ได้จนกว่าจะเชื่อมใหม่'))return;
  setBusy(true);
  try{const r=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'disconnect'})});const d=await r.json().catch(()=>({}));setOk(false);setMessage(r.ok?'ยกเลิกการเชื่อมแล้ว':d.message||'ดำเนินการไม่สำเร็จ');await load()}
  finally{setBusy(false)}
 }
 if(!state||state.driver!=='drive')return null;
 const q=state.quota,free=q?.limit?Number(q.limit)-Number(q.usage||0):null;
 return <section className="fga-card"><h2>ที่เก็บต้นฉบับ · Google Drive</h2>
  {message&&<div className={'fga-message'+(ok?' fga-ok':'')} role="status">{message}</div>}
  {state.connected?<>
   <p>เชื่อมกับ {state.account||'บัญชี Google'} แล้ว{free!=null?` · พื้นที่ว่าง ${tb(free)} จาก ${tb(q.limit)}`:''}</p>
   {state.error&&<p className="fga-message" role="alert">ติดต่อ Google Drive ไม่ได้ในขณะนี้ ({state.error}) ถ้าเพิ่งเปลี่ยนรหัสผ่านหรือถอดสิทธิ์ ให้เชื่อมใหม่</p>}
   <p>ต้นฉบับเก็บในโฟลเดอร์ "Football Gallery (PhotoFlow Pro)" ห้ามแชร์โฟลเดอร์นี้หรือแก้ไขไฟล์ในนั้นด้วยมือ</p>
   <div className="fga-actions"><a className="fga-quiet-btn" href={api+'/connect'}>เชื่อมบัญชีใหม่</a><button className="fga-quiet-btn" disabled={busy} onClick={disconnect}>ยกเลิกการเชื่อม</button></div>
  </>:<>
   <p>ยังไม่ได้เชื่อม Google Drive ระบบจะยังอัปโหลดต้นฉบับไม่ได้ เจ้าของระบบกดปุ่มด้านล่างแล้วอนุญาตให้แอปสร้างและอ่านเฉพาะไฟล์ที่แอปสร้างเอง (drive.file)</p>
   <a className="fga-button" href={api+'/connect'}>เชื่อม Google Drive</a>
  </>}
 </section>;
}
