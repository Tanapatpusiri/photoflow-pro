import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
const home=await readFile('app/football-gallery/home-client.jsx','utf8');
const page=await readFile('app/football-gallery/[slug]/event.css','utf8');
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');

// Loading: photo pages show placeholder photos in the same two columns (with a hidden status text
// for screen readers) instead of a short line of text; videos keep the text.
assert.match(album,/function Skeleton\(\{count,label\}\)\{return <div className="fge-photo-grid fge-skeleton-grid" role="status"><span className="fge-sr-only">\{label\}<\/span>\{\[0,1\]\.map\(c=><div className="fge-photo-column" key=\{c\}>\{Array\.from\(\{length:Math\.ceil\(count\/2\)\},\(_,i\)=><div className="fge-skeleton" key=\{i\}\/>\)\}<\/div>\)\}<\/div>\}/);
assert.match(album,/\{loading&&items\.length===0\?\(isVideo\?<p className="fge-loading">กำลังโหลด…<\/p>:<Skeleton count=\{6\} label="กำลังโหลด…"\/>\)/);
assert.match(album,/\{loading&&pageNo>1&&\(isVideo\?<p className="fge-hint" role="status">กำลังโหลดชุดถัดไป…<\/p>:<Skeleton count=\{2\} label="กำลังโหลดชุดถัดไป…"\/>\)\}/);
// The end of the list says so (only once everything is loaded and something is shown).
assert.match(album,/\{!hasMore&&!loading&&!listFailed&&viewed\.length>0&&<p className="fge-end"><Icon name="done" size=\{16\}\/>ดูครบแล้ว<\/p>\}/);
assert.match(page,/\.fge-skeleton\{position:relative;overflow:hidden;aspect-ratio:3\/2;border-radius:18px;background:#f1f1f2\}/);
assert.match(page,/\.fge-sr-only\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\);white-space:nowrap\}/);
assert.match(css,/\.fge-skeleton::after\{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient\(100deg,transparent 25%,rgba\(255,255,255,\.45\) 50%,transparent 75%\);transform:translateX\(-100%\);animation:fg-shimmer 1\.4s ease-in-out infinite\}/);
assert.match(css,/\.fge-end\{animation:fg-fade-up \.3s ease-out both\}/);

// Empty lists: a football drops in and bounces to rest once (album "no files" / "no players",
// home "no albums"). Other empty states (errors, no preview) keep their icon.
const ball=/ball:<><circle cx="12" cy="12" r="9"\/><path d="M12 8\.8l3\.04 2\.21-1\.16 3\.58h-3\.76l-1\.16-3\.58z"\/><path d="M12 8\.8V3m3\.04 8\.01 5\.52-1\.79m-6\.68 5\.37 3\.41 4\.69m-7\.17-4\.69-3\.41 4\.69m2\.25-8\.27-5\.52-1\.79"\/><\/>/;
assert.match(album,ball);assert.match(home,ball);
assert.match(album,/function Empty\(\{message,children,ball=false\}\)\{return <div className="fge-empty"><div className="fge-placeholder">\{ball\?<span className="fge-ball"><Icon name="ball" size=\{40\}\/><\/span>:<Icon name="image" size=\{40\}\/>\}<\/div>/);
assert.match(album,/<Empty ball message="ยังไม่มีไฟล์ในหมวดนี้"\/>/);
assert.match(album,/<Empty ball message="ยังไม่มีรายชื่อนักฟุตบอลที่เผยแพร่"\/>/);
assert.match(home,/<div className="fg-albums-empty" role="status"><span className="fg-ball"><Icon name="ball" size=\{28\}\/><\/span>/);
assert.match(css,/\.fge-ball,\.fg-ball\{display:inline-flex;transform-origin:50% 100%;animation:fg-ball-drop 1\.1s cubic-bezier\(\.3,0,\.5,1\) both\}/);
const drop=css.match(/@keyframes fg-ball-drop\{.*?\}\}/)?.[0]||'';
assert.ok(drop,'drop keyframes');
assert.doesNotMatch(drop.replace(/translate|rotate|scale|opacity/g,''),/[a-z-]+:/,'translate/rotate/scale/opacity only');

const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
for(const selector of ['.fge-skeleton::after','.fge-end','.fge-ball','.fg-ball'])assert.ok(reduce.includes(selector),'reduced motion covers '+selector);

console.log('football gallery list states ok');
