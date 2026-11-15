import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let nonce=0,identities=[],limited=()=>true;
globalThis.__rateTest={
 NextResponse:{json:(body,{status=200})=>({body,status})},
 db:()=>({query:async(sql)=>sql.startsWith('SELECT id FROM fg_events')?{rowCount:1,rows:[{id:'event',title:'Event'}]}:{rowCount:1,rows:[{id:'request'}]}}),
 configured:()=>true,grantFor:async()=>({codeId:'same-grant',nonce:String(++nonce)}),isUuid:()=>true,sameOrigin:()=>true,
 clientIp:request=>request.headers.get('x-real-ip')||'unknown',
 rateLimit:async(scope,identity)=>{identities.push(scope+'='+identity);return !limited(scope)},sha256:()=>'',privateHeaders:{},
 ARCHIVE_PART_BYTES:()=>1,ARCHIVE_MAX_FILES:()=>1,FORMAT_VARIANTS:{jpeg:'JPEG'},grantFingerprint:()=>'',selectArchiveFiles:()=>[],partition:()=>[],partLayout:()=>{},archiveName:()=>''
};
async function load(path){let source=await readFile(path,'utf8');source=source.replace(/^import .*;\n/gm,'');
 source='const {NextResponse,db,configured,grantFor,isUuid,sameOrigin,rateLimit,clientIp,sha256,privateHeaders,ARCHIVE_PART_BYTES,ARCHIVE_MAX_FILES,FORMAT_VARIANTS,grantFingerprint,selectArchiveFiles,partition,partLayout,archiveName}=globalThis.__rateTest;\n'+source;
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const removal=await load('app/api/football-gallery/events/[slug]/removal/route.js');
const archive=await load('app/api/football-gallery/events/[slug]/archive/route.js');
const from=ip=>({get:name=>name==='x-real-ip'?ip:null});
const ask=async ip=>[
 (await removal.POST({headers:from(ip),json:async()=>({description:'please remove this'})},{params:Promise.resolve({slug:'test'})})).status,
 (await archive.POST({headers:from(ip),json:async()=>({scope:'event',formats:{jpeg:true}})},{params:Promise.resolve({slug:'test'})})).status
];
// A new session (new nonce) from the same network still counts against the same limit.
limited=scope=>!scope.endsWith('-grant');
for(let i=0;i<2;i++)assert.deepEqual(await ask('203.0.113.5'),[429,429]);
assert.deepEqual(identities,['removal=same-grant:203.0.113.5','archive=same-grant:203.0.113.5','removal=same-grant:203.0.113.5','archive=same-grant:203.0.113.5']);
// Another family on the shared code has its own allowance; the whole code still has a cap.
identities=[];limited=scope=>scope.endsWith('-grant');
assert.deepEqual(await ask('198.51.100.7'),[429,429]);
assert.deepEqual(identities,['removal=same-grant:198.51.100.7','removal-grant=same-grant','archive=same-grant:198.51.100.7','archive-grant=same-grant']);
console.log('PASS: rate limits follow the grant per network and cap the shared code');
