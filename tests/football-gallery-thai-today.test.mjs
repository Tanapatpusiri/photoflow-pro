import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(path,'utf8')).toString('base64'));
const {TODAY_SQL,ACTIVE_RETENTION_SQL,oneYearAfterEvent}=await load('lib/football-gallery-retention.js');
const review=await load('lib/football-gallery-retention-review.js'),eligible=await load('lib/football-gallery-deletion-eligibility.js');
assert.equal(review.TODAY_SQL,TODAY_SQL);assert.equal(eligible.TODAY_SQL,TODAY_SQL);
for(const sql of [ACTIVE_RETENTION_SQL,review.RETENTION_REVIEW_REASON_SQL,eligible.DELETION_ELIGIBLE_SQL])assert.doesNotMatch(sql,/CURRENT_DATE/);
for(const path of ['app/api/football-gallery/admin/review/route.js','app/api/football-gallery/admin/events/route.js','app/api/football-gallery/access/route.js','lib/football-gallery-server.js'])assert.doesNotMatch(await readFile(path,'utf8'),/CURRENT_DATE/,path);
// 2026-11-16 17:30 UTC is already 2026-11-17 in Thailand: an album open "until 16 Nov" must be closed.
const today=execFileSync('psql',['-X','-d','postgres','-Atqc',`SET TIME ZONE 'UTC'; SELECT ${TODAY_SQL.replace('NOW()',"TIMESTAMPTZ '2026-11-16 17:30:00+00'")}::text`],{encoding:'utf8'}).trim();
assert.equal(today,'2026-11-17');
const open=execFileSync('psql',['-X','-d','postgres','-Atqc',`SET TIME ZONE 'UTC'; SELECT (${ACTIVE_RETENTION_SQL.replaceAll(TODAY_SQL,`(TIMESTAMPTZ '2026-11-16 17:30:00+00' AT TIME ZONE 'Asia/Bangkok')::date`)})::text FROM (SELECT DATE '2026-11-15' AS event_date, DATE '2026-11-16' AS retention_until) e`],{encoding:'utf8'}).trim();
assert.equal(open,'false');
// Creating an event with an impossible date is a validation error, not a database failure.
assert.equal(oneYearAfterEvent('2025-02-30'),'');
const events=await readFile('app/api/football-gallery/admin/events/route.js','utf8');
assert.match(events,/if\(rawDate&&\(!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(rawDate\)\|\|!oneYearAfterEvent\(rawDate\)\)\)return send\(\{message:'วันจัดงานไม่ถูกต้อง'\},400\);/);
const migrate=await readFile('scripts/migrate-football-gallery.mjs','utf8');
assert.match(migrate,/'db\/football_gallery_005_retention_deletion\.sql'\]/);
console.log('PASS: retention uses the Thai calendar date, impossible event dates are rejected, migration 005 is applied');
