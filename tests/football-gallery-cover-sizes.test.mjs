import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const ID='11111111-1111-4111-8111-111111111111';
let row,queries,reads,resize;
class FakeResponse{
 constructor(body,{status=200,headers={}}={}){this.body=body;this.status=status;this.headers=headers}
 static redirect(location,{status,headers}){return Object.assign(new FakeResponse(null,{status,headers}),{location})}
}
globalThis.__coverTest={
 NextResponse:FakeResponse,configured:()=>true,isUuid:value=>value===ID,
 privateHeaders:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'},
 ACTIVE_RETENTION_SQL:'TRUE',coverUrl:key=>'https://worker.test/a/'+key,presignInline:async key=>'https://r2.test/'+key,
 db:()=>({query:async sql=>{queries.push(sql);return row?{rowCount:1,rows:[row]}:{rowCount:0,rows:[]}}}),
 readDriveMedia:async key=>{reads.push('drive:'+key);return new Response(Buffer.from('drive-bytes'))},
 streamPrivateObject:async key=>{reads.push('r2:'+key);return {Body:{transformToByteArray:async()=>Buffer.from('r2-bytes')}}},
 coverWidth:value=>value===null?null:['360','540','720','1080'].includes(value)?Number(value):false,
 coverVariant:async(bytes,width)=>resize(bytes,width)
};
const source=(await readFile('app/api/football-gallery/cover/[id]/route.js','utf8')).replace(/^import .*;\n/gm,'');
const route=await import('data:text/javascript;base64,'+Buffer.from(
 'const {NextResponse,configured,isUuid,privateHeaders,ACTIVE_RETENTION_SQL,coverUrl,presignInline,db,readDriveMedia,streamPrivateObject,coverWidth,coverVariant}=globalThis.__coverTest;\n'+source).toString('base64'));
const get=(query='')=>route.GET({url:'https://app.test/api/football-gallery/cover/'+ID+'?v=1'+query},{params:Promise.resolve({id:ID})});
const reset=next=>{row=next;queries=[];reads=[];resize=async(bytes,width)=>Buffer.from('jpeg:'+width+':'+bytes)};

// Without a width the route keeps redirecting to the short-lived Worker link (existing URLs unchanged).
reset({cover_drive_id:'drive-cover'});
let r=await get();
assert.equal(r.status,302);
assert.equal(r.location,'https://worker.test/a/drive-cover');
assert.deepEqual(reads,[]);

// With a width the publication/retention query still runs, then the crop is sent directly.
reset({cover_drive_id:'drive-cover'});
r=await get('&w=540');
assert.equal(r.status,200);
assert.equal(queries.length,1);
assert.deepEqual(reads,['drive:drive-cover']);
assert.equal(String(r.body),'jpeg:540:drive-bytes');
assert.equal(r.headers['Content-Type'],'image/jpeg');
// Kept only in the viewer's browser: never a shared/CDN cache.
assert.equal(r.headers['Cache-Control'],'private, max-age=3600');
assert.equal(r.headers['X-Robots-Tag'],'noindex, nofollow');

// A photo chosen from the album (stored in R2) is read from R2.
reset({cover_drive_id:null,chosen:{storage:'s3',key:'previews/x.jpg'},first:null});
r=await get('&w=360');
assert.equal(r.status,200);
assert.deepEqual(reads,['r2:previews/x.jpg']);

// A width the page never asks for is refused before touching the database.
reset({cover_drive_id:'drive-cover'});
r=await get('&w=541');
assert.equal(r.status,400);
assert.deepEqual(queries,[]);

// An album that is no longer published (or past retention) gives no cover bytes at all.
reset(null);
r=await get('&w=540');
assert.equal(r.status,404);
assert.deepEqual(reads,[]);

// If resizing fails, the card still shows the cover through the old redirect.
reset({cover_drive_id:'drive-cover'});
resize=async()=>{throw new Error('bad image')};
const quiet=console.error;console.error=()=>{};
r=await get('&w=720');
console.error=quiet;
assert.equal(r.status,302);
assert.equal(r.location,'https://worker.test/a/drive-cover');

console.log('football gallery cover sizes ok');
