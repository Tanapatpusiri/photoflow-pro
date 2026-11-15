'use client';
import {useEffect,useState} from 'react';
export default function RetentionDeletionReview({event}){
 const [reviews,setReviews]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const r=await fetch('/api/football-gallery/admin/retention-review?event='+encodeURIComponent(event.id),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message||'โหลดรายการไม่สำเร็จ');setReviews(d.reviews||[]);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{setReviews([]);load()},[event.id]);
 async function prepare(){if(busy)return;setBusy(true);try{const r=await fetch('/api/football-gallery/admin/retention-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:event.id})}),d=await r.json();if(!r.ok)throw Error(d.message||'เตรียมรายการไม่สำเร็จ');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const current=reviews.find(r=>r.state==='prepared');
 return <section className="fga-card"><h2>เตรียมตรวจหลังครบกำหนด</h2><p>เฉพาะเจ้าของ: เตรียมรายการสำหรับงานที่ผ่านวันครบ 1 ปีหลังงานและหมดสิทธิ์เข้าถึงแล้ว ขั้นตอนนี้ยังไม่ใช่การยืนยันลบและไม่ลบไฟล์</p>
  {error&&<p role="alert">{error}</p>}{loading?<p>กำลังโหลด…</p>:current?<><p>เตรียมรายการไว้แล้ว · ตรวจนับจากฐานข้อมูล ณ เวลาที่เตรียม</p><p>ต้นฉบับ {current.snapshot.originals} ไฟล์ · ภาพตัวอย่างและไฟล์อื่น {current.snapshot.previews} ไฟล์ · อัปโหลดค้าง {current.snapshot.pending} ไฟล์</p><p>ยังไม่ได้ตรวจไฟล์จริงในที่เก็บ ไฟล์ที่ไม่มีรายการในระบบ หรือสำเนาสำรอง จึงยังยืนยันไม่ได้ว่าลบครบ การลบจริงต้องมีขั้นตอนและการยืนยันแยก</p></>:<button disabled={busy||!!error} onClick={prepare}>{busy?'กำลังเตรียม…':'เตรียมรายการเพื่อตรวจ'}</button>}
 </section>;
}
