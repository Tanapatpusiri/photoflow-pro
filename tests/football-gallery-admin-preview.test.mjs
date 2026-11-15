import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.env.FG_DOWNLOAD_SECRET='test-only-secret-that-is-long-enough-for-signing';
process.env.FG_DOWNLOAD_BASE='https://worker.example';
const load=source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tickets=await load(await readFile('lib/football-gallery-tickets.js','utf8'));
const media='11111111-1111-4111-8111-111111111111';
let signedIn=true,row={r2_key:'drive-preview-id',storage:'drive'},queries=[];
globalThis.__adminPreviewTest={
 randomUUID:()=>'x',isUuid:x=>/^[0-9a-f-]{36}$/.test(x),storageDriver:()=> 'drive',
 presignUpload:async()=>'',verifyObject:async()=>({}),streamPrivateObject:async()=>({}),
 presignInline:async key=>'https://r2.example/'+key+'?signed',privateHeaders:{'cache-control':'private, no-store'},
 db:()=>({query:async(sql,args)=>{queries.push(args);return row?{rowCount:1,rows:[row]}:{rowCount:0,rows:[]}}}),
 adminGuard:async()=>signedIn?{admin:{id:'admin'}}:{error:{status:401,body:{message:'ไม่มีสิทธิ์'}}},
 reply:(body,status=200)=>({status,body}),adminThumbUrl:tickets.adminThumbUrl,
 NextResponse:{redirect:(url,{status,headers})=>({status,location:url,headers})},
 ensurePreviewFolder:async()=>'',createUploadSession:async()=>'',sessionStatus:async()=>({}),readRange:async()=>Buffer.alloc(0),deleteFile:async()=>{}
};
let source=await readFile('app/api/football-gallery/admin/preview/route.js','utf8');
source=source.replace(/^import .*;\n/gm,'');
source='const {randomUUID,NextResponse,db,isUuid,storageDriver,presignUpload,presignInline,verifyObject,streamPrivateObject,privateHeaders,adminGuard,reply,adminThumbUrl,ensurePreviewFolder,createUploadSession,sessionStatus,readRange,deleteFile}=globalThis.__adminPreviewTest;\n'+source;
const route=await load(source);
const get=id=>route.GET({nextUrl:new URL('https://app.example/api/football-gallery/admin/preview?media='+id)});
let r=await get(media);
assert.equal(r.status,302);assert.match(r.location,/^https:\/\/worker\.example\/a\//);assert.match(r.headers['cache-control'],/no-store/);
const ticket=tickets.verifyTicket(r.location.split('/a/')[1]);
assert.equal(ticket.k,'a');assert.equal(ticket.d,'drive-preview-id');
assert.ok(ticket.x-Date.now()/1000<=tickets.ADMIN_PREVIEW_TTL+1,'admin preview links expire within two minutes');
assert.deepEqual(queries,[[media]]);
signedIn=false;r=await get(media);assert.equal(r.status,401);assert.equal(queries.length,1,'no lookup without an admin session');
signedIn=true;r=await get('not-a-uuid');assert.equal(r.status,400);
row=null;r=await get(media);assert.equal(r.status,404);
row={r2_key:'previews/a.jpg',storage:'s3'};r=await get(media);assert.equal(r.status,302);assert.equal(r.location,'https://r2.example/previews/a.jpg?signed');
console.log('PASS: admin previews re-check the session on every load and hand out two-minute links');
