import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const source=await readFile('lib/football-gallery-retention.js','utf8');
const {ACTIVE_RETENTION_SQL,TODAY_SQL}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// Use fixed today values and PostgreSQL itself, without modifying any database data.
const expression=ACTIVE_RETENTION_SQL.replaceAll(TODAY_SQL,"DATE '2025-02-28'");
const sql=`SELECT label FROM (VALUES
 ('valid', DATE '2024-02-29', DATE '2025-02-28', true),
 ('leap-day-too-late', DATE '2024-02-29', DATE '2025-03-01', false),
 ('missing-event-date', NULL::date, DATE '2025-03-01', false),
 ('missing-retention', DATE '2024-03-01', NULL::date, false),
 ('expired', DATE '2024-02-01', DATE '2025-01-31', false),
 ('valid-earlier', DATE '2024-03-05', DATE '2025-03-01', true)
) AS e(label,event_date,retention_until,expected)
WHERE ((${expression}) IS TRUE) IS DISTINCT FROM expected;`;
const failures=execFileSync('psql',['-X','-d','postgres','-Atqc',sql],{encoding:'utf8'}).trim();
assert.equal(failures,'',`Retention SQL returned an unexpected result: ${failures}`);
for(const path of ['lib/football-gallery-server.js','app/api/football-gallery/access/route.js','app/football-gallery/invite/[token]/route.js']){
 const content=await readFile(path,'utf8');
 assert.match(content,/\$\{ACTIVE_RETENTION_SQL\}/,`${path} must use the same retention rule`);
}
console.log('PASS: PostgreSQL denies missing, expired, and over-year dates, including leap-day boundaries');
