'use client';
import {useEffect,useState} from 'react';
import '../gallery.css';
import './admin.css';
import './admin-motion.css';
import Uploader from './upload-client';
import ReviewClient from './review-client';
import ChildrenManager from './children-client';
import PlayerRegistry from './player-registry-client';
import AlbumFront from './album-front-client';
import StorageCard from './storage-client';
import RetentionReview from './retention-client';
import RetentionDeletionReview from './retention-deletion-client';
import RetentionSettings from './retention-settings-client';
const api='/api/football-gallery/admin';
const STATUS={draft:'Draft',published:'เผยแพร่',suspended:'ระงับ',archived:'เก็บถาวร'};
// One album at a time, in the order the work is done.
const ALBUM_TABS=[['players','นักฟุตบอล'],['upload','อัปโหลด'],['review','ตรวจภาพ'],['publish','เผยแพร่ & แชร์'],['requests','คำขอ & ประวัติ'],['retention','เก็บรักษา']];
const isAlbumTab=t=>ALBUM_TABS.some(([k])=>k===t);
const fmtDay=v=>v?new Date(v).toLocaleDateString('th-TH',{dateStyle:'medium',timeZone:'UTC'}):'';
const pending=e=>Math.max(0,(e?.media||0)-(e?.published||0));
// Open the step that needs attention first.
const defaultTab=e=>!e?'review':e.album_mode==='multi-day'?'publish':e.open_removals?'requests':!e.media?'upload':pending(e)?'review':'publish';
// What to do next in this album, in plain words, with the tab that does it.
function nextStep(e){
 if(!e||['suspended','archived'].includes(e.status))return null;
 if(e.open_removals)return {tab:'requests',text:`มีคำขอถอดภาพ ${e.open_removals} รายการรอดำเนินการ`,action:'ดูคำขอ'};
 if(!e.media)return {tab:'upload',text:'ขั้นต่อไป: อัปโหลดรูปเข้าอัลบั้มนี้',action:'อัปโหลดรูป'};
 if(pending(e))return {tab:'review',text:`ขั้นต่อไป: ตรวจและอนุมัติภาพ ${pending(e)} รายการ`,action:'ตรวจภาพ'};
 if(e.status==='draft')return {tab:'publish',text:'ภาพพร้อมแล้ว ขั้นต่อไป: เผยแพร่อัลบั้มให้ผู้ปกครอง',action:'เผยแพร่'};
 return {tab:'publish',text:'อัลบั้มเผยแพร่แล้ว ส่งลิงก์หรือรหัสให้ผู้ปกครองได้',action:'ส่งลิงก์'};
}
function Badge({status}){return <span className={'fga-badge '+status}>{STATUS[status]||status}</span>}
function Stats({e}){return <div className="fga-stats"><span>{e.media||0} รายการ</span><span>เผยแพร่ {e.published||0}</span>{pending(e)>0&&<span className="alert">รอตรวจ {pending(e)}</span>}<span>{e.players||0} นักฟุตบอล</span>{e.open_removals>0&&<span className="alert">คำขอถอดภาพ {e.open_removals}</span>}</div>}

