'use client';
import {useEffect,useRef,useState} from 'react';
const base='/api/football-gallery/admin/player-registry';
const empty={name:'',nickname:'',age_group:'',jersey:'',team:'',active:true};
async function call(method='GET',body){
 const r=await fetch(base,{method,cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'เชื่อมต่อระบบไม่สำเร็จ');return d;
}
async function jpeg(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('เลือกรูป JPEG, PNG หรือ WebP ไม่เกิน 15 MB');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('เปิดรูปไม่สำเร็จ'));img.src=url});
  const scale=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=c.getContext('2d');if(!ctx)throw Error('เบราว์เซอร์ไม่รองรับการแปลงรูป');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
  const data=c.toDataURL('image/jpeg',0.82);if(data.length>409600)throw Error('รูปใหญ่เกินกำหนด');return data;
 }finally{URL.revokeObjectURL(url)}
}
const profile=p=>p?.has_profile?base+'?photo='+encodeURIComponent(p.id)+'&v='+encodeURIComponent(p.updated_at||''):'';
function Avatar({src}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 return <span style={{display:'inline-flex',width:56,height:56,flex:'0 0 56px',borderRadius:'50%',overflow:'hidden',background:'#eceef0',alignItems:'center',justifyContent:'center'}}>{src&&!failed?<img src={src} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>}</span>
}
export default function PlayerRegistry({eventId=null,eventPlayers=[],onChanged}){
 const [players,setPlayers]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [query,setQuery]=useState(''),[group,setGroup]=useState(''),[edit,setEdit]=useState(null),[form,setForm]=useState(empty),[photo,setPhoto]=useState(undefined),[converting,setConverting]=useState(false);
 const [selected,setSelected]=useState(''),[existing,setExisting]=useState('');const lock=useRef(false),fileGeneration=useRef(0),input=useRef(null);
 async function load(){setLoading(true);try{const d=await call();setPlayers(d.players||[]);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{setSelected('');setExisting('');setInfo('');setError('')},[eventId]);
 function start(p){fileGeneration.current++;setConverting(false);setEdit(p||{});setForm(p?{...empty,...p,nickname:p.nickname||'',team:p.team||'',age_group:p.age_group||'',jersey:p.jersey||''}:empty);setPhoto(undefined);setError('');setInfo('');if(input.current)input.current.value=''}
 function close(){fileGeneration.current++;setConverting(false);setEdit(null);setPhoto(undefined)}
 async function choose(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;const generation=++fileGeneration.current;setConverting(true);setError('');try{const data=await jpeg(file);if(generation===fileGeneration.current)setPhoto(data)}catch(err){if(generation===fileGeneration.current)setError(err.message)}finally{if(generation===fileGeneration.current)setConverting(false)}}
 async function save(e){e.preventDefault();if(lock.current||converting)return;lock.current=true;setBusy(true);setError('');setInfo('');try{
  const body={name:form.name,nickname:form.nickname,age_group:form.age_group,jersey:form.jersey,team:form.team,active:form.active,...(photo!==undefined?{photo}:{}),...(edit.id?{id:edit.id}:{})};
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
 return <section className="fga-card" style={{minWidth:0,maxWidth:'100%'}}>
  <div className="fga-row" style={{flexWrap:'wrap'}}><h2>{eventId?'เลือกจากทะเบียนนักฟุตบอล':'จัดการเด็ก · ทะเบียนกลาง'}</h2>{!eventId&&<button type="button" className="fga-primary" disabled={busy} onClick={()=>start(null)}>+ ลงทะเบียน</button>}</div>
  <p>{eventId?'เลือกนักเตะที่ลงทะเบียนไว้แล้วเพื่อเพิ่มเข้าอัลบั้มและแท็กรูป โดยยังต้องตรวจสิทธิ์การเผยแพร่ตามเดิม':'ลงทะเบียนครั้งเดียว ใช้กับหลายอัลบั้มได้ รูปโปรไฟล์นี้ใช้เฉพาะผู้ดูแลระบบ'}</p>
  {error&&<div role="alert" className="fga-message">{error}<button type="button" className="fga-chip" onClick={load} disabled={loading}>ลองโหลดใหม่</button></div>}{info&&<div role="status" className="fga-message fga-ok">{info}</div>}
  {edit&&<form onSubmit={save} style={{minWidth:0}}>
   <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><Avatar src={preview}/><div style={{flex:'1 1 180px',minWidth:0}}><label>รูปโปรไฟล์<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||converting} onChange={choose} style={{fontSize:16,width:'100%',minWidth:0,maxWidth:'100%'}}/></label>{preview&&<button type="button" className="fga-chip" disabled={busy||converting} onClick={()=>{setPhoto(null)}}>นำรูปออก</button>}{converting&&<p>กำลังเตรียมรูป…</p>}</div></div>
   {[[ 'name','ชื่อ–นามสกุล',true,100],['nickname','ชื่อเล่น',false,100],['age_group','รุ่น U เช่น U10',true,3],['jersey','เบอร์เสื้อ',true,3],['team','ทีม / Academy',false,100]].map(([key,label,required,max])=><label key={key}>{label}<input style={{fontSize:16,width:'100%',minWidth:0,maxWidth:'100%'}} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} required={required} maxLength={max} inputMode={key==='jersey'?'numeric':undefined} pattern={key==='jersey'?'[0-9]{1,3}':key==='age_group'?'[Uu][0-9]{1,2}':undefined}/></label>)}
   <label className="fga-check"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/>ใช้งานอยู่</label>
   <div className="fga-actions"><button className="fga-primary" disabled={busy||converting}>{busy?'กำลังบันทึก…':'บันทึก'}</button><button type="button" className="fga-chip" disabled={busy} onClick={close}>ยกเลิก</button></div>
  </form>}
  <label>ค้นหานักฟุตบอล<input type="search" placeholder="ชื่อ / เบอร์เสื้อ / ทีม" value={query} onChange={e=>setQuery(e.target.value)} style={{fontSize:16,width:'100%',minWidth:0,maxWidth:'100%'}}/></label>
  <label>รุ่นอายุ<select value={group} onChange={e=>setGroup(e.target.value)} style={{fontSize:16,width:'100%',minWidth:0,maxWidth:'100%'}}><option value="">ทุกรุ่น</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
  {loading?<p>กำลังโหลดทะเบียน…</p>:shown.length===0?<p>ไม่พบรายชื่อนักฟุตบอล</p>:<ul className="fga-children-list">{shown.map(p=><li key={p.id} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><Avatar src={profile(p)}/><div style={{flex:'1 1 100px',minWidth:0,overflowWrap:'anywhere'}}><strong>{p.nickname?p.nickname+' · ':''}{p.name}</strong><div className="fga-meta">{p.age_group||'ยังไม่ระบุรุ่น U'} · {p.jersey?'#'+p.jersey:'ยังไม่ระบุเบอร์'}{p.team?' · '+p.team:''}{p.active?'':' · ไม่ได้ใช้งาน'}</div></div>{eventId?<button type="button" className="fga-chip" aria-pressed={selected===p.id} disabled={busy} onClick={()=>{setSelected(p.id);setExisting('')}}>{selected===p.id?'เลือกแล้ว':'เลือก'}</button>:<button type="button" className="fga-chip" disabled={busy} onClick={()=>start(p)}>แก้ไข</button>}</li>)}</ul>}
  {eventId&&selected&&<form onSubmit={link}><label>เชื่อมกับรายชื่อเดิม (ถ้าเป็นเด็กคนเดียวกัน)<select style={{fontSize:16,width:'100%',maxWidth:'100%',minWidth:0}} value={existing} onChange={e=>setExisting(e.target.value)}><option value="">เพิ่มรายชื่อใหม่ในอัลบั้ม</option>{eventPlayers.filter(p=>!p.registry_id).map(p=><option key={p.id} value={p.id}>{p.name}{p.jersey?' #'+p.jersey:''}</option>)}</select></label><button className="fga-primary" disabled={busy}>{busy?'กำลังเชื่อม…':'ยืนยันเพิ่มเข้าอัลบั้ม'}</button></form>}
 </section>
}
