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

// I. Players: the tapped card grows into the player's banner and the name flies into its title, and
// back again. The card gets the shared names only for that transition (it is unmounted after
// opening; restored after coming back), so a name is never on two elements at once.
assert.match(album,/<button className="fge-player" key=\{p\.id\} data-player-id=\{p\.id\} style=\{\{viewTransitionName:'fg-player-'\+order\}\} onClick=\{e=>openPlayer\(p,e\.currentTarget\)\}>/);
assert.match(album,/const openPlayer=\(p,card\)=>\{if\(card\)\{card\.style\.viewTransitionName='fg-player-hero';const n=card\.querySelector\('strong'\);if\(n\)n\.style\.viewTransitionName='fg-player-name'\}withViewTransition\(\(\)=>flushSync\(\(\)=>change\('player',p\)\)\)\};/);
assert.match(album,/const backToPlayers=\(\)=>\{const id=player\?\.id;let card=null,prev='';/);
assert.match(album,/flushSync\(\(\)=>change\('players'\)\);card=id\?document\.querySelector\('\.fge-player\[data-player-id="'\+CSS\.escape\(id\)\+'"\]'\):null;/);
// Coming back: if the card is off screen it is scrolled into view first, so the banner lands on it.
assert.match(album,/const r=card\.getBoundingClientRect\(\);if\(r\.bottom<0\|\|r\.top>innerHeight\)window\.scrollTo\(\{top:window\.scrollY\+r\.top\+r\.height\/2-innerHeight\/2,behavior:'instant'\}\);prev=card\.style\.viewTransitionName;card\.style\.viewTransitionName='fg-player-hero'/);
assert.match(album,/const restore=\(\)=>\{if\(card\)\{card\.style\.viewTransitionName=prev;const n=card\.querySelector\('strong'\);if\(n\)n\.style\.viewTransitionName=''\}\};if\(t\)t\.finished\.then\(restore,restore\);else restore\(\)\};/);
assert.match(album,/else if\(page==='player'\)backToPlayers\(\);/);
assert.match(css,/\.fge-player-banner\{view-transition-name:fg-player-hero\}/);
assert.match(css,/\.fge-player-banner h2\{view-transition-name:fg-player-name\}/);
assert.match(css,/::view-transition-group\(fg-player-hero\),::view-transition-group\(fg-player-name\)\{animation-duration:\.38s;animation-timing-function:cubic-bezier\(\.2,\.8,\.2,1\)\}/);

const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.includes('::view-transition-group(*)'),'reduced motion stops every view transition');

console.log('football gallery layout + player morph ok');
