'use client';
import {useEffect,useRef,useState} from 'react';
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
 const [albums,setAlbums]=useState(null),[broken,setBroken]=useState({});
 const [accessOpen,setAccessOpen]=useState(false),[selectedAlbum,setSelectedAlbum]=useState('');
 const codeInput=useRef(null);
 useEffect(()=>{fetch('/api/football-gallery/albums',{cache:'no-store'}).then(r=>r.json()).then(d=>setAlbums(d.albums||[])).catch(()=>setAlbums([]))},[]);
 // A locked album needs the code from the organiser: take the visitor to the code box.
 const askCode=title=>{setSelectedAlbum(title);setStatus('idle');setMessage('');setAccessOpen(true)};
 const closeAccess=()=>{if(busy)return;setAccessOpen(false);setStatus('idle');setMessage('');setCode('')};
 useEffect(()=>{if(!accessOpen)return;const t=setTimeout(()=>codeInput.current?.focus(),80);const dismiss=e=>{if(e.key==='Escape'&&!busy)closeAccess()};window.addEventListener('keydown',dismiss);return()=>{clearTimeout(t);window.removeEventListener('keydown',dismiss)}},[accessOpen,busy]);
 const fmtDate=v=>v?new Date(v).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}):'';
 useEffect(()=>{const invite=new URLSearchParams(window.location.search).get('invite');if(invite==='invalid'){setAccessOpen(true);setStatus('error');setMessage('ลิงก์เชิญหมดอายุหรือถูกยกเลิก กรุณาขอลิงก์ใหม่จากผู้จัดงาน หรือกรอกรหัสอัลบั้ม')}else if(invite==='suspended'){setAccessOpen(true);setStatus('error');setMessage('ผู้จัดงานปิดอัลบั้มนี้ไว้ชั่วคราว กรุณาติดต่อผู้จัดงาน')}},[]);
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
    <a className="fg-admin-link" href="/admin">จัดการหลังบ้าน</a>
   </header>
   <div className="fg-content">
    <section className="fg-albums" aria-label="อัลบั้ม">
     {albums===null?<div className="fg-album-grid">{[0,1].map(i=><div key={i} className="fg-album-card fg-album-loading"/>)}</div>
     :albums.length===0?<div className="fg-albums-empty" role="status"><Icon name="image" size={28}/><span>ยังไม่มีอัลบั้มที่เปิดให้ชม</span></div>
     :<div className="fg-album-grid">{albums.map(a=>{const body=<>
       <div className="fg-album-cover">{a.cover&&!broken[a.slug]?<img src={a.cover} alt="" loading="lazy" onError={()=>setBroken(b=>({...b,[a.slug]:true}))}/>:<Icon name="image" size={34}/>}{a.locked&&<span className="fg-album-lock" aria-label="ล็อก ต้องใช้รหัส"><Icon name="lock" size={14}/></span>}</div>
       <strong>{a.title}</strong><span>{[fmtDate(a.date),a.venue].filter(Boolean).join(' · ')}</span></>;
      return a.locked?<button key={a.slug} type="button" className="fg-album-card" onClick={()=>askCode(a.title)}>{body}</button>:<a key={a.slug} className="fg-album-card" href={'/football-gallery/'+encodeURIComponent(a.slug)}>{body}</a>})}</div>}
    </section>
    <div className="fg-features"><span><Icon name="image" size={18}/> JPEG + RAW</span><span><Icon name="video" size={18}/> Videos</span></div>
    <div className="fg-notice"><Icon name="shield" size={23}/><div><strong>ความเป็นส่วนตัวของเด็กสำคัญที่สุด</strong><p>ไม่ต้องสมัครสมาชิก อัลบั้มที่มีรูปกุญแจเปิดได้เฉพาะผู้ที่ได้รับรหัสหรือลิงก์จากผู้จัดงาน</p></div></div>
   </div>
   {accessOpen&&<div className="fg-access-overlay" onClick={closeAccess}>
    <section className="fg-access-modal" role="dialog" aria-modal="true" aria-labelledby="fg-access-title" onClick={e=>e.stopPropagation()}>
     <div className="fg-access-modal-head"><h2 id="fg-access-title">{selectedAlbum||'อัลบั้มส่วนตัว'}</h2><button type="button" className="fg-access-close" onClick={closeAccess} aria-label="ปิดหน้ากรอกรหัส">×</button></div>
     <p className="fg-subtitle">กรอกรหัสประจำงานที่ได้รับจากผู้จัดงาน หรือเปิดลิงก์เชิญจาก LINE</p>
     <form onSubmit={enter} noValidate><label htmlFor="fg-code">รหัสอัลบั้ม</label><input ref={codeInput} id="fg-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="กรอกรหัสจากผู้จัดงาน" value={code} onChange={e=>{setCode(e.target.value);setMessage('');}} aria-invalid={status==='error'}/>
      {message&&<p className="fg-error" role="alert">{message}</p>}
      <button type="submit" disabled={busy} className="fg-primary">{busy?'กำลังตรวจสอบ…':'เข้าสู่อัลบั้ม'}<Icon name="arrow" size={20}/></button>
     </form>
    </section>
   </div>}
   <footer className="fg-footer">หากไม่พบรหัส โปรดติดต่อผู้จัดงานหรือช่างภาพ</footer>
  </div>
 </main>
}