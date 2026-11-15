import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let scenario={},log=[],intent=null;
const row=(rows=[])=>({rows,rowCount:rows.length});
const file={id:'file',r2_key:'drive-id',variant:'JPEG',storage:'drive',size_bytes:5,sha256:'abc'};
const client={async query(sql,args=[]){
 log.push(sql);
 if(sql.includes('pg_try_advisory_lock'))return row([{ok:true}]);
 if(sql.includes('pg_advisory_unlock')||['BEGIN','COMMIT','ROLLBACK'].includes(sql))return row();
 if(sql.startsWith('SELECT id,drive_folder_id'))return row([{id:'event',drive_folder_id:'folder'}]);
 if(sql.startsWith('SELECT id FROM fg_events')||sql.startsWith('SELECT id FROM fg_media'))return row([{id:'media'}]);
 if(sql.startsWith('SELECT value FROM fg_settings'))return args[0].startsWith('media.delete.')?(intent?row([{value:JSON.stringify(intent)}]):row()):row([{value:'preview-folder'}]);
 if(sql.startsWith('SELECT id,variant'))return row([file]);
 if(sql.startsWith('SELECT id,r2_key'))return row([{id:'file',r2_key:'drive-id'}]);
 if(sql.startsWith('INSERT INTO fg_settings')){intent=JSON.parse(args[1]);return row()}
 if(sql.startsWith('DELETE FROM fg_settings')){intent=null;return row()}
 return row();
},release(){}};
globalThis.__deleteDeps={db:()=>({connect:async()=>client}),isUuid:x=>['event','media'].includes(x),adminGuard:async()=>({admin:{id:'owner',role:scenario.role||'owner'}}),reply:(body,status=200)=>({body,status}),audit:async()=>{},deleteFile:async key=>{log.push('delete '+key);if(scenario.failDelete)throw Error('network')},fileMeta:async()=>({}),inspectRecordedFiles:async()=>[{status:scenario.mismatch?'identity_mismatch':'matched'}]};
let src=await readFile('app/api/football-gallery/admin/delete-media/route.js','utf8');
src=src.replace(/import \{db,isUuid\} from '[^']+';/,'const {db,isUuid}=globalThis.__deleteDeps;')
 .replace(/import \{adminGuard,adminReply as reply,audit\} from '[^']+';/,'const {adminGuard,reply,audit}=globalThis.__deleteDeps;')
 .replace(/import \{deleteFile,fileMeta\} from '[^']+';/,'const {deleteFile,fileMeta}=globalThis.__deleteDeps;')
 .replace(/import \{inspectRecordedFiles\} from '[^']+';/,'const {inspectRecordedFiles}=globalThis.__deleteDeps;');
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const req=(confirmed=true)=>({json:async()=>({eventId:'event',mediaId:'media',confirmed})});
scenario={role:'admin'};assert.equal((await POST(req())).status,403);assert.ok(!log.includes('delete drive-id'));
scenario={};log=[];assert.equal((await POST(req(false))).status,400);assert.equal(log.length,0);
scenario={mismatch:true};log=[];assert.equal((await POST(req())).status,409);assert.ok(!log.includes('delete drive-id'));assert.equal(intent,null);
scenario={failDelete:true};log=[];assert.equal((await POST(req())).status,503);assert.ok(intent);assert.ok(log.indexOf('COMMIT')<log.indexOf('delete drive-id'));assert.ok(log.some(x=>x.startsWith("UPDATE fg_media SET status='hidden'")));
scenario={};log=[];assert.equal((await POST(req())).status,200);assert.equal(intent,null);assert.ok(log.includes('delete drive-id'));assert.ok(log.some(x=>x.startsWith('DELETE FROM fg_media WHERE')));
console.log('PASS: deletion requires owner, verifies file identity and resumes safely after failure');
