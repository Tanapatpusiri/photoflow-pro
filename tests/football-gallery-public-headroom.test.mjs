import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load=async source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

// 1. Unlocked albums: a visitor IP may read 240 list pages an hour (parents often share one IP at the
// field or on mobile networks). The album's daily budget stays the same, so the Worker load does not grow.
const lib=await readFile('lib/football-gallery-server.js','utf8');
const limits=await load(lib.slice(lib.indexOf('export const PUBLIC_LIMITS='),lib.indexOf('\n',lib.indexOf('export const PUBLIC_LIMITS='))));
assert.deepEqual(limits.PUBLIC_LIMITS.list,[240,1200]);
// "เลือกทั้งหมด" asks for ids only (no previews), with its own small budget.
assert.deepEqual(limits.PUBLIC_LIMITS.ids,[30,600]);

// 2. GET /media?ids=1 answers the whole listing in one request: ids of photos that have a verified
// JPEG original, in listing order, with no paging and no preview tickets.
const event='11111111-1111-4111-8111-111111111111',player='44444444-4444-4444-8444-444444444444';
let queries=[],kinds=[],limitOk=true,tickets=0;
globalThis.__mediaTest={
 NextResponse:{json:(body,{status=200,headers}={})=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json'}})},
 configured:()=>true,isUuid:x=>/^[0-9a-f-]{36}$/.test(x),privateHeaders:{'cache-control':'private, no-store'},
 grantFor:async()=>({codeId:'public-grant',eventId:event}),
 publicLimitOk:async(_request,_grant,kind)=>{kinds.push(kind);return limitOk},PUBLIC_LIMIT_MESSAGE:'limited',
 thumbUrl:(...args)=>{tickets++;return 'https://worker.example/t/'+args.join(',')},
 db:()=>({query:async(sql,args)=>{
  queries.push({sql,args});
  if(/FROM fg_events/.test(sql))return {rowCount:1,rows:[{id:event}]};
  if(/SELECT m\.id FROM fg_media m/.test(sql))return {rowCount:3,rows:[{id:'m1'},{id:'m2'},{id:'m3'}]};
  return {rowCount:1,rows:[{id:'m1',kind:'photo',files:[],thumb_drive:{id:'t1',key:'drive-t1'}}]};
 }})
};
let route=await readFile('app/api/football-gallery/events/[slug]/media/route.js','utf8');
route=route.replace(/^import .*;\n/gm,'');
route='const {NextResponse,configured,db,grantFor,isUuid,privateHeaders,publicLimitOk,PUBLIC_LIMIT_MESSAGE,thumbUrl}=globalThis.__mediaTest;\n'+route;
const media=await load(route);
const get=async query=>{queries=[];kinds=[];tickets=0;const r=await media.GET(new Request('https://app.example/api/football-gallery/events/album/media?'+query),{params:Promise.resolve({slug:'album'})});return {status:r.status,body:await r.json()}};

let r=await get(`kind=photo&ids=1&player=${player}`);
assert.equal(r.status,200);
assert.deepEqual(r.body,{ids:['m1','m2','m3']});
assert.deepEqual(kinds,['ids'],'counted against the ids budget, not the list budget');
assert.equal(tickets,0,'no preview tickets, so no Worker or Vercel preview load');
const idsSql=queries.at(-1);
assert.match(idsSql.sql,/f\.variant='JPEG' AND f\.verified_hash=true/,'only photos that can be saved as JPEG');
assert.match(idsSql.sql,/m\.status='published' AND m\.publish_allowed=true AND m\.metadata_reviewed=true/);
assert.match(idsSql.sql,/fg_privacy_records/,'the same player privacy rules as the list');
assert.match(idsSql.sql,/ORDER BY m\.captured_at NULLS LAST,m\.title NULLS LAST,m\.id/,'same order as the list');
assert.doesNotMatch(idsSql.sql,/OFFSET/);
assert.deepEqual(idsSql.args,[event,'photo',player]);

limitOk=false;r=await get('kind=photo&ids=1');
assert.equal(r.status,429);assert.equal(r.body.message,'limited');
limitOk=true;

// The paged list is unchanged and still counted as "list"; its preview tickets now carry the Drive id.
r=await get('kind=photo&page=2');
assert.equal(r.status,200);assert.deepEqual(kinds,['list']);
assert.match(queries.at(-1).sql,/OFFSET \$3/);assert.deepEqual(queries.at(-1).args,[event,'photo',36]);
assert.equal(r.body.items[0].thumbUrl,`https://worker.example/t/t1,public-grant,${event},drive-t1`);
assert.equal('thumb_drive' in r.body.items[0],false);

// The album page: "เลือกทั้งหมด" sends one ids request instead of reading every list page.
const client=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
const selectAll=client.slice(client.indexOf('async function selectAllPhotos(){'),client.indexOf('\n }\n',client.indexOf('async function selectAllPhotos(){')));
assert.match(selectAll,/const params=new URLSearchParams\(\{kind:'photo',ids:'1'\}\);if\(player\?\.id\)params\.set\('player',player\.id\);/);
assert.match(selectAll,/const response=await fetch\(base\(slug\)\+'\/media\?'\+params,\{cache:'no-store'\}\),data=await response\.json\(\);/);
assert.match(selectAll,/if\(current!==selectionRequest\.current\)return;/);
assert.match(selectAll,/for\(const id of data\.ids\|\|\[\]\)\{if\(filter==='favorites'&&!favoriteIds\.has\(id\)\)continue;ids\.add\(id\)\}/);
assert.doesNotMatch(selectAll,/listMedia|collectMedia/,'no list pages for select-all');
console.log('PASS: public list limit 240/IP/h; select-all is one ids request on its own budget');
