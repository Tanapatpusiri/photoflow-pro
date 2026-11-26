'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {formatBytes as fmtBytes} from '../../../lib/football-gallery-format';
import {watchImage,imageShown,imageFailed} from '../../../lib/football-gallery-image-fade';
import {flyHeart,headerState,prefersReducedMotion,withViewTransition} from '../../../lib/football-gallery-motion';
import {clampZoom,dismissScale,dragOffset,panZoom,pinchZoom,shouldDismiss,swipeStep,zoomToggle} from '../../../lib/football-gallery-swipe';
import './event.css';
import '../gallery-motion.css';
const paths={
 search:<><circle cx="10.8" cy="10.8" r="6.1"/><path d="m15.4 15.4 4.3 4.3"/></>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 profile:<><circle cx="12" cy="8" r="3.3"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
 play:<><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></>,
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
 shield:<><path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>,
 ball:<><circle cx="12" cy="12" r="9"/><path d="M12 8.8l3.04 2.21-1.16 3.58h-3.76l-1.16-3.58z"/><path d="M12 8.8V3m3.04 8.01 5.52-1.79m-6.68 5.37 3.41 4.69m-7.17-4.69-3.41 4.69m2.25-8.27-5.52-1.79"/></>
};
const Icon=({name,size=22,filled=false})=><svg className="fg-icon" width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
const fmt=n=>Number(n||0).toLocaleString('th-TH');
const base=slug=>'/api/football-gallery/events/'+encodeURIComponent(slug);
const ORIGINAL=['JPEG','RAW','VIDEO_ORIGINAL'];
const normalizePlayerText=value=>String(value||'').trim().normalize('NFC').toLocaleLowerCase('th');
const matchesPlayer=(player,query)=>{
 const term=normalizePlayerText(query).replace(/^#\s*/,'');
 return !term||[player.name,player.nickname,player.jersey].some(value=>normalizePlayerText(value).includes(term));
};
function PlayerAvatar({src,first}){
 const [failed,setFailed]=useState(false);
 return <span className="fge-profile-ring">
  <Icon name="profile" size={29}/>
  {src&&!failed&&<img src={src} alt="" width={64} height={64} loading={first?'eager':'lazy'} fetchPriority="low" decoding="async" draggable={false} onError={()=>setFailed(true)}/>}
 </span>;
}
function PlayerStrip({players,selected,onSelect,fileUrl}){
 const gesture=useRef(null),ignoreClick=useRef(false);
 const start=e=>{
  ignoreClick.current=false;
  if(e.pointerType==='mouse'&&e.button===0)gesture.current={x:e.clientX,left:e.currentTarget.scrollLeft};
 };
 const move=e=>{
  const drag=gesture.current;
  if(!drag)return;
  if(!e.buttons){gesture.current=null;return}
  const dx=e.clientX-drag.x;
  if(!ignoreClick.current&&Math.abs(dx)<6)return;
  ignoreClick.current=true;
  e.currentTarget.setPointerCapture(e.pointerId);
  e.currentTarget.scrollLeft=drag.left-dx;
 };
 return <div className="fge-profile-strip" role="group" aria-label="กรองตามนักเตะ"
  onPointerDown={start} onPointerMove={move} onPointerUp={()=>{gesture.current=null}}
  onPointerCancel={()=>{gesture.current=null}} onClickCapture={e=>{if(ignoreClick.current&&e.detail){e.preventDefault();e.stopPropagation()}}}>
  {players.map((p,index)=><button key={p.id} type="button" className="fge-profile" aria-pressed={selected===p.id}
   aria-label={p.jersey?(p.nickname||p.name)+' #'+p.jersey:p.nickname||p.name} onClick={()=>onSelect(p)}>
    <PlayerAvatar src={p.coverUrl||(p.cover?fileUrl({id:p.cover}):'')} first={index<4}/>
    <span className="fge-profile-name">{p.nickname||p.name}</span>
   </button>)}
 </div>;
}
// Empty lists get a football that drops in and bounces once; other empty states keep the photo icon.
function Empty({message,children,ball=false}){return <div className="fge-empty"><div className="fge-placeholder">{ball?<span className="fge-ball"><Icon name="ball" size={40}/></span>:<Icon name="image" size={40}/>}</div><p>{message}</p>{children}</div>}
// Placeholder photos (with a light sweep) in the same two columns while photos are on their way.
function Skeleton({count,label}){return <div className="fge-photo-grid fge-skeleton-grid" role="status"><span className="fge-sr-only">{label}</span>{[0,1].map(c=><div className="fge-photo-column" key={c}>{Array.from({length:Math.ceil(count/2)},(_,i)=><div className="fge-skeleton" key={i}/>)}</div>)}</div>}
export default function EventExperience({slug,initialData=null,matchdayDate=null}){
 const [matchdays,setMatchdays]=useState(initialData?.matchdays??null);
 const [event,setEvent]=useState(initialData?.event||null),[players,setPlayers]=useState(initialData?.players||[]),[items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(!initialData),[needsAccess,setNeedsAccess]=useState(false);
 const [page,setPage]=useState('photos'),[mediaPage,setMediaPage]=useState('photos'),[player,setPlayer]=useState(null),[detail,setDetail]=useState(null),[filter,setFilter]=useState('all'),[favorites,setFavorites]=useState([]),[selected,setSelected]=useState([]),[pageNo,setPageNo]=useState(1),[hasMore,setHasMore]=useState(false),[query,setQuery]=useState('');
 const [searchOpen,setSearchOpen]=useState(false);
 const searchButton=useRef(null),searchInput=useRef(null);
 const closeSearch=(focus=false)=>{setSearchOpen(false);setQuery('');if(focus)searchButton.current?.focus()};
 const visiblePlayers=useMemo(()=>players.filter(p=>matchesPlayer(p,query)),[players,query]);
 const [archive,setArchive]=useState(null),[preparing,setPreparing]=useState(false),[downloadProgress,setDownloadProgress]=useState('');
 // Saving several photos: share of the photos prepared so far (bar on the save button).
 const [saveProgress,setSaveProgress]=useState(0);
 const [removal,setRemoval]=useState({description:'',contact:'',sent:null,busy:false});
 const listingCache=useRef(new Map());
 const loadMoreTarget=useRef(null);
 const [loadedPage,setLoadedPage]=useState(0);
 const [listFailed,setListFailed]=useState(false);
 const [listRetry,setListRetry]=useState(0);
 const isMediaPage=page==='photos'||page==='videos';
 const isVideo=mediaPage==='videos';
 const canLoadMore=hasMore&&loadedPage===pageNo&&!loading&&!listFailed;
 // Sticky header: hides while scrolling down, comes back on any scroll up (see headerState). Only its
 // own data attributes change while scrolling, never React state.
 const heading=useRef(null),headingState=useRef({hidden:false,scrolled:false,anchor:0});
 const paintHeading=()=>{const el=heading.current,s=headingState.current;if(!el)return;const hidden=s.hidden?'true':'false',scrolled=s.scrolled?'true':'false';if(el.dataset.hidden!==hidden)el.dataset.hidden=hidden;if(el.dataset.scrolled!==scrolled)el.dataset.scrolled=scrolled};
 const revealHeading=()=>{headingState.current={...headingState.current,hidden:false,anchor:window.scrollY};paintHeading()};
 const hasEvent=Boolean(event);
 useEffect(()=>{if(!hasEvent)return;let frame=0;
  const update=()=>{frame=0;headingState.current=headerState({...headingState.current,y:window.scrollY});paintHeading()};
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update)};
  update();window.addEventListener('scroll',onScroll,{passive:true});
  return()=>{window.removeEventListener('scroll',onScroll);cancelAnimationFrame(frame)}},[hasEvent]);
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
  if(!r.ok){if(d.needsAccess&&live)setNeedsAccess(true);throw Error(d.message||'ไม่สามารถเปิดอัลบั้ม')}if(live){setEvent(d.event);setMatchdays(d.matchdays??null);setPlayers(d.players||[]);setError('');if(!d.matchdays&&!navigator.connection?.saveData){listMedia('photo',null,1).catch(()=>{})}}}catch(e){if(live)setError(e.message)}finally{if(live)setLoading(false)}})();return()=>{live=false}},[slug]);
 useEffect(()=>{
  if(!event||matchdays||!isMediaPage)return;
  let live=true;
  setLoading(true);
  setListFailed(false);
  (async()=>{
   try{
    const d=await listMedia(isVideo?'video':'photo',player?.id,pageNo);
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
 },[matchdays,slug,event,isMediaPage,isVideo,player?.id,pageNo,listRetry]);
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
 },[page,pageNo,player?.id,canLoadMore]);
 function resetListing(){
  setLoading(true);setItems([]);setPageNo(1);setLoadedPage(0);setHasMore(false);setListFailed(false);
 }
 // Album tabs: the new tab's content slides in from the side of the tab that was tapped (only after
 // a tab tap; opening or leaving a photo never slides, so the #45 photo morph finds the grid in place).
 const [tabDir,setTabDir]=useState(null);
 const panelKey=mediaPage;
 const resetSelection=()=>{resetListing();setSelected([]);setDetail(null);setFilter('all');setArchive(null);setError('')};
 const selectPlayer=p=>{
  setPlayer(player?.id===p.id?null:p);
  resetSelection();closeSearch();
 };
 // The heart pops only right after it is added (not for favourites restored on page load).
 const [popFav,setPopFav]=useState(null);
 const switchTab=next=>{
  if(next===mediaPage)return;
  setMediaPage(next);setPage(next);resetSelection();
  setTabDir({key:next,dir:next==='videos'?'next':'prev'});
 };
 const toggleFav=id=>{setFavorites(prev=>{const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];try{localStorage.setItem('fg_fav_'+slug,JSON.stringify(next))}catch{}return next})};
 const toggleSelected=id=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
 const viewed=useMemo(()=>items.filter(item=>filter==='favorites'?favorites.includes(item.id):filter==='JPEG'||filter==='RAW'?item.files.some(f=>f.variant===filter):true),[items,filter,favorites]);
 // Favourites: the ♥ count in the header (among the photos/videos listed now, so it matches what the
 // filter shows) switches to favourites only. Adding one sends a heart flying into it; the count
 // bumps when it lands.
 const favCount=useMemo(()=>items.reduce((n,item)=>n+(favorites.includes(item.id)?1:0),0),[items,favorites]);
 const showFav=isMediaPage&&(favCount>0||filter==='favorites');
 const favChip=useRef(null),flight=useRef(null),[bump,setBump]=useState(0);
 const toggleFavFilter=()=>{setFilter(f=>f==='favorites'?'all':'favorites');window.scrollTo({top:0,behavior:'instant'})};
 const launchHeart=button=>{flight.current={button,wasHidden:headingState.current.hidden};revealHeading()};
 useEffect(()=>{const trip=flight.current,chip=favChip.current;flight.current=null;if(!trip||!chip)return;
  const box=chip.getBoundingClientRect(),to=trip.wasHidden?{left:box.left,top:chip.offsetTop,width:box.width,height:box.height}:box;
  flyHeart({from:trip.button.getBoundingClientRect(),to,source:trip.button.querySelector('svg'),onArrive:()=>setBump(n=>n+1)})},[favorites]);
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
 const openDetail=(item,img)=>{gridScroll.current=window.scrollY;setTabDir(null);if(img)img.style.viewTransitionName='fg-photo';
  const transition=withViewTransition(()=>{flushSync(()=>{setDetail(item);setPage('detail');setArchive(null)});window.scrollTo({top:0,behavior:'instant'});return detailReady()});
  const clear=()=>{if(img)img.style.viewTransitionName=''};if(transition)transition.finished.then(clear,clear);else clear()};
 const closeDetail=()=>{const id=detail?.id,target=mediaPage;let tile=null;
  const transition=withViewTransition(()=>{flushSync(()=>setPage(target));window.scrollTo({top:gridScroll.current,behavior:'instant'});tile=id?document.querySelector('.fge-tile-image img[data-media-id="'+CSS.escape(id)+'"]'):null;if(tile){const r=tile.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)window.scrollTo({top:window.scrollY+r.top+r.height/2-innerHeight/2,behavior:'instant'});tile.style.viewTransitionName='fg-photo'}});
  const clear=()=>{if(tile)tile.style.viewTransitionName=''};if(transition)transition.finished.then(clear,clear);else clear()};
 const goBack=()=>{
  if(page==='detail')closeDetail();
  else if(page==='removal'&&detail)setPage('detail');
  else if(!isMediaPage)setPage(mediaPage);
  else window.location.assign(event.parentSlug?'/football-gallery/'+encodeURIComponent(event.parentSlug):'/football-gallery');
 };
 // Photo detail: swipe left/right (or the arrow keys) to the next/previous photo of the list the
 // visitor came from. The photo follows the finger (transform only), with resistance at the ends.
 const detailIndex=detail?viewed.findIndex(item=>item.id===detail.id):-1;
 const detailFrame=useRef(null);
 const stepDetail=(step,fromDx=0)=>{const next=viewed[detailIndex+step],img=detailFrame.current?.querySelector('img');if(!next||preparing)return false;
  const swap=()=>{flushSync(()=>{setDetail(next);setDownloadProgress('');setSavedAt(0)})};
  if(prefersReducedMotion()||typeof img?.animate!=='function'){if(img)img.style.transform='';swap();return true}
  const out=img.animate([{transform:'translateX('+fromDx+'px)',opacity:1},{transform:'translateX('+(-step*110)+'%)',opacity:0}],{duration:170,easing:'ease-in',fill:'forwards'});
  let done=false;const enter=()=>{if(done)return;done=true;out.cancel();img.style.transform='';swap();
   detailFrame.current?.querySelector('img')?.animate?.([{transform:'translateX('+(step*40)+'%)',opacity:0},{transform:'none',opacity:1}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'})};
  out.onfinish=enter;out.oncancel=enter;setTimeout(enter,300);return true};
 // Gestures on the detail photo (its frame has touch-action:none, so every move comes here):
 // sideways = change photo; down at the top of the page = close back into the grid; double tap or
 // pinch = zoom, then one finger pans; any other move scrolls the page.
 const pointers=useRef(new Map()),gesture=useRef(null),zoom=useRef({scale:1,x:0,y:0}),lastTap=useRef(null);
 const frameBox=el=>{const r=el.getBoundingClientRect();return {cx:r.left+r.width/2,cy:r.top+r.height/2,width:r.width,height:r.height}};
 const paintZoom=(img,animate)=>{const z=clampZoom(zoom.current,frameBox(img.parentElement));zoom.current=z;img.style.transition=animate&&!prefersReducedMotion()?'transform .25s cubic-bezier(.2,.8,.2,1)':'';img.style.transform=z.scale>1?'translate('+Math.round(z.x)+'px,'+Math.round(z.y)+'px) scale('+z.scale.toFixed(3)+')':''};
 const settle=img=>{if(!img)return;const from=img.style.transform;img.style.transform='';if(from&&!prefersReducedMotion()&&typeof img.animate==='function')img.animate([{transform:from},{transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'})};
 useEffect(()=>{zoom.current={scale:1,x:0,y:0};gesture.current=null;pointers.current.clear();lastTap.current=null},[detail?.id]);
 const dragStart=e=>{if(e.target.closest?.('video')||detailIndex<0||e.pointerType==='mouse'&&e.button!==0)return;const el=e.currentTarget;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});el.setPointerCapture?.(e.pointerId);
  if(pointers.current.size===2){const [a,b]=[...pointers.current.values()],box=frameBox(el);gesture.current={mode:'pinch',d0:Math.hypot(a.x-b.x,a.y-b.y),m0:{x:(a.x+b.x)/2-box.cx,y:(a.y+b.y)/2-box.cy},z0:{...zoom.current},box};return}
  if(pointers.current.size>1)return;
  const img=el.querySelector('img');if(img)img.style.transition='';
  gesture.current={mode:null,x:e.clientX,y:e.clientY,t:e.timeStamp,lastY:e.clientY,dx:0,dy:0,z0:{...zoom.current},box:frameBox(el)}};
 const dragMove=e=>{if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;if(!g)return;const img=e.currentTarget.querySelector('img');
  if(g.mode==='pinch'){const [a,b]=[...pointers.current.values()];if(!b)return;zoom.current=pinchZoom(g.z0,{d0:g.d0,d:Math.hypot(a.x-b.x,a.y-b.y),m0:g.m0,m:{x:(a.x+b.x)/2-g.box.cx,y:(a.y+b.y)/2-g.box.cy}},g.box);if(img)paintZoom(img,false);return}
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(!g.mode){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;g.mode=zoom.current.scale>1?'pan':Math.abs(dx)>Math.abs(dy)?'x':dy>0&&window.scrollY<=0?'down':'scroll';if(g.mode==='down')e.currentTarget.dataset.gesture='down'}
  if(g.mode==='pan'){zoom.current=panZoom(g.z0,{dx,dy},g.box);if(img)paintZoom(img,false);return}
  if(g.mode==='scroll'){window.scrollBy(0,g.lastY-e.clientY);g.lastY=e.clientY;return}
  if(g.mode==='down'){g.dy=Math.max(0,dy);if(img)img.style.transform='translate('+Math.round(dx*.5)+'px,'+Math.round(g.dy)+'px) scale('+dismissScale(g.dy)+')';return}
  g.dx=dragOffset(dx,{atStart:detailIndex===0,atEnd:detailIndex===viewed.length-1});if(img)img.style.transform='translateX('+g.dx+'px)'};
 const dragEnd=e=>{if(!pointers.current.delete(e.pointerId))return;const g=gesture.current,img=e.currentTarget.querySelector('img');
  if(g?.mode==='pinch'){if(pointers.current.size<2){gesture.current=null;if(zoom.current.scale<1.05){zoom.current={scale:1,x:0,y:0};if(img)paintZoom(img,true)}}return}
  if(pointers.current.size)return;
  gesture.current=null;if(!g)return;
  if(!g.mode){if(e.type!=='pointerup')return;const last=lastTap.current;
   if(last&&e.timeStamp-last.t<300&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<30){lastTap.current=null;const box=frameBox(e.currentTarget);zoom.current=zoomToggle(zoom.current,{x:e.clientX-box.cx,y:e.clientY-box.cy},box);if(img)paintZoom(img,true)}
   else lastTap.current={t:e.timeStamp,x:e.clientX,y:e.clientY};
   return}
  if(g.mode==='pan'||g.mode==='scroll')return;
  if(g.mode==='down'){if(e.type==='pointerup'&&shouldDismiss({dy:e.clientY-g.y,ms:e.timeStamp-g.t})){closeDetail();return}delete e.currentTarget.dataset.gesture;settle(img);return}
  const step=e.type==='pointerup'?swipeStep({dx:e.clientX-g.x,dy:e.clientY-g.y,ms:e.timeStamp-g.t,width:e.currentTarget.clientWidth,index:detailIndex,count:viewed.length}):0;
  if(step&&stepDetail(step,g.dx))return;
  settle(img)};
 useEffect(()=>{if(page!=='detail')return;const onKey=e=>{if(e.defaultPrevented||e.altKey||e.metaKey||e.ctrlKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;if(e.key==='ArrowRight'&&stepDetail(1))e.preventDefault();else if(e.key==='ArrowLeft'&&stepDetail(-1))e.preventDefault()};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)});
 // The photos next to the one shown are fetched ahead, so a swipe lands on a ready photo.
 useEffect(()=>{if(page!=='detail'||detailIndex<0)return;for(const step of [-1,1]){const near=viewed[detailIndex+step],src=near&&imageFor(near);if(src){const pre=new Image();pre.decoding='async';pre.src=src}}},[page,detailIndex,viewed]);
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
  setPreparing(true);setSaveProgress(0);setDownloadProgress('กำลังรวบรวมรูป JPEG ต้นฉบับ…');setError('');
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
    setDownloadProgress('กำลังเตรียมภาพ '+fmt(i+1)+' / '+fmt(originals.length));setSaveProgress((i+1)/originals.length);
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
  }finally{setPreparing(false);setSaveProgress(0)}
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
 if(matchdays)return <main className="fge-shell">
  <header className="fge-nav fge-album-heading"><a className="fge-back" href="/football-gallery" aria-label="ย้อนกลับ"><Icon name="back"/></a><h1>{event.title}</h1><span className="fge-nav-spacer"/></header>
  <div className="fge-playergrid">{matchdays.filter(day=>!matchdayDate||day.date===matchdayDate).map(day=><a className="fge-player fge-matchday" key={day.slug} href={'/football-gallery/'+encodeURIComponent(day.slug)}>
   {day.cover&&<div className="fge-player-cover"><img src={day.cover+'?w=360'} alt="" loading="lazy"/></div>}
   <strong>{day.title}</strong><time dateTime={day.date}>{new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(day.date))}</time>
   <span>{fmt(day.photos)} รูป · {fmt(day.videos)} คลิป</span>
  </a>)}</div>
  {matchdayDate&&<a className="fge-primary fge-link-button" href={'/football-gallery/'+encodeURIComponent(slug)}>ดูทุกวันแข่งขัน</a>}
  {matchdays.length>0&&<button className="fge-primary" disabled={preparing} onClick={()=>prepare({jpeg:true,raw:true,video:true},{scope:'event'})}>{preparing?'กำลังเตรียมไฟล์…':'ดาวน์โหลดต้นฉบับทุกวันแข่งขัน'}</button>}
  {error&&<p role="alert">{error}</p>}
  <Parts/>
  {!matchdays.some(day=>!matchdayDate||day.date===matchdayDate)&&<Empty message="ยังไม่มีวันแข่งขันที่เปิดให้เข้าชม"/>}
 </main>;
 return <main className="fge-shell">
  <header ref={heading} className="fge-nav fge-album-heading"><button onClick={goBack} className="fge-back" aria-label="ย้อนกลับ"><Icon name="back"/></button><h1>{event.title}</h1>{showFav?<button type="button" ref={favChip} className={'fge-fav-chip'+(filter==='favorites'?' active':'')} aria-pressed={filter==='favorites'} aria-label={'รายการโปรด '+fmt(favCount)+' รายการ'} onClick={toggleFavFilter}><Icon name="heart" size={16} filled/><span className="fge-fav-count" key={bump} data-bump={bump?'true':undefined}>{fmt(favCount)}</span></button>:null}{isMediaPage?<button ref={searchButton} type="button" className="fge-back fge-search-toggle" aria-label={searchOpen?'ปิดการค้นหา':'ค้นหานักเตะ'} aria-expanded={searchOpen} onClick={()=>{if(searchOpen)closeSearch();else setSearchOpen(true)}}><Icon name={searchOpen?'close':'search'}/></button>:<span className="fge-nav-spacer"/>}</header>
  {isMediaPage&&<>
   <nav className="fge-album-tabs" aria-label="เนื้อหาอัลบั้ม">
    <button type="button" className={page==='photos'?'active':''} aria-current={page==='photos'?'page':undefined} onClick={()=>switchTab('photos')}><Icon name="image" size={19}/>รูปทั้งหมด</button>
    <button type="button" className={page==='videos'?'active':''} aria-current={page==='videos'?'page':undefined} onClick={()=>switchTab('videos')}><Icon name="play" size={19}/>วิดีโอทั้งหมด</button>
   </nav>
   {searchOpen&&<div className="fge-profile-search" role="search">
    <input ref={searchInput} className="fge-search" type="search" autoFocus enterKeyHint="search" placeholder="ค้นหาชื่อหรือหมายเลขเสื้อ" aria-label="ค้นหาชื่อหรือหมายเลขเสื้อ" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')closeSearch(true)}}/>
    {query&&<button className="fge-search-clear" type="button" aria-label="ล้างคำค้นหา" onClick={()=>{setQuery('');searchInput.current?.focus()}}><Icon name="close" size={16}/></button>}
   </div>}
   {visiblePlayers.length>0?<PlayerStrip players={visiblePlayers} selected={player?.id} onSelect={selectPlayer} fileUrl={fileUrl}/>:searchOpen?<p className="fge-profile-empty" role="status">ไม่พบนักเตะที่ค้นหา</p>:null}
  </>}
  {error&&<div className="fge-alert" role="alert">{error}</div>}
  {isMediaPage&&<div className="fge-tab-panel" key={panelKey} data-dir={tabDir?.key===panelKey?tabDir.dir:undefined} onAnimationEnd={e=>{if(e.target===e.currentTarget)setTabDir(null)}}>
   {loading&&items.length===0?(isVideo?<p className="fge-loading">กำลังโหลด…</p>:<Skeleton count={6} label="กำลังโหลด…"/>):viewed.length===0&&!listFailed?<Empty ball message={player?(isVideo?'ยังไม่มีวิดีโอของนักเตะคนนี้':'ยังไม่มีรูปของนักเตะคนนี้'):'ยังไม่มีไฟล์ในหมวดนี้'}/>:null}
   <div className={isVideo?'fge-video-list':'fge-photo-grid'}>
    {(isVideo?[viewed]:[viewed.filter((_,index)=>index%2===0),viewed.filter((_,index)=>index%2===1)]).map((column,columnIndex)=>
     <div className={isVideo?'fge-video-column':'fge-photo-column'} key={columnIndex}>
      {column.map((item,index)=><article className={'fge-tile'+(selected.includes(item.id)?' is-selected':'')} key={item.id}>
       <button className="fge-tile-image" onClick={e=>openDetail(item,e.currentTarget.querySelector('img'))} aria-label={'เปิด '+(item.title||'ไฟล์')}>
        {imageFor(item)?<img src={imageFor(item)} data-media-id={item.id} ref={watchImage} onLoad={imageShown} onError={e=>imageFailed(e,event=>retryPreview(event,preview(item)))} loading={columnIndex===0&&index<3||columnIndex===1&&index<3?"eager":"lazy"} fetchPriority={index<2?"high":"auto"} decoding="async" alt={item.title||'ภาพการแข่งขัน'}/>:<span className="fge-photo-fallback"><Icon name={item.kind==='video'?'video':'image'} size={34}/></span>}
        {item.kind==='video'&&<span className="fge-video-play"><Icon name="play" size={26}/></span>}
       </button>
       <div className="fge-tile-actions">
        <button onClick={e=>{const adding=!favorites.includes(item.id);toggleFav(item.id);setPopFav(item.id);if(adding)launchHeart(e.currentTarget)}} data-pop={popFav===item.id&&favorites.includes(item.id)?'true':undefined} aria-label="รายการโปรด" aria-pressed={favorites.includes(item.id)}><Icon name="heart" size={17} filled={favorites.includes(item.id)}/></button>
        <button onClick={()=>toggleSelected(item.id)} aria-label="เลือกไฟล์" aria-pressed={selected.includes(item.id)}><Icon name={selected.includes(item.id)?'check':'box'} size={17}/></button>
       </div>
       {item.kind==='video'&&<span className="fge-video-title">{item.title||'วิดีโอการแข่งขัน'}<small>{fmtBytes(item.files.filter(f=>f.variant==='VIDEO_ORIGINAL').reduce((n,f)=>n+Number(f.bytes),0))}</small></span>}
      </article>)}
     </div>
    )}
   </div>
   {hasMore&&!isVideo&&<div ref={loadMoreTarget} aria-hidden="true" style={{height:1}}/>}
   {loading&&pageNo>1&&(isVideo?<p className="fge-hint" role="status">กำลังโหลดชุดถัดไป…</p>:<Skeleton count={2} label="กำลังโหลดชุดถัดไป…"/>)}
   {listFailed?<button type="button" className="fge-load" onClick={()=>{setListFailed(false);setListRetry(n=>n+1)}}>ลองโหลดอีกครั้ง</button>
    :hasMore&&(isVideo||typeof IntersectionObserver==='undefined')&&<button type="button" className="fge-load" onClick={()=>setPageNo(n=>n+1)} disabled={!canLoadMore}>โหลดเพิ่ม</button>}
   {!hasMore&&!loading&&!listFailed&&viewed.length>0&&<p className="fge-end"><Icon name="done" size={16}/>ดูครบแล้ว</p>}
   {selected.length>0&&<button className="fge-primary fge-sticky" onClick={()=>{setArchive(null);setDownloadProgress('');setPage('downloads')}}>ดาวน์โหลดรูปที่เลือก <span className="fge-select-count" key={selected.length}>{fmt(selected.length)}</span> รายการ</button>}
  </div>}
  {page==='detail'&&detail&&<><div className="fge-detail-image" ref={detailFrame} onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>{detail.kind==='video'&&detail.files.some(f=>f.variant==='VIDEO_PREVIEW')
    ?<video controls preload="none" playsInline poster={imageFor(detail)||undefined} src={fileUrl(detail.files.find(f=>f.variant==='VIDEO_PREVIEW'))}/>
    :imageFor(detail)?<img src={imageFor(detail)} draggable={false} key={detail.id} onError={e=>retryPreview(e,preview(detail))} loading="eager" fetchPriority="high" decoding="async" alt={detail.title||'ภาพการแข่งขัน'}/>:<Empty message="ไฟล์นี้ไม่มีภาพตัวอย่าง"/>}</div>
   <div className="fge-card"><h2>{detail.title||'ภาพการแข่งขัน'}</h2><p>{event.title}{detail.captured_at?' · '+new Date(detail.captured_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}):''}</p><p>ไฟล์ต้นฉบับที่มีอยู่จริง</p></div>
   {detail.kind==='photo'&&<button className="fge-primary" data-saved={savedAt?'true':undefined} disabled={preparing} onClick={()=>savePhotos({mediaIds:[detail.id]})}><Icon name={savedAt?'done':'download'}/><span style={{marginLeft:10}}>{preparing?'กำลังเตรียมรูปภาพ…':savedAt?'บันทึกแล้ว':'ดาวน์โหลดรูปภาพ'}</span>{preparing&&saveProgress>0?<span className="fge-save-progress" aria-hidden="true" style={{'--p':saveProgress}}/>:null}{savedAt?<span className="fge-celebrate" aria-hidden="true" key={savedAt}>{[0,1,2,3,4,5,6,7].map(i=><i key={i} style={{'--i':i}}/>)}</span>:null}</button>}
   {detail.kind==='video'&&detail.files.filter(f=>f.variant==='VIDEO_ORIGINAL').map(f=><a key={f.id} className="fge-primary fge-link-button" href={fileUrl(f)}>ดาวน์โหลดวิดีโอต้นฉบับ</a>)}
   {downloadProgress&&<p className="fge-hint" role="status">{downloadProgress}</p>}
   <p className="fge-hint">ไฟล์ที่ดาวน์โหลดเป็นต้นฉบับ ไม่ลดความละเอียดหรือแก้ไขข้อมูลสี</p>
   <button className="fge-text-link" onClick={()=>{setRemoval(s=>({...s,sent:null}));setPage('removal')}}>ขอถอดภาพนี้</button></>}
  {page==='downloads'&&<><div className="fge-card fge-event-summary"><h2>{selected.length?'รายการที่เลือก':player?.name||event.title}</h2><p>{selected.length?fmt(selected.length)+' รายการที่เลือก':player?fmt(player.photos)+' ภาพ':fmt(event.photos)+' ภาพ'}</p></div>
   <button className="fge-primary" data-saved={savedAt?'true':undefined} disabled={preparing} onClick={()=>savePhotos()}><Icon name={savedAt?'done':'download'}/><span style={{marginLeft:10}}>{preparing?'กำลังเตรียมรูปภาพ…':savedAt?'บันทึกแล้ว':'ดาวน์โหลดรูปภาพ'}</span>{preparing&&saveProgress>0?<span className="fge-save-progress" aria-hidden="true" style={{'--p':saveProgress}}/>:null}{savedAt?<span className="fge-celebrate" aria-hidden="true" key={savedAt}>{[0,1,2,3,4,5,6,7].map(i=><i key={i} style={{'--i':i}}/>)}</span>:null}</button>
   {downloadProgress&&<p className="fge-hint" role="status">{downloadProgress}</p>}
   <p className="fge-hint">ดาวน์โหลดเฉพาะ JPEG ต้นฉบับ ไม่สร้าง ZIP บน iPhone ให้เลือก “บันทึกภาพ” ในเมนูแชร์เพื่อเก็บลงแอปรูปภาพโดยตรง</p>
  </>}
  {page==='removal'&&<div className="fge-card"><h2>ขอถอดภาพ</h2>{removal.sent?<><p>ส่งคำขอแล้ว หมายเลขอ้างอิง {removal.sent}</p><p>ผู้ดูแลจะตรวจสอบและถอดภาพตามคำขอ</p></>:<form className="fge-form" onSubmit={sendRemoval}><p>{detail?'ขอถอดไฟล์ '+(detail.title||'นี้')+' ออกจากอัลบั้ม':'ระบุภาพหรือชื่อเด็กที่ต้องการให้ถอดออกจากอัลบั้ม'}</p><label>รายละเอียด<textarea rows={4} required minLength={5} maxLength={2000} value={removal.description} onChange={e=>setRemoval(s=>({...s,description:e.target.value}))} placeholder="เช่น ขอถอดภาพที่เห็นหน้าลูกชัดเจน"/></label><label>ช่องทางติดต่อกลับ (ไม่บังคับ)<input value={removal.contact} maxLength={200} onChange={e=>setRemoval(s=>({...s,contact:e.target.value}))} placeholder="LINE ID หรือเบอร์โทร"/></label><button className="fge-primary" disabled={removal.busy||removal.description.trim().length<5}>{removal.busy?'กำลังส่ง…':'ส่งคำขอ'}</button></form>}</div>}
  {page==='privacy'&&<div className="fge-card fge-privacy"><h2>ประกาศความเป็นส่วนตัว</h2><p className="fge-prewrap">{event.privacyNotice}</p>{event.retentionUntil&&<p>อัลบั้มนี้เปิดให้เข้าถึงถึง {new Date(event.retentionUntil).toLocaleDateString('th-TH',{dateStyle:'long'})}</p>}<button className="fge-text-link" onClick={()=>{setDetail(null);setRemoval(s=>({...s,sent:null}));setPage('removal')}}>ขอถอดภาพ</button></div>}
  <footer className="fge-footer"><a href="/football-gallery">Football Gallery</a> · <button className="fge-footer-link" onClick={()=>{setDetail(null);setPage('privacy');window.scrollTo({top:0,behavior:'instant'})}}>ความเป็นส่วนตัว / ขอถอดภาพ</button></footer>
 </main>
}
