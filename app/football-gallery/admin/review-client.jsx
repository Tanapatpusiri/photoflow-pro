'use client';
import {useEffect,useState} from 'react';
const api='/api/football-gallery/admin';
async function post(path,body){const r=await fetch(api+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.message||'ดำเนินการไม่สำเร็จ');return d}
export default function ReviewClient({event,players,onUpdated}){
 const [items,setItems]=useState([]),[active,setActive]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
 const [tags,setTags]=useState([]),[basis,setBasis]=useState(''),[evidence,setEvidence]=useState(''),[attest,setAttest]=useState(false),[notice,setNotice]=useState(''),[invite,setInvite]=useState(null);
 const [privacyPlayer,setPrivacyPlayer]=useState('');
 const load=async(p=1)=>{setLoading(true);try{const r=await fetch(api+'/media?event='+encodeURIComponent(event.id)+'&page='+p,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message);setItems(old=>p===1?d.items:[...old,...d.items]);setHasMore(d.hasMore);setPage(p);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{setActive(null);setItems([]);setPage(1);load(1)},[event.id]);
 const select=item=>{setActive(item);setTags(item.players||[]);setBasis('');setEvidence('');setAttest(false);setError('')};
 const mutate=async(action,data={})=>{if(busy)return;setBusy(true);setError('');try{await post('/review',{action,eventId:event.id,mediaId:active?.id,...data});await load(1);setActive(null);await onUpdated?.()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const verify=async file=>{if(busy)return;setBusy(true);try{await post('/verify-file',{fileId:file.id});await load(1)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const createGrant=async type=>{if(busy)return;setBusy(true);try{const result=await post('/grants',{event:event.id,type,days:14});setInvite(result)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <div className="fga-review">
  <h2>ตรวจภาพก่อนเผยแพร่</h2><p>ทุกไฟล์จะถูกปิดไว้จนกว่าตรวจสิทธิ์เด็ก Metadata และ SHA-256 เสร็จ</p>
  {error&&<div className="fga-message" role="alert">{error}</div>}
  {active?<div className="fga-review-detail">
   <button className="fga-link" onClick={()=>setActive(null)}>‹ กลับรายการ</button>
   {active.thumb&&<img className="fga-review-photo" src={active.thumb} alt="ภาพสำหรับผู้ดูแลตรวจสอบก่อนเผยแพร่"/>}
   <h3>{active.title||active.id.slice(0,8)} · {active.kind}</h3>
   <p>สถานะ: {active.status}</p>
   <div className="fga-items">{active.files.map(f=><div key={f.id}><strong>{f.variant} · {f.filename}</strong><span>{(f.bytes/1e6).toFixed(1)} MB · {f.verifiedHash?'SHA-256 ผ่าน':'รอตรวจ SHA-256'}</span>{!f.verifiedHash&&['JPEG','RAW','VIDEO_ORIGINAL'].includes(f.variant)&&<button onClick={()=>verify(f)} disabled={busy}>ตรวจสอบ SHA-256</button>}</div>)}</div>
   <h3>แท็กนักฟุตบอล</h3><p>ภาพหนึ่งภาพแท็กเด็กได้หลายคนโดยไม่คัดลอกไฟล์</p>
   <div className="fga-checkboxes">{players.map(p=><label key={p.id}><input type="checkbox" checked={tags.includes(p.id)} onChange={e=>setTags(s=>e.target.checked?[...s,p.id]:s.filter(x=>x!==p.id))}/>{p.name} {p.jersey&&'#'+p.jersey}</label>)}</div>
   <button className="fga-quiet" disabled={busy} onClick={()=>mutate('tag',{players:tags})}>บันทึกแท็ก</button>
   <h3>ยืนยันการเผยแพร่</h3>
   <label>ฐานทางกฎหมาย / ขอบเขตการอนุญาต<input value={basis} onChange={e=>setBasis(e.target.value)} placeholder="กรอกเฉพาะข้อมูลที่ตรวจสอบได้จริง"/></label>
   <label>หลักฐานการอนุญาต / อ้างอิง<input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="รหัสเอกสารหรือข้อมูลหลักฐาน"/></label>
   <label className="fga-check"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>ตรวจสิทธิ์เด็กทุกคนที่ปรากฏในภาพและ Metadata แล้ว</label>
   <button disabled={busy||!attest||basis.length<5||evidence.length<5} onClick={()=>mutate('approve',{basis,evidence,confirmed:attest})}>อนุมัติภาพนี้สำหรับ Private Gallery</button>
   <button className="fga-danger" disabled={busy} onClick={()=>mutate('hide')}>ซ่อนภาพนี้</button>
  </div>:<><div className="fga-review-grid">{items.map(item=><button key={item.id} className="fga-review-tile" onClick={()=>select(item)}>{item.thumb?<img src={item.thumb} alt="ภาพรอตรวจ" loading="lazy"/>:<div className="fga-review-placeholder">ยังไม่มี Preview</div>}<strong>{item.kind==='photo'?'รูปภาพ':'วิดีโอ'}</strong><span>{item.status} · {item.files.length} ไฟล์</span></button>)}</div>{loading&&<p>กำลังโหลด…</p>}{items.length===0&&!loading&&<p>ยังไม่มีภาพที่อัปโหลดในงานนี้</p>}{hasMore&&<button onClick={()=>load(page+1)} disabled={loading}>โหลดภาพเพิ่ม</button>}</>}
  <div className="fga-review-policy">
   <h3>สิทธิ์ของนักฟุตบอล</h3><p>บันทึกฐานกฎหมายของเด็กแต่ละคนก่อนอนุมัติภาพที่แท็กเด็กคนนั้น</p>
   <select value={privacyPlayer} onChange={e=>setPrivacyPlayer(e.target.value)}><option value="">เลือกนักฟุตบอล</option>{players.map(p=><option key={p.id} value={p.id}>{p.name} {p.jersey&&'#'+p.jersey}</option>)}</select>
   <label>ฐานการอนุญาต<input value={basis} onChange={e=>setBasis(e.target.value)}/></label><label>หลักฐานอ้างอิง<input value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
   <button disabled={busy||!privacyPlayer||basis.length<5||evidence.length<5||!attest} onClick={()=>mutate('player-privacy',{playerId:privacyPlayer,basis,evidence,confirmed:attest})}>บันทึกสิทธิ์นักฟุตบอล</button>
   <label className="fga-check"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>ยืนยันว่าได้ตรวจฐานทางกฎหมายและผู้มีอำนาจอนุญาตแล้ว</label>
  </div>
  <div className="fga-review-policy"><h3>เปิดงานให้ผู้ปกครอง</h3><p>ใส่ Privacy Notice ที่ใช้กับงานนี้จริง หากยังไม่ได้รับความยินยอม/ฐานกฎหมาย ไม่ควรเผยแพร่</p><textarea rows={5} value={notice} onChange={e=>setNotice(e.target.value)} placeholder="รายละเอียดผู้ดูแลข้อมูล วัตถุประสงค์ สิทธิ์ ระยะเก็บและช่องทางขอถอดรูป"/><button disabled={busy||notice.length<40||!attest} onClick={()=>mutate('publish-event',{notice,confirmed:attest})}>เผยแพร่อัลบั้มส่วนตัว</button></div>
  {event.status==='published'&&<div className="fga-review-policy"><h3>ส่งลิงก์ผู้ปกครอง</h3><div className="fga-actions"><button onClick={()=>createGrant('invite')} disabled={busy}>สร้างลิงก์เชิญ LINE</button><button onClick={()=>createGrant('code')} disabled={busy}>สร้างรหัสเข้างาน</button></div>{invite&&<div><p>แสดงเพียงครั้งเดียว กรุณาเก็บไว้ในช่องทางที่ปลอดภัย</p><code>{invite.url||invite.code}</code><button onClick={()=>navigator.clipboard.writeText(invite.url||invite.code)}>คัดลอก</button></div>}</div>}
 </div>
}
