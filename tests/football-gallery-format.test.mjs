import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {formatBytes,formatCaptureTime}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('lib/football-gallery-format.js','utf8')).toString('base64'));
assert.equal(formatBytes(36538),'37 KB');
assert.equal(formatBytes(512),'512 B');
assert.equal(formatBytes(999600),'1.0 MB');
assert.equal(formatBytes(25_400_000),'25.4 MB');
assert.equal(formatBytes(1_500_000_000),'1.50 GB');
assert.equal(formatBytes(null),'0 B');
// EXIF 09:00 must stay 09:00 regardless of the viewer's time zone.
for(const tz of ['Asia/Bangkok','America/Los_Angeles','UTC']){
 process.env.TZ=tz;
 assert.match(formatCaptureTime('2026-11-15T09:00:00Z'),/09:00/);
}
assert.equal(formatCaptureTime('not a date'),'');
assert.equal(formatCaptureTime(null),'');
const review=await readFile('app/football-gallery/admin/review-client.jsx','utf8');
assert.match(review,/ถ่ายเมื่อ '\+formatCaptureTime\(active\.captured_at\)/);
assert.doesNotMatch(review,/\/1e6\)\.toFixed\(1\)\} MB/);
assert.match(review,/useEffect\(\(\)=>\{if\(uploadKey\)load\(1\)\},\[uploadKey\]\)/);
const page=await readFile('app/football-gallery/admin/page.jsx','utf8');
assert.match(page,/onUploaded=\{\(\)=>\{setUploadKey\(n=>n\+1\);setUploadedAlbum\(active\.id\);return load\(\)\}\}/);
assert.match(page,/uploadKey=\{uploadKey\}/);
console.log('PASS: sizes under 1 MB show in KB, capture times keep camera time, review list reloads after uploads');
