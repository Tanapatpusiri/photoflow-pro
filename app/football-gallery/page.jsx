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
 const [albums,setAlbums]=useState([]),[albumsLoading,setAlbumsLoading]=useState(true),[albumsError,setAlbumsError]=useState(''),[albumsPage,setAlbumsPage]=useState(1),[albumsMore,setAlbumsMore]=useState(false),[albumsRetry,setAlbumsRetry]=useState(0);
 useEffect(()=>{let alive=true;setAlbumsLoading(true);fetch('/api/football-gallery/albums?page='+albumsPage,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message||'โหลดอัลบั้มไม่สำเร็จ');if(alive){setAlbums(old=>albumsPage===1?d.albums||[]:[...old,...(d.albums||[])]);setAlbumsMore(!!d.hasMore);setAlbumsError('')}}).catch(e=>{if(alive)setAlbumsError(e.message)}).finally(()=>{if(alive)setAlbumsLoading(false)});return()=>{alive=false}},[albumsPage,albumsRetry]);
 useEffect(()=>{const invite=new URLSearchParams(window.location.search).get('invite');if(invite==='invalid'){setStatus('error');setMessage('ลิงก์เชิญหมดอายุหรือถูกยกเลิก กรุณาขอลิงก์ใหม่จากผู้จัดงาน หรือกรอกรหัสอัลบั้ม')}else if(invite==='suspended'){setStatus('error');setMessage('ผู้จัดงานปิดอัลบั้มนี้ไว้ชั่วคราว กรุณาติดต่อผู้จัดงาน')}},[]);
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
    <div className="fg-brand-text"><strong>Football Gallery</strong><span>Photo albums for families</span></div>
    <a className="fg-admin-link" href="/admin">จัดการหลังบ้าน</a>
   </header>
   <div className="fg-content">
    <section aria-label="อัลบั้มการแข่งขัน">
     {albums.length>0&&<div className="fg-album-grid">{albums.map(album=><a className="fg-album-card" key={album.slug} href={'/football-gallery/'+encodeURIComponent(album.slug)}><div className="fg-album-art">{album.coverUrl?<img src={album.coverUrl} alt=""/>:<Icon name={album.locked?'lock':'image'} size={36}/>}</div><div className="fg-album-info"><strong>{album.title}</strong>{album.date&&<span>{new Date(album.date).toLocaleDateString('th-TH',{dateStyle:'medium',timeZone:'UTC'})}</span>}{album.locked&&<span><Icon name="lock" size={13}/> อัลบั้มส่วนตัว</span>}</div></a>)}</div>}
     {albumsLoading&&<p>กำลังโหลดอัลบั้ม…</p>}{albumsError&&<p role="alert">{albumsError} <button type="button" onClick={()=>setAlbumsRetry(n=>n+1)}>ลองอีกครั้ง</button></p>}{!albumsLoading&&!albumsError&&albums.length===0&&<p>ยังไม่มีอัลบั้มที่เปิดให้เข้าชม</p>}{albumsMore&&!albumsError&&<button type="button" className="fg-primary" disabled={albumsLoading} onClick={()=>setAlbumsPage(n=>n+1)}>โหลดอัลบั้มเพิ่ม</button>}
    </section>
    <section className="fg-access" aria-label="เข้าชมอัลบั้ม">
     <h2>เข้าชมอัลบั้ม</h2><p className="fg-subtitle">เปิดลิงก์ที่ได้รับทาง LINE หรือกรอกรหัสประจำงาน</p>
     <form onSubmit={enter} noValidate><label htmlFor="fg-code">รหัสอัลบั้ม</label><input id="fg-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="กรอกรหัสจากผู้จัดงาน" value={code} onChange={e=>{setCode(e.target.value);setMessage('');}} aria-invalid={status==='error'}/>
      {message&&<p className="fg-error" role="alert">{message}</p>}
      <button type="submit" disabled={busy} className="fg-primary">{busy?'กำลังตรวจสอบ…':'เข้าสู่อัลบั้ม'}<Icon name="arrow" size={20}/></button>
     </form>
    </section>
    <div className="fg-features"><span><Icon name="lock" size={18}/> Public / Private</span><span><Icon name="image" size={18}/> JPEG + RAW</span><span><Icon name="video" size={18}/> Videos</span></div>
    <div className="fg-notice"><Icon name="shield" size={23}/><div><strong>ความเป็นส่วนตัวของเด็กสำคัญที่สุด</strong><p>อัลบั้มส่วนตัวต้องได้รับสิทธิ์จากผู้ดูแล อัลบั้มสาธารณะเปิดให้ทุกคนเข้าชม</p></div></div>
   </div>
   <footer className="fg-footer">หากไม่พบรหัส โปรดติดต่อผู้จัดงานหรือช่างภาพ</footer>
  </div>
 </main>
}
