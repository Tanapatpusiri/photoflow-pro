import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
// Placeholder configuration so the library treats itself as configured; no service is contacted.
Object.assign(process.env,{DATABASE_URL:'postgres://db.invalid/test',FG_SESSION_SECRET:'test-only-session-secret-long-enough',FG_STORAGE:'drive',GOOGLE_CLIENT_ID:'test-only-client-id-000000',GOOGLE_CLIENT_SECRET:'test-only-secret',FG_DOWNLOAD_BASE:'https://worker.invalid',FG_DOWNLOAD_SECRET:'test-only-download-secret-long-enough'});
const event='11111111-1111-4111-8111-111111111111',grant='22222222-2222-4222-8222-222222222222';
let status='suspended',grantStillValid=true,lastStatus=null;
// The real server library, with only the database replaced.
let server=await readFile('lib/football-gallery-server.js','utf8');
server=server.replace(/^import .*;\n/gm,'');
server=`import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const {NextResponse,ACTIVE_RETENTION_SQL,dbStub}=globalThis.__suspendTest;
const S3Client=class{},GetObjectCommand=class{},PutObjectCommand=class{},HeadObjectCommand=class{},CreateMultipartUploadCommand=class{},UploadPartCommand=class{},CompleteMultipartUploadCommand=class{},AbortMultipartUploadCommand=class{},ListPartsCommand=class{},getSignedUrl=async()=>'',Pool=class{};
`+server;
server=server.replace('export function db(){','function __realDb(){');
server+='\nexport const db=()=>dbStub;';
globalThis.__suspendTest={
 ACTIVE_RETENTION_SQL:'TRUE',
 NextResponse:{json:(body,{status=200}={})=>({body,status})},
 dbStub:{query:async(sql,args)=>{
  if(sql.includes('FROM fg_events e WHERE e.slug=$1'))return status?{rowCount:1,rows:[{id:event,slug:'s',status}]}:{rowCount:0,rows:[]};
  if(sql.includes('e.status=$3')){lastStatus=args[2];return {rowCount:grantStillValid&&args[0]===event&&args[1]===grant&&args[2]===status?1:0,rows:[]}}
  throw Error('Unexpected query: '+sql);
 }}
};
let lib;
try{lib=await import('data:text/javascript;base64,'+Buffer.from(server).toString('base64'))}
catch(e){console.error('Could not load server library in isolation:',e.message);process.exit(1)}
assert.ok(lib.configured(),'test configuration is complete');
const cookie=(eventId)=>{const payload=Buffer.from(JSON.stringify({eventId,codeId:grant,until:Date.now()+60000,nonce:'n'})).toString('base64url');return payload+'.'+createHmac('sha256',process.env.FG_SESSION_SECRET).update(payload).digest('base64url')};
globalThis.__eventTest={NextResponse:globalThis.__suspendTest.NextResponse,db:lib.db,configured:()=>true,grantFor:lib.grantFor,suspendedForGrant:lib.suspendedForGrant,SUSPENDED_MESSAGE:lib.SUSPENDED_MESSAGE,privateHeaders:{},thumbUrl:()=>''};
let route=await readFile('app/api/football-gallery/events/[slug]/route.js','utf8');
route=route.replace(/^import .*;\n/gm,'');
route='const {NextResponse,db,configured,grantFor,suspendedForGrant,SUSPENDED_MESSAGE,privateHeaders,thumbUrl}=globalThis.__eventTest;\n'+route;
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(route).toString('base64'));
const call=value=>GET({cookies:{get:name=>value&&name===lib.grantCookieName(event)?{value}:undefined}},{params:Promise.resolve({slug:'s'})});
let r=await call(cookie(event));
assert.equal(r.status,403);assert.equal(r.body.suspended,true);assert.equal(r.body.message,lib.SUSPENDED_MESSAGE);assert.equal(lastStatus,'suspended');
r=await call(null);assert.equal(r.status,404);assert.equal(r.body.message,'ไม่พบอัลบั้ม');
r=await call(cookie('33333333-3333-4333-8333-333333333333'));assert.equal(r.status,404);
r=await call('tampered.'+cookie(event).split('.')[1]);assert.equal(r.status,404);
grantStillValid=false;r=await call(cookie(event));assert.equal(r.status,404,'revoked invitations do not learn about suspension');
status=null;grantStillValid=true;r=await call(cookie(event));assert.equal(r.status,404);
const access=await readFile('app/api/football-gallery/access/route.js','utf8');
assert.match(access,/e\.status='suspended'[^`]*c\.revoked_at IS NULL|c\.revoked_at IS NULL[^`]*e\.status='suspended'/);
const invite=await readFile('app/football-gallery/invite/[token]/route.js','utf8');
assert.match(invite,/invite=suspended/);assert.match(invite,/i\.revoked_at IS NULL AND i\.expires_at>NOW\(\) AND e\.status='suspended'/);
const landing=await readFile('app/football-gallery/page.jsx','utf8');
assert.match(landing,/invite==='suspended'/);
console.log('PASS: suspended albums tell valid invitees they are paused and stay hidden from everyone else');
