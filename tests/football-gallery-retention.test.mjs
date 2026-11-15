import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile('lib/football-gallery-retention.js','utf8');
const {oneYearAfterEvent}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.equal(oneYearAfterEvent('2026-11-14'),'2027-11-14');
assert.equal(oneYearAfterEvent('2024-02-29T00:00:00.000Z'),'2025-02-28');
assert.equal(oneYearAfterEvent('2025-02-30'),'');
assert.equal(oneYearAfterEvent(null),'');
console.log('PASS: calendar year, leap day, invalid and missing event dates');
