import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
const page=await readFile('app/football-gallery/[slug]/event.css','utf8');
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));

// J. Selecting photos: the selected photo sinks a little inside its frame and the check pops; the
// "download selected" button rises in and its count bumps on every change.
assert.match(album,/ดาวน์โหลดรูปที่เลือก <span className="fge-select-count" key=\{selected\.length\}>\{fmt\(selected\.length\)\}<\/span> รายการ<\/button>\}/);
assert.match(css,/\.fge-sticky\{animation:fg-rise-in \.32s cubic-bezier\(\.2,\.8,\.2,1\) backwards\}/);
assert.match(css,/@keyframes fg-rise-in\{from\{opacity:0;translate:0 24px\}\}/);
assert.match(css,/\.fge-select-count\{display:inline-block;animation:fg-count-bump \.4s cubic-bezier\(\.3,1\.6,\.5,1\)\}/);
assert.match(css,/\.fge-photo-column \.fge-tile-image\{transition:transform \.15s ease-out,scale \.22s cubic-bezier\(\.2,\.8,\.2,1\)\}/,'keeps the press feedback transition');
assert.match(css,/\.fge-tile\.is-selected \.fge-tile-image\{scale:\.94\}/);
assert.match(css,/\.fge-tile-actions button\[aria-label="เลือกไฟล์"\]\[aria-pressed="true"\] \.fg-icon\{animation:fg-heart-pop \.4s cubic-bezier\(\.3,1\.6,\.5,1\)\}/);

// K. Saving several photos: a thin bar on the save button fills with the photos prepared so far
// (the same count as the "กำลังเตรียมภาพ i / n" text); it resets when the save ends.
assert.match(album,/const \[saveProgress,setSaveProgress\]=useState\(0\);/);
assert.match(album,/setPreparing\(true\);setSaveProgress\(0\);setDownloadProgress\('กำลังรวบรวมรูป JPEG ต้นฉบับ…'\);/);
assert.match(album,/setDownloadProgress\('กำลังเตรียมภาพ '\+fmt\(i\+1\)\+' \/ '\+fmt\(originals\.length\)\);setSaveProgress\(\(i\+1\)\/originals\.length\);/);
assert.match(album,/if\(e\.name!=='AbortError'\)setError\(e\.message\|\|'ไม่สามารถดาวน์โหลดภาพได้'\);\n\s*\}finally\{setPreparing\(false\);setSaveProgress\(0\)\}/);
assert.equal((album.match(/\{preparing&&saveProgress>0\?<span className="fge-save-progress" aria-hidden="true" style=\{\{'--p':saveProgress\}\}\/>:null\}/g)||[]).length,2,'both save buttons');
assert.match(css,/\.fge-save-progress\{display:none\}/,'hidden where :has() is missing (no positioned parent)');
assert.match(css,/\.fge-primary:has\(\.fge-save-progress\)\{position:relative\}/);
assert.match(css,/\.fge-save-progress::after\{[^}]*transform-origin:left;transform:scaleX\(var\(--p\)\);transition:transform \.25s ease-out\}/);

// Media tabs slide while retaining the selected player.
assert.match(album,/const \[tabDir,setTabDir\]=useState\(null\);/);
assert.match(album,/setMediaPage\(next\);setPage\(next\);resetSelection\(\);/);
assert.match(album,/setTabDir\(\{key:next,dir:next==='videos'\?'next':'prev'\}\);/);
assert.match(album,/const panelKey=mediaPage;/);
assert.match(album,/\{isMediaPage&&<div className="fge-tab-panel" key=\{panelKey\}/);
assert.doesNotMatch(album,/switchTab\('players'\)/);
assert.match(css,/\.fge-album-tabs::before\{[^}]*width:calc\(\(100% - 2 \* var\(--tabs-pad\) - var\(--tabs-gap\)\) \/ 2\)/);
assert.doesNotMatch(css,/\.fge-album-tabs:has\(button:nth-child\(3\)/);

assert.match(album,/const openDetail=\(item,img\)=>\{gridScroll\.current=window\.scrollY;setTabDir\(null\);/);
assert.match(css,/\.fge-tab-panel\[data-dir="next"\]\{animation:fg-tab-next \.3s cubic-bezier\(\.2,\.8,\.2,1\) backwards\}/);
assert.match(css,/\.fge-tab-panel\[data-dir="prev"\]\{animation:fg-tab-prev \.3s cubic-bezier\(\.2,\.8,\.2,1\) backwards\}/);
assert.match(css,/@keyframes fg-tab-next\{from\{opacity:0;translate:28px 0\}\}/);
assert.match(css,/@keyframes fg-tab-prev\{from\{opacity:0;translate:-28px 0\}\}/);
// The slide never makes the page scroll sideways (clip keeps sticky working, unlike hidden).
assert.match(page,/\.fge-shell\{overflow-x:clip\}/);

for(const selector of ['.fge-sticky','.fge-select-count','.fge-tile-actions button[aria-label="เลือกไฟล์"][aria-pressed="true"] .fg-icon','.fge-tab-panel[data-dir="next"]','.fge-tab-panel[data-dir="prev"]'])
 assert.ok(reduce.includes(selector),'reduced motion covers '+selector);
assert.match(reduce,/\.fge-save-progress::after\{transition:none\}/);
// Same specificity as the new tile transition, or "reduce motion" would not switch it off.
assert.match(reduce,/\.fge-photo-column \.fge-tile-image\{transition:none\}/);

console.log('football gallery select, progress and tabs ok');
