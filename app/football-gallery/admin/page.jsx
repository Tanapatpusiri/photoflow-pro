'use client';
import {useEffect,useState} from 'react';
import '../gallery.css';
import './admin.css';
import Uploader from './upload-client';
import ReviewClient from './review-client';
const api='/api/football-gallery/admin';
export default function FootballAdmin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[events,setEvents]=useState([]),[authorized,setAuthorized]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[venue,setVenue]=useState(''),[date,setDate]=useState('');
 const [active,setActive]=useState(null),[players,setPlayers]=useState([]),[name,setName]=useState(''),[jersey,setJersey]=useState(''),[team,setTeam]=useState('');
 async function load(){
  setLoading(true);
  try{const r=await fetch(api+'/events',{cache:'no-store'}),d=await r.json();if(!r.ok){setAuthorized(false);setMessage(d.message||'กรุณาเข้าสู่ระบบ')}else{setAuthorized(true);setEvents(d.events||[]);setMessage('')}}catch{setMessage('เชื่อมต่อระบบไม่สำเร็จ')}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[]);
 async function login(e){e.preventDefault();if(busy)return;setBusy(true);try{const r=await fetch(api+'/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}),d=await r.json();if(!r.ok){setMessage(d.message||'เข้าสู่ระบบไม่สำเร็จ');return}setPassword('');await load()}catch{setMessage('เครือข่ายขัดข้อง')}finally{setBusy(false)}}
 async function createEvent(e){e.preventDefault();if(busy)return;setBusy(true);try{const r=await fetch(api+'/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,venue,date})}),d=await r.json();if(!r.ok)throw Error(d.message||'สร้างงานไม่สำเร็จ');setTitle('');setVenue('');setDate('');await load()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 async function selectEvent(e){setActive(e);setMessage('');try{const r=await fetch(api+'/players?event='+encodeURIComponent(e.id),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message);setPlayers(d.players||[])}catch(err){setMessage(err.message)}}
 async function addPlayer(e){e.preventDefault();if(busy||!active)return;setBusy(true);try{const r=await fetch(api+'/players',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:active.id,name,jersey,team})}),d=await r.json();if(!r.ok)throw Error(d.message||'เพิ่มเด็กไม่สำเร็จ');setName('');setJersey('');setTeam('');await selectEvent(active)}catch(err){setMessage(err.message)}finally{setBusy(false)}}
 return <main className="fga-root"><div className="fga-shell"><a href="/football-gallery" className="fga-back">‹ Football Gallery</a><header><h1>Studio</h1><p>จัดการอัลบั้มการแข่งขัน • เฉพาะผู้ดูแล</p></header>
  {message&&<div className="fga-message" role="status">{message}</div>}
  {loading?<p>กำลังตรวจสอบสิทธิ์…</p>:!authorized?<section className="fga-card"><h2>เข้าสู่ระบบแอดมิน</h2><p>ต้องเป็นบัญชีที่ได้รับอนุญาตจากเจ้าของระบบ</p><form onSubmit={login}><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button disabled={busy}>{busy?'กำลังตรวจสอบ…':'เข้าสู่ระบบ'}</button></form></section>:<>
    <section className="fga-card"><h2>สร้างงานใหม่</h2><p>งานใหม่จะอยู่ในสถานะ Draft จนกว่าจะตรวจสิทธิ์เผยแพร่ภาพเด็ก</p><form onSubmit={createEvent}><label>ชื่องาน<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={180} placeholder="ชื่อการแข่งขัน"/></label><label>สถานที่<input value={venue} onChange={e=>setVenue(e.target.value)} maxLength={180} placeholder="สถานที่ (ไม่บังคับ)"/></label><label>วันที่งาน<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button disabled={busy||!title.trim()}>{busy?'กำลังบันทึก…':'สร้างอัลบั้มใหม่'}</button></form></section>
    <section className="fga-card"><h2>งานทั้งหมด</h2>{events.length===0?<p>ยังไม่มีงานที่สร้าง</p>:<div className="fga-items">{events.map(e=><button key={e.id} onClick={()=>selectEvent(e)} className={active?.id===e.id?'active':''}><strong>{e.title}</strong><span>{e.status} · {e.players||0} คน · {e.media||0} ไฟล์</span></button>)}</div>}</section>
    {active&&<section className="fga-card"><h2>นักฟุตบอล — {active.title}</h2><div className="fga-items">{players.map(p=><div key={p.id}><strong>{p.name} {p.jersey?'#'+p.jersey:''}</strong><span>{p.team||'ไม่ระบุทีม'} · {p.visible?'แสดง':'รอตรวจสิทธิ์'}</span></div>)}</div><form onSubmit={addPlayer}><label>ชื่อเล่น/ชื่อแสดง<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></label><label>หมายเลขเสื้อ<input value={jersey} onChange={e=>setJersey(e.target.value)} maxLength={12}/></label><label>ทีม<input value={team} onChange={e=>setTeam(e.target.value)} maxLength={100}/></label><button disabled={busy||!name.trim()}>เพิ่มนักฟุตบอล</button></form></section>}
    <section className="fga-card"><h2>อัปโหลด JPEG / RAW / วิดีโอ</h2>{active?<Uploader eventId={active.id}/>:<p>เลือกงานที่ต้องการอัปโหลดก่อน</p>}</section>{active&&<section className="fga-card"><ReviewClient event={active} players={players} onUpdated={load}/></section>}
  </>}
 </div></main>
}
