import {NextResponse} from 'next/server';
import {configured,db,storageDriver,grantActive,isUuid,privateHeaders} from '../../../../../lib/football-gallery-server';
import {accessToken} from '../../../../../lib/football-gallery-drive';
import {verifyTicket,workerAuthorized} from '../../../../../lib/football-gallery-tickets';
import {grantFingerprint,archiveEventIds,partEntries,archiveName} from '../../../../../lib/football-gallery-archive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:privateHeaders});
const PUBLISHED="m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true AND f.verified_hash=true";

// Called only by the download Worker for every original-file or ZIP request. The ticket only proves
// that this app issued the link; access is re-checked here against the current database, so revoked
// links, suspended events, expired retention and removed photos stop working immediately.
// Parent previews are the exception: for tickets that carry the Drive id the Worker also asks for the
// album's list of published previews and serves that grant's previews from it for up to 60 seconds,
// so for previews revocation and removal apply within 60 seconds.
const ALLOWED_MAX=20000;
export async function POST(request){
 if(!configured()||storageDriver()!=='drive')return reply({error:'not-configured'},503);
 if(!workerAuthorized(request))return reply({error:'unauthorized'},401);
 let body;try{body=await request.json()}catch{return reply({error:'bad-request'},400)}
 const t=verifyTicket(body?.ticket);
 if(!t||!['t','f','z'].includes(t.k)||!isUuid(t.g)||!isUuid(t.e))return reply({error:'invalid-ticket'},403);
 const rangeStart=Number(body.rangeStart)||0;
 try{
  if(!await grantActive(t.e,t.g))return reply({error:'access-revoked'},403);
  if(t.k==='t'){
   if(!isUuid(t.f))return reply({error:'invalid-ticket'},403);
   const q=await db().query(`SELECT f.r2_key FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=$1 AND m.event_id=$2 AND f.storage='drive' AND f.variant IN('THUMB','PREVIEW','VIDEO_PREVIEW') AND f.verified_bytes=true AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true`,[t.f,t.e]);
   if(!q.rowCount)return reply({error:'not-available'},404);
   const preview={driveId:q.rows[0].r2_key};
   if(body.allowed!==true||typeof t.d!=='string')return reply({preview});
   const all=await db().query(`SELECT f.id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE m.event_id=$1 AND f.storage='drive' AND f.variant='THUMB' AND f.verified_bytes=true AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true LIMIT ${ALLOWED_MAX+1}`,[t.e]);
   return reply(all.rows.length>ALLOWED_MAX?{preview}:{preview,allowed:all.rows.map(r=>r.id)});
  }
  if(t.k==='f'){
   if(!isUuid(t.f))return reply({error:'invalid-ticket'},403);
   const q=await db().query(`SELECT f.r2_key,f.original_filename,f.size_bytes,f.mime_type FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=$1 AND m.event_id=$2 AND f.storage='drive' AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL') AND ${PUBLISHED}`,[t.f,t.e]);
   if(!q.rowCount)return reply({error:'not-available'},404);
   const f=q.rows[0],token=await accessToken();
   return reply({accessToken:token.token,expiresAt:token.exp,file:{driveId:f.r2_key,name:f.original_filename,size:Number(f.size_bytes),mime:f.mime_type}});
  }
  // ZIP part
  if(!isUuid(t.j)||!Number.isInteger(t.p)||t.p<0)return reply({error:'invalid-ticket'},403);
  const j=await db().query(`SELECT j.id,j.grant_fingerprint,j.manifest,j.part_count,e.title,e.event_date FROM fg_download_jobs j JOIN fg_events e ON e.id=j.event_id WHERE j.id=$1 AND j.event_id=$2 AND j.state='ready' AND j.expires_at>NOW()`,[t.j,t.e]);
  if(!j.rowCount)return reply({error:'expired'},410);
  const job=j.rows[0];
  if(job.grant_fingerprint!==grantFingerprint({codeId:t.g}))return reply({error:'forbidden'},403);
  const ids=job.manifest?.parts?.[t.p];
  if(!Array.isArray(ids)||!ids.length)return reply({error:'not-found'},404);
  const eventIds=await archiveEventIds(t.e,t.g,job.manifest?.combined===true);
  const q=await db().query(`SELECT f.id,f.r2_key,f.original_filename,f.variant,f.size_bytes,f.crc32,f.sha256,f.storage,m.captured_at FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=ANY($1::uuid[]) AND m.event_id=ANY($2::uuid[]) AND f.storage='drive' AND f.crc32 IS NOT NULL AND ${PUBLISHED}`,[ids,eventIds]);
  if(q.rowCount!==ids.length)return reply({error:'changed'},410);
  const order=new Map(ids.map((id,i)=>[id,i]));
  const files=q.rows.sort((a,b)=>order.get(a.id)-order.get(b.id));
  const entries=await partEntries(files,job.event_date?new Date(job.event_date):new Date());
  if(rangeStart===0)await db().query('INSERT INTO fg_audit(event_id,action,resource_id,detail) VALUES($1,$2,$3,$4)',[t.e,'download.archive',t.j,JSON.stringify({part:t.p,files:files.length,storage:'drive'})]);
  const token=await accessToken();
  return reply({accessToken:token.token,expiresAt:token.exp,zip:{
   filename:archiveName(job.title,t.p,job.part_count),
   etag:`${t.j}-${t.p}`,
   entries:entries.map(e=>({name:e.name,size:e.size,crc32:e.crc32,modified:e.modified.toISOString(),...(e.data?{data:Buffer.from(e.data).toString('base64')}:{driveId:e.key})}))
  }});
 }catch(e){console.error('fg internal stream',e?.code||'unknown');return reply({error:e?.code||'unavailable'},503)}
}
