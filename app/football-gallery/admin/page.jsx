'use client';
import {useEffect,useState} from 'react';
import '../gallery.css';
import './admin.css';
import Uploader from './upload-client';
import ReviewClient from './review-client';
const api='/api/football-gallery/admin';
const STATUS={draft:'Draft',published:'เผยแพร่',suspended:'ระงับ',archived:'เก็บถาวร'};
export default function FootballAdmin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[events,setEvents]=useState([]),[authorized,setAuthorized]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[venue,setVenue]=useState(''),[date,setDate]=useState('');
 const [activeId,setActiveId]=useState(null),[players,setPlayers]=useState([]),[name,setName]=useState(''),[jersey,setJersey]=useState(''),[team,setTeam]=useState('');
 // The selected event is always read from the latest list, so status changes (e.g. publish) show immediately.
 const active=events.find(e=>e.id===activeId)||null;
 async function load(){
  try{const r=await fetch(api+'/events',{cache:'no-store'}),d=await r.json();if(!r.ok){setAuthorized(false);if(r.status!==401)setMessage(d.message||'เชื่อมต่อระบบไม่สำเร็จ')}else{setAuthorized(true);setEvents(d.events||[])}}catch{setMessage('เชื่อมต่อระบบไม่สำเร็จ')}finally{setLoading(false)}
 }
 async function loadPlayers(id=activeId){if(!id)return;try{const r=await fetch(api+'/players?event='+encodeURIComponent(id),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message);setPlayers(d.players||[])}catch(err){setMessage(err.message)}}
 useEffect(()=>{load()},[]);
 async function login(e){e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const r=await fetch(api+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}),d=await r.json();if(!r.ok){setMessage(d.message||'เข้าสู่ระบบไม่สำเร็จ');return}setPassword('');await load()}catch{setMessage('เครือข่ายขัดข้อง')}finally{setBusy(false)}}
 async function logout(){await fetch(api+'/login',{method:'DELETE'}).catch(()=>{});setAuthorized(false);setEvents([]);setActiveId(null)}
 async function createEvent(e){e.preventDefault();if(busy)return;setBusy(true);try{const r=await fetch(api+'/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,venue,date})}),d=await r.json();if(!r.ok)throw Error(d.message||'สร้างงานไม่สำเร็จ');setTitle('');setVenue('');setDate('');setMessage('');await load();await selectEvent(d.event.id)}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 async function selectEvent(id){setActiveId(id);setMessage('');setPlayers([]);await loadPlayers(id)}
 async function addPlayer(e){e.preventDefault();if(busy||!active)return;setBusy(true);try{const r=await fetch(api+'/players',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:active.id,name,jersey,team})}),d=await r.json();if(!r.ok)throw Error(d.message||'เพิ่มเด็กไม่สำเร็จ');setName('');setJersey('');await loadPlayers();await load()}catch(err){setMessage(err.message)}finally{setBusy(false)}}
 return <main className="fga-root"><div className="fga-shell"><a href="/football-gallery" className="fga-back">‹ Football Gallery</a><header><h1>Studio</h1><p>จัดการอัลบั้มการแข่งขัน • เฉพาะผู้ดูแล</p>{authorized&&<button className="fga-logout" onClick={logout}>ออกจากระบบ</button>}</header>
  {message&&<div className="fga-message" role="status">{message}</div>}
  {loading?<p>กำลังตรวจสอบสิทธิ์…</p>:!authorized?<section className="fga-card"><h2>เข้าสู่ระบบแอดมิน</h2><p>ต้องเป็นบัญชีที่ได้รับอนุญาตจากเจ้าของระบบ</p><form onSubmit={login}><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button disabled={busy}>{busy?'กำลังตรวจสอบ…':'เข้าสู่ระบบ'}</button></form></section>:<>
    <section className="fga-card"><h2>สร้างงานใหม่</h2><p>งานใหม่จะอยู่ในสถานะ Draft จนกว่าจะตรวจสิทธิ์เผยแพร่ภาพเด็ก</p><form onSubmit={createEvent}><label>ชื่องาน<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={180} placeholder="ชื่อการแข่งขัน"/></label><label>สถานที่<input value={venue} onChange={e=>setVenue(e.target.value)} maxLength={180} placeholder="สถานที่ (ไม่บังคับ)"/></label><label>วันที่งาน<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button disabled={busy||!title.trim()}>{busy?'กำลังบันทึก…':'สร้างอัลบั้มใหม่'}</button></form></section>
    <section className="fga-card"><h2>งานทั้งหมด</h2>{events.length===0?<p>ยังไม่มีงานที่สร้าง</p>:<div className="fga-items">{events.map(e=><button key={e.id} onClick={()=>selectEvent(e.id)} className={activeId===e.id?'active':''}><strong>{e.title}</strong><span>{STATUS[e.status]||e.status} · {e.players||0} คน · {e.media||0} รายการ · เผยแพร่ {e.published||0}{e.open_removals?' · คำขอถอดภาพ '+e.open_removals:''}</span></button>)}</div>}</section>
    {active&&<section className="fga-card"><h2>นักฟุตบอล — {active.title}</h2><div className="fga-items">{players.map(p=><div key={p.id}><strong>{p.name} {p.jersey?'#'+p.jersey:''}</strong><span>{p.team||'ไม่ระบุทีม'} · {p.visible?'แสดงในอัลบั้ม':'รอบันทึกสิทธิ์'}</span></div>)}</div><form onSubmit={addPlayer}><label>ชื่อเล่น/ชื่อแสดง<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></label><label>หมายเลขเสื้อ<input value={jersey} onChange={e=>setJersey(e.target.value)} maxLength={12} inputMode="numeric"/></label><label>ทีม<input value={team} onChange={e=>setTeam(e.target.value)} maxLength={100}/></label><button disabled={busy||!name.trim()}>เพิ่มนักฟุตบอล</button></form></section>}
    <section className="fga-card"><h2>อัปโหลด JPEG / RAW / วิดีโอ</h2>{active?(['draft','published'].includes(active.status)?<Uploader eventId={active.id} onUploaded={load}/>:<p>งานที่ระงับหรือเก็บถาวรไม่เปิดรับอัปโหลด</p>):<p>เลือกงานที่ต้องการอัปโหลดก่อน</p>}</section>
    {active&&<section className="fga-card"><ReviewClient event={active} players={players} onUpdated={load} onPlayersChanged={()=>loadPlayers()}/></section>}
  </>}
 </div></main>
}
