import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

let existing,rolledBack=0;
const client={async query(sql){
 if(sql==='BEGIN')return {rowCount:0,rows:[]};
 if(sql==='ROLLBACK'){rolledBack++;return {rowCount:0,rows:[]}}
 if(sql.startsWith('SELECT id FROM fg_events'))return {rowCount:1,rows:[{id:'event'}]};
 if(sql.startsWith('SELECT f.id,f.media_id'))return {rowCount:1,rows:[existing]};
 throw Error('Unexpected query: '+sql);
},release(){}};
globalThis.__uploadResumeTest={
 randomUUID,db:()=>({connect:async()=>client}),isUuid:x=>x==='event',
 originalType:()=>({base:'photo',ext:'jpg',variant:'JPEG',mime:'image/jpeg'}),storageDriver:()=> 'drive',
 adminGuard:async()=>({admin:{id:'admin'}}),send:(body,status=200)=>({body,status}),audit:async()=>{},
 DRIVE_CHUNK:8*1024*1024,ensureEventFolder:async()=> 'folder'
};
let source=await readFile('app/api/football-gallery/admin/upload/route.js','utf8');
source=source.replace(/^import .*;\n/gm,'');
source="const {randomUUID,db,isUuid,originalType,storageDriver,adminGuard,send,audit,DRIVE_CHUNK,ensureEventFolder}=globalThis.__uploadResumeTest;\n"+source;
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const body={action:'init',event:'event',filename:'photo.jpg',bytes:100,sha256:'a'.repeat(64),crc32:'12345678',batch:'batch'};
const request={json:async()=>body,headers:{get:()=> 'https://preview.example'}};
for(const [bytes,hash,expected] of [[false,false,'resumable'],[true,false,'resumable'],[true,true,'duplicate']]){
 existing={id:'file',media_id:'media',verified_bytes:bytes,verified_hash:hash};
 const r=await POST(request);assert.equal(r.status,409);assert.equal(r.body[expected],true);assert.equal(r.body.fileId,'file');
 assert.equal(Boolean(r.body[expected==='duplicate'?'resumable':'duplicate']),false);
}
assert.equal(rolledBack,3);
console.log('PASS: incomplete uploads can resume; only fully verified originals count as duplicates');
