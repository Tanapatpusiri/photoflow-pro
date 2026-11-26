import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

let scenario={},calls=[],audits=[];
const client={async query(sql,args){
 calls.push({sql,args});
 if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
 if(sql.startsWith('SELECT id,status,locked,public_grant_id,privacy_approved_at'))return {rowCount:1,rows:[{id:'event',status:'draft'}]};
 if(sql.startsWith('SELECT id,status FROM fg_media'))return {rowCount:1,rows:[{id:'media',status:'review'}]};
 if(sql.includes('AS originals'))return {rowCount:1,rows:[{originals:1,verified:scenario.verified===false?0:1}]};
 if(sql.includes('revoked_at IS NOT NULL'))return {rowCount:1,rows:[{n:scenario.revoked||0}]};
 if(sql.startsWith('UPDATE fg_players SET visible=true'))return {rowCount:scenario.tagged||0,rows:[]};
 if(sql.startsWith('SELECT COUNT(*)::int AS n FROM fg_media_players'))return {rowCount:1,rows:[{n:scenario.tagged||0}]};
 if(sql.startsWith('INSERT INTO fg_privacy_records')||sql.startsWith('UPDATE fg_media SET publish_allowed'))return {rowCount:1,rows:[]};
 if(sql.startsWith('SELECT id,event_id,media_id FROM fg_removal_requests'))return {rowCount:1,rows:[{id:'request',event_id:'event',media_id:scenario.mediaId||null}]};
 if(sql.startsWith("UPDATE fg_media SET status='hidden'"))return {rowCount:scenario.missingMedia?0:1,rows:[]};
 if(sql.startsWith('UPDATE fg_removal_requests'))return {rowCount:1,rows:[]};
 throw Error('Unexpected query: '+sql);
},release(){}};
globalThis.__privacyDb=()=>({connect:async()=>client});
globalThis.__privacyAdmin={adminGuard:async()=>({admin:{id:'admin'}}),adminReply:(body,status=200)=>({body,status}),audit:async(_c,a)=>audits.push(a)};
globalThis.__privacyRetention={validRetentionDate:()=>true,TODAY_SQL:"(NOW() AT TIME ZONE 'Asia/Bangkok')::date"};
globalThis.__privacyServer={db:()=>globalThis.__privacyDb(),isUuid:(x)=>['event','media','request'].includes(x),sha256:x=>'hash:'+x.length,PUBLIC_GRANT_LABEL:'[public-album]'};
async function load(path){let s=await readFile(path,'utf8');
 // Routes import different names from the server library (review also needs sha256 and PUBLIC_GRANT_LABEL for album grants).
 s=s.replace(/import \{([^}]+)\} from '[^']*\/lib\/football-gallery-server';/,(_,names)=>`const {${names}}=globalThis.__privacyServer;`);
 s=s.replace(/import \{adminGuard,adminReply as reply,audit\} from '[^']+';/,'const {adminGuard,adminReply:reply,audit}=globalThis.__privacyAdmin;');
 s=s.replace(/import \{addRetentionMonths,validRetentionDate,TODAY_SQL\} from '[^']+';/,'const {addRetentionMonths,validRetentionDate,TODAY_SQL}=globalThis.__privacyRetention;');
 s=s.replace(/import \{RETENTION_SETTINGS_LOCK,readRetentionMonths\} from '[^']+';/,"const RETENTION_SETTINGS_LOCK='RETENTION_LOCK'; const readRetentionMonths=async()=>12;");
 // A data: URL cannot resolve relative imports, so a new one must fail here with a readable message.
 assert.doesNotMatch(s,/^import .* from '\.\.?\//m,path+' has a relative import this test does not stub');
 return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
const review=await load('app/api/football-gallery/admin/review/route.js');
const removals=await load('app/api/football-gallery/admin/removals/route.js');
const req=body=>({json:async()=>body});
// Owner policy: consent is confirmed once at publish, so approving only needs who is in the photo.
const body={action:'approve',eventId:'event',mediaId:'media'};
const runReview=async(extra={})=>{calls=[];audits=[];return review.POST(req({...body,...extra}))};
scenario={};let r=await runReview();assert.equal(r.body.code,'NO_CHILDREN_CONFIRMATION_REQUIRED');assert.ok(calls.some(x=>x.sql==='ROLLBACK'));assert.ok(!calls.some(x=>x.sql.startsWith('UPDATE fg_media')));
r=await runReview({noChildrenConfirmed:true});assert.equal(r.status,200);assert.deepEqual(audits[0].detail,{noChildrenConfirmed:true,consent:'album'});
const record=calls.find(x=>x.sql.startsWith('INSERT INTO fg_privacy_records'));assert.ok(record.args[2].length>=5&&record.args[3].length>=5,'default basis and evidence are recorded');
scenario={tagged:1};r=await runReview();assert.equal(r.status,200);assert.deepEqual(audits[0].detail,{noChildrenConfirmed:false,consent:'album'});assert.ok(calls.some(x=>x.sql.startsWith('UPDATE fg_players SET visible=true')),'tagged children become findable by name');
scenario={tagged:1};r=await runReview({basis:'basis test',evidence:'evidence test'});assert.equal(r.status,200);assert.equal(calls.find(x=>x.sql.startsWith('INSERT INTO fg_privacy_records')).args[2],'basis test');
scenario={tagged:1,revoked:1};r=await runReview();assert.equal(r.body.code,'PLAYER_CONSENT_REVOKED');assert.ok(!calls.some(x=>x.sql.startsWith('UPDATE fg_media')));
scenario={verified:false};r=await runReview({noChildrenConfirmed:true});assert.equal(r.body.code,'INTEGRITY_NOT_VERIFIED');
const resolve=async(extra={})=>{calls=[];audits=[];return removals.POST(req({id:'request',state:'done',...extra}))};
scenario={};r=await resolve({resolution:'ดำเนินการถอดภาพแล้ว'});assert.equal(r.status,400);assert.ok(!calls.some(x=>x.sql.startsWith('UPDATE fg_removal_requests')));
r=await resolve({resolution:'ได้ซ่อนภาพตามคำขอด้วยตนเอง',manualConfirmed:true});assert.equal(r.status,200);assert.deepEqual(audits[0].detail,{mediaHidden:false,manualConfirmed:true});
scenario={mediaId:'media'};r=await resolve({hideMedia:false});assert.equal(r.status,400);assert.ok(!calls.some(x=>x.sql.startsWith('UPDATE fg_removal_requests')));
scenario={mediaId:'media',missingMedia:true};r=await resolve();assert.equal(r.status,409);assert.ok(!calls.some(x=>x.sql.startsWith('UPDATE fg_removal_requests')));
scenario={mediaId:'media'};r=await resolve();assert.equal(r.status,200);assert.deepEqual(audits[0].detail,{mediaHidden:true,manualConfirmed:false});
console.log('PASS: privacy attestations and truthful removal resolution');
