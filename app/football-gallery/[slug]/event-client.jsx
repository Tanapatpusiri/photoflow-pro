'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {formatBytes as fmtBytes} from '../../../lib/football-gallery-format';
import {watchImage,imageShown,imageFailed} from '../../../lib/football-gallery-image-fade';
import {withViewTransition} from '../../../lib/football-gallery-motion';
import './event.css';
import '../gallery-motion.css';
const paths={
 back:<path d="m15 5-7 7 7 7"/>,next:<path d="m9 5 7 7-7 7"/>,
 download:<><path d="M12 4v11m-5-5 5 5 5-5"/><path d="M5 20h14"/></>,
 image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></>,
 video:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></>,
 players:<><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/></>,
 heart:<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>,
 check:<><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="m8 12.5 2.7 2.7L16 9.8"/></>,
 done:<path d="m5 12.5 4.5 4.5L19 7.5"/>,
 box:<rect x="3.5" y="3.5" width="17" height="17" rx="5"/>,
 lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
 shield:<><path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>
};
const Icon=({name,size=22,filled=false})=><svg className="fg-icon" width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
const fmt=n=>Number(n||0).toLocaleString('th-TH');
const base=slug=>'/api/football-gallery/events/'+encodeURIComponent(slug);
const ORIGINAL=['JPEG','RAW','VIDEO_ORIGINAL'];
function Empty({message,children}){return <div className="fge-empty"><div className="fge-placeholder"><Icon name="image" size={40}/></div><p>{message}</p>{children}</div>}
export default function EventExperience({slug,initialData=null}){
 const [event,setEvent]=useState(initialData?.event||null),[players,setPlayers]=useState(initialData?.players||[]),[items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(!initialData),[needsAccess,setNeedsAccess]=useState(false);
 const [page,setPage]=useState('photos'),[tab,setTab]=useState('photo'),[player,setPlayer]=useState(null),[detail,setDetail]=useState(null),[filter,setFilter]=useState('all'),[favorites,setFavorites]=useState([]),[selected,setSelected]=useState([]),[pageNo,setPageNo]=useState(1),[hasMore,setHasMore]=useState(false),[query,setQuery]=useState('');
 const [archive,setArchive]=useState(null),[preparing,setPreparing]=useState(false),[downloadProgress,setDownloadProgress]=useState('');
 const [removal,setRemoval]=useState({description:'',contact:'',sent:null,busy:false});
 const listingCache=useRef(new Map());
 const loadMoreTarget=useRef(null);
 const [loadedPage,setLoadedPage]=useState(0);
 const [listFailed,setListFailed]=useState(false);
 const [listRetry,setListRetry]=useState(0);
 const isMediaPage=['photos','videos','player'].includes(page);
 const isVideo=page==='videos'||page==='player'&&tab==='video';
 const canLoadMore=hasMore&&loadedPage===pageNo&&!loading&&!listFailed;
 const cacheKey=(kind,personId,pageNumber)=>[slug,kind,personId||'',pageNumber].join(':');
 function listMedia(kind,personId,pageNumber){
  const key=cacheKey(kind,personId,pageNumber);
  const entry=listingCache.current.get(key);
  if(entry&&Date.now()-entry.at<20000)return entry.promise;
  const params=new URLSearchParams({page:String(pageNumber),kind});
  if(personId)params.set('player',personId);
  const promise=fetch(base(slug)+'/media?'+params,{cache:'no-store'})
    .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message||'โหลดไฟล์ไม่สำเร็จ');return d})
    .catch(e=>{listingCache.current.delete(key);throw e});
  listingCache.current.set(key,{at:Date.now(),promise});
  return promise;
 }

 const inLine=typeof navigator!=='undefined'&&/\bLine\//i.test(navigator.userAgent);
 useEffect(()=>{try{setFavorites(JSON.parse(localStorage.getItem('fg_fav_'+slug)||'[]'))}catch{}},[slug]);
 useEffect(()=>{if(initialData?.event)return;let live=true;(async()=>{setLoading(true);try{let r=await fetch(base(slug),{cache:'no-store'}),d=await r.json();
  // An unlocked album opens without a code: ask for its public pass once, then load again.
  if(!r.ok&&d.needsAccess){const o=await fetch('/api/football-gallery/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug}),cache:'no-store'});if(o.ok){r=await fetch(base(slug),{cache:'no-store'});d=await r.json()}}
  if(!r.ok){if(d.needsAccess&&live)setNeedsAccess(true);throw Error(d.message||'ไม่สามารถเปิดอัลบั้ม')}if(live){setEvent(d.event);setPlayers(d.players||[]);setError('');if(!navigator.connection?.saveData){listMedia('photo',null,1).catch(()=>{})}}}catch(e){if(live)setError(e.message)}finally{if(live)setLoading(false)}})();return()=>{live=false}},[slug]);
 useEffect(()=>{
  if(!event||!isMediaPage)return;
  let live=true;
  setLoading(true);
  setListFailed(false);
  (async()=>{
   try{
    const d=await listMedia(isVideo?'video':'photo',page==='player'?player?.id:null,pageNo);
    if(!live)return;
    setItems(old=>{
     const seen=new Set();
     return (pageNo===1?d.items:[...old,...d.items]).filter(item=>{
      if(seen.has(item.id))return false;
      seen.add(item.id);
      return true;
     });
    });
    setLoadedPage(pageNo);
    setHasMore(d.hasMore);
    setError('');
   }catch(e){
    if(live){setError(e.message);setListFailed(true)}
   }finally{
    if(live)setLoading(false);
   }
  })();
  return()=>{live=false};
 },[slug,event,page,player,tab,pageNo,listRetry]);
 useEffect(()=>{
  const target=loadMoreTarget.current;
  if(!target||!canLoadMore||typeof IntersectionObserver==='undefined')return;
  let active=true;
  const observer=new IntersectionObserver(entries=>{
   if(!active||!entries.some(entry=>entry.isIntersecting))return;
   active=false;
   observer.disconnect();
   setPageNo(current=>current===pageNo?current+1:current);
  },{rootMargin:'0px 0px 360px 0px'});
  observer.observe(target);
  return()=>{active=false;observer.disconnect()};
 },[page,pageNo,tab,canLoadMore]);
 function resetListing(){
  setItems([]);setPageNo(1);setLoadedPage(0);setHasMore(false);setListFailed(false);
 }
 const change=(next,who=null,newTab='photo')=>{if(next===page&&who?.id===player?.id&&newTab===tab)return;setPage(next);setPlayer(who);setTab(newTab);resetListing();setSelected([]);setDetail(null);setFilter('all');setArchive(null);window.scrollTo({top:0,behavior:'instant'})};
 // The heart pops only right after it is added (not for favourites restored on page load).
 const [popFav,setPopFav]=useState(null);
 const toggleFav=id=>{setFavorites(prev=>{const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];try{localStorage.setItem('fg_fav_'+slug,JSON.stringify(next))}catch{}return next})};
 const toggleSelected=id=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
 const viewed=useMemo(()=>items.filter(item=>filter==='favorites'?favorites.includes(item.id):filter==='JPEG'||filter==='RAW'?item.files.some(f=>f.variant===filter):true),[items,filter,favorites]);
 const fileUrl=file=>base(slug)+'/files/'+encodeURIComponent(file.id);
 const preview=item=>item.files.find(f=>f.variant==='THUMB')||item.files.find(f=>f.variant==='PREVIEW');
 const imageFor=item=>{if(item.thumbUrl)return item.thumbUrl;const file=preview(item);return file?fileUrl(file):''};
 const retryPreview=(e,file)=>{const img=e.currentTarget;if(!file||img.dataset.retried==='1')return;img.dataset.retried='1';img.src=fileUrl(file)+'?retry='+Date.now()};
 // Opening a photo: the tapped preview grows into the detail photo (View Transitions where supported).
 // Going back returns to the same place in the grid and the photo shrinks into its own tile.
 const gridScroll=useRef(0);
 // Saved: the save button shows "บันทึกแล้ว" with a check and a small burst for a moment.
 const [savedAt,setSavedAt]=useState(0),savedTimer=useRef(null);
 const celebrate=()=>{setSavedAt(Date.now());clearTimeout(savedTimer.current);savedTimer.current=setTimeout(()=>setSavedAt(0),1800)};
 useEffect(()=>()=>clearTimeout(savedTimer.current),[]);
 const detailReady=()=>{const img=document.querySelector('.fge-detail-image img');return img?.decode?Promise.race([img.decode().catch(()=>{}),new Promise(r=>setTimeout(r,150))]):null};
 const openDetail=(item,img)=>{gridScroll.current=window.scrollY;if(img)img.style.viewTransitionName='fg-photo';
  const transition=withViewTransition(()=>{flushSync(()=>{setDetail(item);setPage('detail');setArchive(null)});window.scrollTo({top:0,behavior:'instant'});return detailReady()});
  const clear=()=>{if(img)img.style.viewTransitionName=''};if(transition)transition.finished.then(clear,clear);else clear()};
 const closeDetail=()=>{const id=detail?.id,target=player?'player':detail?.kind==='video'?'videos':'photos';let tile=null;
  const transition=withViewTransition(()=>{flushSync(()=>setPage(target));window.scrollTo({top:gridScroll.current,behavior:'instant'});tile=id?document.querySelector('.fge-tile-image img[data-media-id="'+CSS.escape(id)+'"]'):null;if(tile)tile.style.viewTransitionName='fg-photo'});
  const clear=()=>{if(tile)tile.style.viewTransitionName=''};if(transition)transition.finished.then(clear,clear);else clear()};
 const title={overview:event?.title,photos:'All Photos',videos:'Videos',players:'Players',player:player?.name,detail:detail?.kind==='video'?'Video Detail':'Photo Detail',downloads:'Download All',removal:'ขอถอดภาพ',privacy:'ความเป็นส่วนตัว'}[page]||'Football Gallery';
 const goBack=()=>{if(page==='detail')closeDetail();else if(page==='removal'&&detail)setPage('detail');else if(page==='player')change('players');else if(page==='downloads'&&(selected.length||player))setPage(player?'player':'photos');else if(page==='players'||page==='videos')change('photos');else if(page==='photos')window.location.assign('/football-gallery');else change('photos')};
 async function prepare(formats,scope){
  if(preparing)return;setPreparing(true);setError('');setArchive(null);
  try{
   const sel=scope||(selected.length?{scope:'selection',mediaIds:selected}:player?{scope:'player',playerId:player.id}:{scope:'event'});
   const r=await fetch(base(slug)+'/archive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...sel,formats})}),d=await r.json();
   if(!r.ok)throw Error(d.message||'เตรียมไฟล์ไม่สำเร็จ');setArchive(d);
  }catch(e){setError(e.message)}finally{setPreparing(false)}
 }
 async function savePhotos(scope){
  if(preparing)return;
  setPreparing(true);setDownloadProgress('กำลังรวบรวมรูป JPEG ต้นฉบับ…');setError('');
  try{
   const wanted=scope?.mediaIds||selected;
   const childId=scope?.playerId||(player&&!wanted.length?player.id:null);
   const photos=[];let page=1;
   while(true){
    const query=new URLSearchParams({kind:'photo',page:String(page)});
    if(childId)query.set('player',childId);
    const response=await fetch(base(slug)+'/media?'+query,{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.message||'โหลดรายการภาพไม่สำเร็จ');
    photos.push(...(data.items||[]).filter(item=>!wanted.length||wanted.includes(item.id)));
    if(!data.hasMore)break;
    if(++page>100000)throw Error('มีภาพจำนวนมากเกินกว่าจะโหลดในครั้งเดียว');
   }
   const originals=photos.map(item=>item.files.find(f=>f.variant==='JPEG')).filter(Boolean);
   if(!originals.length)throw Error('ไม่มีไฟล์ JPEG ต้นฉบับสำหรับรายการนี้');
   const files=[];
   for(let i=0;i<originals.length;i++){
    setDownloadProgress('กำลังเตรียมภาพ '+fmt(i+1)+' / '+fmt(originals.length));
    const f=originals[i],response=await fetch(fileUrl(f)+'?share=1',{cache:'no-store'});
    if(!response.ok)throw Error('ดาวน์โหลดภาพไม่สำเร็จ ('+response.status+')');
    const blob=await response.blob();
    if(blob.type&&!blob.type.includes('image/')&&!blob.type.includes('octet-stream'))throw Error('ไฟล์ที่ได้รับไม่ใช่รูปภาพ');
    const filename=String(f.filename||'photo-'+(i+1)+'.jpg').replace(/[^a-zA-Z0-9_.-]/g,'_');
    files.push(new File([blob],/\\.(jpe?g)$/i.test(filename)?filename:filename+'.jpg',{type:'image/jpeg'}));
   }
   // iOS Photos import is mediated by the native Share Sheet. A website cannot silently write to Photos.
   if(navigator.share&&navigator.canShare?.({files})){
    setDownloadProgress('');
    await navigator.share({files});
    celebrate();
   }else{
    for(const file of files){
     const url=URL.createObjectURL(file),a=document.createElement('a');
     a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    setDownloadProgress('ส่งไฟล์ภาพไปยังการดาวน์โหลดของเบราว์เซอร์แล้ว หากใช้ iPhone ให้เปิดภาพและเลือก “บันทึกรูปภาพ” เพื่อเพิ่มลง Photos');
    celebrate();
   }
  }catch(e){
   if(e.name!=='AbortError')setError(e.message||'ไม่สามารถดาวน์โหลดภาพได้');
  }finally{setPreparing(false)}
 }
 async function sendRemoval(e){
  e.preventDefault();if(removal.busy)return;setRemoval(s=>({...s,busy:true}));setError('');
  try{const r=await fetch(base(slug)+'/removal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mediaId:detail?.id||null,description:removal.description,contact:removal.contact})}),d=await r.json();if(!r.ok)throw Error(d.message||'ส่งคำขอไม่สำเร็จ');setRemoval({description:'',contact:'',sent:d.reference,busy:false})}
  catch(err){setError(err.message);setRemoval(s=>({...s,busy:false}))}
 }
 const Parts=()=>archive&&<div className="fge-card fge-parts"><h2>พร้อมดาวน์โหลด</h2><p>{fmt(archive.files)} ไฟล์ · {fmtBytes(archive.originalBytes)} · แบ่งเป็น {fmt(archive.parts.length)} ชุด</p>
  {archive.parts.map(p=><a key={p.index} className="fge-part" href={p.url} download={p.name}><span><strong>ชุดที่ {p.index+1}</strong><small>{fmt(p.files)} ไฟล์ · {fmtBytes(p.bytes)}</small></span><Icon name="download"/></a>)}
  <p className="fge-hint">กดทีละชุด ไฟล์ ZIP เก็บต้นฉบับแบบไม่บีบอัด พร้อมไฟล์ SHA256SUMS.txt สำหรับตรวจความถูกต้อง หากดาวน์โหลดสะดุด กดชุดเดิมอีกครั้งเพื่อทำต่อ ลิงก์ใช้ได้ 24 ชั่วโมง</p></div>;
 if(loading&&!event)return <div className="fge-shell"><p className="fge-loading">กำลังโหลดอัลบั้ม…</p></div>;
 if(!event)return <div className="fge-shell"><div className="fge-nav"><a className="fge-back" href="/football-gallery" aria-label="กลับ"><Icon name="back"/></a></div><Empty message={error||'อัลบั้มนี้ยังไม่พร้อมให้เข้าชม'}>{needsAccess&&<a className="fge-primary fge-link-button" href="/football-gallery">กรอกรหัสอัลบั้ม</a>}</Empty></div>;
 return <main className="fge-shell">
  <header className="fge-nav fge-album-heading"><button onClick={goBack} className="fge-back" aria-label="ย้อนกลับ"><Icon name="back"/></button><h1>{event.title}</h1><span className="fge-nav-spacer"/></header>
  {['photos','videos','players','player'].includes(page)&&<nav className="fge-album-tabs" aria-label="เนื้อหาอัลบั้ม">
   <button type="button" className={(page==='photos'?'active':'')} aria-current={page==='photos'?'page':undefined} onClick={()=>change('photos')}>รูปทั้งหมด</button>
   <button type="button" className={(page==='videos'?'active':'')} aria-current={page==='videos'?'page':undefined} onClick={()=>change('videos')}>วิดีโอทั้งหมด</button>
   <button type="button" className={(page==='players'||page==='player'?'active':'')} aria-current={page==='players'||page==='player'?'page':undefined} onClick={()=>change('players')}>นักเตะ</button>
  </nav>}
  {error&&<div className="fge-alert" role="alert">{error}</div>}
  {page==='players'&&<><input className="fge-search" type="search" enterKeyHint="search" placeholder="ค้นหาชื่อหรือหมายเลขเสื้อ" aria-label="ค้นหาชื่อหรือหมายเลขเสื้อ" value={query} onChange={e=>setQuery(e.target.value)}/><div className="fge-playergrid">{players.filter(p=>!query.trim()||[p.name,p.jersey,p.team,p.jersey?'#'+p.jersey:''].some(x=>String(x||'').toLowerCase().includes(query.trim().toLowerCase()))).map((p,index)=><button className="fge-player" key={p.id} onClick={()=>change('player',p)}><div className="fge-player-cover">{p.coverUrl||p.cover?<img src={p.coverUrl||fileUrl({id:p.cover})} alt="" loading={index<4?"eager":"lazy"} fetchPriority={index<2?"high":"auto"} decoding="async"/>:<Icon name="players" size={44}/>}</div><strong>{p.name}{p.jersey?' #'+p.jersey:''}</strong><span>{fmt(p.photos)} รูป · {fmt(p.videos)} คลิป</span></button>)}</div>{players.length===0&&<Empty message="ยังไม่มีรายชื่อนักฟุตบอลที่เผยแพร่"/>}</>}
  {page==='player'&&<><div className="fge-player-banner"><h2>{player.name}{player.jersey?' #'+player.jersey:''}</h2><span>{fmt(player.photos)} รูป · {fmt(player.videos)} คลิป</span></div><div className="fge-segments" role="tablist"><button role="tab" aria-selected={tab==='photo'} className={tab==='photo'?'selected':''} onClick={()=>{if(tab==='photo')return;resetListing();setTab('photo')}}>Photos</button><button role="tab" aria-selected={tab==='video'} className={tab==='video'?'selected':''} onClick={()=>{if(tab==='video')return;resetListing();setTab('video')}}>Videos</button></div></>}
  {isMediaPage&&<>
   {loading&&items.length===0?<p className="fge-loading">กำลังโหลด…</p>:viewed.length===0&&!listFailed?<Empty message="ยังไม่มีไฟล์ในหมวดนี้"/>:null}
   <div className={isVideo?'fge-video-list':'fge-photo-grid'}>
    {(isVideo?[viewed]:[viewed.filter((_,index)=>index%2===0),viewed.filter((_,index)=>index%2===1)]).map((column,columnIndex)=>
     <div className={isVideo?'fge-video-column':'fge-photo-column'} key={columnIndex}>
      {column.map((item,index)=><article className={'fge-tile'+(selected.includes(item.id)?' is-selected':'')} key={item.id}>
       <button className="fge-tile-image" onClick={e=>openDetail(item,e.currentTarget.querySelector('img'))} aria-label={'เปิด '+(item.title||'ไฟล์')}>
        {imageFor(item)?<img src={imageFor(item)} data-media-id={item.id} ref={watchImage} onLoad={imageShown} onError={e=>imageFailed(e,event=>retryPreview(event,preview(item)))} loading={columnIndex===0&&index<3||columnIndex===1&&index<3?"eager":"lazy"} fetchPriority={index<2?"high":"auto"} decoding="async" alt={item.title||'ภาพการแข่งขัน'}/>:<span className="fge-photo-fallback"><Icon name={item.kind==='video'?'video':'image'} size={34}/></span>}
       </button>
       <div className="fge-tile-actions">
        <button onClick={()=>{toggleFav(item.id);setPopFav(item.id)}} data-pop={popFav===item.id&&favorites.includes(item.id)?'true':undefined} aria-label="รายการโปรด" aria-pressed={favorites.includes(item.id)}><Icon name="heart" size={17} filled={favorites.includes(item.id)}/></button>
        <button onClick={()=>toggleSelected(item.id)} aria-label="เลือกไฟล์" aria-pressed={selected.includes(item.id)}><Icon name={selected.includes(item.id)?'check':'box'} size={17}/></button>
       </div>
       {item.kind==='video'&&<span className="fge-video-title">{item.title||'วิดีโอการแข่งขัน'}<small>{fmtBytes(item.files.filter(f=>f.variant==='VIDEO_ORIGINAL').reduce((n,f)=>n+Number(f.bytes),0))}</small></span>}
      </article>)}
     </div>
    )}
   </div>
   {hasMore&&!isVideo&&<div ref={loadMoreTarget} aria-hidden="true" style={{height:1}}/>}
   {loading&&pageNo>1&&<p className="fge-hint" role="status">กำลังโหลดชุดถัดไป…</p>}
   {listFailed?<button type="button" className="fge-load" onClick={()=>{setListFailed(false);setListRetry(n=>n+1)}}>ลองโหลดอีกครั้ง</button>
    :hasMore&&(isVideo||typeof IntersectionObserver==='undefined')&&<button type="button" className="fge-load" onClick={()=>setPageNo(n=>n+1)} disabled={!canLoadMore}>โหลดเพิ่ม</button>}
   {selected.length>0&&<button className="fge-primary fge-sticky" onClick={()=>{setArchive(null);setDownloadProgress('');setPage('downloads')}}>ดาวน์โหลดรูปที่เลือก {fmt(selected.length)} รายการ</button>}
  </>}
  {page==='detail'&&detail&&<><div className="fge-detail-image">{imageFor(detail)?<img src={imageFor(detail)} onError={e=>retryPreview(e,preview(detail))} loading="eager" fetchPriority="high" decoding="async" alt={detail.title||'ภาพการแข่งขัน'}/>:<Empty message="ไฟล์นี้ไม่มีภาพตัวอย่าง"/>}</div>
   <div className="fge-card"><h2>{detail.title||'ภาพการแข่งขัน'}</h2><p>{event.title}{detail.captured_at?' · '+new Date(detail.captured_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}):''}</p><p>ไฟล์ต้นฉบับที่มีอยู่จริง</p></div>
   {detail.kind==='photo'&&<button className="fge-primary" data-saved={savedAt?'true':undefined} disabled={preparing} onClick={()=>savePhotos({mediaIds:[detail.id]})}><Icon name={savedAt?'done':'download'}/><span style={{marginLeft:10}}>{preparing?'กำลังเตรียมรูปภาพ…':savedAt?'บันทึกแล้ว':'ดาวน์โหลดรูปภาพ'}</span>{savedAt?<span className="fge-celebrate" aria-hidden="true" key={savedAt}>{[0,1,2,3,4,5,6,7].map(i=><i key={i} style={{'--i':i}}/>)}</span>:null}</button>}
   {detail.kind==='video'&&<a className="fge-primary fge-link-button" href={fileUrl(detail.files.find(f=>f.variant==='VIDEO_ORIGINAL')||{id:''})}>ดาวน์โหลดวิดีโอต้นฉบับ</a>}
   {downloadProgress&&<p className="fge-hint" role="status">{downloadProgress}</p>}
   <p className="fge-hint">ไฟล์ที่ดาวน์โหลดเป็นต้นฉบับ ไม่ลดความละเอียดหรือแก้ไขข้อมูลสี</p>
   <button className="fge-text-link" onClick={()=>{setRemoval(s=>({...s,sent:null}));setPage('removal')}}>ขอถอดภาพนี้</button></>}
  {page==='downloads'&&<><div className="fge-card fge-event-summary"><h2>{selected.length?'รายการที่เลือก':player?.name||event.title}</h2><p>{selected.length?fmt(selected.length)+' รายการที่เลือก':player?fmt(player.photos)+' ภาพ':fmt(event.photos)+' ภาพ'}</p></div>
   <button className="fge-primary" data-saved={savedAt?'true':undefined} disabled={preparing} onClick={()=>savePhotos()}><Icon name={savedAt?'done':'download'}/><span style={{marginLeft:10}}>{preparing?'กำลังเตรียมรูปภาพ…':savedAt?'บันทึกแล้ว':'ดาวน์โหลดรูปภาพ'}</span>{savedAt?<span className="fge-celebrate" aria-hidden="true" key={savedAt}>{[0,1,2,3,4,5,6,7].map(i=><i key={i} style={{'--i':i}}/>)}</span>:null}</button>
   {downloadProgress&&<p className="fge-hint" role="status">{downloadProgress}</p>}
   <p className="fge-hint">ดาวน์โหลดเฉพาะ JPEG ต้นฉบับ ไม่สร้าง ZIP บน iPhone ให้เลือก “บันทึกภาพ” ในเมนูแชร์เพื่อเก็บลงแอปรูปภาพโดยตรง</p>
  </>}
  {page==='removal'&&<div className="fge-card"><h2>ขอถอดภาพ</h2>{removal.sent?<><p>ส่งคำขอแล้ว หมายเลขอ้างอิง {removal.sent}</p><p>ผู้ดูแลจะตรวจสอบและถอดภาพตามคำขอ</p></>:<form className="fge-form" onSubmit={sendRemoval}><p>{detail?'ขอถอดไฟล์ '+(detail.title||'นี้')+' ออกจากอัลบั้ม':'ระบุภาพหรือชื่อเด็กที่ต้องการให้ถอดออกจากอัลบั้ม'}</p><label>รายละเอียด<textarea rows={4} required minLength={5} maxLength={2000} value={removal.description} onChange={e=>setRemoval(s=>({...s,description:e.target.value}))} placeholder="เช่น ขอถอดภาพที่เห็นหน้าลูกชัดเจน"/></label><label>ช่องทางติดต่อกลับ (ไม่บังคับ)<input value={removal.contact} maxLength={200} onChange={e=>setRemoval(s=>({...s,contact:e.target.value}))} placeholder="LINE ID หรือเบอร์โทร"/></label><button className="fge-primary" disabled={removal.busy||removal.description.trim().length<5}>{removal.busy?'กำลังส่ง…':'ส่งคำขอ'}</button></form>}</div>}
  {page==='privacy'&&<div className="fge-card fge-privacy"><h2>ประกาศความเป็นส่วนตัว</h2><p className="fge-prewrap">{event.privacyNotice}</p>{event.retentionUntil&&<p>อัลบั้มนี้เปิดให้เข้าถึงถึง {new Date(event.retentionUntil).toLocaleDateString('th-TH',{dateStyle:'long'})}</p>}<button className="fge-text-link" onClick={()=>{setDetail(null);setRemoval(s=>({...s,sent:null}));setPage('removal')}}>ขอถอดภาพ</button></div>}
  <footer className="fge-footer"><a href="/football-gallery">Football Gallery</a> · <button className="fge-footer-link" onClick={()=>{setDetail(null);setPage('privacy');window.scrollTo({top:0,behavior:'instant'})}}>ความเป็นส่วนตัว / ขอถอดภาพ</button></footer>
 </main>
}
