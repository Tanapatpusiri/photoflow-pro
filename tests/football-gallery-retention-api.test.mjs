import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const retentionSource=await readFile('lib/football-gallery-retention.js','utf8');
globalThis.__retentionTest=await import('data:text/javascript;base64,'+Buffer.from(retentionSource).toString('base64'));
const event={id:'test-event',status:'draft',event_date:'2026-11-15',retention_until:null,privacy_approved_at:null,today:'2026-11-15'};
let lastUpdate=null,lastGrant=null,currentMonths=12;
const client={async query(sql,args){
 if(['BEGIN','COMMIT','ROLLBACK','RETENTION_LOCK'].includes(sql))return {rows:[],rowCount:0};
 if(sql.startsWith('SELECT id,status,locked,public_grant_id,privacy_approved_at'))return {rows:[{...event}],rowCount:1};
 if(sql.startsWith('UPDATE fg_events SET status=')){lastUpdate={sql,args};return {rows:[],rowCount:1}}
 // Publishing an unlocked album also creates its public grant and releases verified photos in the same transaction.
 if(sql.startsWith('INSERT INTO fg_event_codes')){lastGrant={sql,args};return {rows:[{id:'public-grant'}],rowCount:1}}
 if(sql.startsWith('UPDATE fg_media m')||sql.startsWith('UPDATE fg_players SET visible=true'))return {rows:[],rowCount:0};
 if(sql.startsWith('UPDATE fg_events SET event_date=')){
  const permitted=event.status==='draft'||(['published','suspended'].includes(event.status)&&event.retention_until&&event.retention_until<=globalThis.__retentionTest.oneYearAfterEvent(args[1]));
  if(!permitted||event.event_date)return {rows:[],rowCount:0};
  event.event_date=args[1];return {rows:[{id:event.id}],rowCount:1};
 }
 throw Error('Unexpected query: '+sql);
},release(){}};
let listArgs;
globalThis.__retentionDb=()=>({connect:async()=>client,query:async(sql,args)=>{listArgs=args;return {rows:[{...event}],rowCount:1}}});
globalThis.__retentionAdmin={adminGuard:async()=>({admin:{id:'admin'}}),adminReply:(body,status=200)=>({body,status}),audit:async()=>{}};
globalThis.__retentionServer={db:()=>globalThis.__retentionDb(),isUuid:(x)=>x==='test-event',sha256:x=>'hash:'+x.length,PUBLIC_GRANT_LABEL:'[public-album]'};
const load=async(path)=>{
 let s=await readFile(path,'utf8');
 // Routes import different names from the server library (review also needs sha256 and PUBLIC_GRANT_LABEL for album grants).
 s=s.replace(/import \{([^}]+)\} from '[^']*\/lib\/football-gallery-server';/,(_,names)=>`const {${names}}=globalThis.__retentionServer;`);
 s=s.replace(/import \{adminGuard,adminReply as (\w+),audit\} from '[^']+';/,(_,name)=>`const {adminGuard,adminReply: ${name},audit}=globalThis.__retentionAdmin;`);
 s=s.replace(/import \{(validRetentionDate|oneYearAfterEvent)\} from '[^']+';/,(_,name)=>`const {${name}}=globalThis.__retentionTest;`);
 s=s.replace(/import \{addRetentionMonths,validRetentionDate,TODAY_SQL\} from '[^']+';/,'const {addRetentionMonths,validRetentionDate,TODAY_SQL}=globalThis.__retentionTest;');
 s=s.replace(/import \{RETENTION_SETTINGS_LOCK,readRetentionMonths\} from '[^']+';/,"const RETENTION_SETTINGS_LOCK='RETENTION_LOCK'; const readRetentionMonths=async()=>globalThis.__retentionMonths;");
 // A data: URL cannot resolve relative imports, so a new one must fail here with a readable message.
 assert.doesNotMatch(s,/^import .* from '\.\.?\//m,path+' has a relative import this test does not stub');
 return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
};
const review=await load('app/api/football-gallery/admin/review/route.js');
const events=await load('app/api/football-gallery/admin/events/route.js');
const req=(body)=>({json:async()=>body});
let listing=await events.GET({nextUrl:new URL('https://example.test/')});assert.equal(listing.status,200);assert.deepEqual(listArgs,[null]);
listing=await events.GET({nextUrl:new URL('https://example.test/?event=test-event')});assert.equal(listing.status,200);assert.deepEqual(listArgs,['test-event']);
listing=await events.GET({nextUrl:new URL('https://example.test/?event=bad')});assert.equal(listing.status,400);
globalThis.__retentionMonths=12;
const publish=(retentionUntil)=>review.POST(req({action:'publish-event',eventId:event.id,notice:'คำอธิบายการทดสอบความเป็นส่วนตัวที่มีความยาวมากกว่าสี่สิบตัวอักษร',retentionUntil,confirmed:true}));
let result=await publish('2027-11-16');assert.equal(result.status,400);assert.equal(result.body.code,'RETENTION_OUT_OF_RANGE');assert.equal(lastUpdate,null);assert.equal(lastGrant,null,'no public grant before the retention check passes');
result=await publish('2027-11-15');assert.equal(result.status,200);assert.equal(lastUpdate.args[2],'2027-11-15');assert.equal(lastUpdate.args[3],'2027-11-15');
// The public album grant stops working on the chosen access end date (not the deletion date) and is linked to the event.
result=await publish('2027-03-01');assert.equal(result.status,200);assert.equal(lastUpdate.args[2],'2027-03-01');assert.equal(lastUpdate.args[3],'2027-11-15');
assert.equal(lastGrant.args[2],'2027-03-01');assert.match(lastGrant.sql,/\(\$3::date \+ INTERVAL '1 day'\)/);assert.equal(lastUpdate.args[4],'public-grant');
globalThis.__retentionMonths=6;lastUpdate=null;result=await publish('2027-05-16');assert.equal(result.status,400);result=await publish('2027-05-15');assert.equal(result.status,200);assert.equal(lastUpdate.args[3],'2027-05-15');globalThis.__retentionMonths=12;
event.status='archived';result=await publish('2027-11-15');assert.equal(result.status,409);assert.equal(result.body.code,'EVENT_NOT_DRAFT');
event.status='published';result=await publish('2027-11-15');assert.equal(result.status,409);assert.equal(result.body.code,'EVENT_NOT_DRAFT');
event.status='draft';
event.event_date=null;result=await publish('2027-11-15');assert.equal(result.status,400);assert.equal(result.body.code,'EVENT_DATE_REQUIRED');
result=await events.PATCH(req({event:event.id,date:'2026-02-30'}));assert.equal(result.status,400);
result=await events.PATCH(req({event:event.id,date:'2026-11-15'}));assert.equal(result.status,200);assert.equal(event.event_date,'2026-11-15');
result=await events.PATCH(req({event:event.id,date:'2026-11-16'}));assert.equal(result.status,409);
event.event_date=null;event.status='published';event.retention_until=null;result=await events.PATCH(req({event:event.id,date:'2026-11-15'}));assert.equal(result.status,409);
event.retention_until='2027-11-16';result=await events.PATCH(req({event:event.id,date:'2026-11-15'}));assert.equal(result.status,409);
event.retention_until='2027-11-15';result=await events.PATCH(req({event:event.id,date:'2026-11-15'}));assert.equal(result.status,200);
result=await events.PATCH(req({event:event.id,date:'2026-11-16'}));assert.equal(result.status,409);
event.event_date=null;event.status='suspended';result=await events.PATCH(req({event:event.id,date:'2026-11-15'}));assert.equal(result.status,200);
event.event_date=null;event.status='archived';result=await events.PATCH(req({event:event.id,date:'2026-11-15'}));assert.equal(result.status,409);
console.log('PASS: server retention limit and safe missing-date repair');
