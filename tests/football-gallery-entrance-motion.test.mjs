import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
const has=(re,why)=>assert.match(css,re,why);

// 1. Home entrance: header, search, then album cards one after another. Cards and covers only move
//    (translate/scale, never opacity) because the first cover is the LCP image.
has(/\.fg-home-v2 \.fg-header\{animation:fg-enter-up/,'header enters');
has(/\.fg-home-v2 \.fg-home-search\{animation:fg-enter-up[^}]*\.06s/,'search follows');
has(/@keyframes fg-enter-up\{from\{opacity:0;translate:0 10px\}\}/,'header/search: small rise');
has(/\.fg-home-v2 \.fg-album-card\{animation:fg-card-in[^}]*animation-delay:var\(--enter-delay,0s\)/,'cards enter with a stagger');
has(/\.fg-home-v2 \.fg-album-card:nth-child\(2\)\{--enter-delay:\.06s\}/);
has(/@keyframes fg-card-in\{from\{translate:0 16px\}\}/,'cards: translate only');
assert.doesNotMatch(css.match(/@keyframes fg-card-in\{[^}]*\}\}/)[0],/opacity/,'cards never fade (LCP)');
// Covers settle from a slight zoom once they are actually shown (cached, or loaded).
has(/\.fg-album-cover img:not\(\[data-fade="pending"\]\):not\(\[data-fade="loading"\]\)\{animation:fg-cover-settle/);
has(/@keyframes fg-cover-settle\{from\{scale:1\.06\}\}/);

// 2. Carousel depth: side cards a little smaller, full size in the centre (scroll-driven, only
//    where supported), combined with the entrance through separate translate/scale properties.
has(/@supports \(animation-timeline:view\(\)\)\{[^@]*\.fg-home-v2 \.fg-album-carousel \.fg-album-card\{animation:fg-card-in[^;]*,fg-carousel-depth linear both;animation-timeline:auto,view\(inline\)/);
has(/@keyframes fg-carousel-depth\{0%,100%\{scale:\.94\}50%\{scale:1\}\}/);

// 3. Album page: heading and tabs enter; photos rise in as they scroll into view (scroll-driven).
has(/\.fge-album-heading\{animation:fg-enter-up/);
has(/\.fge-album-tabs\{animation:fg-enter-up[^}]*\.06s/);
has(/@supports \(animation-timeline:view\(\)\)\{[^@]*\.fge-photo-column \.fge-tile\{animation:fg-tile-rise linear both;animation-timeline:view\(\);animation-range:entry 0% entry 70%\}/);
has(/@keyframes fg-tile-rise\{from\{opacity:\.25;translate:0 18px\}\}/);

// 4. Camera shutter on the home logo, and a small celebration when photos are saved.
has(/\.fg-home-v2 \.fg-brand-icon svg\{animation:fg-shutter/);
has(/@keyframes fg-shutter\{[^}]*scale:\.8/);
has(/\.fge-primary:has\(\.fge-celebrate\)\{position:relative\}/,'position only while celebrating (keeps the sticky button sticky)');
has(/\.fge-celebrate i\{[^}]*animation:fg-burst/);
has(/@keyframes fg-burst\{[^}]*rotate\(calc\(var\(--i\) \* 45deg\)\)/);
has(/\.fge-primary\[data-saved="true"\] \.fg-icon\{animation:fg-heart-pop/);
assert.doesNotMatch(css.slice(css.indexOf('.fge-celebrate')),/#(?!4e920e|fff\b)[0-9a-f]{3,6}\b/i,'only existing colours (green #4e920e, white)');

// Everything new is off for "reduce motion".
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
for(const selector of ['.fg-home-v2 .fg-header','.fg-home-v2 .fg-home-search','.fg-home-v2 .fg-album-card','.fg-album-cover img','.fge-album-heading','.fge-album-tabs','.fge-photo-column .fge-tile','.fg-home-v2 .fg-brand-icon svg','.fge-celebrate i','.fge-primary[data-saved="true"] .fg-icon'])
 assert.ok(reduce.includes(selector),'reduced motion covers '+selector);

// Album page: saving shows "บันทึกแล้ว" with a check and the burst for a moment, only after a
// real save (share sheet finished or downloads started), never after a cancelled share.
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/const \[savedAt,setSavedAt\]=useState\(0\),savedTimer=useRef\(null\);/);
assert.match(album,/const celebrate=\(\)=>\{setSavedAt\(Date\.now\(\)\);clearTimeout\(savedTimer\.current\);savedTimer\.current=setTimeout\(\(\)=>setSavedAt\(0\),1800\)\};/);
assert.match(album,/await navigator\.share\(\{files\}\);\n\s*celebrate\(\);/);
assert.match(album,/setDownloadProgress\('ส่งไฟล์ภาพไปยังการดาวน์โหลดของเบราว์เซอร์แล้ว[^']*'\);\n\s*celebrate\(\);/);
const buttons=album.match(/<button className="fge-primary" data-saved=\{savedAt\?'true':undefined\}[^\n]*/g)||[];
assert.equal(buttons.length,2,'both save buttons celebrate');
for(const b of buttons){
 assert.match(b,/<Icon name=\{savedAt\?'done':'download'\}\/>/);
 assert.match(b,/savedAt\?'บันทึกแล้ว':'ดาวน์โหลดรูปภาพ'/);
 assert.match(b,/\{savedAt\?<span className="fge-celebrate" aria-hidden="true" key=\{savedAt\}>/);
}
assert.match(album,/done:<path d="m5 12\.5 4\.5 4\.5L19 7\.5"\/>/);

console.log('football gallery entrance motion ok');
