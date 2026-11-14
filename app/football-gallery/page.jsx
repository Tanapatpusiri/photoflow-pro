'use client';
import {useEffect,useState} from 'react';
import './gallery.css';

const Icon=({name,size=22})=>{
 const paths={
  camera:<><path d="M14 4h-4l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z"/><circle cx="12" cy="13" r="4"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></>,
  video:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></>,
  arrow:<><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  shield:<><path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
};
export default function FootballGallery() {
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [status,setStatus]=useState('idle');
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('invite')==='invalid'){setStatus('error');setMessage('ลิงก์เชิญหมดอายุหรือถูกยกเลิก กรุณาขอลิงก์ใหม่จากผู้จัดงาน หรือกรอกรหัสอัลบั้ม')}},[]);
 async function enter(e){
  e.preventDefault();
  if(busy)return;
  if(code.trim().length<4){setStatus('error');setMessage('กรุณากรอกรหัสอัลบั้มที่ได้รับจากผู้จัดงาน');return}
  setBusy(true);setStatus('idle');setMessage('');
  try{
   const res=await fetch('/api/football-gallery/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:code.trim()}),cache:'no-store'});
   const data=await res.json();
   if(!res.ok){setStatus('error');setMessage(data.message||'ยังไม่สามารถเข้าอัลบั้มได้ กรุณาติดต่อผู้ดูแล');return}
   if(typeof data.redirect==='string'&&data.redirect.startsWith('/football-gallery/')){window.location.assign(data.redirect);return}
   setStatus('error');setMessage('ไม่พบอัลบั้มที่ได้รับอนุญาต')}
  catch{setStatus('error');setMessage('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่')}
  finally{setBusy(false)}
 }
 return <main className="fg-page">
  <div className="fg-shell">
   <header className="fg-header">
    <div className="fg-brand-icon"><Icon name="camera" size={29}/></div>
    <div className="fg-brand-text"><strong>Football Gallery</strong><span>Private photo albums for families</span></div>
   </header>
   <div className="fg-content">
    <section className="fg-title-section" aria-labelledby="fg-title"><p className="fg-overline">PRIVATE PHOTO GALLERY</p><h1 id="fg-title">ทุกโมเมนต์สำคัญ<br/>อยู่ในภาพถ่าย</h1><p>เลือกรูปการแข่งขันของลูกได้ง่าย ๆ ดาวน์โหลด JPEG, RAW และวิดีโอในคุณภาพต้นฉบับ</p></section>
    <section className="fg-cover" aria-label="แกลเลอรีส่วนตัว">
     <div className="fg-cover-art"><Icon name="image" size={56}/></div>
     <div className="fg-cover-bottom"><span className="fg-private"><Icon name="lock" size={15}/> Private Album</span><h2>ภาพการแข่งขันฟุตบอล</h2><p>เฉพาะผู้ได้รับสิทธิ์เข้าชม</p></div>
    </section>
    <section className="fg-access" aria-label="เข้าชมอัลบั้ม">
     <h2>เข้าชมอัลบั้ม</h2><p className="fg-subtitle">เปิดลิงก์ที่ได้รับทาง LINE หรือกรอกรหัสประจำงาน</p>
     <form onSubmit={enter} noValidate><label htmlFor="fg-code">รหัสอัลบั้ม</label><input id="fg-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="กรอกรหัสจากผู้จัดงาน" value={code} onChange={e=>{setCode(e.target.value);setMessage('');}} aria-invalid={status==='error'}/>
      {message&&<p className="fg-error" role="alert">{message}</p>}
      <button type="submit" disabled={busy} className="fg-primary">{busy?'กำลังตรวจสอบ…':'เข้าสู่อัลบั้ม'}<Icon name="arrow" size={20}/></button>
     </form>
    </section>
    <div className="fg-features"><span><Icon name="lock" size={18}/> Private</span><span><Icon name="image" size={18}/> JPEG + RAW</span><span><Icon name="video" size={18}/> Videos</span></div>
    <div className="fg-notice"><Icon name="shield" size={23}/><div><strong>ความเป็นส่วนตัวของเด็กสำคัญที่สุด</strong><p>ไม่ต้องสมัครสมาชิก ภาพและไฟล์ต้นฉบับจะเข้าถึงได้เมื่อได้รับสิทธิ์จากผู้ดูแลเท่านั้น</p></div></div>
   </div>
   <footer className="fg-footer">หากไม่พบรหัส โปรดติดต่อผู้จัดงานหรือช่างภาพ<br/>เว็บไซต์นี้ยังไม่เปิดเผยอัลบั้มสาธารณะ</footer>
  </div>
 </main>
}