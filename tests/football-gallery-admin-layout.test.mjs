import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const page=await readFile('app/football-gallery/admin/page.jsx','utf8');
const review=await readFile('app/football-gallery/admin/review-client.jsx','utf8');
// Studio is split into albums and system settings; each album has its own workflow steps.
for(const label of ['อัลบั้ม','ตั้งค่าระบบ'])assert.ok(page.includes('>'+label+'</button>'),label);
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
for(const action of ["review('approve'","review('hide'","review('restore'","review('publish-event'","review('suspend-event'","review('resume-event'","createGrant('invite')","createGrant('code')","revokeGrant(g)","resolveRemoval(r,'done')","savePrivacy('player-privacy')","savePrivacy('revoke-player-privacy')","review('tag'"])assert.ok(review.includes(action),action);
for(const action of ['createEvent','saveEventDate','addPlayer','<Uploader ','<RetentionDeletionReview '])assert.ok(page.includes(action),action);
// The site root opens Football Gallery; the old PhotoFlow demo is no longer the front page.
const root=await readFile('app/page.js','utf8');
assert.match(root,/redirect\('\/football-gallery'\)/);
console.log('PASS: Studio splits settings from albums, keeps every action and restores the album step from the URL; / opens Football Gallery');
