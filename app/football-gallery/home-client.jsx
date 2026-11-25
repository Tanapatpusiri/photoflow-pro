'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {coverSrc,coverSrcSet,COVER_SIZES} from '../../lib/football-gallery-cover-srcset';
import {watchImage,imageShown} from '../../lib/football-gallery-image-fade';
import './gallery.css';
import './home-v2.css';
import './gallery-motion.css';

const layoutKey='football-gallery-layout';
const dateOptions={timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'};
const thaiDate=new Intl.DateTimeFormat('th-TH',dateOptions);
const filterDate=new Intl.DateTimeFormat('sv-SE',{...dateOptions,day:'2-digit',month:'2-digit'});

const Icon=({name,size=22})=>{
 const paths={
  camera:<><path d="M14 4h-4l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z"/><circle cx="12" cy="13" r="4"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></>,
  grid:<>{[[3,3],[13,3],[3,13],[13,13]].map(([x,y])=><rect key={x+','+y} x={x} y={y} width="8" height="8" rx="1.5"/>)}</>,
  list:<><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/></>,
  home:<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H4a1 1 0 0 1-1-1z"/>,
  arrow:<><path d="M5 12h14m-6-6 6 6-6 6"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
};
export default function FootballGallery({initialAlbums=[]}) {
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [status,setStatus]=useState('idle');
 const [broken,setBroken]=useState({});
 const [singleColumn,setSingleColumn]=useState(false);
 const [activeAlbum,setActiveAlbum]=useState(0);
 const [query,setQuery]=useState('');
 const [date,setDate]=useState('');
 const [draftDate,setDraftDate]=useState('');
 const hasPendingDate=draftDate!==date;
 const [accessOpen,setAccessOpen]=useState(false),[selectedAlbum,setSelectedAlbum]=useState('');
 const codeInput=useRef(null);
 const page=useRef(null);
 const track=useRef(null);
 const scrollTimer=useRef(null);
 const mouseDrag=useRef(null);
 const suppressClick=useRef(false);

 useEffect(()=>{
  const preventZoom=event=>event.preventDefault();
  const keyboardFocus=event=>{
   if(event.key==='Tab')delete page.current.dataset.pointerFocus;
  };
  document.addEventListener('gesturestart',preventZoom,{passive:false});
  document.addEventListener('gesturechange',preventZoom,{passive:false});
  document.addEventListener('keydown',keyboardFocus);
  return ()=>{
   document.removeEventListener('gesturestart',preventZoom);
   document.removeEventListener('gesturechange',preventZoom);
   document.removeEventListener('keydown',keyboardFocus);
  };
 },[]);

 // A locked album needs the code from the organiser: take the visitor to the code box.
 const askCode=title=>{setSelectedAlbum(title);setStatus('idle');setMessage('');setAccessOpen(true)};
 const closeAccess=()=>{if(busy)return;setAccessOpen(false);setStatus('idle');setMessage('');setCode('')};
 useEffect(()=>{if(!accessOpen)return;const t=setTimeout(()=>codeInput.current?.focus(),80);const dismiss=e=>{if(e.key==='Escape'&&!busy)closeAccess()};window.addEventListener('keydown',dismiss);return()=>{clearTimeout(t);window.removeEventListener('keydown',dismiss)}},[accessOpen,busy]);
 useEffect(()=>{
  try{setSingleColumn(localStorage.getItem(layoutKey)==='single')}catch{}
 },[]);
 const search=query.trim().normalize('NFC').toLocaleLowerCase('th');
 const filtering=Boolean(query||date);
 const albums=initialAlbums.filter(album=>
  album.title.normalize('NFC').toLocaleLowerCase('th').includes(search)&&
  (!date||(album.date&&filterDate.format(new Date(album.date))===date)));
 const albumOrder=JSON.stringify(albums.map(album=>album.slug));
 useEffect(()=>{
  setActiveAlbum(0);
  if(singleColumn)track.current?.scrollTo({left:0,behavior:'instant'});
  return ()=>clearTimeout(scrollTimer.current);
 },[singleColumn,albumOrder]);

 function centeredIndex(){
  const list=track.current;
  const first=list?.children[0],second=list?.children[1];
  return second?Math.round(list.scrollLeft/(second.offsetLeft-first.offsetLeft)):0;
 }
 function selectAlbum(index){
  const list=track.current;
  const card=list?.children[index];
  if(!card)return;
  const left=card.offsetLeft-list.firstElementChild.offsetLeft;
  list.scrollTo({left,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function handleCarouselKey(event){
  const target={ArrowLeft:centeredIndex()-1,ArrowRight:centeredIndex()+1,Home:0,End:albums.length-1}[event.key];
  if(target===undefined)return;
  event.preventDefault();
  selectAlbum(Math.max(0,Math.min(albums.length-1,target)));
 }
 function beginDrag(event){
  suppressClick.current=false;
  if(event.pointerType==='mouse'&&event.button===0){
   mouseDrag.current={x:event.clientX,left:event.currentTarget.scrollLeft};
  }
 }
 function dragCarousel(event){
  const drag=mouseDrag.current;
  if(!drag)return;
  const distance=event.clientX-drag.x;
  if(!suppressClick.current&&Math.abs(distance)<6)return;
  const list=event.currentTarget;
  if(!suppressClick.current){
   suppressClick.current=true;
   list.setPointerCapture(event.pointerId);
   list.dataset.dragging='true';
  }
  list.scrollLeft=drag.left-distance;
 }
 function endDrag(event){
  mouseDrag.current=null;
  const list=event.currentTarget;
  if(!list.dataset.dragging)return;
  const index=centeredIndex();
  delete list.dataset.dragging;
  selectAlbum(index);
 }
 function toggleLayout(){
  const next=!singleColumn;
  setSingleColumn(next);
  try{localStorage.setItem(layoutKey,next?'single':'grid')}catch{}
 }
 function markCoverBroken(slug){
  setBroken(previous=>previous[slug]?previous:{...previous,[slug]:true});
 }
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
 return <main className="fg-page fg-home-v2" data-carousel={singleColumn} ref={page} onPointerDownCapture={()=>{page.current.dataset.pointerFocus='true'}}>
  <div className="fg-shell">
   <header className="fg-header">
    <div className="fg-brand-icon"><Icon name="camera" size={29}/></div>
    <div className="fg-brand-text"><h1>Football Gallery</h1><span>Private photo albums for families</span></div>
    <div className="fg-home-controls">
     <button type="button" className="fg-home-control" onClick={toggleLayout} aria-label="มุมมองอัลบั้มแบบเลื่อนแนวนอน" aria-pressed={singleColumn}><Icon name={singleColumn?'list':'grid'}/></button>
     <a className="fg-home-control" href="/admin" aria-label="จัดการหลังบ้าน"><Icon name="home"/></a>
    </div>
   </header>
   <div className="fg-content">
    <div className="fg-home-search" role="search">
     <Icon name="search" size={20}/>
     <input type="search" aria-label="ค้นหาอัลบั้ม / งานแข่งขัน" placeholder="ค้นหาอัลบั้ม / งานแข่งขัน" value={query} onChange={e=>setQuery(e.target.value)}/>
     <label className="fg-home-calendar">
      <Icon name="calendar" size={21}/>
      <input type="date" aria-label="เลือกวันที่แข่งขัน" value={draftDate} onChange={e=>setDraftDate(e.target.value)}/>
     </label>
    </div>
    {(filtering||hasPendingDate)&&<div className="fg-home-filters">
     {(draftDate||date)&&<span>{draftDate?thaiDate.format(new Date(draftDate+'T12:00:00+07:00')):'ทุกวันที่'}</span>}
     {hasPendingDate?<><button type="button" onClick={()=>setDraftDate(date)}>ยกเลิก</button><button type="button" onClick={()=>setDate(draftDate)}>ยืนยันวันที่ ✓</button></>
      :<button type="button" onClick={()=>{setQuery('');setDate('');setDraftDate('')}}>ล้างตัวกรอง</button>}
    </div>}
    <section className="fg-albums" aria-label="อัลบั้ม">
     {albums.length===0?<div className="fg-albums-empty" role="status"><Icon name="image" size={28}/><span>{filtering?'ไม่พบอัลบั้มที่ตรงกับตัวกรอง':'ยังไม่มีอัลบั้มที่เปิดให้ชม'}</span></div>
     :<><div className={singleColumn?'fg-album-carousel':'fg-album-grid'} ref={track}
      tabIndex={singleColumn&&albums.length>1?0:undefined}
      role={singleColumn?'group':undefined} aria-label={singleColumn?'เลื่อนดูอัลบั้ม':undefined}
      onKeyDown={singleColumn?handleCarouselKey:undefined}
      onScroll={singleColumn?()=>{
       clearTimeout(scrollTimer.current);
       scrollTimer.current=setTimeout(()=>setActiveAlbum(centeredIndex()),100);
      }:undefined}
      onPointerDown={singleColumn?beginDrag:undefined} onPointerMove={singleColumn?dragCarousel:undefined}
      onPointerUp={singleColumn?endDrag:undefined} onPointerCancel={singleColumn?endDrag:undefined}
      onPointerLeave={singleColumn?event=>{if(!event.currentTarget.dataset.dragging)mouseDrag.current=null}:undefined}
      onDragStart={singleColumn?event=>event.preventDefault():undefined}
      onClickCapture={singleColumn?event=>{
       if(suppressClick.current&&event.detail!==0){event.preventDefault();event.stopPropagation();}
      }:undefined}
     >{albums.map((a,index)=>{const body=<>
       <div className="fg-album-cover">{a.cover&&!broken[a.slug]?<img src={coverSrc(a.cover)} srcSet={coverSrcSet(a.cover)} sizes={COVER_SIZES} alt="" loading={index<2?"eager":"lazy"} fetchPriority={index<2?"high":"auto"} decoding="async" onLoad={imageShown} ref={img=>{watchImage(img);if(img?.complete&&!img.naturalWidth)markCoverBroken(a.slug)}} onError={()=>markCoverBroken(a.slug)}/>:<Icon name="image" size={34}/>}</div>
       <div className="fg-home-cover-shade" aria-hidden="true"/>
       {a.locked&&<span className="fg-album-lock"><Icon name="lock" size={14}/><span className="fg-home-sr-only">ล็อก ต้องใช้รหัส</span></span>}
       <div className="fg-home-caption"><div><strong>{a.title}</strong>{a.date&&<time dateTime={filterDate.format(new Date(a.date))}>{thaiDate.format(new Date(a.date))}</time>}</div><span className="fg-home-arrow" aria-hidden="true"><Icon name="arrow" size={17}/></span></div>
      </>;
      return a.locked?<button key={a.slug} type="button" className="fg-album-card" onClick={()=>askCode(a.title)}>{body}</button>:<Link key={a.slug} className="fg-album-card" href={"/football-gallery/"+encodeURIComponent(a.slug)} prefetch={false}>{body}</Link>})}</div>
      {singleColumn&&albums.length>1&&<div className="fg-carousel-dots" role="group" aria-label="ตำแหน่งอัลบั้ม">
       {albums.map((album,index)=><button key={album.slug} type="button" aria-label={'แสดงอัลบั้ม '+album.title} aria-current={index===activeAlbum?'true':undefined} onClick={()=>selectAlbum(index)}/>)}
      </div>}
     </>}
    </section>
   </div>
   {accessOpen&&<div className="fg-access-overlay" onClick={closeAccess}>
    <section className="fg-access-modal" role="dialog" aria-modal="true" aria-labelledby="fg-access-title" onClick={e=>e.stopPropagation()}>
     <div className="fg-access-modal-head"><h2 id="fg-access-title">{selectedAlbum||'อัลบั้มส่วนตัว'}</h2><button type="button" className="fg-access-close" onClick={closeAccess} aria-label="ปิดหน้ากรอกรหัส">×</button></div>
     <p className="fg-subtitle">กรอกรหัสประจำงานที่ได้รับจากผู้จัดงาน หรือเปิดลิงก์เชิญจาก LINE</p>
     <p className="fg-subtitle">อัลบั้มที่มีรูปกุญแจเปิดได้เฉพาะผู้ที่ได้รับรหัสหรือลิงก์จากผู้จัดงาน</p>
     <form onSubmit={enter} noValidate><label htmlFor="fg-code">รหัสอัลบั้ม</label><input ref={codeInput} id="fg-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck="false" placeholder="กรอกรหัสจากผู้จัดงาน" value={code} onChange={e=>{setCode(e.target.value);setMessage('');}} aria-invalid={status==='error'}/>
      {message&&<p className="fg-error" role="alert">{message}</p>}
      <button type="submit" disabled={busy} className="fg-primary">{busy?'กำลังตรวจสอบ…':'เข้าสู่อัลบั้ม'}<Icon name="arrow" size={20}/></button>
     </form>
    </section>
   </div>}
  </div>
 </main>
}
