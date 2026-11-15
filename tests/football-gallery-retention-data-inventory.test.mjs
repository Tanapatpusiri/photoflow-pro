import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const eligibilitySource=await readFile('lib/football-gallery-deletion-eligibility.js','utf8');
const {DELETION_ELIGIBLE_SQL}=await import('data:text/javascript;base64,'+Buffer.from(eligibilitySource).toString('base64'));
let role='owner',queries=[],found=true;
globalThis.__dataInventory={db:()=>({query:async(sql,args)=>{queries.push({sql,args});return found?{rowCount:1,rows:[{players:2,media:3,files:4,tags:1,codes:1,invites:0,privacy_records:2,removal_requests:1,download_jobs:1,audit_entries:3,review_entries:1,folder_settings:1,cross_event_links:1}]}:{rowCount:0,rows:[]}}}),isUuid:x=>x==='event',adminGuard:async()=>({admin:{role}}),reply:(body,status=200)=>({body,status}),DELETION_ELIGIBLE_SQL};
let source=await readFile('app/api/football-gallery/admin/retention-data-inventory/route.js','utf8');source=source.replace(/^import .*;\n/gm,'');source='const {db,isUuid,adminGuard,reply,DELETION_ELIGIBLE_SQL}=globalThis.__dataInventory;\n'+source;
const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const req=q=>({nextUrl:new URL('https://example.test/?'+q)});
role='admin';let result=await route.GET(req('event=event'));assert.equal(result.status,403);assert.equal(queries.length,0);
role='owner';result=await route.GET(req('event=bad'));assert.equal(result.status,400);
found=false;result=await route.GET(req('event=event'));assert.equal(result.status,409);
found=true;result=await route.GET(req('event=event'));assert.equal(result.status,200);assert.equal(result.body.counts.players,2);assert.equal(result.body.counts.privacy_records,2);assert.equal(result.body.counts.cross_event_links,1);assert.deepEqual(queries.at(-1).args,['event']);
for(const table of ['fg_players','fg_media','fg_media_files','fg_media_players','fg_event_codes','fg_invites','fg_privacy_records','fg_removal_requests','fg_download_jobs','fg_audit','fg_retention_deletion_reviews','fg_settings'])assert.ok(queries.at(-1).sql.includes(table));
assert.ok(!/\b(DELETE|UPDATE|INSERT)\b/i.test(queries.at(-1).sql));
const fixture=`WITH fg_events(id,event_date,retention_until,deletion_after) AS (VALUES ('a',DATE '2020-01-01',DATE '2021-01-01',NULL::date)),
 fg_players(id,event_id) AS (VALUES ('p1','a'),('p2','b')),
 fg_media(id,event_id) AS (VALUES ('m1','a'),('m2','b')),
 fg_media_files(id,media_id) AS (SELECT NULL::text,NULL::text WHERE false),
 fg_media_players(media_id,player_id) AS (VALUES ('m1','p2')),
 fg_event_codes(event_id) AS (SELECT NULL::text WHERE false),fg_invites(event_id) AS (SELECT NULL::text WHERE false),
 fg_privacy_records(event_id,media_id,player_id) AS (VALUES ('b','m1',NULL::text),('a','m2',NULL::text)),
 fg_removal_requests(event_id,media_id) AS (VALUES ('b','m1')),
 fg_download_jobs(event_id) AS (SELECT NULL::text WHERE false),fg_audit(event_id) AS (SELECT NULL::text WHERE false),
 fg_retention_deletion_reviews(event_id) AS (SELECT NULL::text WHERE false),fg_settings(key) AS (SELECT NULL::text WHERE false)
 SELECT cross_event_links FROM (${queries.at(-1).sql.replace('$1',"'a'")}) q;`;
assert.equal(execFileSync('psql',['-X','-d','postgres','-Atqc',fixture],{encoding:'utf8'}).trim(),'4');
console.log('PASS: owner-only counts cover event-related data without modifying or exposing personal records');
