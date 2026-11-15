import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
process.env.FG_DOWNLOAD_SECRET='test-only-secret-that-is-long-enough-for-signing';
process.env.FG_DOWNLOAD_BASE='https://worker.example';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tickets=await load(await readFile('lib/football-gallery-tickets.js','utf8'));
const event='11111111-1111-4111-8111-111111111111',grant='22222222-2222-4222-8222-222222222222',file='33333333-3333-4333-8333-333333333333';
let active=true,visible=true,driveRequests=0;
globalThis.__previewTest={
 configured:()=>true,storageDriver:()=> 'drive',isUuid:x=>/^[0-9a-f-]{36}$/.test(x),
 grantActive:async(e,g)=>active&&e===event&&g===grant,
 db:()=>({query:async(sql,args)=>{
  assert.match(sql,/f\.verified_bytes=true/);assert.match(sql,/m\.status='published'/);
  return {rowCount:visible&&args[0]===file&&args[1]===event?1:0,rows:[{r2_key:'drive-preview'}]};
 }}),
 privateHeaders:{'cache-control':'private, no-store'},
 verifyTicket:tickets.verifyTicket,workerAuthorized:()=>true,
 accessToken:async()=>({token:'test-drive-token',exp:Date.now()+3600000}),
 NextResponse:{json:(body,{status=200,headers}={})=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json'}})}
};
let route=await readFile('app/api/football-gallery/internal/stream/route.js','utf8');
route=route.replace(/^import .*;\n/gm,'');
route="const {NextResponse,configured,db,storageDriver,grantActive,isUuid,privateHeaders,accessToken,verifyTicket,workerAuthorized}=globalThis.__previewTest;\n"+route;
const endpoint=await load(route);
let worker=await readFile('workers/football-gallery-download/src/index.js','utf8');
worker=worker.replace(/^import .*;\n/m,'');
const service=(await load(worker)).default;
const env={FG_DOWNLOAD_SECRET:process.env.FG_DOWNLOAD_SECRET,FG_APP_ORIGIN:'https://app.example'};
globalThis.fetch=async(url,options={})=>{
 if(String(url).endsWith('/internal/stream'))return endpoint.POST({json:async()=>JSON.parse(options.body)});
 if(String(url).endsWith('/internal/drive-token'))return Response.json({accessToken:'test-drive-token',expiresAt:Date.now()+3600000});
 if(String(url).startsWith('https://www.googleapis.com/drive/v3/files/')){driveRequests++;return new Response('jpeg',{headers:{'content-length':'4'}})}
 throw Error('Unexpected request');
};
const request=async url=>service.fetch(new Request(url),env,{waitUntil(){}});
const url=tickets.thumbUrl(file,grant,event);
let result=await request(url);assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);assert.equal(driveRequests,1);
active=false;result=await request(url);assert.equal(result.status,403);assert.equal(driveRequests,1);
active=true;visible=false;result=await request(url);assert.equal(result.status,404);assert.equal(driveRequests,1);
visible=true;
const old='https://worker.example/t/'+tickets.signTicket({k:'t',d:'drive-preview'},900);
result=await request(old);assert.equal(result.status,403);assert.equal(driveRequests,1);
result=await request(tickets.adminThumbUrl('drive-preview'));assert.equal(result.status,200);assert.equal(driveRequests,2);
console.log('PASS: previews recheck access and visibility, reject old tickets, and disable caching');
