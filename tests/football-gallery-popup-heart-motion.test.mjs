import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {animatedClose} from '../lib/football-gallery-motion.js';

// Closing never waits for an animation event: a timer always finishes the close, and with
// "reduce motion" it closes at once. A missing stylesheet can never leave the popup stuck.
let calls=[],scheduled=null;
const schedule=(fn,ms)=>{scheduled={fn,ms};return 'timer'};
let timer=animatedClose({reduce:true,start:()=>calls.push('start'),finish:()=>calls.push('finish'),schedule});
assert.deepEqual(calls,['finish']);
assert.equal(timer,null);
assert.equal(scheduled,null);
calls=[];
timer=animatedClose({reduce:false,start:()=>calls.push('start'),finish:()=>calls.push('finish'),ms:200,schedule});
assert.deepEqual(calls,['start']);
assert.equal(timer,'timer');
assert.equal(scheduled.ms,200);
scheduled.fn();
assert.deepEqual(calls,['start','finish']);

const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
const has=(re,why)=>assert.match(css,re,why);
// Popup: backdrop fades, the sheet rises from the bottom, both reverse while closing.
has(/\.fg-access-overlay\{animation:fg-fade-in/,'backdrop fades in');
has(/\.fg-access-modal\{animation:fg-sheet-up/,'sheet rises');
has(/@keyframes fg-sheet-up\{from\{transform:translateY/,'sheet moves with transform');
has(/\.fg-access-overlay\[data-closing="true"\]\{animation:fg-fade-out/,'backdrop fades out');
has(/\.fg-access-overlay\[data-closing="true"\] \.fg-access-modal\{animation:fg-sheet-down/,'sheet goes down');
// Wide screens show the popup centred, so it scales in instead of rising.
has(/@media \(min-width:620px\)\{[^@]*fg-pop-in/,'centred popup scales in');
// Wrong code: the field shakes once and the message eases in.
has(/\.fg-access-modal input\[aria-invalid="true"\]\{animation:fg-shake/,'field shakes');
has(/@keyframes fg-shake\{[^}]*transform:translateX/,'shake uses transform');
has(/\.fg-access-modal \.fg-error\{animation:fg-fade-up/,'error eases in');
// Busy button: a small spinner.
has(/\.fg-spinner\{[^}]*animation:fg-spin/,'spinner spins');
has(/@keyframes fg-spin\{to\{transform:rotate\(360deg\)\}\}/,'spinner uses transform');
// Favourite: the heart pops when it is added.
has(/\.fge-tile-actions button\[data-pop="true"\] \.fg-icon\{animation:fg-heart-pop/,'heart pops');
has(/@keyframes fg-heart-pop\{[^}]*transform:scale/,'pop uses transform');
// All of it is off for "reduce motion".
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
for(const selector of ['.fg-access-overlay','.fg-access-modal','.fg-access-modal input[aria-invalid="true"]','.fg-access-modal .fg-error','.fg-spinner','.fge-tile-actions button[data-pop="true"] .fg-icon'])
 assert.ok(reduce.includes(selector),'reduced motion covers '+selector);

const home=await readFile('app/football-gallery/home-client.jsx','utf8');
assert.match(home,/import \{animatedClose,prefersReducedMotion\} from '\.\.\/\.\.\/lib\/football-gallery-motion';/);
assert.match(home,/className="fg-access-overlay" data-closing=\{closingAccess\?'true':undefined\}/);
assert.match(home,/const closeAccess=\(\)=>\{if\(busy\|\|closingAccess\)return;closeTimer\.current=animatedClose\(\{reduce:prefersReducedMotion\(\)/);
// Re-opening right after a close cancels the pending close.
assert.match(home,/const askCode=title=>\{clearTimeout\(closeTimer\.current\);setClosingAccess\(false\);/);
assert.match(home,/\{busy\?<span className="fg-spinner" aria-hidden="true"\/>:<Icon name="arrow" size=\{20\}\/>\}/);

const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/onClick=\{\(\)=>\{toggleFav\(item\.id\);setPopFav\(item\.id\)\}\} data-pop=\{popFav===item\.id&&favorites\.includes\(item\.id\)\?'true':undefined\}/);

console.log('football gallery popup + heart motion ok');
