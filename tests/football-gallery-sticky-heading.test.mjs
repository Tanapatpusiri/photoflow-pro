import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {headerState} from '../lib/football-gallery-motion.js';

// Near the top the header is always shown ("scrolled" only once the page has moved).
assert.deepEqual(headerState({y:0,anchor:0,hidden:false}),{hidden:false,scrolled:false,anchor:0});
assert.deepEqual(headerState({y:60,anchor:300,hidden:true}),{hidden:false,scrolled:true,anchor:60});
assert.deepEqual(headerState({y:-30,anchor:0,hidden:false}),{hidden:false,scrolled:false,anchor:-30},'iOS bounce at the top');
// Further down: scrolling down hides it, scrolling up shows it again.
assert.deepEqual(headerState({y:400,anchor:300,hidden:false}),{hidden:true,scrolled:true,anchor:400});
assert.deepEqual(headerState({y:380,anchor:400,hidden:true}),{hidden:false,scrolled:true,anchor:380});
// Small movements (a resting finger, momentum jitter) change nothing and keep the anchor.
assert.deepEqual(headerState({y:405,anchor:400,hidden:true}),{hidden:true,scrolled:true,anchor:400});
assert.deepEqual(headerState({y:393,anchor:400,hidden:true}),{hidden:true,scrolled:true,anchor:400});
// Slow scrolling still counts once it adds up past the jitter (3px a frame).
let state={hidden:false,anchor:300};
for(let y=303;y<=312;y+=3)state=headerState({...state,y});
assert.equal(state.hidden,true,'slow scroll down hides');
for(let y=309;y>=300;y-=3)state=headerState({...state,y});
assert.equal(state.hidden,false,'slow scroll up shows');

// Album page: the header element is driven from one rAF-throttled, passive scroll listener and
// only touches its own data attributes (no React re-render while scrolling).
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/<header ref=\{heading\} className="fge-nav fge-album-heading">/);
assert.match(album,/const heading=useRef\(null\),headingState=useRef\(\{hidden:false,scrolled:false,anchor:0\}\);/);
assert.match(album,/const paintHeading=\(\)=>\{const el=heading\.current,s=headingState\.current;if\(!el\)return;const hidden=s\.hidden\?'true':'false',scrolled=s\.scrolled\?'true':'false';if\(el\.dataset\.hidden!==hidden\)el\.dataset\.hidden=hidden;if\(el\.dataset\.scrolled!==scrolled\)el\.dataset\.scrolled=scrolled\};/);
assert.match(album,/const revealHeading=\(\)=>\{headingState\.current=\{\.\.\.headingState\.current,hidden:false,anchor:window\.scrollY\};paintHeading\(\)\};/);
assert.match(album,/window\.addEventListener\('scroll',onScroll,\{passive:true\}\)/);
assert.match(album,/const onScroll=\(\)=>\{if\(!frame\)frame=requestAnimationFrame\(update\)\};/);
assert.match(album,/return\(\)=>\{window\.removeEventListener\('scroll',onScroll\);cancelAnimationFrame\(frame\)\}\},\[hasEvent\]\);/);

// Layout: sticky at the top with a white background reaching the page edges (same side padding
// as .fge-shell, 18px and 13px on small screens), above the sticky download button (z-index 4).
const page=await readFile('app/football-gallery/[slug]/event.css','utf8');
assert.match(page,/\.fge-album-heading\{position:sticky;top:0;z-index:6;background:#fff;margin-inline:-18px;padding-inline:18px\}/);
assert.match(page,/@media\(max-width:370px\)\{\.fge-album-heading\{margin-inline:-13px;padding-inline:13px\}\}/);
// Motion: slides away/back (transform), the title shrinks a little while scrolled (scale), a soft
// shadow while it floats over photos. Off for "reduce motion".
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
assert.match(css,/\.fge-album-heading\[data-hidden="true"\]\{transform:translateY\(calc\(-100% - 8px\)\)\}/);
assert.match(css,/\.fge-album-heading\[data-scrolled="true"\] h1\{scale:\.82\}/);
assert.match(css,/\.fge-album-heading\{transition:transform \.28s cubic-bezier\(\.2,\.8,\.2,1\),box-shadow \.2s\}/);
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.includes('.fge-album-heading h1'),'reduced motion: no title shrink animation');
assert.match(reduce,/\.fge-album-heading\{transition:none\}/);

console.log('football gallery sticky heading ok');
