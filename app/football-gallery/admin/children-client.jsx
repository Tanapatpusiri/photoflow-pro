'use client';
import {useEffect,useState} from 'react';
const api='/api/football-gallery/admin';
async function call(path,method,body){const r=await fetch(api+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.message||'ดำเนินการไม่สำเร็จ');return d}
const n=v=>(v||0).toLocaleString('th-TH');

// Children of one album in a single list: add, edit, remove a mistaken entry, withdraw or restore consent.
export default function ChildrenManager({events,initialEvent,onChanged,refreshKey}){
 const [eventId,setEventId]=useState(initialEvent||events[0]?.id||''),[players,setPlayers]=useState([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[info,setInfo]=useState(''),[editing,setEditing]=useState(null),[search,setSearch]=useState('');
 const event=events.find(e=>e.id===eventId);
 const load=async(id=eventId)=>{if(!id)return;setLoading(true);try{const d=await call('/players?event='+encodeURIComponent(id),'GET');setPlayers(d.players||[]);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{if(!eventId&&events[0])setEventId(events[0].id)},[events]);
 useEffect(()=>{setEditing(null);setSearch('');setInfo('');load(eventId)},[eventId]);
 useEffect(()=>{load(eventId)},[refreshKey]);
 const run=async(task,ok)=>{if(busy)return;setBusy(true);setError('');setInfo('');try{await task();await load();await onChanged?.(eventId);if(ok)setInfo(ok)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const save=e=>{e.preventDefault();if(!editing.name.trim())return;run(async()=>{await call('/players','PATCH',{player:editing.id,name:editing.name,jersey:editing.jersey||'',team:editing.team||''});setEditing(null)},'บันทึกแล้ว')};
 const remove=p=>{if(!confirm(`ลบ ${p.name} ออกจากอัลบั้มนี้? ใช้สำหรับชื่อที่เพิ่มผิด แท็กในภาพที่ยังไม่เผยแพร่จะถูกเอาออกด้วย`))return;run(()=>call('/players?player='+encodeURIComponent(p.id),'DELETE'),'ลบ '+p.name+' แล้ว')};
 const withdraw=p=>{if(!confirm(`ถอนความยินยอมของ ${p.name}?\n\nภาพที่มี ${p.name} จะถูกนำออกจากอัลบั้มทันที ชื่อจะไม่แสดงให้ผู้ปกครองเห็น และจะอนุมัติภาพของเด็กคนนี้ไม่ได้จนกว่าจะให้ความยินยอมอีกครั้ง`))return;run(()=>call('/review','POST',{action:'revoke-player-privacy',eventId,playerId:p.id}),'ถอนความยินยอมของ '+p.name+' แล้ว')};
 const restore=p=>{const evidence=prompt(`ผู้ปกครองของ ${p.name} ให้ความยินยอมอีกครั้ง ระบุหลักฐานที่ตามหาได้ (เช่น เลขแบบฟอร์ม) อย่างน้อย 5 ตัวอักษร`,'');if(evidence===null)return;if(evidence.trim().length<5){setError('กรุณาระบุหลักฐานอย่างน้อย 5 ตัวอักษร');return}run(()=>call('/review','POST',{action:'player-privacy',eventId,playerId:p.id,basis:'ผู้ปกครองให้ความยินยอมอีกครั้ง',evidence:evidence.trim(),confirmed:true}),'บันทึกความยินยอมของ '+p.name+' แล้ว')};
 const q=search.trim().toLowerCase();
 const shown=q?players.filter(p=>[p.name,p.jersey,p.team].some(v=>v&&String(v).toLowerCase().includes(q))):players;
 if(!events.length)return <section className="fga-card fga-empty"><h2>ยังไม่มีอัลบั้ม</h2><p>สร้างอัลบั้มในแท็บ "อัลบั้ม" ก่อน แล้วค่อยเพิ่มรายชื่อเด็ก</p></section>;
 return <section className="fga-card fga-children">
  <div className="fga-children-head"><h2>นักฟุตบอลในอัลบั้มนี้</h2></div>
  <p>รายชื่อเด็กของอัลบั้ม {event?.title} ใช้สำหรับเลือกตอนตรวจภาพ และให้ผู้ปกครองค้นหาภาพของบุตรหลาน</p>
  {error&&<div className="fga-message" role="alert">{error}</div>}
  {info&&<div className="fga-message fga-ok" role="status">{info}</div>}
  {players.length>8&&<input className="fga-children-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อ เบอร์ หรือทีม" aria-label="ค้นหาเด็ก"/>}
  {loading?<p>กำลังโหลด…</p>:players.length===0?<p>ยังไม่มีนักฟุตบอลในอัลบั้มนี้ เลือกจากทะเบียนกลางด้านบน</p>:
  <ul className="fga-children-list">{shown.map(p=><li key={p.id} className={p.consent_withdrawn?'withdrawn':''}>
   {editing?.id===p.id?<form className="fga-children-edit" onSubmit={save}>
    <input value={editing.name} onChange={e=>setEditing(x=>({...x,name:e.target.value}))} maxLength={100} aria-label="ชื่อเด็ก" required autoFocus/>
    <input value={editing.jersey||''} onChange={e=>setEditing(x=>({...x,jersey:e.target.value}))} placeholder="เบอร์" maxLength={12} aria-label="เบอร์เสื้อ"/>
    <input value={editing.team||''} onChange={e=>setEditing(x=>({...x,team:e.target.value}))} placeholder="ทีม" maxLength={100} aria-label="ทีม"/>
    <div className="fga-actions"><button className="fga-primary" disabled={busy}>บันทึก</button><button type="button" className="fga-chip" onClick={()=>setEditing(null)}>ยกเลิก</button></div>
   </form>:<>
    <div className="fga-children-info"><strong>{p.name}{p.jersey?' #'+p.jersey:''}</strong>
     <span>{p.age_group?p.age_group+' · ':''}{p.team?p.team+' · ':''}อยู่ในภาพ {n(p.photos)} · เผยแพร่แล้ว {n(p.published_photos)}</span>
     {p.consent_withdrawn&&<em>ถอนความยินยอมแล้ว · ภาพของเด็กคนนี้ไม่แสดงให้ผู้ปกครอง</em>}
    </div>
    <div className="fga-actions">
     <button className="fga-chip" disabled={busy} onClick={()=>setEditing({id:p.id,name:p.name,jersey:p.jersey||'',team:p.team||''})}>แก้ไข</button>
     {p.consent_withdrawn?<button className="fga-chip" disabled={busy} onClick={()=>restore(p)}>ให้ความยินยอมอีกครั้ง</button>:<button className="fga-chip" disabled={busy} onClick={()=>withdraw(p)}>ถอนความยินยอม</button>}
     <button className="fga-chip fga-chip-danger" disabled={busy||p.published_photos>0} title={p.published_photos>0?'มีภาพที่เผยแพร่แล้ว ใช้ "ถอนความยินยอม" แทน':undefined} onClick={()=>remove(p)}>ลบ</button>
    </div>
   </>}
  </li>)}</ul>}
  {q&&shown.length===0&&<p>ไม่พบชื่อที่ค้นหา</p>}
 </section>;
}
