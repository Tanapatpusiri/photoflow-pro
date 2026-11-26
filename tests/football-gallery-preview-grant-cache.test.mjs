import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto,randomUUID} from 'node:crypto';

// The download Worker remembers, per grant, which previews the app said were still published, for
// 60 seconds. Revoking a code or removing a photo therefore reaches previews within 60 seconds, and a
// page of 36 previews costs one app request instead of 36.
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
process.env.FG_DOWNLOAD_SECRET='test-only-secret-that-is-long-enough-for-signing';
process.env.FG_DOWNLOAD_BASE='https://worker.example';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tickets=await load(await readFile('lib/football-gallery-tickets.js','utf8'));
const event=randomUUID(),grant=randomUUID(),grant2=randomUUID();
const files=Array.from({length:40},()=>randomUUID()),drive=f=>'drive-'+f.slice(0,8);
const active=new Set([grant,grant2]),visible=new Set(files.slice(0,38));
let streamCalls=0,driveRequests=0,stripAllowed=false,lastBody=null;
globalThis.__cacheTest={
 configured:()=>true,storageDriver:()=>'drive',isUuid:x=>/^[0-9a-f-]{36}$/.test(x),
 grantActive:async(e,g)=>e===event&&active.has(g),
 db:()=>({query:async(sql,args)=>{
  assert.match(sql,/f\.verified_bytes=true/);assert.match(sql,/m\.status='published' AND m\.publish_allowed=true AND m\.metadata_reviewed=true/);
  if(/f\.id=\$1/.test(sql))return visible.has(args[0])&&args[1]===event?{rowCount:1,rows:[{r2_key:drive(args[0])}]}:{rowCount:0,rows:[]};
  assert.match(sql,/m\.event_id=\$1/);assert.match(sql,/f\.variant='THUMB'/);assert.match(sql,/f\.storage='drive'/);
  const rows=args[0]===event?[...visible].map(id=>({id})):[];
  return {rowCount:rows.length,rows};
 }}),
 privateHeaders:{'cache-control':'private, no-store'},
 verifyTicket:tickets.verifyTicket,workerAuthorized:()=>true,
 accessToken:async()=>({token:'test-drive-token',exp:Date.now()+3600000}),
 NextResponse:{json:(body,{status=200,headers}={})=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json'}})}
};
let route=await readFile('app/api/football-gallery/internal/stream/route.js','utf8');
route=route.replace(/^import .*;\n/gm,'');
route="const {NextResponse,configured,db,storageDriver,grantActive,isUuid,privateHeaders,accessToken,verifyTicket,workerAuthorized}=globalThis.__cacheTest;\n"+route;
const endpoint=await load(route);
let worker=await readFile('workers/football-gallery-download/src/index.js','utf8');
worker=worker.replace(/^import .*;\n/m,'');
const service=(await load(worker)).default;
const env={FG_DOWNLOAD_SECRET:process.env.FG_DOWNLOAD_SECRET,FG_APP_ORIGIN:'https://app.example'};
globalThis.fetch=async(url,options={})=>{
 if(String(url).endsWith('/internal/stream')){
  streamCalls++;lastBody=JSON.parse(options.body);
  const r=await endpoint.POST({json:async()=>lastBody});
  if(!stripAllowed)return r;
  const {allowed,...rest}=await r.json();return Response.json(rest,{status:r.status});
 }
 if(String(url).endsWith('/internal/drive-token'))return Response.json({accessToken:'test-drive-token',expiresAt:Date.now()+3600000});
 if(String(url).startsWith('https://www.googleapis.com/drive/v3/files/')){driveRequests++;return new Response('jpeg',{headers:{'content-length':'4'}})}
 throw Error('Unexpected request '+url);
};
let now=Date.now();const realNow=Date.now;Date.now=()=>now;
const request=async url=>service.fetch(new Request(url),env,{waitUntil(){}});
const thumb=(f,g=grant)=>tickets.thumbUrl(f,g,event,drive(f));
const status=async url=>(await request(url)).status;

// A page of previews: one app request, then the rest come from the grant cache.
assert.equal(await status(thumb(files[0])),200);
assert.equal(streamCalls,1);assert.equal(lastBody.allowed,true,'the Worker asks for the grant\'s preview list');
for(const f of files.slice(1,36))assert.equal(await status(thumb(f)),200);
assert.equal(streamCalls,1,'35 more previews of the same grant need no app request');
assert.equal(driveRequests,36);

// 36 previews requested at once on a cold cache still make one app request.
const burst=await Promise.all(files.slice(0,36).map(f=>status(thumb(f,grant2))));
assert.deepEqual([...new Set(burst)],[200]);assert.equal(streamCalls,2);

// Revoking the code: previews keep working for at most 60 seconds, then stop.
active.delete(grant);
now+=30000;assert.equal(await status(thumb(files[1])),200,'inside the 60 seconds');
now+=31000;assert.equal(await status(thumb(files[1])),403,'after 60 seconds the app is asked and refuses');
assert.equal(await status(thumb(files[2])),403,'a refused grant is not served from the cache');
active.add(grant);

// Removing a photo: its preview keeps working for at most 60 seconds, then stops; others continue.
assert.equal(await status(thumb(files[3])),200);const calls=streamCalls;
visible.delete(files[3]);
now+=59000;assert.equal(await status(thumb(files[3])),200);assert.equal(streamCalls,calls);
now+=2000;assert.equal(await status(thumb(files[3])),404,'after 60 seconds the removed photo is refused');
assert.equal(await status(thumb(files[4])),200,'a fresh preview list is cached again');
const afterRefresh=streamCalls;
assert.equal(await status(thumb(files[3])),404,'the fresh list no longer contains the removed photo');
assert.equal(streamCalls,afterRefresh+1,'it is asked about directly, never served from the list');
visible.add(files[3]);

// A photo published after the list was cached: asked about directly, then served.
visible.add(files[38]);
assert.equal(await status(thumb(files[38])),200);
// A photo that was never published is refused even while the grant is cached.
const before=streamCalls;assert.equal(await status(thumb(files[39])),404);assert.equal(streamCalls,before+1);

// Old tickets without the Drive id, and an older app that sends no list: asked every time, as before.
const oldTicket=tickets.thumbUrl(files[5],grant,event);
const n=streamCalls;
assert.equal(await status(oldTicket),200);assert.equal(await status(oldTicket),200);
assert.equal(streamCalls,n+2);assert.equal(lastBody.allowed,undefined,'no list is asked for an old ticket');
stripAllowed=true;now+=61000;
const m=streamCalls;
assert.equal(await status(thumb(files[6])),200);assert.equal(await status(thumb(files[7])),200);
assert.equal(streamCalls,m+2,'without the list the Worker caches nothing');
stripAllowed=false;

// The app sends the list only when asked (original and ZIP requests stay small).
const direct=await (await endpoint.POST({json:async()=>({ticket:thumb(files[8]).split('/t/')[1]})})).json();
assert.deepEqual(Object.keys(direct),['preview']);
// The list holds THUMB previews only, and only for this album.
const asked=await (await endpoint.POST({json:async()=>({ticket:thumb(files[8]).split('/t/')[1],allowed:true})})).json();
assert.equal(asked.preview.driveId,drive(files[8]));assert.equal(asked.allowed.length,visible.size);

Date.now=realNow;
console.log('PASS: the Worker caches each grant\'s preview list for 60 seconds; revocation and removal apply within 60 seconds');
