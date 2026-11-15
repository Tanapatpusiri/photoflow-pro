import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const source=await readFile('lib/football-gallery-deletion-eligibility.js','utf8');
const {DELETION_ELIGIBLE_SQL,TODAY_SQL}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const rule=DELETION_ELIGIBLE_SQL.replaceAll(TODAY_SQL,"DATE '2025-09-01'");
const sql=`SELECT label FROM (VALUES
 ('six-month-expired',DATE '2024-12-01',DATE '2025-06-01',DATE '2025-06-01',true),
 ('access-shorter-but-wait',DATE '2024-12-01',DATE '2025-03-01',DATE '2025-12-01',false),
 ('legacy-waits-one-year',DATE '2024-12-01',DATE '2025-03-01',NULL::date,false),
 ('legacy-after-year',DATE '2024-01-01',DATE '2024-04-01',NULL::date,true),
 ('due-today',DATE '2024-09-01',DATE '2025-09-01',DATE '2025-09-01',false),
 ('retention-after-deletion',DATE '2024-12-01',DATE '2025-08-01',DATE '2025-06-01',false),
 ('deletion-over-year',DATE '2023-01-01',DATE '2023-02-01',DATE '2024-02-01',false),
 ('missing-date',NULL::date,DATE '2025-01-01',NULL::date,false)
) AS e(label,event_date,retention_until,deletion_after,expected) WHERE COALESCE((${rule}),false) IS DISTINCT FROM expected;`;
assert.equal(execFileSync('psql',['-X','-d','postgres','-Atqc',sql],{encoding:'utf8'}).trim(),'');
console.log('PASS: configured deletion dates preserve legacy one-year waits and fail closed on inconsistent dates');
