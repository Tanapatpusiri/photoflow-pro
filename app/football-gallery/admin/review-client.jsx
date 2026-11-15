'use client';
import {useEffect,useState} from 'react';
import {addRetentionMonths,oneYearAfterEvent} from '../../../lib/football-gallery-retention';
import {formatBytes,formatCaptureTime} from '../../../lib/football-gallery-format';
const api='/api/football-gallery/admin';
async function post(path,body){const r=await fetch(api+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}if(!r.ok&&r.status!==202)throw Error(d.message||'ดำเนินการไม่สำเร็จ');return {status:r.status,...d}}
async function get(path){const r=await fetch(api+path,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.message||'โหลดข้อมูลไม่สำเร็จ');return d}
const STATUS={uploading:'กำลังอัปโหลด',review:'รอตรวจ',published:'เผยแพร่แล้ว',hidden:'ซ่อน'};
const fmtDate=v=>v?new Date(v).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'';
// Calendar dates follow Thailand, matching the server's Bangkok "today".
const inDays=n=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(Date.now()+n*86400000));

// view picks the part of the album workflow to show; state is kept while switching between them.
export default function ReviewClient({event,players,retentionMonths,uploadKey=0,onUpdated,onPlayersChanged,view='all',onNavigate}){
 const show=part=>view==='all'||view===part;
 const [items,setItems]=useState([]),[active,setActive]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[filter,setFilter]=useState('');
 const [tags,setTags]=useState([]),[approval,setApproval]=useState({basis:'',evidence:'',attest:false,gps:false,noChildren:false});
 const [privacy,setPrivacy]=useState({player:'',basis:'',evidence:'',attest:false});
 const [publish,setPublish]=useState({notice:'',retention:addRetentionMonths(event.event_date,retentionMonths),attest:false});
 const [grants,setGrants]=useState([]),[grantLabel,setGrantLabel]=useState(''),[grantDays,setGrantDays]=useState(14),[issued,setIssued]=useState(null);
 const [removals,setRemovals]=useState([]),[auditLog,setAuditLog]=useState([]),[verifying,setVerifying]=useState({});
 const load=async(p=1,f=filter)=>{setLoading(true);try{const d=await get('/media?event='+encodeURIComponent(event.id)+'&page='+p+(f?'&status='+f:''));setItems(old=>p===1?d.items:[...old,...d.items]);setHasMore(d.hasMore);setPage(p);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
 const loadSide=async()=>{try{const [g,r,a]=await Promise.all([get('/grants?event='+event.id),get('/removals?event='+event.id),get('/audit?event='+event.id)]);setGrants(g.grants);setRemovals(r.requests);setAuditLog(a.entries.slice(0,20))}catch(e){setError(e.message)}};
 useEffect(()=>{setActive(null);setItems([]);setPage(1);setIssued(null);setPublish({notice:'',retention:addRetentionMonths(event.event_date,retentionMonths),attest:false});load(1);loadSide()},[event.id,event.event_date]);
 // Show newly uploaded files without leaving the current filter or the file being reviewed.
 useEffect(()=>{if(uploadKey)load(1)},[uploadKey]);
 useEffect(()=>{if(retentionMonths)setPublish(p=>p.retention?p:{...p,retention:addRetentionMonths(event.event_date,retentionMonths)})},[retentionMonths,event.event_date]);
 const select=item=>{setActive(item);setTags(item.players||[]);setApproval({basis:'',evidence:'',attest:false,gps:false,noChildren:false});setError('');setInfo('')};
 const run=async(task,ok)=>{if(busy)return;setBusy(true);setError('');setInfo('');try{await task();if(ok)setInfo(ok)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const review=(action,data={},ok)=>run(async()=>{await post('/review',{action,eventId:event.id,mediaId:active?.id,...data});await load(1);setActive(null);await onUpdated?.();await loadSide()},ok);
 const verify=file=>run(async()=>{
  for(let i=0;i<5000;i++){const r=await post('/verify-file',{fileId:file.id});if(r.status===202){setVerifying(v=>({...v,[file.id]:Math.floor(r.offset/r.bytes*100)}));continue}break}
  setVerifying(v=>({...v,[file.id]:undefined}));const d=await get('/media?event='+encodeURIComponent(event.id));setItems(d.items);setActive(a=>a&&d.items.find(x=>x.id===a.id)||a);
 },'ตรวจ SHA-256 แล้ว');
 const createGrant=type=>run(async()=>{const r=await post('/grants',{event:event.id,type,days:grantDays,label:grantLabel});setIssued({type,...r});setGrantLabel('');await loadSide()});
 const revokeGrant=g=>run(async()=>{if(!confirm('ยกเลิกสิทธิ์นี้? ผู้ที่เข้าด้วยลิงก์/รหัสนี้จะเข้าไม่ได้ทันที'))return;await post('/grants',{event:event.id,action:'revoke',type:g.type,grantId:g.id});await loadSide()},'ยกเลิกสิทธิ์แล้ว');
 const resolveRemoval=(r,state)=>{let resolution=state==='done'?'ซ่อนภาพที่ระบุจากแกลเลอรีแล้ว':state==='rejected'?'ไม่สามารถดำเนินการได้':'';let manualConfirmed=false;if(state==='done'&&!r.media_id){resolution=prompt('ระบุสิ่งที่ดำเนินการจริงสำหรับคำขอนี้ (อย่างน้อย 10 ตัวอักษร) ระบบจะไม่ซ่อนภาพให้อัตโนมัติ','');if(resolution===null)return;if(resolution.trim().length<10){setError('กรุณาระบุสิ่งที่ดำเนินการจริงอย่างน้อย 10 ตัวอักษร');return}manualConfirmed=confirm('ยืนยันว่าได้ดำเนินการตามที่ระบุแล้ว? ระบบจะไม่ซ่อนภาพให้อัตโนมัติ');if(!manualConfirmed)return}return run(async()=>{await post('/removals',{id:r.id,state,resolution,manualConfirmed});await load(1);await loadSide();await onUpdated?.()},'บันทึกคำขอแล้ว')};
 const savePrivacy=action=>run(async()=>{await post('/review',{action,eventId:event.id,playerId:privacy.player,basis:privacy.basis,evidence:privacy.evidence,confirmed:privacy.attest});setPrivacy({player:'',basis:'',evidence:'',attest:false});await onPlayersChanged?.();await load(1);await loadSide()},action==='player-privacy'?'บันทึกสิทธิ์นักฟุตบอลแล้ว':'ถอนสิทธิ์แล้ว ภาพที่แท็กเด็กคนนี้กลับไปรอตรวจ');
 const copy=text=>navigator.clipboard?.writeText(text).then(()=>setInfo('คัดลอกแล้ว'),()=>setError('คัดลอกไม่สำเร็จ'));
 const originals=f=>['JPEG','RAW','VIDEO_ORIGINAL'].includes(f.variant);
 const selectedPlayer=players.find(p=>p.id===privacy.player);
 const publishedCount=items.filter(i=>i.status==='published').length;
 return <div className="fga-review">
  {error&&<div className="fga-message" role="alert">{error}</div>}
  {info&&<div className="fga-message fga-ok" role="status">{info}</div>}
  {show('review')&&<>
  <h2>ตรวจภาพก่อนเผยแพร่</h2><p>ทุกไฟล์ถูกปิดไว้จนกว่าตรวจสิทธิ์เด็ก Metadata และ SHA-256 เสร็จ เลือกภาพเพื่อแท็กนักฟุตบอลและอนุมัติ</p>
  {active?<div className="fga-review-detail">
   <button className="fga-link" onClick={()=>setActive(null)}>‹ กลับรายการ</button>
   {active.thumb&&<img className="fga-review-photo" src={active.thumb} alt="ภาพสำหรับผู้ดูแลตรวจสอบก่อนเผยแพร่"/>}
   <h3>{active.title||active.id.slice(0,8)} · {active.kind==='photo'?'รูปภาพ':'วิดีโอ'}</h3>
   <p>สถานะ: {STATUS[active.status]||active.status}{active.captured_at?' · ถ่ายเมื่อ '+formatCaptureTime(active.captured_at):''}</p>
   {active.has_gps&&<div className="fga-message" role="note">ไฟล์ต้นฉบับมีพิกัด GPS ใน Metadata ระบบไม่แก้ไขต้นฉบับ ผู้ที่ดาวน์โหลดจะเห็นพิกัดนี้ ตรวจว่าเผยแพร่ได้ก่อนอนุมัติ</div>}
   <div className="fga-items">{active.files.map(f=><div key={f.id}><strong>{f.variant} · {f.filename}</strong><span>{formatBytes(f.bytes)} · {f.pending?'อัปโหลดยังไม่ครบ':!originals(f)?'ภาพตัวอย่าง (ไฟล์แยก)':f.verifiedHash?'SHA-256 ผ่าน':verifying[f.id]!==undefined?'กำลังตรวจ '+verifying[f.id]+'%':'รอตรวจ SHA-256'}</span>{!f.verifiedHash&&!f.pending&&originals(f)&&<button onClick={()=>verify(f)} disabled={busy}>ตรวจสอบ SHA-256</button>}</div>)}</div>
   {active.status==='hidden'?<button className="fga-quiet" disabled={busy} onClick={()=>review('restore',{},'กู้คืนแล้ว ต้องตรวจใหม่ก่อนเผยแพร่')}>กู้คืนเพื่อตรวจใหม่</button>:<>
   <h3>แท็กนักฟุตบอล</h3><p>ภาพหนึ่งภาพแท็กเด็กได้หลายคนโดยไม่คัดลอกไฟล์ การเปลี่ยนแท็กจะส่งภาพกลับไปรอตรวจ</p>
   <div className="fga-checkboxes">{players.map(p=><label key={p.id}><input type="checkbox" checked={tags.includes(p.id)} onChange={e=>setTags(s=>e.target.checked?[...s,p.id]:s.filter(x=>x!==p.id))}/>{p.name} {p.jersey&&'#'+p.jersey}{!p.privacy_recorded&&' (ยังไม่บันทึกสิทธิ์)'}</label>)}</div>
   <button className="fga-quiet" disabled={busy} onClick={()=>review('tag',{players:tags},'บันทึกแท็กแล้ว')}>บันทึกแท็ก</button>
   <h3>ยืนยันการเผยแพร่</h3>
   <label>ฐานทางกฎหมาย / ขอบเขตการอนุญาต<input value={approval.basis} onChange={e=>setApproval(a=>({...a,basis:e.target.value}))} placeholder="กรอกเฉพาะข้อมูลที่ตรวจสอบได้จริง"/></label>
   <label>หลักฐานการอนุญาต / อ้างอิง<input value={approval.evidence} onChange={e=>setApproval(a=>({...a,evidence:e.target.value}))} placeholder="รหัสเอกสารหรือข้อมูลหลักฐาน"/></label>
   <label className="fga-check"><input type="checkbox" checked={approval.attest} onChange={e=>setApproval(a=>({...a,attest:e.target.checked}))}/>ตรวจสิทธิ์เด็กทุกคนที่ปรากฏในภาพแล้ว</label>
   <p>การตรวจ GPS อัตโนมัติไม่ครอบคลุมไฟล์และ Metadata ทุกกรณี ไฟล์ต้นฉบับที่ดาวน์โหลดอาจมีพิกัดอยู่</p>
   <label className="fga-check"><input type="checkbox" checked={approval.gps} onChange={e=>setApproval(a=>({...a,gps:e.target.checked}))}/>ยืนยันว่าได้ตรวจความเสี่ยงจากพิกัดในต้นฉบับทุกไฟล์ และอนุญาตให้เผยแพร่ได้</label>
   {!active.players?.length&&<label className="fga-check"><input type="checkbox" checked={approval.noChildren} onChange={e=>setApproval(a=>({...a,noChildren:e.target.checked}))}/>ยืนยันว่าไม่มีเด็กที่ระบุตัวได้ในภาพนี้</label>}
   <button disabled={busy||!approval.attest||!approval.gps||(!active.players?.length&&!approval.noChildren)||approval.basis.trim().length<5||approval.evidence.trim().length<5} onClick={()=>review('approve',{basis:approval.basis,evidence:approval.evidence,confirmed:approval.attest,gpsConfirmed:approval.gps,noChildrenConfirmed:approval.noChildren},'อนุมัติแล้ว')}>อนุมัติภาพนี้สำหรับ Private Gallery</button>
   <button className="fga-danger" disabled={busy} onClick={()=>review('hide',{},'ซ่อนแล้ว')}>ซ่อนภาพนี้</button></>}
  </div>:<>
   <div className="fga-actions">{[['','ทั้งหมด'],['review','รอตรวจ'],['published','เผยแพร่'],['hidden','ซ่อน']].map(([v,l])=><button key={v} className={filter===v?'fga-chip active':'fga-chip'} onClick={()=>{setFilter(v);load(1,v)}}>{l}</button>)}</div>
   <div className="fga-review-grid">{items.map(item=><button key={item.id} className="fga-review-tile" onClick={()=>select(item)}>{item.thumb?<img src={item.thumb} alt="ภาพรอตรวจ" loading="lazy"/>:<div className="fga-review-placeholder">ยังไม่มี Preview</div>}<strong>{item.title||(item.kind==='photo'?'รูปภาพ':'วิดีโอ')}</strong><span>{STATUS[item.status]||item.status} · {item.files.filter(originals).map(f=>f.variant==='VIDEO_ORIGINAL'?'VIDEO':f.variant).join('+')}{item.has_gps?' · GPS':''}</span></button>)}</div>
   {loading&&<p>กำลังโหลด…</p>}{items.length===0&&!loading&&<p>ยังไม่มีไฟล์ในหมวดนี้{onNavigate&&filter===''?' ':''}{onNavigate&&filter===''&&<button className="fga-link" onClick={()=>onNavigate('upload')}>ไปอัปโหลด ›</button>}</p>}{hasMore&&<button className="fga-quiet" onClick={()=>load(page+1)} disabled={loading}>โหลดเพิ่ม</button>}
   {onNavigate&&event.status==='draft'&&publishedCount>0&&<button className="fga-next" onClick={()=>onNavigate('publish')}>อนุมัติภาพแล้ว ไปเผยแพร่ & แชร์ ›</button>}
  </>}
  </>}

  {show('players')&&<div className="fga-review-policy">
   <h3>สิทธิ์ของนักฟุตบอล</h3><p>บันทึกฐานกฎหมายของเด็กแต่ละคนก่อนอนุมัติภาพที่แท็กเด็กคนนั้น หากผู้ปกครองถอนความยินยอม ให้ถอนสิทธิ์ ภาพที่แท็กเด็กคนนั้นจะถูกปิดทันที</p>
   <select value={privacy.player} onChange={e=>setPrivacy(p=>({...p,player:e.target.value}))}><option value="">เลือกนักฟุตบอล</option>{players.map(p=><option key={p.id} value={p.id}>{p.name} {p.jersey&&'#'+p.jersey} · {p.privacy_recorded?'บันทึกแล้ว':'ยังไม่บันทึก'}</option>)}</select>
   {selectedPlayer?.privacy_recorded?<button className="fga-danger" disabled={busy} onClick={()=>confirm('ถอนสิทธิ์ของ '+selectedPlayer.name+'?')&&savePrivacy('revoke-player-privacy')}>ถอนสิทธิ์ / ผู้ปกครองถอนความยินยอม</button>:<>
   <label>ฐานการอนุญาต<input value={privacy.basis} onChange={e=>setPrivacy(p=>({...p,basis:e.target.value}))}/></label><label>หลักฐานอ้างอิง<input value={privacy.evidence} onChange={e=>setPrivacy(p=>({...p,evidence:e.target.value}))}/></label>
   <label className="fga-check"><input type="checkbox" checked={privacy.attest} onChange={e=>setPrivacy(p=>({...p,attest:e.target.checked}))}/>ยืนยันว่าได้ตรวจฐานทางกฎหมายและผู้มีอำนาจอนุญาตแล้ว</label>
   <button disabled={busy||!privacy.player||privacy.basis.trim().length<5||privacy.evidence.trim().length<5||!privacy.attest} onClick={()=>savePrivacy('player-privacy')}>บันทึกสิทธิ์นักฟุตบอล</button></>}
  </div>}

  {show('publish')&&<>
  <div className="fga-review-policy">
   <h3>เปิดงานให้ผู้ปกครอง</h3>
   {event.status==='published'?<><p>เผยแพร่แล้ว{event.retention_until?' · เข้าถึงถึง '+new Date(event.retention_until).toLocaleDateString('th-TH',{dateStyle:'medium',timeZone:'UTC'}):''} ระงับได้ทันทีหากพบปัญหา</p>{(event.deletion_after||oneYearAfterEvent(event.event_date))&&<p>เตรียมตรวจเพื่อลบได้หลังวันที่ {new Date(event.deletion_after||oneYearAfterEvent(event.event_date)).toLocaleDateString('th-TH',{dateStyle:'medium',timeZone:'UTC'})} และต้องรอเจ้าของยืนยัน</p>}<button className="fga-danger" disabled={busy} onClick={()=>confirm('ระงับการเผยแพร่ทั้งงาน? ผู้ปกครองทุกคนจะเข้าไม่ได้จนกว่าจะเปิดอีกครั้ง')&&review('suspend-event',{},'ระงับการเผยแพร่แล้ว')}>ระงับการเผยแพร่ทั้งงาน</button></>
   :event.status==='suspended'?<><p>งานนี้ถูกระงับอยู่ ผู้ปกครองเข้าไม่ได้</p><button disabled={busy} onClick={()=>review('resume-event',{},'เปิดการเผยแพร่อีกครั้งแล้ว')}>เปิดการเผยแพร่อีกครั้ง</button></>
   :event.status==='archived'?<p>งานนี้เก็บถาวรแล้ว ผู้ปกครองเข้าไม่ได้</p>
   :<><p>ใส่ Privacy Notice ที่ใช้กับงานนี้จริง และวันสิ้นสุดการเก็บรักษา หลังวันดังกล่าวลิงก์และรหัสทั้งหมดจะใช้ไม่ได้ หากยังไม่ได้รับความยินยอม/ฐานกฎหมาย ไม่ควรเผยแพร่</p>
    <textarea rows={5} value={publish.notice} onChange={e=>setPublish(p=>({...p,notice:e.target.value}))} placeholder="ผู้ควบคุมข้อมูล วัตถุประสงค์ สิทธิ์ ระยะเก็บและช่องทางขอถอดรูป"/>
    <label>เปิดให้เข้าถึงถึงวันที่<input type="date" value={publish.retention} min={inDays(1)} max={addRetentionMonths(event.event_date,retentionMonths)||undefined} onChange={e=>setPublish(p=>({...p,retention:e.target.value}))}/></label>
    <p>{event.event_date&&retentionMonths?`เข้าถึงได้ไม่เกิน ${retentionMonths} เดือนหลังวันจัดงาน`:!event.event_date?'กรุณาบันทึกวันจัดงานก่อนเผยแพร่':'กำลังโหลดระยะเวลาที่เจ้าของตั้ง'} เมื่อครบกำหนดระบบจะปิดการเข้าถึง แต่ไฟล์ยังอยู่ในที่เก็บจนกว่าเจ้าของจะยืนยันและดำเนินการลบ</p>{event.event_date&&retentionMonths&&publish.retention>addRetentionMonths(event.event_date,retentionMonths)&&<p role="alert">กรุณาปรับวันสิ้นสุดให้ไม่เกินระยะเวลาที่ตั้งไว้</p>}
    <label className="fga-check"><input type="checkbox" checked={publish.attest} onChange={e=>setPublish(p=>({...p,attest:e.target.checked}))}/>ยืนยันว่าภาพที่อนุมัติมีฐานกฎหมายครบ และ Privacy Notice ถูกต้อง</label>
    <button disabled={busy||publish.notice.trim().length<40||!event.event_date||!retentionMonths||!publish.retention||publish.retention>addRetentionMonths(event.event_date,retentionMonths)||publish.retention<=event.event_date.slice(0,10)||!publish.attest} onClick={()=>review('publish-event',{notice:publish.notice,retentionUntil:publish.retention,confirmed:publish.attest},'เผยแพร่อัลบั้มส่วนตัวแล้ว')}>เผยแพร่อัลบั้มส่วนตัว</button></>}
  </div>

  {event.status==='published'&&<div className="fga-review-policy"><h3>ส่งลิงก์ผู้ปกครอง</h3>
   <label>ส่งให้ใคร (สำหรับผู้ดูแลจำ)<input value={grantLabel} onChange={e=>setGrantLabel(e.target.value)} maxLength={80} placeholder="เช่น กลุ่ม LINE ผู้ปกครอง U10"/></label>
   <label>หมดอายุใน (วัน)<input type="number" inputMode="numeric" min={1} max={90} value={grantDays} onChange={e=>setGrantDays(Number(e.target.value)||14)}/></label>
   <div className="fga-actions"><button onClick={()=>createGrant('invite')} disabled={busy}>สร้างลิงก์เชิญ LINE</button><button onClick={()=>createGrant('code')} disabled={busy}>สร้างรหัสเข้างาน</button></div>
   {issued&&<div className="fga-issued"><p>แสดงเพียงครั้งเดียว กรุณาคัดลอกเก็บไว้ (หมดอายุใน {issued.expiresDays} วัน)</p>
    {issued.url?<><code>{issued.url}</code><button onClick={()=>copy(issued.url)}>คัดลอกลิงก์</button><p>ลิงก์สำหรับเปิดด้วย Safari/Chrome จาก LINE (เหมาะกับการดาวน์โหลดไฟล์ใหญ่)</p><code>{issued.externalUrl}</code><button onClick={()=>copy(issued.externalUrl)}>คัดลอกลิงก์ Safari/Chrome</button></>:<><code>{issued.code}</code><button onClick={()=>copy(issued.code)}>คัดลอกรหัส</button></>}
   </div>}
   {grants.length>0&&<div className="fga-items">{grants.map(g=><div key={g.id}><strong>{g.type==='invite'?'ลิงก์ LINE':'รหัสเข้างาน'}{g.label?' · '+g.label:''}</strong><span>สร้าง {fmtDate(g.created_at)} · {g.revoked_at?'ยกเลิกแล้ว':g.active?'ใช้ได้ถึง '+fmtDate(g.expires_at):'หมดอายุ'}</span>{g.active&&<button className="fga-danger" disabled={busy} onClick={()=>revokeGrant(g)}>ยกเลิกสิทธิ์</button>}</div>)}</div>}
  </div>}
  {event.status==='draft'&&<p className="fga-meta">หลังเผยแพร่แล้ว จะสร้างลิงก์เชิญ LINE หรือรหัสเข้างานให้ผู้ปกครองได้ที่หน้านี้</p>}
  </>}

  {show('requests')&&<>
  <div className="fga-review-policy"><h3>คำขอถอดภาพ ({removals.filter(r=>['new','in_review'].includes(r.state)).length})</h3>
   {removals.length===0?<p>ยังไม่มีคำขอ</p>:<div className="fga-items">{removals.map(r=><div key={r.id}><strong>{r.media_title?'ไฟล์ '+r.media_title:'ทั้งงาน / ไม่ระบุไฟล์'} · {({new:'ใหม่',in_review:'กำลังตรวจ',done:'ดำเนินการแล้ว',rejected:'ไม่ดำเนินการ'})[r.state]}</strong><span>{fmtDate(r.created_at)}{r.contact?' · ติดต่อ: '+r.contact:''}</span><span>{r.description}</span>{r.resolution&&<span>ผลที่บันทึก: {r.resolution}</span>}
    {['new','in_review'].includes(r.state)&&<div className="fga-actions">{r.state==='new'&&<button className="fga-quiet" disabled={busy} onClick={()=>resolveRemoval(r,'in_review')}>รับเรื่อง</button>}<button disabled={busy} onClick={()=>resolveRemoval(r,'done')}>{r.media_id?'ถอดภาพนี้':'ดำเนินการแล้ว'}</button><button className="fga-quiet" disabled={busy} onClick={()=>resolveRemoval(r,'rejected')}>ไม่ดำเนินการ</button></div>}</div>)}</div>}
  </div>

  <details className="fga-review-policy" open={view==='requests'}><summary>ประวัติการดำเนินการล่าสุด (Audit Log)</summary>
   <div className="fga-items">{auditLog.map(a=><div key={a.id}><strong>{a.action}</strong><span>{fmtDate(a.created_at)} · {a.admin||'ผู้ปกครอง/ระบบ'}</span></div>)}</div>
  </details>
  </>}
 </div>
}
