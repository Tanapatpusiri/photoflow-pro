'use client';
import {useEffect,useState} from 'react';
const REASON={missing_event_date:'ยังไม่มีวันจัดงาน',missing_retention:'ยังไม่มีวันสิ้นสุดการเข้าถึง',invalid_retention:'วันสิ้นสุดเกิน 1 ปีหลังงาน',expired:'ครบกำหนดแล้ว',upcoming:'ใกล้ครบกำหนดภายใน 30 วัน'};
const fmtDate=value=>value?new Date(value).toLocaleDateString('th-TH',{dateStyle:'medium'}):'ไม่ระบุ';
export default function RetentionReview({onSelect,refreshKey}){
 const [page,setPage]=useState(1),[items,setItems]=useState([]),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setError('');
  fetch('/api/football-gallery/admin/retention?page='+page,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message||'โหลดรายการไม่สำเร็จ');if(live){setItems(d.events||[]);setHasMore(Boolean(d.hasMore))}}).catch(e=>{if(live){setItems([]);setHasMore(false);setError(e.message)}}).finally(()=>{if(live)setLoading(false)});
  return ()=>{live=false};
 },[page,refreshKey]);
 return <section className="fga-card"><h2>อัลบั้มที่ต้องตรวจวันเก็บภาพ</h2><p>แสดงงานที่วันไม่ครบ กำหนดเกิน 1 ปี ครบกำหนดแล้ว หรือใกล้ครบกำหนดภายใน 30 วัน ระบบไม่ลบภาพอัตโนมัติ การลบต้องรอเจ้าของยืนยัน</p>
  {error&&<p role="alert">{error}</p>}{loading?<p>กำลังโหลด…</p>:items.length===0&&!error?<p>ไม่มีอัลบั้มที่ต้องตรวจในหน้านี้</p>:<div className="fga-items">{items.map(e=><button key={e.id} onClick={()=>onSelect(e)}><strong>{e.title}</strong><span>{REASON[e.reason]||'ตรวจวันจัดงาน'} · วันงาน {fmtDate(e.event_date)} · วันสิ้นสุด {fmtDate(e.retention_until)}</span></button>)}</div>}
  <div className="fga-actions"><button className="fga-quiet" disabled={loading||page===1} onClick={()=>setPage(n=>n-1)}>หน้าก่อน</button><span>หน้า {page}</span><button className="fga-quiet" disabled={loading||!hasMore} onClick={()=>setPage(n=>n+1)}>หน้าถัดไป</button></div>
 </section>;
}
