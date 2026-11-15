import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let nonce=0,identities=[];
globalThis.__rateTest={
 NextResponse:{json:(body,{status=200})=>({body,status})},
 db:()=>({query:async(sql)=>sql.startsWith('SELECT id FROM fg_events')?{rowCount:1,rows:[{id:'event',title:'Event'}]}:{rowCount:1,rows:[{id:'request'}]}}),
 configured:()=>true,grantFor:async()=>({codeId:'same-grant',nonce:String(++nonce)}),isUuid:()=>true,sameOrigin:()=>true,
 rateLimit:async(scope,identity)=>{identities.push({scope,identity});return false},sha256:()=>'',privateHeaders:{},
 ARCHIVE_PART_BYTES:()=>1,ARCHIVE_MAX_FILES:()=>1,FORMAT_VARIANTS:{jpeg:'JPEG'},grantFingerprint:()=>'',selectArchiveFiles:()=>[],partition:()=>[],partLayout:()=>{},archiveName:()=>''
};
async function load(path){let source=await readFile(path,'utf8');source=source.replace(/^import .*;\n/gm,'');
 source='const {NextResponse,db,configured,grantFor,isUuid,sameOrigin,rateLimit,sha256,privateHeaders,ARCHIVE_PART_BYTES,ARCHIVE_MAX_FILES,FORMAT_VARIANTS,grantFingerprint,selectArchiveFiles,partition,partLayout,archiveName}=globalThis.__rateTest;\n'+source;
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const removal=await load('app/api/football-gallery/events/[slug]/removal/route.js');
const archive=await load('app/api/football-gallery/events/[slug]/archive/route.js');
const headers={get:()=>null};
for(let i=0;i<2;i++){
 let response=await removal.POST({headers,json:async()=>({description:'please remove this'})},{params:Promise.resolve({slug:'test'})});assert.equal(response.status,429);
 response=await archive.POST({headers,json:async()=>({scope:'event',formats:{jpeg:true}})},{params:Promise.resolve({slug:'test'})});assert.equal(response.status,429);
}
assert.deepEqual(identities,[{scope:'removal',identity:'same-grant'},{scope:'archive',identity:'same-grant'},{scope:'removal',identity:'same-grant'},{scope:'archive',identity:'same-grant'}]);
console.log('PASS: rate limits remain tied to the grant across new sessions');
