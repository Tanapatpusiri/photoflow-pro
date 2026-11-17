'use client';
import {useEffect,useRef,useState} from 'react';
import {addRetentionMonths,oneYearAfterEvent} from '../../../lib/football-gallery-retention';
import {formatBytes,formatCaptureTime} from '../../../lib/football-gallery-format';
const api='/api/football-gallery/admin';
async function post(path,body){const r=await fetch(api+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}if(!r.ok&&r.status!==202)throw Error(d.message||'ดำเนินการไม่สำเร็จ');return {status:r.status,...d}}
async function get(path){const r=await fetch(api+path,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.message||'โหลดข้อมูลไม่สำเร็จ');return d}
const BASIS_HINT='เขียนว่าได้รับอนุญาตจากใคร ให้ทำอะไร และใช้ได้แค่ไหน เช่น "ผู้ปกครองยินยอมตามแบบฟอร์มสมัครแข่ง ให้เผยแพร่เฉพาะในอัลบั้มส่วนตัวของงานนี้"';
const EVIDENCE_HINT='เขียนว่าหลักฐานอยู่ที่ไหน เพื่อให้ตามหาได้ภายหลัง เช่น "แบบฟอร์มยินยอม เลขที่ 2569-014 เก็บที่สำนักงานสโมสร" ไม่ต้องใส่เบอร์โทร เลขบัตร หรือข้อมูลส่วนตัวของผู้ปกครอง';
// Standard notice shown to parents; the admin can publish it as is or edit it.
const fmtThaiDate=v=>v?new Date(v+'T00:00:00Z').toLocaleDateString('th-TH',{dateStyle:'long',timeZone:'UTC'}):'วันที่กำหนด';
const defaultNotice=(title,until)=>`ภาพและวิดีโอในอัลบั้ม "${title}" ใช้เพื่อให้ผู้ปกครองที่ได้รับลิงก์หรือรหัสจากผู้ดูแล ดูและดาวน์โหลดภาพของบุตรหลานตนเองเท่านั้น ห้ามนำไปเผยแพร่ต่อสาธารณะ ผู้ดูแลอัลบั้มเป็นผู้ควบคุมข้อมูล อัลบั้มเปิดให้เข้าถึงถึงวันที่ ${fmtThaiDate(until)} หลังจากนั้นลิงก์และรหัสทั้งหมดจะใช้ไม่ได้ และผู้ดูแลจะลบไฟล์ตามขั้นตอน ผู้ปกครองขอถอดภาพที่มีบุตรหลานของตนได้ทุกเมื่อ โดยกด "ขอถอดภาพ" ในอัลบั้ม หรือติดต่อผู้ดูแลอัลบั้มโดยตรง`;
const STATUS={uploading:'กำลังอัปโหลด',review:'พร้อมจัดการ',published:'แสดงในอัลบั้ม',hidden:'ซ่อน'};
const fmtDate=v=>v?new Date(v).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'';
// Calendar dates follow Thailand, matching the server's Bangkok "today".
const inDays=n=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(Date.now()+n*86400000));

