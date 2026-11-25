import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const page=await readFile('app/football-gallery/admin/page.jsx','utf8');
const review=await readFile('app/football-gallery/admin/review-client.jsx','utf8');
// Studio is split into albums and system settings; each album has its own workflow steps.
for(const label of ['อัลบั้ม','จัดการเด็ก','ตั้งค่าระบบ'])assert.ok(page.includes('>'+label+'</button>'),label);
const tabs=[...page.matchAll(/\['(players|upload|review|publish|requests|retention)','([^']+)'\]/g)].map(m=>m[1]);
assert.deepEqual(tabs,['players','upload','review','publish','requests','retention']);
// System settings live in their own section, not above every album.
const settings=page.slice(page.indexOf("view==='settings'?<>"),page.indexOf("</>:!active?<>"));
for(const part of ['<StorageCard/>','<RetentionSettings','<RetentionReview'])assert.ok(settings.includes(part),part);
// Returning from Google OAuth (?drive=...) must open the settings section where the result is shown.
assert.match(page,/if\(q\.get\('drive'\)\|\|q\.get\('view'\)==='settings'\)setView\('settings'\)/);
// The address bar keeps the album and step across reloads.
assert.match(page,/q\.set\('album',activeId\);q\.set\('tab',albumTab\)/);
// One ReviewClient instance serves the review steps, so form state survives switching between them.
assert.equal((page.match(/<ReviewClient /g)||[]).length,1);
assert.match(page,/<ReviewClient view=\{albumTab\}/);
for(const part of ["show('review')","show('players')","show('publish')","show('requests')"])assert.ok(review.includes(part),part);
// Every API action of the previous layout is still reachable.
for(const action of ["action:'approve'","review('hide'","review('restore'","review('publish-event'","review('suspend-event'","review('resume-event'","createGrant('invite')","createGrant('code')","revokeGrant(g)","resolveRemoval(r,'done')","savePrivacy('player-privacy')","savePrivacy('revoke-player-privacy')","action:'tag'"])assert.ok(review.includes(action),action);
for(const action of ['createEvent','saveEventDate','addPlayer','<Uploader ','<RetentionDeletionReview '])assert.ok(page.includes(action),action);
// Approving saves unsaved tag changes first, and "no identifiable child" is only offered when no child is selected.
assert.match(review,/if\(tagsDirty\)\{await post\('\/review',\{action:'tag'/);
assert.match(review,/noChildrenConfirmed:tags\.length===0&&approval\.noChildren/);
// Owner policy (2026-11-17, c9054b6 / f6c97f2): there is no per-photo approval. Tapping a child's name saves the tag at once.
assert.match(review,/onChange=\{e=>savePhotoTags\(e\.target\.checked\?\[\.\.\.tags,p\.id\]:tags\.filter\(x=>x!==p\.id\)\)\}/);
assert.match(review,/post\('\/review',\{action:'tag',eventId:event\.id,mediaId:active\.id,players:next\}\)/);
assert.doesNotMatch(review,/onClick=\{approve\}/);
// Photos reach viewers only through the album-level release, after the admin confirms the rights and the GPS check.
assert.match(review,/if\(!window\.confirm\('[^']*ยืนยันว่ามีสิทธิ์เผยแพร่ภาพเด็กและตรวจความเสี่ยงจาก GPS แล้ว\?'\)\)return;/);
assert.match(review,/post\('\/review',\{action:'publish-ready',eventId:event\.id,confirmed:true\}\)/);
assert.match(review,/<form className="fga-add-name" onSubmit=\{addName\}>/);
assert.match(review,/fetch\(api\+'\/players',\{method:'POST'/);
assert.doesNotMatch(review,/gpsConfirmed|approval\.basis|approval\.attest/);
// Disabled buttons say what is missing (the per-photo approve button is gone, see above).
for(const list of ['privacyMissing','publishMissing'])assert.match(review,new RegExp('<Missing items=\\{'+list+'\\}/>'));
assert.match(review,/disabled=\{busy\|\|privacyMissing\.length>0\}/);
assert.match(review,/disabled=\{busy\|\|publishMissing\.length>0\}/);
// The album header always offers the next step and a visible upload button.
assert.match(page,/function nextStep\(e\)/);
assert.match(page,/\+ อัปโหลดรูป<\/button>/);
// Step tabs fit a phone screen without sideways scrolling.
const css=await readFile('app/football-gallery/admin/admin.css','utf8');
assert.match(css,/@media\(max-width:560px\)\{\s*\.fga-tabs:not\(\.fga-tabs-main\)\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
// Permission fields explain what to write, and the GPS note says who sees the location and how to check it.
for(const part of ['BASIS_HINT','EVIDENCE_HINT'])assert.ok(review.includes('{'+part+'}'),part);
assert.match(review,/active\.has_gps&&<p className="fga-gps-note"/);
// Review on a phone: verified files fold away and the approve buttons stay pinned near the bottom.
assert.match(review,/className="fga-files"/);
assert.match(review,/<div className="fga-approve-bar">/);
assert.match(css,/\.fga-approve-bar\{position:sticky;bottom:0/);
// Upload shows the album flow, live progress and a result summary with a way on to review.
const upload=await readFile('app/football-gallery/admin/upload-client.jsx','utf8');
// Tagging is optional since the review step stopped being mandatory (f6c97f2, 1c2106f).
assert.ok(upload.includes("['เลือกไฟล์','อัปโหลด','แท็กชื่อ (ไม่บังคับ)','เผยแพร่']"),'upload steps');
assert.match(upload,/const current=done\.indexOf\(false\)/);
assert.match(upload,/role="progressbar"/);
for(const label of ['สำเร็จ','มีอยู่แล้ว (ข้าม)','ไม่สำเร็จ'])assert.ok(upload.includes('<dt>'+label+'</dt>'),label);
assert.match(upload,/onClick=\{onReview\}/);
assert.match(page,/<Uploader eventId=\{active\.id\} album=\{\{/);
// Upload steps describe only the files picked now; what is already in the album is shown separately.
assert.match(upload,/function AlbumStatus\(/);
assert.match(upload,/ขั้นตอนของรอบอัปโหลดนี้/);
// "Published" is ticked only when the album is live and none of its photos still wait for release (508dd4b).
assert.match(upload,/const done=\[files>0,uploaded,reviewed,reviewed&&album\.live&&album\.pending===0\]/);
assert.doesNotMatch(upload,/files>0\|\|!!summary\|\|album\.media>0/);
// The publish step gets the retention period on sign-in, without opening Settings first.
assert.match(page,/fetch\(api\+'\/retention-settings'/);
// Publishing uses a ready-made notice for parents unless the admin edits it.
assert.match(review,/const defaultNotice=\(title,until\)=>/);
assert.match(review,/const notice=publish\.edited\?publish\.notice:defaultNotice\(event\.title,publish\.retention\)/);
assert.match(review,/review\('publish-event',\{notice,/);
// Review detail: photo beside three numbered sections; a preview that fails to load says why.
assert.equal((review.match(/className="fga-step-card"/g)||[]).length,1);
assert.match(review,/onError=\{\(\)=>setThumbFailed/);
assert.match(css,/\.fga-review-layout\{grid-template-columns:/);
// Children management: its own Studio tab with add, edit, remove and consent withdrawal, kept in the URL.
assert.match(page,/view==='children'\?<ChildrenManager /);
assert.match(page,/else if\(q\.get\('view'\)==='children'\)setView\('children'\)/);
const kids=await readFile('app/football-gallery/admin/children-client.jsx','utf8');
for(const part of ["call('/players','POST'","call('/players','PATCH'","'DELETE'","action:'revoke-player-privacy'","action:'player-privacy'"])assert.ok(kids.includes(part),part);
const players=await readFile('app/api/football-gallery/admin/players/route.js','utf8');
assert.match(players,/export async function PATCH\(/);
assert.match(players,/export async function DELETE\(/);
assert.match(players,/if\(used\.rows\[0\]\.published\|\|used\.rows\[0\]\.history\)throw Error\('IN_USE'\)/);
// Withdrawing consent is recorded even for a child who never had a consent record of their own.
const reviewRoute=await readFile('app/api/football-gallery/admin/review/route.js','utf8');
assert.match(reviewRoute,/if\(!withdrawn\.rowCount\)await client\.query\(`INSERT INTO fg_privacy_records/);
// The public page links to the admin Studio, and /admin is a short address for it.
// The front page renders the client home page, where the link is an icon button with a Thai label (homepage V2, #31).
const front=await readFile('app/football-gallery/page.jsx','utf8');
assert.match(front,/import FootballGallery from '\.\/home-client';/);
const home=await readFile('app/football-gallery/home-client.jsx','utf8');
assert.match(home,/<a className="fg-home-control" href="\/admin" aria-label="จัดการหลังบ้าน">/);
assert.match(await readFile('app/admin/page.js','utf8'),/redirect\('\/football-gallery\/admin'\)/);
// Photos can be deleted for good one at a time or all in a filter, after a confirmation.
assert.match(review,/post\('\/media-delete',\{event:event\.id,mediaIds:ids\}\)/);
assert.match(review,/post\('\/media-delete',\{event:event\.id,all:true/);
assert.match(review,/confirm\(`ลบถาวร /);
assert.match(review,/removeForever\(\{ids:\[active\.id\],label:'ภาพนี้'\}\)/);
// The publish step sets the album's front-page card: lock and cover.
assert.match(page,/albumTab==='publish'&&<AlbumFront event=\{active\}/);
const frontCard=await readFile('app/football-gallery/admin/album-front-client.jsx','utf8');
for(const action of ["action:locked?'lock':'unlock'","action:'cover-init'","action:'cover-complete'","action:'cover-media'","action:'cover-clear'"])assert.ok(frontCard.includes(action),action);
// The site root opens Football Gallery; the old PhotoFlow demo is no longer the front page.
const root=await readFile('app/page.js','utf8');
assert.match(root,/redirect\('\/football-gallery'\)/);
console.log('PASS: Studio splits settings from albums, keeps every action and restores the album step from the URL; / opens Football Gallery');
