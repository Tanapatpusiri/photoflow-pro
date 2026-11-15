import {createSHA256,createCRC32} from 'hash-wasm';
import {timingSafeEqual} from 'node:crypto';
import {db,streamPrivateObject} from './football-gallery-server';
import {fileMeta,checkUploaded} from './football-gallery-drive';

// Google Drive computes SHA-256 from the stored bytes itself; comparing it with the browser's
// SHA-256 proves the original is byte-identical without downloading it again.
async function verifyDrive(f,size){
 const meta=await fileMeta(f.r2_key);
 const check=checkUploaded(meta,{fileId:f.id,size,sha256:f.sha256});
 if(check.pending)return {status:202,done:false,offset:size,bytes:size,eventId:f.event_id};
 const ok=check.ok&&/^[0-9a-f]{8}$/.test(f.declared_crc32||'');
 await db().query(`UPDATE fg_media_files SET verified_hash=$2,crc32=$3,verified_at=CASE WHEN $2 THEN NOW() ELSE NULL END WHERE id=$1`,[f.id,ok,ok?f.declared_crc32:null]);
 return {status:ok?200:409,done:true,verified:ok,bytes:size,sha256:meta?.sha256Checksum?String(meta.sha256Checksum).toLowerCase():null,eventId:f.event_id,reason:check.reason};
}

// Resumable SHA-256 (+ CRC32 for ZIP export) of a private original, read back from storage.
// Hash state is saved between steps, so files of any size can be verified in several short
// function invocations, or in one long run by the CLI worker (scripts/verify-pending-originals.mjs).
export async function verifyStep(fileId,{budgetMs=40000,maxBytes=Infinity}={}){
 const q=await db().query(`SELECT f.id,f.r2_key,f.sha256,f.size_bytes,f.verify_offset,f.verify_sha_state,f.verify_crc_state,f.verified_bytes,f.storage,f.declared_crc32,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=$1 AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL')`,[fileId]);
 if(!q.rowCount)return {status:404};
 const f=q.rows[0],size=Number(f.size_bytes);
 if(!f.verified_bytes)return {status:409,reason:'NOT_UPLOADED'};
 if(f.storage==='drive')return verifyDrive(f,size);
 const sha=await createSHA256(),crc=await createCRC32();
 let offset=Number(f.verify_offset)||0;
 if(offset>0&&f.verify_sha_state&&f.verify_crc_state){sha.load(new Uint8Array(f.verify_sha_state));crc.load(new Uint8Array(f.verify_crc_state))}
 else{offset=0;sha.init();crc.init()}
 const started=Date.now();
 if(offset<size){
  const object=await streamPrivateObject(f.r2_key,`bytes=${offset}-${size-1}`);
  let read=0;
  try{
   for await(const chunk of object.Body){
    const bytes=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);
    const take=Math.min(bytes.length,size-offset);
    if(take>0){const part=bytes.subarray(0,take);sha.update(part);crc.update(part);offset+=take;read+=take}
    if(bytes.length>take){offset=size+1;break} // stored object is longer than the recorded original
    if(offset>=size||Date.now()-started>budgetMs||read>=maxBytes)break;
   }
  }finally{object.Body?.destroy?.()}
 }
 if(offset<size){
  await db().query('UPDATE fg_media_files SET verify_offset=$2,verify_sha_state=$3,verify_crc_state=$4 WHERE id=$1',[f.id,offset,Buffer.from(sha.save()),Buffer.from(crc.save())]);
  return {status:202,done:false,offset,bytes:size,eventId:f.event_id};
 }
 const calculated=offset===size?sha.digest('hex'):'';
 const crc32=offset===size?crc.digest('hex'):null;
 const ok=offset===size&&/^[0-9a-f]{64}$/.test(f.sha256||'')&&timingSafeEqual(Buffer.from(calculated,'hex'),Buffer.from(f.sha256,'hex'));
 await db().query(`UPDATE fg_media_files SET verified_hash=$2,crc32=$3,verified_at=CASE WHEN $2 THEN NOW() ELSE NULL END,verify_offset=0,verify_sha_state=NULL,verify_crc_state=NULL WHERE id=$1`,[f.id,ok,ok?crc32:null]);
 return {status:ok?200:409,done:true,verified:ok,bytes:size,sha256:calculated||null,eventId:f.event_id};
}
