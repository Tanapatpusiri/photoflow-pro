'use client';
import {useEffect,useState} from 'react';
const api='/api/football-gallery/admin/retention-settings';
export default function RetentionSettings({onChange}){
 const [months,setMonths]=useState(''),[canEdit,setCanEdit]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function load(){try{const r=await fetch(api,{cache:'no-store'}),d=await r.json();if(!r.ok){if(d.invalid&&d.canEdit){setMonths('12');setCanEdit(true);setLoaded(true);setError(d.message);onChange(null);return}throw Error(d.message||'โหลดระยะเวลาไม่สำเร็จ')}setMonths(String(d.months));setCanEdit(d.canEdit);setError('');setLoaded(true);onChange(d.months)}catch(e){setError(e.message);setLoaded(false);onChange(null)}}
 useEffect(()=>{load()},[]);
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{const r=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({months:Number(months)})}),d=await r.json();if(!r.ok)throw Error(d.message||'บันทึกไม่สำเร็จ');onChange(d.months);setMonths(String(d.months));setMessage('บันทึกแล้ว ใช้กับอัลบั้มที่จะเผยแพร่ใหม่')}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="fga-card"><h2>ระยะเวลาเก็บภาพ</h2><p>นับจากวันจัดงาน เมื่อครบกำหนดและสิ้นสุดการเข้าถึงแล้ว เจ้าของสามารถเตรียมรายการเพื่อตรวจ การลบต้องรอเจ้าของยืนยันเป็นรายอัลบั้ม ระบบไม่ลบอัตโนมัติ</p><p>ค่านี้ใช้กับอัลบั้มที่จะเผยแพร่ใหม่ อัลบั้มเดิมยังใช้กำหนดเดิม ระยะเวลาเลือกได้ 1–12 เดือน</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{loaded?canEdit?<form onSubmit={save}><label>ระยะเวลา (เดือน)<input type="number" min="1" max="12" step="1" value={months} onChange={e=>setMonths(e.target.value)} required/></label><button disabled={busy||!Number.isInteger(Number(months))||Number(months)<1||Number(months)>12}>{busy?'กำลังบันทึก…':'บันทึกระยะเวลา'}</button></form>:<p>ระยะเวลาที่ตั้งไว้: {months} เดือน · เฉพาะเจ้าของเปลี่ยนได้</p>:<button className="fga-quiet" disabled={busy} onClick={load}>ลองโหลดอีกครั้ง</button>}
 </section>;
}
