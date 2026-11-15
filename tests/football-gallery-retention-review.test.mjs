import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const source=await readFile('lib/football-gallery-retention-review.js','utf8');
const {RETENTION_REVIEW_REASON_SQL,TODAY_SQL}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const reason=RETENTION_REVIEW_REASON_SQL.replaceAll(TODAY_SQL,"DATE '2025-02-28'");
const sql=`SELECT label FROM (VALUES
 ('missing-date','draft',NULL::date,NULL::date,'missing_event_date'),
 ('missing-retention','published',DATE '2025-02-28',NULL::date,'missing_retention'),
 ('old-draft-missing-retention','draft',DATE '2023-02-01',NULL::date,'missing_retention'),
 ('leap-invalid','published',DATE '2024-02-29',DATE '2025-03-01','invalid_retention'),
 ('expired','published',DATE '2024-02-01',DATE '2025-02-01','expired'),
 ('due-today','published',DATE '2024-02-29',DATE '2025-02-28','upcoming'),
 ('upcoming-draft','draft',DATE '2024-03-15',NULL::date,'upcoming'),
 ('healthy','published',DATE '2025-02-28',DATE '2026-02-28',NULL::text)
) AS e(label,status,event_date,retention_until,expected) WHERE (${reason}) IS DISTINCT FROM expected;`;
assert.equal(execFileSync('psql',['-X','-d','postgres','-Atqc',sql],{encoding:'utf8'}).trim(),'');

let denied=false,calls=0,params;
globalThis.__retentionReviewTest={
 adminGuard:async()=>denied?{error:{status:401}}:{},
 reply:(body,status=200)=>({body,status}),
 db:()=>({query:async(query,args)=>{calls++;params=args;assert.match(query,/WITH flagged/);return {rows:Array.from({length:41},(_,i)=>({id:i}))}}}),
 reason:RETENTION_REVIEW_REASON_SQL
};
let route=await readFile('app/api/football-gallery/admin/retention/route.js','utf8');
route=route.replace(/^import .*;\n/gm,'');
route="const {db,adminGuard,reply,reason:RETENTION_REVIEW_REASON_SQL}=globalThis.__retentionReviewTest;\n"+route;
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(route).toString('base64'));
const request=page=>({nextUrl:new URL('https://example.test/?page='+page)});
let result=await GET(request(2));assert.equal(result.status,200);assert.equal(result.body.events.length,40);assert.equal(result.body.hasMore,true);assert.deepEqual(params,[41,40]);
result=await GET(request('invalid'));assert.equal(result.status,400);assert.equal(calls,1);
denied=true;result=await GET(request(1));assert.equal(result.status,401);assert.equal(calls,1);
console.log('PASS: PostgreSQL classifies review dates; endpoint enforces admin access and pagination');
