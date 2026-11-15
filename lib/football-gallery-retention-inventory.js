// Read-only reconciliation for known database records. This cannot enumerate
// untracked files or prove removal, and never interprets a Drive 404 as deletion.
export async function inspectRecordedFiles(files,folders,readMeta){
 const allowed=new Set(folders.filter(Boolean));
 async function inspect(f){
  const item={filename:f.original_filename,variant:f.variant};
  if(f.storage!=='drive')return {...item,status:'other_storage'};
  if(f.upload_id||String(f.r2_key).startsWith('pending:'))return {...item,status:'pending'};
  if(!allowed.size)return {...item,status:'folder_unknown'};
  try{
   const m=await readMeta(f.r2_key);
   if(!m||m.trashed||m.id!==f.r2_key||m.appProperties?.fgFileId!==f.id)return {...item,status:'identity_mismatch'};
   if(!Array.isArray(m.parents)||!m.parents.some(p=>allowed.has(p)))return {...item,status:'folder_mismatch'};
   if(m.size==null||Number(m.size)!==Number(f.size_bytes))return {...item,status:'size_mismatch'};
   if(['JPEG','RAW','VIDEO_ORIGINAL'].includes(f.variant)){
    if(!f.sha256||!m.sha256Checksum)return {...item,status:'hash_unavailable'};
    if(m.sha256Checksum.toLowerCase()!==f.sha256.toLowerCase())return {...item,status:'hash_mismatch'};
   }
   return {...item,status:'matched'};
  }catch(e){return {...item,status:e?.code==='DRIVE_NOT_FOUND'?'unavailable':'check_failed'}}
 }
 const result=[];
 for(let i=0;i<files.length;i+=4)result.push(...await Promise.all(files.slice(i,i+4).map(inspect)));
 return result;
}
