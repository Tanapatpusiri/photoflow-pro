// Background integrity worker: verifies every uploaded original whose SHA-256 has not been
// confirmed yet, streaming each object from private R2 with no time limit.
// Run on any trusted machine with the same server environment variables as the Vercel project:
//   node --env-file=.env.worker scripts/verify-pending-originals.mjs [--limit 500]
// (.env.worker must never be committed.)
import {createSHA256,createCRC32} from 'hash-wasm';
import {timingSafeEqual} from 'node:crypto';
import {Pool} from 'pg';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';

const need=['DATABASE_URL','R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
const missing=need.filter(k=>!process.env[k]);
if(missing.length){console.error('Missing environment: '+missing.join(', '));process.exit(1)}
const limitArg=process.argv.indexOf('--limit');
const limit=limitArg>0?Math.max(1,Number(process.argv[limitArg+1])||100):100;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
const s3=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
let passed=0,failed=0;
try{
 const pending=await pool.query(`SELECT f.id,f.r2_key,f.sha256,f.size_bytes,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.variant IN('JPEG','RAW','VIDEO_ORIGINAL') AND f.verified_bytes=true AND f.verified_hash=false ORDER BY f.created_at LIMIT $1`,[limit]);
 for(const f of pending.rows){
  const size=Number(f.size_bytes),sha=await createSHA256(),crc=await createCRC32();sha.init();crc.init();
  let read=0;
  try{
   const object=await s3.send(new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:f.r2_key}));
   for await(const chunk of object.Body){const b=new Uint8Array(chunk);read+=b.length;if(read>size)break;sha.update(b);crc.update(b)}
  }catch(e){console.error(`${f.id} read error ${e.name||e.code}`);failed++;continue}
  const hex=read===size?sha.digest('hex'):'';
  const ok=read===size&&/^[0-9a-f]{64}$/.test(f.sha256||'')&&timingSafeEqual(Buffer.from(hex,'hex'),Buffer.from(f.sha256,'hex'));
  await pool.query(`UPDATE fg_media_files SET verified_hash=$2,crc32=$3,verified_at=CASE WHEN $2 THEN NOW() ELSE NULL END,verify_offset=0,verify_sha_state=NULL,verify_crc_state=NULL WHERE id=$1`,[f.id,ok,ok?crc.digest('hex'):null]);
  await pool.query('INSERT INTO fg_audit(event_id,action,resource_id,detail) VALUES($1,$2,$3,$4)',[f.event_id,ok?'original.integrity-verified':'original.integrity-failed',f.id,JSON.stringify({bytes:size,worker:true})]);
  ok?passed++:failed++;
  console.log(`${ok?'OK  ':'FAIL'} ${f.id} ${size} bytes`);
 }
 console.log(`done: ${passed} verified, ${failed} failed, ${pending.rowCount} checked`);
}finally{await pool.end()}
