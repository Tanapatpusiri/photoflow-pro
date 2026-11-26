'use client';
import {useEffect,useRef,useState} from 'react';
const base='/api/football-gallery/admin/player-registry';
const empty={name:'',nickname:'',age_group:'',jersey:'',team:'',active:true};
async function call(method='GET',body){
 const r=await fetch(base,{method,cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'เชื่อมต่อระบบไม่สำเร็จ');return d;
}
async function loadPhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('เลือกรูป JPEG, PNG หรือ WebP ไม่เกิน 15 MB');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  return {img,url,zoom:1,x:0,y:0};
 }catch{URL.revokeObjectURL(url);throw Error('เปิดรูปไม่สำเร็จ')}
}
function frame(crop){
 const unit=crop.zoom/Math.min(crop.img.naturalWidth,crop.img.naturalHeight);
 const width=crop.img.naturalWidth*unit,height=crop.img.naturalHeight*unit;
 return {width,height,left:(1-width)*(1-crop.x)/2,top:(1-height)*(1-crop.y)/2};
}
function exportPhoto(crop){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('เบราว์เซอร์ไม่รองรับการจัดกรอบรูป');
 const {width,height,left,top}=frame(crop);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
 ctx.drawImage(crop.img,left*512,top*512,width*512,height*512);
 const data=canvas.toDataURL('image/jpeg',0.82);
 if(data.length>409600)throw Error('รูปใหญ่เกินกำหนด');
 return data;
}
const clampPosition=value=>Math.min(1,Math.max(-1,value));
function PhotoCrop({crop,onChange,disabled}){
 const drag=useRef(null);
 const {width,height,left,top}=frame(crop);
 const percent=value=>100*value+'%';
 function start(e){
  if(disabled||!e.isPrimary||e.button!==0)return;
  drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,fromX:crop.x,fromY:crop.y,size:e.currentTarget.clientWidth};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e){
  const d=drag.current;if(!d||d.id!==e.pointerId||disabled)return;
  onChange({...crop,
   x:width>1?clampPosition(d.fromX+2*(e.clientX-d.x)/d.size/(width-1)):0,
   y:height>1?clampPosition(d.fromY+2*(e.clientY-d.y)/d.size/(height-1)):0});
 }
 return <fieldset className="fga-profile-crop" disabled={disabled}>
  <legend>จัดกรอบรูปโปรไฟล์</legend>
  <div className="fga-profile-crop-frame" onPointerDown={start} onPointerMove={move} onLostPointerCapture={()=>{drag.current=null}}>
   <img src={crop.url} alt="ตัวอย่างรูปโปรไฟล์" draggable={false} style={{width:percent(width),height:percent(height),left:percent(left),top:percent(top)}}/>
  </div>
  <label>ซูมเข้า–ออก<input type="range" min={1} max={4} step={0.01} value={crop.zoom} onChange={e=>onChange({...crop,zoom:Number(e.target.value)})}/></label>
  <label>เลื่อนซ้าย–ขวา<input type="range" min={-1} max={1} step={0.01} value={width>1?crop.x:0} disabled={width<=1} onChange={e=>onChange({...crop,x:Number(e.target.value)})}/></label>
  <label>เลื่อนขึ้น–ลง<input type="range" min={-1} max={1} step={0.01} value={height>1?crop.y:0} disabled={height<=1} onChange={e=>onChange({...crop,y:Number(e.target.value)})}/></label>
  <button type="button" className="fga-chip" onClick={()=>onChange({...crop,x:0,y:0})}>จัดกึ่งกลาง</button>
 </fieldset>;
}
const profile=p=>p?.has_profile?base+'?photo='+encodeURIComponent(p.id)+'&v='+encodeURIComponent(p.updated_at||''):'';
function Avatar({src}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 return <span style={{display:'inline-flex',width:56,height:56,flex:'0 0 56px',borderRadius:'50%',overflow:'hidden',background:'#eceef0',alignItems:'center',justifyContent:'center'}}>{src&&!failed?<img src={src} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>}</span>
}
export default function PlayerRegistry({eventId=null,eventPlayers=[],onChanged}){
 const [players,setPlayers]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [query,setQuery]=useState(''),[group,setGroup]=useState(''),[edit,setEdit]=useState(null),[form,setForm]=useState(empty),[photo,setPhoto]=useState(undefined),[crop,setCrop]=useState(null),[converting,setConverting]=useState(false);
 const [selected,setSelected]=useState(''),[existing,setExisting]=useState('');const lock=useRef(false),fileGeneration=useRef(0),input=useRef(null);
 async function load(){setLoading(true);try{const d=await call();setPlayers(d.players||[]);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load();return()=>{fileGeneration.current++}},[]);
 const cropUrl=crop?.url;
 useEffect(()=>()=>{if(cropUrl)URL.revokeObjectURL(cropUrl)},[cropUrl]);
 useEffect(()=>{setSelected('');setExisting('');setInfo('');setError('')},[eventId]);
 function start(p){fileGeneration.current++;setConverting(false);setEdit(p||{});setForm(p?{...empty,...p,nickname:p.nickname||'',team:p.team||'',age_group:p.age_group||'',jersey:p.jersey||''}:empty);setPhoto(undefined);setCrop(null);setError('');setInfo('');if(input.current)input.current.value=''}
 function close(){fileGeneration.current++;setConverting(false);setEdit(null);setPhoto(undefined);setCrop(null)}
 async function choose(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;const generation=++fileGeneration.current;setConverting(true);setError('');try{const next=await loadPhoto(file);if(generation===fileGeneration.current)setCrop(next);else URL.revokeObjectURL(next.url)}catch(err){if(generation===fileGeneration.current)setError(err.message)}finally{if(generation===fileGeneration.current)setConverting(false)}}
 async function save(e){e.preventDefault();if(lock.current||converting)return;lock.current=true;setBusy(true);setError('');setInfo('');try{
  const body={name:form.name,nickname:form.nickname,age_group:form.age_group,jersey:form.jersey,team:form.team,active:form.active,...(crop?{photo:exportPhoto(crop)}:photo!==undefined?{photo}:{}),...(edit.id?{id:edit.id}:{})};
  await call(edit.id?'PATCH':'POST',body);close();await load();setInfo('บันทึกทะเบียนนักฟุตบอลแล้ว');
 }catch(err){setError(err.message)}finally{lock.current=false;setBusy(false)}}
 async function link(e){e.preventDefault();if(lock.current||!selected)return;lock.current=true;setBusy(true);setError('');setInfo('');try{
  await call('POST',{action:'link',event:eventId,registry_id:selected,...(existing?{existing_player:existing}:{})});
  setSelected('');setExisting('');setInfo('เชื่อมรายชื่อนักฟุตบอลกับอัลบั้มแล้ว');await onChanged?.();
 }catch(err){setError(err.message)}finally{lock.current=false;setBusy(false)}}
 const linked=new Set(eventPlayers.map(p=>p.registry_id).filter(Boolean));
 const groups=[...new Set(players.map(p=>p.age_group).filter(Boolean))].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
 const q=query.trim().toLowerCase(),shown=players.filter(p=>(!eventId||p.active&&!linked.has(p.id))&&(!group||p.age_group===group)&&(!q||[p.name,p.nickname,p.jersey,p.team].some(v=>String(v||'').toLowerCase().includes(q))));
 const preview=photo===undefined?profile(edit):photo;
 return <section className="fga-card fga-registry">
  <div className="fga-row fga-registry-head"><h2>{eventId?'เลือกจากทะเบียนนักฟุตบอล':'จัดการเด็ก · ทะเบียนกลาง'}</h2>{!eventId&&<button type="button" className="fga-primary" disabled={busy} onClick={()=>start(null)}>+ ลงทะเบียน</button>}</div>
  <p>{eventId?'เลือกนักเตะที่ลงทะเบียนไว้แล้วเพื่อเพิ่มเข้าอัลบั้มและแท็กรูป โดยยังต้องตรวจสิทธิ์การเผยแพร่ตามเดิม':'ลงทะเบียนครั้งเดียว ใช้กับหลายอัลบั้มได้ รูปโปรไฟล์นี้ใช้เฉพาะผู้ดูแลระบบ'}</p>
  {error&&<div role="alert" className="fga-message">{error}<button type="button" className="fga-chip" onClick={load} disabled={loading}>ลองโหลดใหม่</button></div>}{info&&<div role="status" className="fga-message fga-ok">{info}</div>}
  {edit&&<form onSubmit={save} className="fga-registry-form">
   <div className="fga-registry-photo">{!crop&&<Avatar src={preview}/>}<div className="fga-registry-photo-info"><strong>รูปโปรไฟล์</strong><span className="fga-hint">JPEG, PNG หรือ WebP</span><div className="fga-actions"><label className="fga-chip fga-file-chip fga-registry-upload"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/></svg>{preview||crop?'เปลี่ยนรูป':'เลือกรูป'}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||converting} onChange={choose} aria-label="เลือกรูปโปรไฟล์"/></label>{(preview||crop)&&<button type="button" className="fga-chip" disabled={busy||converting} onClick={()=>{setPhoto(null);setCrop(null)}}>นำรูปออก</button>}</div>{converting&&<p>กำลังเตรียมรูป…</p>}</div></div>
   {crop&&<PhotoCrop crop={crop} onChange={setCrop} disabled={busy||converting}/>}
   {[[ 'name','ชื่อ',true,100],['nickname','ชื่อเล่น',false,100],['age_group','รุ่น U เช่น U10',false,3],['jersey','เบอร์เสื้อ',false,3],['team','ทีม / Academy',false,100]].map(([key,label,required,max])=><label key={key}>{label}<input style={{fontSize:16,width:'100%',minWidth:0,maxWidth:'100%'}} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} required={required} maxLength={max} inputMode={key==='jersey'?'numeric':undefined} pattern={key==='jersey'?'[0-9]{1,3}':key==='age_group'?'[Uu][0-9]{1,2}':undefined}/></label>)}
   <label className="fga-check"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/>ใช้งานอยู่</label>
   <div className="fga-actions"><button className="fga-primary" disabled={busy||converting}>{busy?'กำลังบันทึก…':'บันทึก'}</button><button type="button" className="fga-chip" disabled={busy} onClick={close}>ยกเลิก</button></div>
  </form>}
  <div className="fga-registry-filters"><label className="fga-registry-search"><span className="fga-registry-sr">ค้นหานักฟุตบอล</span><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" placeholder="ค้นหาชื่อ / เบอร์เสื้อ / ทีม" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="fga-registry-filter"><span className="fga-registry-sr">รุ่นอายุ</span><select value={group} onChange={e=>setGroup(e.target.value)}><option value="">ทุกรุ่น U</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label></div>
  {loading?<p>กำลังโหลดทะเบียน…</p>:shown.length===0?<p>ไม่พบรายชื่อนักฟุตบอล</p>:<ul className="fga-children-list fga-registry-list">{shown.map(p=><li key={p.id}><Avatar src={profile(p)}/><div className="fga-registry-player-info"><strong>{p.nickname?p.nickname+' · ':''}{p.name}</strong><div className="fga-meta">{p.age_group||'ยังไม่ระบุรุ่น U'} · {p.jersey?'#'+p.jersey:'ยังไม่ระบุเบอร์'}{p.team?' · '+p.team:''}{p.active?'':' · ไม่ได้ใช้งาน'}</div></div>{eventId?<button type="button" className={'fga-chip'+(selected===p.id?' active':'')} aria-pressed={selected===p.id} disabled={busy} onClick={()=>{setSelected(p.id);setExisting('')}}>{selected===p.id?'เลือกแล้ว':'เลือก'}</button>:<button type="button" className="fga-chip" disabled={busy} onClick={()=>start(p)}>แก้ไข</button>}</li>)}</ul>}
  {eventId&&selected&&<form onSubmit={link} className="fga-registry-link"><label>เชื่อมกับรายชื่อเดิม (ถ้าเป็นเด็กคนเดียวกัน)<select style={{fontSize:16,width:'100%',maxWidth:'100%',minWidth:0}} value={existing} onChange={e=>setExisting(e.target.value)}><option value="">เพิ่มรายชื่อใหม่ในอัลบั้ม</option>{eventPlayers.filter(p=>!p.registry_id).map(p=><option key={p.id} value={p.id}>{p.name}{p.jersey?' #'+p.jersey:''}</option>)}</select></label><button className="fga-primary" disabled={busy}>{busy?'กำลังเชื่อม…':'ยืนยันเพิ่มเข้าอัลบั้ม'}</button></form>}
 </section>
}
