import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let nonce=0,identities=[],limited=()=>true;
globalThis.__rateTest={
 NextResponse:{json:(body,{status=200})=>({body,status})},
 db:()=>({query:async(sql)=>sql.startsWith('SELECT id FROM fg_events')?{rowCount:1,rows:[{id:'event',title:'Event'}]}:{rowCount:1,rows:[{id:'request'}]}}),
 configured:()=>true,grantFor:async()=>({codeId:'same-grant',nonce:String(++nonce)}),isUuid:()=>true,sameOrigin:()=>true,
 clientIp:request=>request.headers.get('x-real-ip')||'unknown',
 rateLimit:async(scope,identity)=>{identities.push(scope+'='+identity);return !limited(scope)},sha256:()=>'',privateHeaders:{},
 publicLimitOk:async()=>true,PUBLIC_LIMIT_MESSAGE:'busy',ARCHIVE_PART_BYTES:()=>1,ARCHIVE_MAX_FILES:()=>1,FORMAT_VARIANTS:{jpeg:'JPEG'},grantFingerprint:()=>'',selectArchiveFiles:()=>[],partition:()=>[],partLayout:()=>{},archiveName:()=>''
};
async function load(path){let source=await readFile(path,'utf8');source=source.replace(/^import .*;\n/gm,'');
 source='const {NextResponse,db,configured,grantFor,isUuid,sameOrigin,rateLimit,clientIp,sha256,privateHeaders,publicLimitOk,PUBLIC_LIMIT_MESSAGE,ARCHIVE_PART_BYTES,ARCHIVE_MAX_FILES,FORMAT_VARIANTS,grantFingerprint,selectArchiveFiles,partition,partLayout,archiveName}=globalThis.__rateTest;\n'+source;
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
// Unlocked albums: only the shared system grant is limited, per visitor IP per hour and per album per day.
const lib=await readFile('lib/football-gallery-server.js','utf8');
const fn=lib.slice(lib.indexOf('export const PUBLIC_LIMITS='),lib.indexOf('\n}\n',lib.indexOf('export async function publicLimitOk'))+3).replace(/export /g,'');
let calls=[];const isPublic=new Set(['public-grant']);
const env={db:()=>({query:async(_s,args)=>({rowCount:isPublic.has(args[0])?1:0})}),rateLimit:async(scope,identity,max,minutes)=>{calls.push([scope,identity,max,minutes]);return true},clientIp:()=>'198.51.100.9',PUBLIC_GRANT_LABEL:'[public-album]'};
globalThis.__pubEnv=env;
const mod=await import('data:text/javascript;base64,'+Buffer.from('const {db,rateLimit,clientIp,PUBLIC_GRANT_LABEL}=globalThis.__pubEnv;\n'+fn+'\nexport {publicLimitOk,PUBLIC_LIMITS};').toString('base64'));
assert.equal(await mod.publicLimitOk({},{codeId:'code-grant',eventId:'ev'},'original'),true);assert.equal(calls.length,0,'code and invite access is not limited here');
assert.equal(await mod.publicLimitOk({},{codeId:'public-grant',eventId:'ev'},'original'),true);
assert.deepEqual(calls,[['public-original','ev:198.51.100.9',300,60],['public-original-album','ev',20000,1440]]);
const worst=mod.PUBLIC_LIMITS.list[1]*36+mod.PUBLIC_LIMITS.preview[1]+mod.PUBLIC_LIMITS.original[1]+mod.PUBLIC_LIMITS.part[1];
assert.ok(worst<100000,'one public album stays under the Worker free-plan daily allowance: '+worst);
for(const f of ['files/[fileId]/route.js','archive/route.js','archive/[jobId]/[part]/route.js'])assert.match(await readFile('app/api/football-gallery/events/[slug]/'+f,'utf8'),/await publicLimitOk\(request,grant,/,f);
const media=await readFile('lib/football-gallery-media.js','utf8');
assert.match(media,/await publicLimitOk\(request,grant,'list'\)/);
const mediaRoute=await readFile('app/api/football-gallery/events/[slug]/media/route.js','utf8');
assert.match(mediaRoute,/await listGalleryMedia\(request,/);
const eventReader=await readFile('lib/football-gallery-event.js','utf8');
assert.match(eventReader,/includePhotos\?listGalleryMedia\(request,/);
console.log('PASS: rate limits follow the grant per network and cap the shared code; unlocked albums are limited per IP and per album');
