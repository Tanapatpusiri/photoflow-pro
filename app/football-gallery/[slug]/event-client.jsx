'use client';
import {useEffect,useMemo,useState} from 'react';
import './event.css';
const Icon=({name})=><span className="fg-glyph" aria-hidden="true">{{back:'‹',next:'›',download:'↓',image:'▧',video:'▷',players:'♙',close:'×',check:'✓',heart:'♡'}[name]||'•'}</span>;
const fmt=n=>Number(n||0).toLocaleString('th-TH');
const base=slug=>'/api/football-gallery/events/'+encodeURIComponent(slug);
function Empty({message}){return <div className="fge-empty"><div className="fge-placeholder">▧</div><p>{message}</p></div>}
export default function EventExperience({slug}){
 const [event,setEvent]=useState(null),[players,setPlayers]=useState([]),[items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [page,setPage]=useState('overview'),[tab,setTab]=useState('photo'),[player,setPlayer]=useState(null),[detail,setDetail]=useState(null),[filter,setFilter]=useState('all'),[favorites,setFavorites]=useState([]),[selected,setSelected]=useState([]),[pageNo,setPageNo]=useState(1),[hasMore,setHasMore]=useState(false),[query,setQuery]=useState('');
 const [dlType,setDlType]=useState('both');
 useEffect(()=>{try{setFavorites(JSON.parse(localStorage.getItem('fg_fav_'+slug)||'[]'))}catch{}},[slug]);
 useEffect(()=>{let live=true;(async()=>{setLoading(true);try{const r=await fetch(base(slug),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message||'ไม่สามารถเปิดอัลบั้ม');if(live){setEvent(d.event);setPlayers(d.players||[]);setError('')}}catch(e){if(live)setError(e.message)}finally{if(live)setLoading(false)}})();return()=>{live=false}},[slug]);
 useEffect(()=>{if(!event||!['photos','videos','player','downloads'].includes(page))return;let live=true;(async()=>{setLoading(true);try{const params=new URLSearchParams({page:String(pageNo),kind:page==='videos'||page==='player'&&tab==='video'?'video':'photo'});if(player&&page==='player')params.set('player',player.id);const r=await fetch(base(slug)+'/media?'+params,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message||'โหลดไฟล์ไม่สำเร็จ');if(live){setItems(old=>pageNo===1?d.items:[...old,...d.items]);setHasMore(d.hasMore);setError('')}}catch(e){if(live)setError(e.message)}finally{if(live)setLoading(false)}})();return()=>{live=false}},[slug,event,page,player,tab,pageNo]);
 const change=(next,who=null,newTab='photo')=>{setPage(next);setPlayer(who);setTab(newTab);setPageNo(1);setItems([]);setSelected([]);setDetail(null);setFilter('all');window.scrollTo({top:0,behavior:'instant'})};
 const toggleFav=id=>{setFavorites(prev=>{const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];try{localStorage.setItem('fg_fav_'+slug,JSON.stringify(next))}catch{}return next})};
 const toggleSelected=id=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
 const viewed=useMemo(()=>items.filter(item=>filter==='favorites'?favorites.includes(item.id):filter==='JPEG'||filter==='RAW'?item.files.some(f=>f.variant===filter):true).filter(item=>!query||String(item.title||'').toLowerCase().includes(query.toLowerCase())),[items,filter,favorites,query]);
 const download=file=>{if(!file)return;window.location.href=base(slug)+'/files/'+encodeURIComponent(file.id)};
 const photo=item=>item.files.find(f=>f.variant==='THUMB')||item.files.find(f=>f.variant==='PREVIEW');
 const imageFor=item=>{const file=photo(item);return file?base(slug)+'/files/'+file.id:''};
 const openDetail=item=>{setDetail(item);setPage('detail')};
 const title={overview:event?.title,photos:'All Photos',videos:'Videos',players:'Players',player:player?.name,detail:'Photo Detail',downloads:'Download All'}[page]||'Football Gallery';
 const goBack=()=>{if(page==='detail')setPage(player?'player':'photos');else if(page==='player')change('players');else change('overview')};
 if(loading&&!event)return <div className="fge-shell"><p className="fge-loading">กำลังโหลดอัลบั้ม…</p></div>;
 if(!event)return <div className="fge-shell"><div className="fge-nav"><a href="/football-gallery"><Icon name="back"/> กลับ</a></div><Empty message={error||'อัลบั้มนี้ยังไม่พร้อมให้เข้าชม'}/></div>;
 return <main className="fge-shell">
  <header className="fge-nav"><button onClick={goBack} className="fge-back" aria-label="ย้อนกลับ"><Icon name="back"/></button><h1>{title}</h1><span className="fge-nav-spacer"/></header>
  {error&&<div className="fge-alert" role="alert">{error}</div>}
  {page==='overview'&&<>
   <div className="fge-hero"><span className="fge-badge">♧ Private Album</span><div className="fge-hero-bottom"><h2>{event.title}</h2><p>{event.date?new Date(event.date).toLocaleDateString('th-TH',{dateStyle:'medium'}):''} {event.venue||''}</p><p>{fmt(event.photos)} รูป · {fmt(event.videos)} คลิป</p></div></div>
   <div className="fge-menu-grid">{[['photos','All Photos','รูปทั้งหมด'],['players','Players','ค้นหาตามนักฟุตบอล'],['videos','Videos','คลิปการแข่งขัน'],['downloads','Downloads','ดาวน์โหลดทั้งหมด']].map(([route,label,desc])=><button className="fge-menu" key={route} onClick={()=>change(route)}><div className="fge-menu-icon"><Icon name={route==='photos'?'image':route==='players'?'players':route==='videos'?'video':'download'}/></div><strong>{label}</strong><span>{desc}</span><Icon name="next"/></button>)}</div>
   <div className="fge-chiprow"><span>Private Album</span><span>Original Quality</span><span>JPEG + RAW</span></div>
   <button className="fge-primary" onClick={()=>change('photos')}>ดูภาพทั้งหมด</button>
  </>}
  {page==='players'&&<><input className="fge-search" placeholder="ค้นหาชื่อหรือหมายเลขเสื้อ" value={query} onChange={e=>setQuery(e.target.value)}/><div className="fge-playergrid">{players.filter(p=>[p.name,p.jersey,p.team].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase()))).map(p=><button className="fge-player" key={p.id} onClick={()=>change('player',p)}><div className="fge-player-cover"><Icon name="players"/></div><strong>{p.name}{p.jersey?' #'+p.jersey:''}</strong><span>{fmt(p.photos)} รูป · {fmt(p.videos)} คลิป</span></button>)}</div>{players.length===0&&<Empty message="ยังไม่มีรายชื่อนักฟุตบอลที่เผยแพร่"/>}</>}
  {page==='player'&&<><div className="fge-player-banner"><h2>{player.name}{player.jersey?' #'+player.jersey:''}</h2><span>{fmt(player.photos)} รูป · {fmt(player.videos)} คลิป</span></div><div className="fge-segments"><button className={tab==='photo'?'selected':''} onClick={()=>{setItems([]);setPageNo(1);setTab('photo')}}>Photos</button><button className={tab==='video'?'selected':''} onClick={()=>{setItems([]);setPageNo(1);setTab('video')}}>Videos</button></div></>}
  {['photos','videos','player'].includes(page)&&<>
   <p className="fge-count">{page==='player'?player?.name:event.title} · Original files available</p>
   {(page==='photos'||page==='player'&&tab==='photo')&&<div className="fge-filters">{['all','favorites','JPEG','RAW'].map(v=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{v==='all'?'ทั้งหมด':v==='favorites'?'รายการโปรด':v}</button>)}</div>}
   {loading&&items.length===0?<p className="fge-loading">กำลังโหลดรูป…</p>:viewed.length===0?<Empty message="ยังไม่มีไฟล์ในหมวดนี้"/>:null}
   <div className={(page==='videos'||page==='player'&&tab==='video')?'fge-video-list':'fge-photo-grid'}>{viewed.map(item=><article className="fge-tile" key={item.id}><button className="fge-tile-image" onClick={()=>openDetail(item)} aria-label={'เปิด '+(item.title||'ไฟล์')} >{imageFor(item)?<img src={imageFor(item)} loading="lazy" alt={item.title||'ภาพการแข่งขัน'}/>:<span className="fge-photo-fallback"><Icon name={item.kind==='video'?'video':'image'}/></span>}</button><div className="fge-tile-actions"><button onClick={()=>toggleFav(item.id)} aria-label="รายการโปรด">{favorites.includes(item.id)?'♥':'♡'}</button><button onClick={()=>toggleSelected(item.id)} aria-label="เลือกไฟล์">{selected.includes(item.id)?'☑':'□'}</button></div>{item.kind==='video'&&<span className="fge-video-title">{item.title||'วิดีโอการแข่งขัน'}</span>}</article>)}</div>
   {hasMore&&<button className="fge-load" onClick={()=>setPageNo(n=>n+1)} disabled={loading}>โหลดเพิ่ม</button>}
   <button className="fge-primary fge-sticky" onClick={()=>setPage('downloads')}>{selected.length?'ดาวน์โหลด '+fmt(selected.length)+' รายการ':'เลือกและดาวน์โหลดทั้งหมด'}</button>
  </>}
  {page==='detail'&&detail&&<><div className="fge-detail-image">{imageFor(detail)?<img src={imageFor(detail)} alt={detail.title||'ภาพการแข่งขัน'}/>:<Empty message="ไฟล์นี้ไม่มีภาพตัวอย่าง"/>}</div><div className="fge-card"><h2>{detail.title||'ภาพการแข่งขัน'}</h2><p>{event.title}</p><p>ไฟล์ต้นฉบับที่มีอยู่จริง</p></div><div className="fge-file-options">{detail.files.filter(f=>['JPEG','RAW','VIDEO_ORIGINAL'].includes(f.variant)).map(f=><button key={f.id} onClick={()=>download(f)}><strong>{f.variant} Original</strong><small>{(Number(f.bytes)/1e6).toFixed(1)} MB</small><Icon name="download"/></button>)}</div><p className="fge-hint">ไฟล์ที่ดาวน์โหลดเป็นต้นฉบับ ไม่ลดความละเอียดหรือแก้ไขข้อมูลสี</p></>}
  {page==='downloads'&&<><div className="fge-card fge-event-summary"><h2>{player?.name||event.title}</h2><p>{selected.length?fmt(selected.length)+' รายการที่เลือก':fmt(event.photos)+' ภาพ · '+fmt(event.videos)+' คลิป'}</p></div><h2 className="fge-section-title">เลือกประเภทไฟล์ที่ต้องการ</h2><div className="fge-options">{[['jpeg','JPEG Originals'],['raw','RAW Originals'],['video','Videos'],['both','JPEG + RAW + Videos']].map(([v,label])=><button key={v} className={dlType===v?'selected':''} onClick={()=>setDlType(v)}><span className="fge-radio">{dlType===v?'●':'○'}</span>{label}</button>)}</div><div className="fge-alert">การดาวน์โหลดเป็นชุดต้องรอระบบสร้าง ZIP ผ่าน Worker ที่เชื่อมกับ R2 ก่อน ปุ่มนี้ยังไม่เปิดใช้งานเพื่อป้องกันไฟล์เสียหาย</div><button className="fge-primary" disabled>เตรียมไฟล์ดาวน์โหลด</button></>}
  <footer className="fge-footer"><a href="/football-gallery">Football Gallery</a> · Private Access · JPEG / RAW / Video</footer>
 </main>
}
