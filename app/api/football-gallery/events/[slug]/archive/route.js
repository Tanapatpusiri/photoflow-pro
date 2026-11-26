import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,sameOrigin,rateLimit,clientIp,privateHeaders,publicLimitOk,PUBLIC_LIMIT_MESSAGE} from '../../../../../../lib/football-gallery-server';
import {ARCHIVE_PART_BYTES,ARCHIVE_MAX_FILES,FORMAT_VARIANTS,grantFingerprint,archiveEventIds,selectArchiveFiles,partition,partLayout,archiveName} from '../../../../../../lib/football-gallery-archive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
// Prepares a "Download All" job: a list of ZIP parts (default <= 1 GiB each) that the browser
// downloads one by one as ordinary file downloads with exact sizes and resume support.
export async function POST(request,{params}){
 if(!configured())return reply({message:'ระบบยังไม่พร้อม'},503);
 if(!sameOrigin(request))return reply({message:'ต้นทางคำขอไม่ถูกต้อง'},403);
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const scope=d?.scope;
 const formats=Object.keys(FORMAT_VARIANTS).filter(k=>d?.formats?.[k]===true);
 if(!['event','player','selection'].includes(scope)||!formats.length)return reply({message:'กรุณาเลือกประเภทไฟล์'},400);
 if(scope==='player'&&!isUuid(d.playerId))return reply({message:'ไม่พบนักฟุตบอล'},400);
 if(scope==='selection'&&(!Array.isArray(d.mediaIds)||!d.mediaIds.length||d.mediaIds.length>5000||d.mediaIds.some(x=>!isUuid(x))))return reply({message:'กรุณาเลือกรูปหรือคลิป'},400);
 try{
  const {slug}=await params;
  const e=await db().query("SELECT id,title,event_date,album_mode FROM fg_events WHERE slug=$1 AND status='published'",[slug]);
  if(!e.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const event=e.rows[0],grant=await grantFor(request,event.id);
  if(!grant)return reply({message:'ไม่มีสิทธิ์',needsAccess:true},403);
  if(!await publicLimitOk(request,grant,'archive'))return reply({message:PUBLIC_LIMIT_MESSAGE},429);
  if(!await rateLimit('archive',grant.codeId+':'+clientIp(request),30,60)||!await rateLimit('archive-grant',grant.codeId,300,60))return reply({message:'สร้างชุดดาวน์โหลดบ่อยเกินไป กรุณารอสักครู่'},429);
  const combined=event.album_mode==='multi-day';
  if(combined&&scope!=='event')return reply({message:'กรุณาเลือกดาวน์โหลดทั้งอัลบั้ม'},400);
  const eventIds=await archiveEventIds(event.id,grant.codeId,combined);
  const files=await selectArchiveFiles(eventIds,{scope,playerId:d.playerId,mediaIds:d.mediaIds?[...new Set(d.mediaIds)]:null,variants:formats.map(k=>FORMAT_VARIANTS[k])});
  if(!files.length)return reply({message:'ไม่มีไฟล์ต้นฉบับที่พร้อมดาวน์โหลดตามที่เลือก'},404);
  const batches=combined?[files.filter(f=>f.storage==='drive'),files.filter(f=>f.storage!=='drive')]:[files];
  const groups=batches.flatMap(batch=>partition(batch,ARCHIVE_PART_BYTES(),ARCHIVE_MAX_FILES(batch)));
  const fallback=event.event_date?new Date(event.event_date):new Date();
  const parts=[];
  for(let i=0;i<groups.length;i++){
   const layout=await partLayout(groups[i],fallback);
   parts.push({index:i,files:groups[i].length,bytes:layout.length,originalBytes:groups[i].reduce((n,f)=>n+Number(f.size_bytes),0),name:archiveName(event.title,i,groups.length)});
  }
  const total=parts.reduce((n,p)=>n+p.originalBytes,0);
  const job=await db().query(`INSERT INTO fg_download_jobs(event_id,grant_fingerprint,scope,formats,state,manifest,expires_at,part_count,total_bytes) VALUES($1,$2,$3,$4,'ready',$5,NOW()+INTERVAL '24 hours',$6,$7) RETURNING id,expires_at`,
   [event.id,grantFingerprint(grant),scope,formats,JSON.stringify({combined,parts:groups.map(g=>g.map(f=>f.id)),playerId:scope==='player'?d.playerId:null}),parts.length,total]);
  const id=job.rows[0].id,base=`/api/football-gallery/events/${encodeURIComponent(slug)}/archive/${id}/`;
  return reply({jobId:id,expiresAt:job.rows[0].expires_at,files:files.length,originalBytes:total,parts:parts.map(p=>({...p,url:base+p.index}))},201);
 }catch(err){console.error('fg archive prepare',err?.code||'unknown');return reply({message:'เตรียมไฟล์ดาวน์โหลดไม่สำเร็จ'},503)}
}
