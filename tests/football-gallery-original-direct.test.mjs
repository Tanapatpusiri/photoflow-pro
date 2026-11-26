import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto,randomUUID} from 'node:crypto';

// Saving a photo must not stream the original through Vercel (Hobby: 10 GB Fast Origin Transfer a
// month, then the project is paused). The app hands out the Worker link; the page fetches it directly.
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
process.env.FG_DOWNLOAD_SECRET='test-only-secret-that-is-long-enough-for-signing';
process.env.FG_DOWNLOAD_BASE='https://worker.example';
const load=async source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tickets=await load(await readFile('lib/football-gallery-tickets.js','utf8'));
const event=randomUUID(),grant=randomUUID(),jpeg=randomUUID(),raw=randomUUID();
const realFetch=globalThis.fetch;

// 1. GET /files/<id>?link=1: same checks, limit and audit as a download, but answers the Worker link.
class NextResponse extends Response{
 static json(body,{status=200,headers}={}){return new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json'}})}
 static redirect(url,{status=302,headers}={}){return new Response(null,{status,headers:{...headers,location:url}})}
}
let kinds=[],audits=0,limitOk=true,upstream=0;
globalThis.__filesTest={
 NextResponse,configured:()=>true,isUuid:x=>/^[0-9a-f-]{36}$/.test(x),privateHeaders:{'cache-control':'private, no-store'},
 grantFor:async()=>({codeId:grant,eventId:event}),
 publicLimitOk:async(_r,_g,kind)=>{kinds.push(kind);return limitOk},PUBLIC_LIMIT_MESSAGE:'limited',
 presignOriginal:async()=>'https://r2.example/original',presignInline:async()=>'https://r2.example/preview',
 thumbUrl:tickets.thumbUrl,originalUrl:tickets.originalUrl,
 db:()=>({query:async(sql,args)=>{
  if(/INSERT INTO fg_audit/.test(sql)){audits++;return {rowCount:1}}
  const variant=args[0]===jpeg?'JPEG':'RAW';
  return {rowCount:1,rows:[{r2_key:'drive-'+variant,original_filename:'IMG.'+variant,variant,verified_hash:true,verified_bytes:true,storage:'drive',event_id:event}]};
 }})
};
let route=await readFile('app/api/football-gallery/events/[slug]/files/[fileId]/route.js','utf8');
route=route.replace(/^import .*;\n/gm,'');
route='const {NextResponse,db,configured,grantFor,isUuid,presignOriginal,presignInline,privateHeaders,publicLimitOk,PUBLIC_LIMIT_MESSAGE,thumbUrl,originalUrl}=globalThis.__filesTest;\n'+route;
const files=await load(route);
globalThis.fetch=async()=>{upstream++;return new Response('jpeg-bytes',{headers:{'content-type':'image/jpeg'}})};
const get=async(id,query)=>{kinds=[];audits=0;upstream=0;const url=new URL(`https://app.example/api/football-gallery/events/album/files/${id}?${query}`);const request=new Request(url);request.nextUrl=url;return files.GET(request,{params:Promise.resolve({slug:'album',fileId:id})})};

let r=await get(jpeg,'link=1');
assert.equal(r.status,200);
const body=await r.json();
assert.match(body.url,/^https:\/\/worker\.example\/f\//,'the Worker link for this original');
assert.equal(tickets.verifyTicket(body.url.split('/f/')[1]).f,jpeg);
assert.equal(upstream,0,'no file bytes pass through the app');
assert.deepEqual(kinds,['original'],'counted like any original download');
assert.equal(audits,1,'and written to the audit log');
assert.match(r.headers.get('cache-control'),/no-store/);

limitOk=false;r=await get(jpeg,'link=1');assert.equal(r.status,429);assert.equal((await r.json()).message,'limited');assert.equal(audits,0);limitOk=true;

// The same-origin stream stays as the fallback (older Worker, or a page on another origin).
r=await get(jpeg,'share=1');
assert.equal(r.status,200);assert.equal(upstream,1);assert.equal(await r.text(),'jpeg-bytes');
// Other originals keep the normal redirect.
r=await get(raw,'link=1');
assert.equal(r.status,302);assert.match(r.headers.get('location'),/^https:\/\/worker\.example\/f\//);assert.equal(upstream,0);

// 2. The Worker lets the app's own origin read an original (CORS), and nobody else.
globalThis.__streamTest={
 configured:()=>true,storageDriver:()=>'drive',isUuid:x=>/^[0-9a-f-]{36}$/.test(x),grantActive:async()=>true,
 db:()=>({query:async()=>({rowCount:1,rows:[{r2_key:'drive-jpeg',original_filename:'IMG_1.jpg',size_bytes:'10',mime_type:'image/jpeg'}]})}),
 privateHeaders:{'cache-control':'private, no-store'},verifyTicket:tickets.verifyTicket,workerAuthorized:()=>true,
 accessToken:async()=>({token:'test-drive-token',exp:Date.now()+3600000}),NextResponse
};
let stream=await readFile('app/api/football-gallery/internal/stream/route.js','utf8');
stream=stream.replace(/^import .*;\n/gm,'');
stream='const {NextResponse,configured,db,storageDriver,grantActive,isUuid,privateHeaders,accessToken,verifyTicket,workerAuthorized}=globalThis.__streamTest;\n'+stream;
const endpoint=await load(stream);
let worker=await readFile('workers/football-gallery-download/src/index.js','utf8');
worker=worker.replace(/^import .*;\n/m,'');
worker='const parseRange=()=>null,buildZipLayout=()=>null;\n'+worker;
const service=(await load(worker)).default;
const env={FG_DOWNLOAD_SECRET:process.env.FG_DOWNLOAD_SECRET,FG_APP_ORIGIN:'https://photoflow-pro.vercel.app/'};
globalThis.fetch=async(url,options={})=>{
 if(String(url).endsWith('/internal/stream'))return endpoint.POST({json:async()=>JSON.parse(options.body)});
 if(String(url).startsWith('https://www.googleapis.com/drive/v3/files/'))return new Response('0123456789',{headers:{'content-length':'10'}});
 throw Error('Unexpected request '+url);
};
const original=tickets.originalUrl(jpeg,grant,event);
const ask=async origin=>service.fetch(new Request(original,{headers:origin?{origin}:{}}),env,{waitUntil(){}});
r=await ask('https://photoflow-pro.vercel.app');
assert.equal(r.status,200);assert.equal(await r.text(),'0123456789');
assert.equal(r.headers.get('access-control-allow-origin'),'https://photoflow-pro.vercel.app');
assert.match(r.headers.get('vary')||'',/Origin/);
r=await ask('https://evil.example');
assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null,'other sites cannot read it with fetch');
r=await ask(null);
assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null,'a normal download is unchanged');
globalThis.fetch=realFetch;

// 3. The album page saves through the Worker link and falls back to the same-origin stream.
const client=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
const helper=client.slice(client.indexOf('async function originalBlob(f){'),client.indexOf('\n }\n',client.indexOf('async function originalBlob(f){')));
assert.match(helper,/const link=await fetch\(fileUrl\(f\)\+'\?link=1',\{cache:'no-store'\}\),data=await link\.json\(\)\.catch\(\(\)=>\(\{\}\)\);/);
assert.match(helper,/if\(!link\.ok\)throw Error\(data\.message\|\|'ดาวน์โหลดภาพไม่สำเร็จ \('\+link\.status\+'\)'\);/);
assert.match(helper,/if\(data\.url\)\{try\{const direct=await fetch\(data\.url,\{cache:'no-store',mode:'cors',credentials:'omit'\}\);if\(direct\.ok\)return await direct\.blob\(\)\}catch\{\}\}/);
assert.match(helper,/const response=await fetch\(fileUrl\(f\)\+'\?share=1',\{cache:'no-store'\}\);/);
const save=client.slice(client.indexOf('async function savePhotos(scope){'),client.indexOf('async function sendRemoval('));
assert.match(save,/const f=originals\[i\],blob=await originalBlob\(f\);/);
assert.doesNotMatch(save,/\?share=1/,'saving goes through originalBlob');
console.log('PASS: originals are saved straight from the Worker (CORS for the app only), with the same-origin stream as fallback');