export default function FootballAdmin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[events,setEvents]=useState([]),[authorized,setAuthorized]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[venue,setVenue]=useState(''),[date,setDate]=useState(''),[newLocked,setNewLocked]=useState(false),[showCreate,setShowCreate]=useState(false);
 const [albumMode,setAlbumMode]=useState('single'),[dayTitle,setDayTitle]=useState(''),[dayDate,setDayDate]=useState('');
 const [missingDate,setMissingDate]=useState('');
 const [retentionRefresh,setRetentionRefresh]=useState(0);
 const [uploadKey,setUploadKey]=useState(0);
 const [retentionMonths,setRetentionMonths]=useState(null);
 const [view,setView]=useState('albums'),[albumTab,setAlbumTab]=useState('review');
 const [activeId,setActiveId]=useState(null),[players,setPlayers]=useState([]);
 // The selected event is always read from the latest list, so status changes (e.g. publish) show immediately.
 const active=events.find(e=>e.id===activeId)||null;
 async function load(want=activeId){
  try{const r=await fetch(api+'/events',{cache:'no-store'}),d=await r.json();if(!r.ok){setAuthorized(false);if(r.status!==401)setMessage(d.message||'เชื่อมต่อระบบไม่สำเร็จ')}else{setAuthorized(true);const latest=d.events||[];if(want&&!latest.some(e=>e.id===want)){const one=await fetch(api+'/events?event='+encodeURIComponent(want),{cache:'no-store'});if(one.ok){const detail=await one.json();latest.push(...(detail.events||[]))}}setEvents(latest);setRetentionRefresh(n=>n+1)}}catch{setMessage('เชื่อมต่อระบบไม่สำเร็จ')}finally{setLoading(false)}
 }
 async function loadPlayers(id=activeId){if(!id)return;try{const r=await fetch(api+'/players?event='+encodeURIComponent(id),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message);setPlayers(d.players||[])}catch(err){setMessage(err.message)}}
 // Restore the album and step from the address bar, so a reload keeps the admin where they were.
 useEffect(()=>{
  const q=new URLSearchParams(location.search),album=q.get('album'),tab=q.get('tab');
  if(q.get('drive')||q.get('view')==='settings')setView('settings');
  else if(q.get('view')==='children')setView('children');
  if(album){setActiveId(album);setAlbumTab(isAlbumTab(tab)?tab:'review');loadPlayers(album)}
  load(album);
 },[]);
 useEffect(()=>{
  if(loading||!authorized)return;
  const q=new URLSearchParams();
  if(view==='settings')q.set('view','settings');
  else if(view==='children')q.set('view','children');
  else if(activeId){q.set('album',activeId);q.set('tab',albumTab)}
  const s=q.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:''));
 },[view,activeId,albumTab,loading,authorized]);
 async function login(e){e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const r=await fetch(api+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}),d=await r.json();if(!r.ok){setMessage(d.message||'เข้าสู่ระบบไม่สำเร็จ');return}setPassword('');await load()}catch{setMessage('เครือข่ายขัดข้อง')}finally{setBusy(false)}}
 // The publish step needs the retention period, so it is loaded on sign-in rather than only when Settings is opened.
 useEffect(()=>{if(!authorized)return;fetch(api+'/retention-settings',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&Number.isInteger(d.months))setRetentionMonths(m=>m??d.months)}).catch(()=>{})},[authorized,retentionRefresh]);
 async function logout(){await fetch(api+'/login',{method:'DELETE'}).catch(()=>{});setAuthorized(false);setEvents([]);setActiveId(null);setRetentionMonths(null);setView('albums');history.replaceState(null,'',location.pathname)}
 async function createEvent(e){e.preventDefault();if(busy)return;setBusy(true);try{const r=await fetch(api+'/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,venue,date,locked:newLocked,albumMode})}),d=await r.json();if(!r.ok)throw Error(d.message||'สร้างงานไม่สำเร็จ');setTitle('');setVenue('');setDate('');setNewLocked(false);setAlbumMode('single');setShowCreate(false);setMessage('');await load(d.event.id);await selectEvent(d.event.id,albumMode==='multi-day'?'publish':'players')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 async function saveAlbumStructure(method,body){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const response=await fetch(api+'/events',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const data=await response.json();
   if(!response.ok)throw Error(data.message);
   if(data.event){setDayTitle('');setDayDate('');await load(data.event.id);await selectEvent(data.event.id,'upload')}
   else{if(body.albumMode==='multi-day')setAlbumTab('publish');await load()}
  }catch(err){setMessage(err.message||'บันทึกไม่สำเร็จ')}finally{setBusy(false)}
 }
 async function selectEvent(id,tab){setView('albums');setActiveId(id);setAlbumTab(tab||defaultTab(events.find(e=>e.id===id)));setMessage('');setPlayers([]);setMissingDate('');window.scrollTo({top:0});await loadPlayers(id)}
 function closeAlbum(){setActiveId(null);setMessage('');setMissingDate('')}
 async function selectRetentionEvent(event){setEvents(old=>old.some(e=>e.id===event.id)?old:[...old,event]);await selectEvent(event.id,'retention')}
 async function saveEventDate(e){e.preventDefault();if(busy||!active||!missingDate)return;setBusy(true);try{const r=await fetch(api+'/events',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({event:active.id,date:missingDate})}),d=await r.json();if(!r.ok)throw Error(d.message||'บันทึกวันจัดงานไม่สำเร็จ');setMissingDate('');setMessage('บันทึกวันจัดงานแล้ว');await load()}catch(err){setMessage(err.message)}finally{setBusy(false)}}
 const counts={upload:0,review:pending(active),requests:active?.open_removals||0,players:active?.players||0};
 const multiDay=active?.album_mode==='multi-day';
 const canUpload=active&&!multiDay&&['draft','published'].includes(active.status);

 return <main className="fga-root"><div className="fga-shell"><a href="/football-gallery" className="fga-back">‹ Football Gallery</a><header><h1>Studio</h1><p>จัดการอัลบั้มการแข่งขัน • เฉพาะผู้ดูแล</p>{authorized&&<button className="fga-logout" onClick={logout}>ออกจากระบบ</button>}</header>
  {loading?<p>กำลังตรวจสอบสิทธิ์…</p>:!authorized?<>{message&&<div className="fga-message" role="status">{message}</div>}<section className="fga-card"><h2>เข้าสู่ระบบแอดมิน</h2><p>ต้องเป็นบัญชีที่ได้รับอนุญาตจากเจ้าของระบบ</p><form onSubmit={login}><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button disabled={busy}>{busy?'กำลังตรวจสอบ…':'เข้าสู่ระบบ'}</button></form></section></>:<>
   <nav className="fga-tabs fga-tabs-main" aria-label="ส่วนของ Studio">
    <button className={view==='albums'?'active':''} aria-current={view==='albums'?'page':undefined} onClick={()=>setView('albums')}>อัลบั้ม</button>
    <button className={view==='children'?'active':''} aria-current={view==='children'?'page':undefined} onClick={()=>setView('children')}>จัดการเด็ก</button>
    <button className={view==='settings'?'active':''} aria-current={view==='settings'?'page':undefined} onClick={()=>setView('settings')}>ตั้งค่าระบบ</button>
   </nav>
   {message&&<div className="fga-message" role="status">{message}</div>}

   {view==='settings'?<>
    <StorageCard/>
    <RetentionSettings onChange={setRetentionMonths}/>
    <RetentionReview onSelect={selectRetentionEvent} refreshKey={retentionRefresh}/>
   </>:view==='children'?<PlayerRegistry/>
   :!active?<>
    <div className="fga-row"><h2 className="fga-section-title">อัลบั้มทั้งหมด</h2><button className="fga-primary" onClick={()=>setShowCreate(s=>!s)} aria-expanded={showCreate}>{showCreate?'ปิด':'+ สร้างอัลบั้ม'}</button></div>
    {showCreate&&<section className="fga-card"><h2>สร้างอัลบั้มใหม่</h2><p>อัลบั้มใหม่จะเป็น Draft และผู้ปกครองยังเข้าไม่ได้ จนกว่าจะตรวจสิทธิ์และกดเผยแพร่</p><form onSubmit={createEvent}><label>ชื่องาน<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={180} placeholder="ชื่อการแข่งขัน"/></label><label>รูปแบบอัลบั้ม<select className="fga-album-mode" value={albumMode} onChange={e=>setAlbumMode(e.target.value)}><option value="single">วันเดียว</option><option value="multi-day">หลายวัน</option></select></label><label>สถานที่<input value={venue} onChange={e=>setVenue(e.target.value)} maxLength={180} placeholder="สถานที่ (ไม่บังคับ)"/></label><label>วันที่งาน<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="fga-check fga-new-lock"><input type="checkbox" checked={newLocked} onChange={e=>setNewLocked(e.target.checked)}/><span><b>ล็อกอัลบั้มนี้</b> · หากเลือก ผู้ชมต้องมีรหัสหรือลิงก์เชิญ อัลบั้มที่ไม่เลือกจะเปิดให้เข้าชมได้หลังอนุมัติเผยแพร่</span></label><button disabled={busy||!title.trim()}>{busy?'กำลังบันทึก…':'สร้างอัลบั้ม'}</button></form></section>}
    {events.length===0?<section className="fga-card fga-empty"><h2>ยังไม่มีอัลบั้ม</h2><p>เริ่มจากกด "สร้างอัลบั้ม" แล้วเพิ่มนักฟุตบอลและอัปโหลดรูป</p></section>
    :<div className="fga-album-grid">{events.filter(e=>!e.parent_event_id).map(e=><button key={e.id} className="fga-album-card" onClick={()=>selectEvent(e.id)}>
      <span className="fga-row"><strong>{e.title}</strong><Badge status={e.status}/></span>
      <span className="fga-meta">{e.event_date?fmtDay(e.event_date):'ยังไม่ระบุวันจัดงาน'}{e.venue?' · '+e.venue:''}</span>
      <Stats e={e}/>
     </button>)}</div>}
   </>:<>
    <button className="fga-link fga-crumb" onClick={()=>active.parent_event_id?selectEvent(active.parent_event_id,'publish'):closeAlbum()}>{active.parent_event_id?'‹ อัลบั้มหลัก':'‹ อัลบั้มทั้งหมด'}</button>
    <section className="fga-card fga-album-head">
     <div className="fga-row"><h2>{active.title}</h2><Badge status={active.status}/></div>
     <p className="fga-meta">{active.event_date?'วันจัดงาน '+fmtDay(active.event_date):'ยังไม่ระบุวันจัดงาน'}{active.venue?' · '+active.venue:''}{active.retention_until?' · เปิดให้เข้าถึงถึง '+fmtDay(active.retention_until):''}</p>
     <Stats e={active}/>
     {(()=>{const next=multiDay?null:nextStep(active);return <div className="fga-next-step">{next&&<p>{next.text}</p>}<div className="fga-actions">{next&&albumTab!==next.tab&&<button className="fga-primary" onClick={()=>setAlbumTab(next.tab)}>{next.action} ›</button>}{canUpload&&albumTab!=='upload'&&next?.tab!=='upload'&&<button className="fga-secondary" onClick={()=>setAlbumTab('upload')}>+ อัปโหลดรูป</button>}</div></div>})()}
    </section>
    {!active.parent_event_id&&<section className="fga-card">
     <label>รูปแบบอัลบั้ม<select className="fga-album-mode" value={multiDay?'multi-day':'single'} disabled={busy} onChange={e=>saveAlbumStructure('PATCH',{event:active.id,albumMode:e.target.value})}><option value="single">วันเดียว</option><option value="multi-day">หลายวัน</option></select></label>
    </section>}
    {multiDay&&<section className="fga-card">
     <h2>วันแข่งขัน</h2>
     <div className="fga-items">{events.filter(e=>e.parent_event_id===active.id).sort((a,b)=>a.event_date.localeCompare(b.event_date)).map(day=><button type="button" key={day.id} onClick={()=>selectEvent(day.id)}><strong>{day.title}</strong><span>{fmtDay(day.event_date)}</span><Badge status={day.status}/></button>)}</div>
     <form onSubmit={e=>{e.preventDefault();saveAlbumStructure('POST',{parentEventId:active.id,title:dayTitle,date:dayDate,venue:active.venue})}}>
      <label>ชื่อวันแข่งขัน<input value={dayTitle} maxLength={180} required onChange={e=>setDayTitle(e.target.value)}/></label>
      <label>วันที่แข่งขัน<input type="date" value={dayDate} required onChange={e=>setDayDate(e.target.value)}/></label>
      <button disabled={busy||!dayTitle.trim()||!dayDate}>เพิ่มวันแข่งขัน</button>
     </form>
    </section>}
    {!active.event_date&&['draft','published','suspended'].includes(active.status)&&<section className="fga-card fga-attention"><h2>ต้องระบุวันจัดงาน</h2><p>ใช้คำนวณวันสิ้นสุดการเข้าถึง และต้องมีก่อนเผยแพร่{active.status==='published'?' การบันทึกอาจเปิดให้ผู้มีสิทธิ์เข้าถึงอัลบั้มอีกครั้งทันทีหากยังไม่หมดอายุ':''}</p><form onSubmit={saveEventDate}><label>วันที่จัดงาน<input type="date" value={missingDate} onChange={e=>setMissingDate(e.target.value)} required/></label><button disabled={busy||!missingDate}>บันทึกวันจัดงาน</button></form></section>}
    <nav className="fga-tabs" aria-label="ขั้นตอนของอัลบั้ม">{ALBUM_TABS.filter(([key])=>!multiDay||['publish','retention','requests'].includes(key)).map(([k,l])=><button key={k} className={albumTab===k?'active':''} aria-current={albumTab===k?'step':undefined} onClick={()=>setAlbumTab(k)}>{l}{counts[k]>0&&<span className={'fga-count'+(k==='requests'||k==='review'?' alert':'')}>{counts[k]}</span>}</button>)}</nav>

    {!multiDay&&albumTab==='players'&&<PlayerRegistry key={active.id} eventId={active.id} eventPlayers={players} onChanged={async()=>{await loadPlayers(active.id);await load()}}/>}
    {!multiDay&&albumTab==='players'&&<ChildrenManager key={active.id} events={[active]} initialEvent={active.id} refreshKey={players.map(p=>p.id).join(',')} onChanged={async()=>{await loadPlayers(active.id);await load()}}/>}
    {!multiDay&&albumTab==='upload'&&<section className="fga-card"><h2>อัปโหลด JPEG / RAW / วิดีโอ</h2>{canUpload?<Uploader eventId={active.id} album={{media:active.media||0,pending:pending(active),live:active.status==='published'}} onUploaded={()=>{setUploadKey(n=>n+1);return load()}} onReview={()=>setAlbumTab('review')} onPublish={()=>setAlbumTab('publish')}/>:<p>อัลบั้มที่ระงับหรือเก็บถาวรไม่เปิดรับอัปโหลด</p>}
    </section>}
    {!multiDay&&albumTab==='review'&&<details className="fga-card"><summary>เพิ่มนักฟุตบอลจากทะเบียน</summary><PlayerRegistry key={active.id} eventId={active.id} eventPlayers={players} onChanged={async()=>{await loadPlayers(active.id);await load()}}/></details>}
    {albumTab==='publish'&&<AlbumFront event={active} onChanged={()=>load()}/>}
    {(multiDay?['publish','requests']:['players','review','publish','requests']).includes(albumTab)&&<section className="fga-card"><ReviewClient view={albumTab} event={active} matchdayTargets={active.parent_event_id?events.filter(e=>e.id!==active.id&&e.parent_event_id===active.parent_event_id&&['draft','published'].includes(e.status)):[]} players={players} retentionMonths={retentionMonths} uploadKey={uploadKey} onUpdated={load} onPlayersChanged={()=>loadPlayers()} onNavigate={setAlbumTab}/></section>}
    {albumTab==='retention'&&<RetentionDeletionReview key={active.id} event={active}/>}
   </>}
  </>}
 </div></main>
}
