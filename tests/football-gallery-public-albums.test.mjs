import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Mocked database, admin session and Drive, in the same style as the other route tests.
let calls=[],audits=[],driveDeleted=[],scenario={};
const client={async query(sql,args){
 calls.push({sql,args});
 if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
 if(sql.startsWith('SELECT id FROM fg_media WHERE event_id=$1 AND id=ANY'))return {rowCount:args[1].length,rows:args[1].map(id=>({id}))};
 if(sql.startsWith('SELECT id FROM fg_media WHERE event_id=$1'))return {rowCount:2,rows:[{id:'m1'},{id:'m2'}]};
 if(sql.startsWith('SELECT storage,r2_key,upload_id FROM fg_media_files'))return {rowCount:3,rows:[{storage:'drive',r2_key:'driveA',upload_id:null},{storage:'drive',r2_key:'pending:x',upload_id:'https://upload'},{storage:'drive',r2_key:'driveB',upload_id:null}]};
 if(sql.startsWith('UPDATE fg_privacy_records SET media_id=NULL')||sql.startsWith('UPDATE fg_removal_requests SET media_id=NULL')||sql.startsWith('UPDATE fg_events SET cover_media_id=NULL WHERE cover_media_id'))return {rowCount:0,rows:[]};
 if(sql.startsWith('DELETE FROM fg_media'))return {rowCount:args[1].length,rows:[]};
 if(sql.startsWith('SELECT COUNT(*)::int AS n FROM fg_media'))return {rowCount:1,rows:[{n:scenario.left||0}]};
 if(sql.startsWith('SELECT id,locked,public_grant_id'))return {rowCount:1,rows:[{id:'event',locked:scenario.locked!==false,public_grant_id:scenario.grant||null,event_date:'2026-11-14',cover_drive_id:null,cover_pending:null}]};
 if(sql.startsWith('INSERT INTO fg_event_codes'))return {rowCount:1,rows:[{id:'public-grant'}]};
 if(sql.startsWith('UPDATE fg_events SET locked')||sql.startsWith('UPDATE fg_event_codes SET revoked_at'))return {rowCount:1,rows:[]};
 throw Error('Unexpected query: '+sql);
},release(){}};
const fakeDb=()=>({connect:async()=>client,query:(sql,args)=>client.query(sql,args)});
globalThis.__pub={
 db:fakeDb,isUuid:x=>typeof x==='string'&&x.length>0,sha256:x=>'hash:'+x.length,storageDriver:()=>'drive',PUBLIC_GRANT_LABEL:'[public-album]',presignInline:async()=>'',privateHeaders:{},
 adminGuard:async()=>({admin:{id:'admin'}}),adminReply:(body,status=200)=>({body,status}),audit:async(_c,a)=>audits.push(a),
 deleteFile:async id=>{if(id===scenario.failId)throw Error('drive down');driveDeleted.push(id)},cancelSession:async()=>{},
 ensurePreviewFolder:async()=>'folder',createUploadSession:async()=>'https://upload',sessionStatus:async()=>({}),readRange:async()=>new Uint8Array([0xff,0xd8,0xff]),
 adminThumbUrl:()=>'',NextResponse:{redirect:()=>({})},randomUUID:()=>'uuid'
};
async function load(path){
 let s=await readFile(path,'utf8');
 s=s.replace(/^import \{([^}]+)\} from '[^']+';$/gm,(_m,names)=>`const {${names.replace(/ as /g,':')}}=globalThis.__pub;`);
 return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
const req=body=>({json:async()=>body,headers:{get:()=>null}});