// view picks the part of the album workflow to show; state is kept while switching between them.
export default function ReviewClient({event,players,retentionMonths,uploadKey=0,onUpdated,onPlayersChanged,view='all',onNavigate}){
 const show=part=>view==='all'||view===part;
 const [items,setItems]=useState([]),[active,setActive]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[filter,setFilter]=useState('');
 const [counts,setCounts]=useState({total:0,ready:0,published:0,uploading:0,hidden:0,filtered:0});
 const moreRef=useRef(null),pageInProgress=useRef(false);
 const [picking,setPicking]=useState(false),[picked,setPicked]=useState([]),[pickAll,setPickAll]=useState(false);
 const [bulkPlayer,setBulkPlayer]=useState('');
 const holdTimer=useRef(null),holdTriggered=useRef(false),holdStart=useRef(null);
 const longPress=item=>{
  holdTriggered.current=true;
  setPicking(true);
  setPicked(previous=>previous.includes(item.id)?previous:[...previous,item.id]);
  setPickAll(false);
 };
 const beginHold=(e,item)=>{
  if(e.pointerType==='mouse')return;
  holdTriggered.current=false;
  holdStart.current={x:e.clientX,y:e.clientY};
  clearTimeout(holdTimer.current);
  holdTimer.current=setTimeout(()=>longPress(item),480);
 };
 const moveHold=e=>{
  if(holdStart.current&&Math.hypot(e.clientX-holdStart.current.x,e.clientY-holdStart.current.y)>12)clearTimeout(holdTimer.current);
 };
 const endHold=()=>{clearTimeout(holdTimer.current);holdStart.current=null};
 useEffect(()=>()=>clearTimeout(holdTimer.current),[]);

 const [tags,setTags]=useState([]),[approval,setApproval]=useState({noChildren:false}),[newName,setNewName]=useState('');
 const [privacy,setPrivacy]=useState({player:'',basis:'',evidence:'',attest:false});
 const [publish,setPublish]=useState({notice:'',edited:false,retention:addRetentionMonths(event.event_date,retentionMonths),attest:false});
 const [grants,setGrants]=useState([]),[grantLabel,setGrantLabel]=useState(''),[grantDays,setGrantDays]=useState(14),[issued,setIssued]=useState(null);
 const [thumbFailed,setThumbFailed]=useState({}),[removals,setRemovals]=useState([]),[auditLog,setAuditLog]=useState([]),[verifying,setVerifying]=useState({});
 const load=async(p=1,f=filter)=>{setLoading(true);try{const d=await get('/media?event='+encodeURIComponent(event.id)+'&page='+p+(f?'&status='+f:''));setItems(old=>p===1?d.items:[...old,...d.items]);if(d.counts)setCounts(d.counts);setHasMore(d.hasMore);setPage(p);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{
  if(!show('review')||active||!hasMore||loading||!moreRef.current)return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)&&!pageInProgress.current){
    pageInProgress.current=true;
    load(page+1).finally(()=>{pageInProgress.current=false});
   }
  },{rootMargin:'350px'});
  observer.observe(moreRef.current);
  return()=>observer.disconnect();
 },[view,active,hasMore,loading,page,filter,items.length,event.id]);
 const loadSide=async()=>{try{const [g,r,a]=await Promise.all([get('/grants?event='+event.id),get('/removals?event='+event.id),get('/audit?event='+event.id)]);setGrants(g.grants);setRemovals(r.requests);setAuditLog(a.entries.slice(0,20))}catch(e){setError(e.message)}};
 useEffect(()=>{setActive(null);setItems([]);setPage(1);setPicking(false);setPicked([]);setPickAll(false);setIssued(null);setPublish({notice:'',edited:false,retention:addRetentionMonths(event.event_date,retentionMonths),attest:false});load(1);loadSide()},[event.id,event.event_date]);
 // Show newly uploaded files without leaving the current filter or the file being reviewed.
 useEffect(()=>{if(uploadKey)load(1)},[uploadKey]);
 useEffect(()=>{if(retentionMonths)setPublish(p=>p.retention?p:{...p,retention:addRetentionMonths(event.event_date,retentionMonths)})},[retentionMonths,event.event_date]);
 // Basis and evidence usually apply to the whole match, so they are kept between photos; the confirmations are per photo.
 const select=item=>{setActive(item);setTags(item.players||[]);setApproval({noChildren:false});setNewName('');setError('');setInfo('')};
 const run=async(task,ok)=>{if(busy)return;setBusy(true);setError('');setInfo('');try{await task();if(ok)setInfo(ok)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const savePhotoTags=next=>{
  if(!active||busy)return;
  const original=active.players||[];
  setTags(next);
  setBusy(true);setError('');setInfo('');
  post('/review',{action:'tag',eventId:event.id,mediaId:active.id,players:next})
   .then(()=>{setItems(xs=>xs.map(x=>x.id===active.id?{...x,players:[...next]}:x));setActive(x=>x?.id===active.id?{...x,players:[...next]}:x);setInfo('บันทึกแท็กอัตโนมัติแล้ว')})
   .catch(e=>{setTags(original);setError(e.message)})
   .finally(()=>setBusy(false));
 };
 const review=(action,data={},ok)=>run(async()=>{await post('/review',{action,eventId:event.id,mediaId:active?.id,...data});await load(1);setActive(null);await onUpdated?.();await loadSide()},ok);
 const savedTags=active?.players||[];
 const tagsDirty=!!active&&(tags.length!==savedTags.length||tags.some(t=>!savedTags.includes(t)));
 // Typing a name that is not in the list adds the child to the album and selects them. "Name #10" also stores the shirt number.
 const addName=e=>{e.preventDefault();const raw=newName.trim();if(!raw||busy)return;const m=/^(.*?)\s*#\s*([0-9A-Za-z-]{1,12})$/.exec(raw);const name=(m?m[1]:raw).trim().slice(0,100);if(!name)return;
  run(async()=>{const r=await fetch(api+'/players',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:event.id,name,jersey:m?m[2]:''})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'เพิ่มชื่อไม่สำเร็จ');await onPlayersChanged?.();const next=[...new Set([...tags,d.player.id])];await post('/review',{action:'tag',eventId:event.id,mediaId:active.id,players:next});setTags(next);setActive(a=>a?{...a,players:next}:a);setItems(xs=>xs.map(x=>x.id===active.id?{...x,players:next}:x));setNewName('')},'เพิ่มชื่อแล้ว')};
 // Permanent delete: rows first on the server, then the files in Google Drive. "all" repeats in batches.
 const removeForever=({ids,all,label})=>{
  if(!confirm(`ลบถาวร ${label}?\n\nไฟล์ต้นฉบับใน Google Drive จะถูกลบด้วย และกู้คืนไม่ได้`))return;
  run(async()=>{
   let deleted=0,failed=0;
   if(all){for(let i=0;i<100;i++){const r=await post('/media-delete',{event:event.id,all:true,...(filter?{status:filter}:{})});deleted+=r.deleted;failed+=r.filesFailed||0;if(!r.left||!r.deleted)break}}
   else{const r=await post('/media-delete',{event:event.id,mediaIds:ids});deleted=r.deleted;failed=r.filesFailed||0}
   setPicking(false);setPicked([]);setPickAll(false);setActive(null);
   await load(1);await onUpdated?.();await loadSide();
   setInfo(`ลบถาวรแล้ว ${deleted.toLocaleString('th-TH')} รายการ`);
   if(failed)setError(`ลบไฟล์ใน Google Drive ไม่สำเร็จ ${failed} ไฟล์ ข้อมูลในระบบถูกลบแล้ว ให้ลบไฟล์ที่เหลือใน Drive เอง`);
  });
 };
 const filterLabel={'':'ทั้งหมด',review:'รอตรวจ',published:'เผยแพร่',hidden:'ซ่อน'}[filter]||'ทั้งหมด';
 const togglePick=id=>{setPickAll(false);setPicked(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])};
 const publishReady=()=>{
  if(event.status!=='published')return onNavigate?.('publish');
  if(!window.confirm('รูปที่อัปโหลดและตรวจ SHA-256 ครบจะมองเห็นได้ทันทีในอัลบั้มที่เผยแพร่แล้ว รวมถึงผู้ที่มีลิงก์เดิม ยืนยันว่ามีสิทธิ์เผยแพร่ภาพเด็กและตรวจความเสี่ยงจาก GPS แล้ว?'))return;
  run(async()=>{
   const result=await post('/review',{action:'publish-ready',eventId:event.id,confirmed:true});
   await load(1);await onUpdated?.();await loadSide();
   setInfo('เปิดรูปที่พร้อมให้ผู้ชมแล้ว '+Number(result.published||0).toLocaleString('th-TH')+' รายการ');
  });
 };
 const bulkTag=()=>run(async()=>{
  if(!bulkPlayer||picked.length===0)throw Error('เลือกนักฟุตบอลและรูปก่อน');
  const photos=items.filter(x=>picked.includes(x.id)&&x.kind==='photo'&&x.status!=='hidden');
  if(photos.length!==picked.length)throw Error('เลือกได้เฉพาะรูปภาพที่ไม่ถูกซ่อน');
  const r=await post('/review',{action:'tag-many',eventId:event.id,playerId:bulkPlayer,mediaIds:photos.map(x=>x.id)});
  setItems(prev=>prev.map(x=>picked.includes(x.id)?{...x,players:[...new Set([...(x.players||[]),bulkPlayer])]}:x));
  setPicked([]);setPicking(false);setPickAll(false);setBulkPlayer('');
  setInfo('แท็ก '+photos.length+' รูปสำเร็จ');
 },undefined);
 const activeIndex=active?items.findIndex(i=>i.id===active.id):-1;
 const navigatePhoto=async delta=>{
  const index=activeIndex+delta;
  if(index<0)return;
  if(index<items.length){select(items[index]);return}
  if(delta>0&&hasMore&&!loading){
   setLoading(true);
   try{
    const d=await get('/media?event='+encodeURIComponent(event.id)+'&page='+(page+1)+(filter?'&status='+filter:''));
    setItems(current=>[...current,...d.items]);setHasMore(d.hasMore);setPage(page+1);
    if(d.counts)setCounts(d.counts);
    if(d.items.length)select(d.items[0]);
   }catch(e){setError(e.message)}finally{setLoading(false)}
  }
 };
 useEffect(()=>{
  if(!active)return;
  const keys=e=>{
   if(e.target?.matches?.('input,textarea,select,[contenteditable]'))return;
   if(e.key==='ArrowRight'&&(activeIndex<items.length-1||hasMore))navigatePhoto(1);
   if(e.key==='ArrowLeft'&&activeIndex>0)navigatePhoto(-1);
  };
  window.addEventListener('keydown',keys);
  return()=>window.removeEventListener('keydown',keys);
 },[active,activeIndex,items,hasMore,loading,page,filter,event.id]);

 const approve=()=>run(async()=>{
  if(tagsDirty){await post('/review',{action:'tag',eventId:event.id,mediaId:active.id,players:tags});setActive(a=>a&&{...a,players:[...tags]})}
  await post('/review',{action:'approve',eventId:event.id,mediaId:active.id,noChildrenConfirmed:tags.length===0&&approval.noChildren});
  await load(1);setActive(null);await onUpdated?.();await loadSide();
 },'อนุมัติแล้ว');
 // Plain-language list of what still blocks each action, shown next to its button.
 const approveMissing=!active?[]:[
  active.files.some(f=>f.pending)&&'ไฟล์ยังอัปโหลดไม่ครบ',
  active.files.some(f=>['JPEG','RAW','VIDEO_ORIGINAL'].includes(f.variant)&&!f.pending&&!f.verifiedHash)&&'ตรวจความครบถ้วนของไฟล์ต้นฉบับ (กดปุ่มด้านบน)',
  tags.length===0&&!approval.noChildren&&'เลือกว่าใครอยู่ในภาพ หรือเลือก "ไม่มีเด็กที่จำหน้าได้"'
 ].filter(Boolean);
 const privacyMissing=[!privacy.player&&'เลือกนักฟุตบอล',privacy.basis.trim().length<5&&'กรอกฐานการอนุญาต (อย่างน้อย 5 ตัวอักษร)',privacy.evidence.trim().length<5&&'กรอกหลักฐานอ้างอิง (อย่างน้อย 5 ตัวอักษร)',!privacy.attest&&'ติ๊กยืนยันการตรวจฐานกฎหมาย'].filter(Boolean);
 const notice=publish.edited?publish.notice:defaultNotice(event.title,publish.retention);
 const publishMax=addRetentionMonths(event.event_date,retentionMonths);
 const publishMissing=[notice.trim().length<40&&`ข้อความแจ้งผู้ปกครองสั้นเกินไป (อย่างน้อย 40 ตัวอักษร ตอนนี้ ${notice.trim().length})`,!event.event_date&&'บันทึกวันจัดงานก่อน (ด้านบนของหน้า)',event.event_date&&!retentionMonths&&'รอโหลดระยะเวลาเก็บภาพ',!publish.retention&&'เลือกวันสิ้นสุดการเข้าถึง',publish.retention&&publishMax&&publish.retention>publishMax&&'วันสิ้นสุดต้องไม่เกิน '+publishMax,publish.retention&&event.event_date&&publish.retention<=event.event_date.slice(0,10)&&'วันสิ้นสุดต้องหลังวันจัดงาน',!publish.attest&&'ติ๊กยืนยันว่าผู้ปกครองอนุญาตแล้ว'].filter(Boolean);
 const Missing=({items})=>items.length?<div className="fga-missing" role="note"><strong>ยังกดไม่ได้ เพราะยังขาด:</strong><ul>{items.map(m=><li key={m}>{m}</li>)}</ul></div>:null;
 const verify=file=>run(async()=>{
  for(let i=0;i<5000;i++){const r=await post('/verify-file',{fileId:file.id});if(r.status===202){setVerifying(v=>({...v,[file.id]:Math.floor(r.offset/r.bytes*100)}));continue}break}
  setVerifying(v=>({...v,[file.id]:undefined}));const d=await get('/media?event='+encodeURIComponent(event.id));setItems(d.items);setActive(a=>a&&d.items.find(x=>x.id===a.id)||a);
 },'ตรวจความครบถ้วนของไฟล์แล้ว');
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
  <h2>จัดการรูปและแท็กนักฟุตบอล</h2><p>รูปที่อัปโหลดครบพร้อมให้แท็กได้เลย เลือกหลายรูปแล้วแท็กเด็กคนเดียวพร้อมกันได้ ส่วนการเปิดรูปให้ผู้ชมเห็นยังควบคุมแยกจากหน้าเผยแพร่</p>
   {active?<div className="fga-review-detail">
    <div className="fga-detail-nav"><button className="fga-link" onClick={()=>setActive(null)}>‹ กลับรายการ</button><span>{activeIndex+1} / {items.length}</span><button type="button" className="fga-chip" onClick={()=>navigatePhoto(-1)} disabled={busy||activeIndex<=0} aria-label="รูปก่อนหน้า">‹ ก่อนหน้า</button><button type="button" className="fga-chip" onClick={()=>navigatePhoto(1)} disabled={busy||loading||(activeIndex>=items.length-1&&!hasMore)} aria-label="รูปถัดไป">ถัดไป ›</button></div>
    <div className="fga-review-layout">
    <div className="fga-review-media">
    {active.thumb&&!thumbFailed[active.id]?<img className="fga-review-photo" src={active.thumb} alt="ภาพตัวอย่างสำหรับแท็กนักฟุตบอล" onError={()=>setThumbFailed(s=>({...s,[active.id]:true}))}/>:<div className="fga-review-photo fga-review-nophoto" role="note">{active.thumb?'โหลดภาพตัวอย่างไม่ได้ ตอนนี้ระบบส่งภาพ (Download Worker) ยังไม่พร้อม เปิดไฟล์ต้นฉบับใน Google Drive เพื่อตรวจแทนได้':'ไฟล์นี้ไม่มีภาพตัวอย่าง (เช่น RAW หรือวิดีโอบางชนิด) เปิดไฟล์ต้นฉบับใน Google Drive เพื่อตรวจ'}</div>}
    <h3>{active.title||active.id.slice(0,8)} · {active.kind==='photo'?'รูปภาพ':'วิดีโอ'}</h3>
    <p>สถานะ: {STATUS[active.status]||active.status}{active.captured_at?' · ถ่ายเมื่อ '+formatCaptureTime(active.captured_at):''}</p>
   {(()=>{const list=<div className="fga-items">{active.files.map(f=><div key={f.id}><strong>{f.variant} · {f.filename}</strong><span>{formatBytes(f.bytes)} · {f.pending?'อัปโหลดยังไม่ครบ':!originals(f)?'ภาพตัวอย่าง':f.verifiedHash?'ไฟล์ครบถ้วน ✓':verifying[f.id]!==undefined?'กำลังตรวจ '+verifying[f.id]+'%':'ยังไม่ได้ตรวจความครบถ้วน'}</span>{!f.verifiedHash&&!f.pending&&originals(f)&&<button onClick={()=>verify(f)} disabled={busy}>ตรวจความครบถ้วน</button>}</div>)}</div>;
    // Files that are all complete need no action, so they fold away to keep the form close to the photo.
    return active.files.every(f=>!f.pending&&(!originals(f)||f.verifiedHash))?<details className="fga-files"><summary>ไฟล์ {active.files.length} ไฟล์ · ครบถ้วน ✓</summary>{list}</details>:list})()}
    </div>
    <div className="fga-review-form">
    {active.status==='hidden'?<button className="fga-quiet" disabled={busy} onClick={()=>review('restore',{},'กู้คืนแล้ว ต้องตรวจใหม่ก่อนเผยแพร่')}>กู้คืนเพื่อตรวจใหม่</button>:<>
    <section className="fga-step-card">
     <h3>แท็กชื่อนักฟุตบอล</h3>
     <p className="fga-hint">แตะชื่อเด็กเพื่อแท็ก รูปจะบันทึกทันทีโดยไม่ต้องกดอนุมัติซ้ำ หากต้องแท็กหลายรูปพร้อมกันให้กดค้างรูปจากหน้ารวม</p>
     <div className="fga-pick">{players.map(p=><label key={p.id} className={tags.includes(p.id)?'on':''}><input type="checkbox" checked={tags.includes(p.id)} disabled={busy} onChange={e=>savePhotoTags(e.target.checked?[...tags,p.id]:tags.filter(x=>x!==p.id))}/>{p.name}{p.jersey?' #'+p.jersey:''}</label>)}
     </div>
     <form className="fga-add-name" onSubmit={addName}><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="พิมพ์ชื่อเด็ก เช่น น้องบอล #10" maxLength={100} aria-label="เพิ่มชื่อเด็กที่ไม่มีในรายการ"/><button className="fga-quiet" disabled={busy||!newName.trim()}>เพิ่ม</button></form>
     {busy&&<p className="fga-hint" role="status">กำลังบันทึกแท็ก…</p>}
     {active.has_gps&&<p className="fga-gps-note" role="note">ไฟล์นี้มีตำแหน่งที่ถ่าย (GPS) ผู้ปกครองที่ดาวน์โหลดไฟล์ต้นฉบับจะเห็นตำแหน่งนี้ ถ้าไม่ควรเปิดเผย ให้กด "ซ่อนภาพนี้"</p>}
    </section>
    <div className="fga-approve-bar">
     <button className="fga-danger" disabled={busy} onClick={()=>review('hide',{},'ซ่อนแล้ว')}>ซ่อนภาพนี้</button>
    </div></>}
    <button className="fga-link fga-delete-link" disabled={busy} onClick={()=>removeForever({ids:[active.id],label:'ภาพนี้'})}>ลบภาพนี้ถาวร</button>
    </div>
    </div>
  </div>:<>
   <div className="fga-actions">{[['','ทั้งหมด'],['review','พร้อมจัดการ'],['published','แสดงในอัลบั้ม'],['hidden','ซ่อน']].map(([v,l])=><button key={v} className={filter===v?'fga-chip active':'fga-chip'} onClick={()=>{setFilter(v);setPicked([]);setPickAll(false);load(1,v)}}>{l}</button>)}</div>
   {items.length>0&&(!picking?<div className="fga-pick-bar"><button className="fga-chip" onClick={()=>setPicking(true)}>เลือกหลายรูปเพื่อแท็กหรือลบ</button><span>แตะค้างที่รูปเพื่อเริ่มเลือกหลายรูป</span></div>
   :<div className="fga-pick-bar" role="toolbar" aria-label="เลือกภาพเพื่อแท็กหรือลบ">
    <label className="fga-check"><input type="checkbox" checked={pickAll} onChange={e=>{setPickAll(e.target.checked);setPicked(e.target.checked?items.map(i=>i.id):[])}}/>เลือกทั้งหมดในหมวด "{filterLabel}"{hasMore?' (รวมที่ยังไม่ได้โหลด)':''}</label>
    <span>{pickAll?`ทั้งหมด ${items.length.toLocaleString('th-TH')}${hasMore?'+':''} รายการ`:`เลือกแล้ว ${picked.length.toLocaleString('th-TH')} รายการ`}</span>
    <label className="fga-bulk-player">แท็กเด็กให้รูปที่เลือก<select aria-label="เลือกเด็กที่ต้องการแท็ก" value={bulkPlayer} onChange={e=>setBulkPlayer(e.target.value)}><option value="">เลือกนักฟุตบอล</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}{p.jersey?' #'+p.jersey:''}</option>)}</select></label>
    <button className="fga-chip fga-bulk-save" disabled={busy||!bulkPlayer||picked.length===0||picked.some(id=>items.find(x=>x.id===id)?.kind!=='photo')} onClick={bulkTag}>แท็ก {picked.length} รูปพร้อมกัน</button>
    <button className="fga-chip fga-chip-danger" disabled={busy||(!pickAll&&picked.length===0)} onClick={()=>removeForever(pickAll?{all:true,label:`ทั้งหมดในหมวด "${filterLabel}" (${items.length.toLocaleString('th-TH')}${hasMore?'+':''} รายการ)`}:{ids:picked,label:`${picked.length.toLocaleString('th-TH')} รายการที่เลือก`})}>ลบถาวร</button>
    <button className="fga-chip" onClick={()=>{setPicking(false);setPicked([]);setPickAll(false)}}>ยกเลิก</button>
   </div>)}
   <p className="fga-review-count" role="status">แสดง {items.length.toLocaleString('th-TH')} จาก {Number(counts.filtered||0).toLocaleString('th-TH')} รายการในหมวดนี้ · รวมทั้งอัลบั้ม {Number(counts.total||0).toLocaleString('th-TH')} รูป/คลิป ({Number(counts.ready||0).toLocaleString('th-TH')} พร้อมจัดการ, {Number(counts.uploading||0).toLocaleString('th-TH')} กำลังอัปโหลด)</p>
   <div className="fga-review-grid">{items.map((item,index)=><button key={item.id} className={'fga-review-tile'+(picking&&(pickAll||picked.includes(item.id))?' picked':'')} aria-pressed={picking?(pickAll||picked.includes(item.id)):undefined} onPointerDown={e=>beginHold(e,item)} onPointerMove={moveHold} onPointerUp={endHold} onPointerCancel={endHold} onContextMenu={e=>{e.preventDefault();endHold();if(!picking)longPress(item)}} onClick={()=>{if(holdTriggered.current){holdTriggered.current=false;return}picking?togglePick(item.id):select(item)}}>{picking&&<span className="fga-tile-check" aria-hidden="true">{pickAll||picked.includes(item.id)?'✓':''}</span>}{item.thumb?<img src={item.thumb} alt="ภาพรอตรวจ" loading={index<8?"eager":"lazy"} fetchPriority={index<4?"high":"auto"} decoding="async"/>:<div className="fga-review-placeholder">ยังไม่มี Preview</div>}<strong>{item.title||(item.kind==='photo'?'รูปภาพ':'วิดีโอ')}</strong><span>{STATUS[item.status]||item.status} · {item.files.filter(originals).map(f=>f.variant==='VIDEO_ORIGINAL'?'VIDEO':f.variant).join('+')}{item.has_gps?' · GPS':''}</span></button>)}</div>
   {loading&&<p>กำลังโหลด…</p>}{items.length===0&&!loading&&<p>ยังไม่มีไฟล์ในหมวดนี้{onNavigate&&filter===''?' ':''}{onNavigate&&filter===''&&<button className="fga-link" onClick={()=>onNavigate('upload')}>ไปอัปโหลด ›</button>}</p>}{hasMore&&<div ref={moreRef} className="fga-more-anchor"><button className="fga-quiet" onClick={()=>load(page+1)} disabled={loading}>โหลดรูปเพิ่ม ({(counts.filtered-items.length).toLocaleString('th-TH')} รายการที่เหลือ)</button></div>}
   {event.status==='published'&&Number(counts.ready)>0&&<div className="fga-release-row"><p>หลังแท็กเสร็จ สามารถเปิดรูปที่พร้อมให้ผู้ชมได้พร้อมกันครั้งเดียว โดยไม่ต้องอนุมัติทีละภาพ</p><button disabled={busy} onClick={publishReady}>เปิดรูปที่พร้อมให้ผู้ชมทั้งหมด ({counts.ready})</button></div>}
   {onNavigate&&event.status!=='published'&&<button className="fga-next" onClick={()=>onNavigate('publish')}>จัดการแท็กแล้ว ไปเผยแพร่รูปและแชร์ ›</button>}
  </>}
  </>}

  {show('players')&&<div className="fga-review-policy">
   <h3>สิทธิ์ของนักฟุตบอล</h3><p>ข้อมูลสิทธิ์เด็กอยู่แยกจากการแท็ก ไม่ต้องกรอกซ้ำทุกภาพ หากผู้ปกครองถอนความยินยอม ให้บันทึกการถอนสิทธิ์เพื่อปิดภาพที่เกี่ยวข้องทันที</p>
   <select value={privacy.player} onChange={e=>setPrivacy(p=>({...p,player:e.target.value}))}><option value="">เลือกนักฟุตบอล</option>{players.map(p=><option key={p.id} value={p.id}>{p.name} {p.jersey&&'#'+p.jersey} · {p.privacy_recorded?'บันทึกแล้ว':'ยังไม่บันทึก'}</option>)}</select>
   {selectedPlayer?.privacy_recorded?<button className="fga-danger" disabled={busy} onClick={()=>confirm('ถอนสิทธิ์ของ '+selectedPlayer.name+'?')&&savePrivacy('revoke-player-privacy')}>ถอนสิทธิ์ / ผู้ปกครองถอนความยินยอม</button>:<>
   <label>ฐานการอนุญาต<input value={privacy.basis} onChange={e=>setPrivacy(p=>({...p,basis:e.target.value}))} placeholder="เช่น ผู้ปกครองยินยอมให้เผยแพร่ในอัลบั้มส่วนตัวของงานนี้"/><small className="fga-hint">{BASIS_HINT}</small></label><label>หลักฐานอ้างอิง<input value={privacy.evidence} onChange={e=>setPrivacy(p=>({...p,evidence:e.target.value}))} placeholder="เช่น แบบฟอร์มยินยอม เลขที่ 2569-014"/><small className="fga-hint">{EVIDENCE_HINT}</small></label>
   <label className="fga-check"><input type="checkbox" checked={privacy.attest} onChange={e=>setPrivacy(p=>({...p,attest:e.target.checked}))}/>ยืนยันว่าได้ตรวจฐานทางกฎหมายและผู้มีอำนาจอนุญาตแล้ว</label>
   <Missing items={privacyMissing}/><button disabled={busy||privacyMissing.length>0} onClick={()=>savePrivacy('player-privacy')}>บันทึกสิทธิ์นักฟุตบอล</button></>}
  </div>}

  {show('publish')&&<>
  <div className="fga-review-policy">
   <h3>เปิดงานให้ผู้ปกครอง</h3>
   {event.status==='published'&&<div className="fga-release-row"><p>รูปใหม่ที่อัปโหลดครบและตรวจ SHA-256 ผ่านแล้วสามารถเปิดให้ผู้ชมเห็นพร้อมกันได้โดยไม่ต้องกดอนุมัติทีละภาพ ผู้ชมที่มีลิงก์เดิมอาจเห็นทันทีเมื่อเปิดรูป</p><button disabled={busy||counts.ready===0} onClick={publishReady}>เปิดรูปที่พร้อมทั้งหมด ({Number(counts.ready||0)})</button></div>}
   {event.status==='published'?<><p>เผยแพร่แล้ว{event.retention_until?' · เข้าถึงถึง '+new Date(event.retention_until).toLocaleDateString('th-TH',{dateStyle:'medium',timeZone:'UTC'}):''} ระงับได้ทันทีหากพบปัญหา</p>{(event.deletion_after||oneYearAfterEvent(event.event_date))&&<p>เตรียมตรวจเพื่อลบได้หลังวันที่ {new Date(event.deletion_after||oneYearAfterEvent(event.event_date)).toLocaleDateString('th-TH',{dateStyle:'medium',timeZone:'UTC'})} และต้องรอเจ้าของยืนยัน</p>}<button className="fga-danger" disabled={busy} onClick={()=>confirm('ระงับการเผยแพร่ทั้งงาน? ผู้ปกครองทุกคนจะเข้าไม่ได้จนกว่าจะเปิดอีกครั้ง')&&review('suspend-event',{},'ระงับการเผยแพร่แล้ว')}>ระงับการเผยแพร่ทั้งงาน</button></>
   :event.status==='suspended'?<><p>งานนี้ถูกระงับอยู่ ผู้ปกครองเข้าไม่ได้</p><button disabled={busy} onClick={()=>review('resume-event',{},'เปิดการเผยแพร่อีกครั้งแล้ว')}>เปิดการเผยแพร่อีกครั้ง</button></>
   :event.status==='archived'?<p>งานนี้เก็บถาวรแล้ว ผู้ปกครองเข้าไม่ได้</p>
   :<><p>เลือกวันสิ้นสุดการเข้าถึง แล้วกดเผยแพร่ได้เลย ระบบเตรียมข้อความแจ้งผู้ปกครอง (Privacy Notice) ให้แล้ว ไม่ต้องเขียนเอง</p>
    <label>เปิดให้เข้าถึงถึงวันที่<input type="date" value={publish.retention} min={inDays(1)} max={addRetentionMonths(event.event_date,retentionMonths)||undefined} onChange={e=>setPublish(p=>({...p,retention:e.target.value}))}/></label>
    <details className="fga-notice"><summary>ข้อความที่ผู้ปกครองจะเห็น (กดเพื่ออ่านหรือแก้ไข)</summary>
     <textarea rows={6} value={notice} onChange={e=>setPublish(p=>({...p,notice:e.target.value,edited:true}))}/>
     {publish.edited&&<button className="fga-link" type="button" onClick={()=>setPublish(p=>({...p,notice:'',edited:false}))}>ใช้ข้อความมาตรฐาน</button>}
    </details>
    <p>{event.event_date&&retentionMonths?`เข้าถึงได้ไม่เกิน ${retentionMonths} เดือนหลังวันจัดงาน`:!event.event_date?'กรุณาบันทึกวันจัดงานก่อนเผยแพร่':'กำลังโหลดระยะเวลาที่เจ้าของตั้ง'} เมื่อครบกำหนดระบบจะปิดการเข้าถึง แต่ไฟล์ยังอยู่ในที่เก็บจนกว่าเจ้าของจะยืนยันและดำเนินการลบ</p>{event.event_date&&retentionMonths&&publish.retention>addRetentionMonths(event.event_date,retentionMonths)&&<p role="alert">กรุณาปรับวันสิ้นสุดให้ไม่เกินระยะเวลาที่ตั้งไว้</p>}
    <label className="fga-check"><input type="checkbox" checked={publish.attest} onChange={e=>setPublish(p=>({...p,attest:e.target.checked}))}/>ยืนยันว่ามีฐานทางกฎหมายสำหรับเผยแพร่ภาพเด็กทั้งหมดที่อัปโหลดในอัลบั้มนี้ และข้อความแจ้งผู้ปกครองถูกต้อง</label>
    {event.published===0&&counts.ready===0&&<p className="fga-message" role="note">ยังไม่มีรูปที่ตรวจไฟล์ต้นฉบับครบ หากเผยแพร่ตอนนี้ ผู้ปกครองจะเห็นอัลบั้มว่าง</p>}<Missing items={publishMissing}/>
    <button disabled={busy||publishMissing.length>0} onClick={()=>review('publish-event',{notice,retentionUntil:publish.retention,confirmed:publish.attest},'เผยแพร่อัลบั้มส่วนตัวแล้ว')}>เผยแพร่อัลบั้มส่วนตัว</button></>}
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
