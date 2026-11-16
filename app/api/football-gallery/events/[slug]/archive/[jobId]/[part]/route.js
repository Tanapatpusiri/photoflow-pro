import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,streamPrivateObject,contentDisposition,privateHeaders,publicLimitOk,PUBLIC_LIMIT_MESSAGE} from '../../../../../../../../lib/football-gallery-server';
import {grantFingerprint,partLayout,archiveName} from '../../../../../../../../lib/football-gallery-archive';
import {zipRangeStream,parseRange} from '../../../../../../../../lib/football-gallery-zip';
import {archiveUrl} from '../../../../../../../../lib/football-gallery-tickets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const deny=(message,status)=>NextResponse.json({message},{status,headers:privateHeaders});

async function readObject(key,from,to){
 const object=await streamPrivateObject(key,`bytes=${from}-${to-1}`);
 return object.Body;
}

export async function GET(request,{params}){
 if(!configured())return deny('ระบบยังไม่พร้อม',503);
 const {slug,jobId,part}=await params,index=Number(part);
 if(!isUuid(jobId)||!Number.isInteger(index)||index<0||index>9999)return deny('ไม่พบไฟล์',404);
 try{
  const j=await db().query(`SELECT j.id,j.event_id,j.grant_fingerprint,j.manifest,j.part_count,j.expires_at,e.title,e.event_date FROM fg_download_jobs j JOIN fg_events e ON e.id=j.event_id WHERE j.id=$1 AND e.slug=$2 AND e.status='published' AND j.state='ready' AND j.expires_at>NOW()`,[jobId,slug]);
  if(!j.rowCount)return deny('ลิงก์ดาวน์โหลดหมดอายุ กรุณาสร้างใหม่',410);
  const job=j.rows[0];
  const grant=await grantFor(request,job.event_id);
  if(!grant||grantFingerprint(grant)!==job.grant_fingerprint)return deny('ไม่มีสิทธิ์ดาวน์โหลด',403);
  if(!await publicLimitOk(request,grant,'part'))return deny(PUBLIC_LIMIT_MESSAGE,429);
  const ids=job.manifest?.parts?.[index];
  if(!Array.isArray(ids)||!ids.length)return deny('ไม่พบไฟล์',404);
  // Re-check publication now: a file hidden after the job was prepared is never streamed.
  const q=await db().query(`SELECT f.id,f.r2_key,f.original_filename,f.variant,f.size_bytes,f.crc32,f.sha256,f.storage,m.captured_at FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=ANY($1::uuid[]) AND m.event_id=$2 AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true AND f.verified_hash=true AND f.crc32 IS NOT NULL`,[ids,job.event_id]);
  if(q.rowCount!==ids.length)return deny('รายการไฟล์มีการเปลี่ยนแปลง กรุณาสร้างชุดดาวน์โหลดใหม่',410);
  // Drive originals are streamed by the download Worker, which re-checks this same authorisation.
  if(q.rows.some(f=>f.storage==='drive'))return NextResponse.redirect(archiveUrl(job.id,index,grant.codeId,job.event_id,job.expires_at),{status:307,headers:privateHeaders});
  const order=new Map(ids.map((id,i)=>[id,i]));
  const files=q.rows.sort((a,b)=>order.get(a.id)-order.get(b.id));
  const layout=await partLayout(files,job.event_date?new Date(job.event_date):new Date());
  const range=parseRange(request.headers.get('range'),layout.length);
  const name=archiveName(job.title,index,job.part_count);
  const headers={...privateHeaders,'Content-Type':'application/zip','Accept-Ranges':'bytes','Content-Disposition':contentDisposition('attachment',name),'ETag':`"${job.id}-${index}-${layout.length}"`};
  if(range===false)return new NextResponse(null,{status:416,headers:{...headers,'Content-Range':`bytes */${layout.length}`}});
  const ifRange=request.headers.get('if-range');
  const useRange=range&&(!ifRange||ifRange===headers.ETag);
  const start=useRange?range.start:0,end=useRange?range.end:layout.length;
  if(start===0)await db().query('INSERT INTO fg_audit(event_id,action,resource_id,detail) VALUES($1,$2,$3,$4)',[job.event_id,'download.archive',job.id,JSON.stringify({part:index,files:files.length,bytes:layout.length})]);
  const body=zipRangeStream(layout,start,end,readObject);
  return new NextResponse(body,{status:useRange?206:200,headers:{...headers,'Content-Length':String(end-start),...(useRange?{'Content-Range':`bytes ${start}-${end-1}/${layout.length}`}:{})}});
 }catch(err){console.error('fg archive stream',err?.code||err?.name||'unknown');return deny('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่',503)}
}