// Permanent delete: database rows first (history kept, links cleared), Drive files after the commit.
const del=await load('app/api/football-gallery/admin/media-delete/route.js');
let r=await del.POST(req({event:'event',mediaIds:['m1','m2']}));
assert.equal(r.status,200);assert.deepEqual(r.body,{deleted:2,left:0,filesFailed:0});
const order=calls.map(c=>c.sql.split(' ').slice(0,3).join(' '));
assert.ok(order.indexOf('UPDATE fg_privacy_records SET')<order.indexOf('DELETE FROM fg_media'),'consent history is unlinked, not deleted');
assert.ok(calls.some(c=>c.sql.startsWith('UPDATE fg_removal_requests SET media_id=NULL')));
assert.deepEqual(driveDeleted.sort(),['driveA','driveB'],'pending uploads are cancelled, finished files deleted');
assert.equal(audits[0].action,'media.delete');
r=await del.POST(req({event:'event',mediaIds:[]}));assert.equal(r.status,400,'nothing chosen');
calls=[];audits=[];driveDeleted=[];scenario={left:5};
r=await del.POST(req({event:'event',all:true,status:'review'}));
assert.equal(r.body.deleted,2);assert.equal(r.body.left,5,'"all" reports what is left for the next batch');
assert.ok(calls.find(c=>c.sql.startsWith('SELECT id FROM fg_media WHERE event_id=$1')).sql.includes('AND status=$2'));
calls=[];driveDeleted=[];scenario={failId:'driveA'};
r=await del.POST(req({event:'event',mediaIds:['m1']}));
assert.equal(r.status,200);assert.equal(r.body.filesFailed,1,'a Drive failure is reported, the rows stay deleted');

// Lock and unlock: unlocking adds a system code row; locking revokes it so open sessions end.
const front=await load('app/api/football-gallery/admin/album-front/route.js');
calls=[];audits=[];scenario={locked:true};
r=await front.POST(req({action:'unlock',event:'event'}));
assert.equal(r.status,200);assert.equal(r.body.locked,false);
const code=calls.find(c=>c.sql.startsWith('INSERT INTO fg_event_codes'));
assert.equal(code.args[3],'[public-album]');
assert.deepEqual(calls.find(c=>c.sql.startsWith('UPDATE fg_events SET locked=false')).args,['event','public-grant']);
assert.equal(audits[0].action,'album.unlock');
calls=[];audits=[];scenario={locked:false,grant:'public-grant'};
r=await front.POST(req({action:'lock',event:'event'}));
assert.equal(r.body.locked,true);
assert.deepEqual(calls.find(c=>c.sql.startsWith('UPDATE fg_event_codes SET revoked_at')).args,['public-grant']);
assert.ok(calls.some(c=>c.sql.startsWith('UPDATE fg_events SET locked=true,public_grant_id=NULL')));
r=await front.POST(req({action:'nope',event:'event'}));assert.equal(r.status,400);

// Public pieces: the code list hides the system row, locked albums never fall back to a photo cover,
// and the album page asks for the public pass only when it has no access yet.
const grants=await readFile('app/api/football-gallery/admin/grants/route.js','utf8');
assert.match(grants,/label IS DISTINCT FROM \$2/);
const cover=await readFile('app/api/football-gallery/cover/[id]/route.js','utf8');
assert.match(cover,/CASE WHEN NOT e\.locked THEN/);
const open=await readFile('app/api/football-gallery/open/route.js','utf8');
assert.match(open,/e\.locked=false AND e\.status='published'/);
assert.match(open,/if\(!sameOrigin\(request\)\)/);
const eventPage=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(eventPage,/if\(!r\.ok&&d\.needsAccess\)\{const o=await fetch\('\/api\/football-gallery\/open'/);
// The front page renders the albums on the server and hands them to the client home page, which draws the cards.
const landing=await readFile('app/football-gallery/page.jsx','utf8');
assert.match(landing,/import FootballGallery from '\.\/home-client';/);
assert.match(landing,/return <FootballGallery initialAlbums=\{albums\}\/>;/);
const home=await readFile('app/football-gallery/home-client.jsx','utf8');
for(const file of [landing,home])assert.doesNotMatch(file,/fg-title-section|ทุกโมเมนต์สำคัญ/);
// Album cards sit in the two-column grid by default; the swipe (carousel) layout is the viewer's opt-in.
assert.match(home,/const \[singleColumn,setSingleColumn\]=useState\(false\);/);
assert.match(home,/className=\{singleColumn\?'fg-album-carousel':'fg-album-grid'\}/);
assert.match(await readFile('app/football-gallery/gallery.css','utf8'),/\.fg-album-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(await readFile('scripts/migrate-football-gallery.mjs','utf8'),/football_gallery_006_public_albums\.sql/);
console.log('PASS: permanent delete, album lock/unlock, front page album cards and public album access');
