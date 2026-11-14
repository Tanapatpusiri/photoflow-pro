import {createCRC32} from 'hash-wasm';
import {db,sha256} from './football-gallery-server';
import {buildZipLayout,uniqueNames} from './football-gallery-zip';

export const ARCHIVE_PART_BYTES=()=>{
 const v=Number(process.env.FG_ZIP_PART_BYTES);
 return Number.isSafeInteger(v)&&v>=64*1024*1024?v:1024*1024*1024; // default 1 GiB per ZIP part
};
export const FORMAT_VARIANTS={jpeg:'JPEG',raw:'RAW',video:'VIDEO_ORIGINAL'};
const FOLDER={JPEG:'JPEG',RAW:'RAW',VIDEO_ORIGINAL:'Videos'};
export const grantFingerprint=grant=>sha256(process.env.FG_SESSION_SECRET+':grant:'+grant.codeId);

// Files a parent may download: published media, verified originals with a known CRC32.
export async function selectArchiveFiles(eventId,{scope,playerId,mediaIds,variants}){
 const inputs=[eventId,variants];
 let where=`m.event_id=$1 AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true AND f.variant=ANY($2::text[]) AND f.verified_hash=true AND f.crc32 IS NOT NULL`;
 if(scope==='player'){inputs.push(playerId);where+=` AND EXISTS(SELECT 1 FROM fg_media_players mp JOIN fg_players p ON p.id=mp.player_id WHERE mp.media_id=m.id AND p.visible=true AND p.event_id=$1 AND p.id=$${inputs.length})`}
 if(scope==='selection'){inputs.push(mediaIds);where+=` AND m.id=ANY($${inputs.length}::uuid[])`}
 const q=await db().query(`SELECT f.id,f.r2_key,f.original_filename,f.variant,f.size_bytes,f.crc32,f.sha256,m.captured_at FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id WHERE ${where} ORDER BY m.captured_at NULLS LAST,m.title NULLS LAST,m.id,f.variant`,inputs);
 return q.rows;
}

export function partition(files,limit){
 const parts=[];let current=[],bytes=0;
 for(const f of files){
  const size=Number(f.size_bytes);
  if(current.length&&bytes+size>limit){parts.push(current);current=[];bytes=0}
  current.push(f);bytes+=size;
 }
 if(current.length)parts.push(current);
 return parts;
}

// Builds the exact ZIP layout of one part: originals in JPEG/, RAW/, Videos/ plus SHA256SUMS.txt.
export async function partLayout(files,fallbackDate){
 const unique=uniqueNames(),entries=[],sums=[];
 for(const f of files){
  const name=unique(FOLDER[f.variant]+'/'+String(f.original_filename).replace(/[\\/\u0000-\u001f]/g,'_'));
  entries.push({name,size:Number(f.size_bytes),crc32:f.crc32,key:f.r2_key,modified:f.captured_at?new Date(f.captured_at):fallbackDate});
  sums.push(`${f.sha256}  ${name}`);
 }
 const manifest=new TextEncoder().encode(sums.join('\n')+'\n');
 const crc=await createCRC32();crc.init();crc.update(manifest);
 entries.push({name:'SHA256SUMS.txt',size:manifest.length,crc32:crc.digest('hex'),data:manifest,modified:fallbackDate});
 return buildZipLayout(entries);
}

export const archiveName=(title,index,count)=>{
 const base=String(title||'football-gallery').normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'football-gallery';
 return count>1?`${base}-part-${String(index+1).padStart(2,'0')}-of-${String(count).padStart(2,'0')}.zip`:`${base}.zip`;
};
