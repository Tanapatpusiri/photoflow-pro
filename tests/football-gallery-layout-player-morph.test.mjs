import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const home=await readFile('app/football-gallery/home-client.jsx','utf8');
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');

// H. Layout switch (grid ↔ swipe row): every card flies from its place in one layout to its place in
// the other (View Transitions; without support or with "reduce motion" it switches at once). Cards
// keep the same name in both layouts, by their place in the full list.
assert.match(home,/function toggleLayout\(\)\{\n  const next=!singleColumn;\n  withViewTransition\(\(\)=>flushSync\(\(\)=>setSingleColumn\(next\)\)\);\n  try\{localStorage\.setItem\(layoutKey,next\?'single':'grid'\)\}catch\{\}\n \}/);
assert.match(home,/const style=\{viewTransitionName:'fg-album-'\+albumIndex\.get\(a\.slug\)\};/);
assert.match(css,/\.fg-home-v2 \.fg-album-card,\.fge-playergrid \.fge-player\{view-transition-class:fg-card\}/);

// V3 filters in place, with stable event-player IDs instead of opening a player page.
assert.match(album,/key=\{p\.id\} type="button" className="fge-profile" aria-pressed=\{selected===p\.id\}/);
assert.match(album,/setPlayer\(player\?\.id===p\.id\?null:p\);/);
assert.doesNotMatch(album,/openPlayer|backToPlayers|fge-player-banner/);

const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.includes('::view-transition-group(*)'),'reduced motion stops every view transition');

console.log('football gallery layout + player morph ok');
