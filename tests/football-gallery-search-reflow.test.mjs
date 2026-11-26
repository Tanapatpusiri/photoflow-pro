import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const home=await readFile('app/football-gallery/home-client.jsx','utf8');
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');

// Home search and date filter: the search box shows what was typed at once (query), and the album
// list follows (shownQuery / date) inside a View Transition. withViewTransition falls back to an
// instant update, so typing never waits for an animation.
assert.match(home,/import \{flushSync\} from 'react-dom';/);
assert.match(home,/import \{animatedClose,prefersReducedMotion,withViewTransition\} from '\.\.\/\.\.\/lib\/football-gallery-motion';/);
assert.match(home,/const \[shownQuery,setShownQuery\]=useState\(''\);/);
assert.match(home,/const search=shownQuery\.trim\(\)\.normalize\('NFC'\)/);
assert.match(home,/const filtering=Boolean\(shownQuery\|\|date\);/);
assert.match(home,/onChange=\{e=>\{const value=e\.target\.value;setQuery\(value\);applyFilter\(\(\)=>setShownQuery\(value\)\)\}\}/);
assert.match(home,/onClick=\{\(\)=>applyFilter\(\(\)=>setDate\(draftDate\)\)\}/);
assert.match(home,/onClick=\{\(\)=>\{setQuery\(''\);setDraftDate\(''\);applyFilter\(\(\)=>\{setShownQuery\(''\);setDate\(''\)\}\)\}\}/);
assert.doesNotMatch(home,/onChange=\{e=>setQuery\(e\.target\.value\)\}/,'the list no longer filters straight from the typed value');
// Grid only: the carousel scrolls back to its first card on every change, so it changes at once.
assert.match(home,/const applyFilter=update=>\{const run=\(\)=>flushSync\(update\);if\(singleColumn\)run\(\);else withViewTransition\(run\)\};/);
// Each card is named by its place in the full list (not the filtered one), so a card keeps its name.
assert.match(home,/const albumIndex=useMemo\(\(\)=>new Map\(initialAlbums\.map\(\(album,index\)=>\[album\.slug,index\]\)\),\[initialAlbums\]\);/);
// (Named in both layouts since the layout switch morphs too, see football-gallery-layout-player-morph.test.mjs.)
assert.match(home,/const style=\{viewTransitionName:'fg-album-'\+albumIndex\.get\(a\.slug\)\};/);
assert.equal((home.match(/className="fg-album-card"[^>]*style=\{style\}/g)||[]).length,2,'locked and open cards both carry the name');

// Album search only filters the already-authorized event players.
assert.match(album,/searchOpen&&<div className="fge-profile-search" role="search"/);
assert.match(album,/players\.filter\(p=>matchesPlayer\(p,query\)\)/);
assert.match(album,/\[player\.name,player\.nickname,player\.jersey\]/);
assert.match(album,/resetSelection\(\);closeSearch\(\);/);

// Motion: cards that stay slide to their new place, the others fade/scale out and in.
// Opacity and transform only; "reduce motion" already stops every view transition.
assert.match(css,/\.fg-home-v2 \.fg-album-card,\.fge-playergrid \.fge-player\{view-transition-class:fg-card\}/);
assert.match(css,/::view-transition-group\(\*\.fg-card\)\{animation-duration:\.3s;animation-timing-function:cubic-bezier\(\.2,\.8,\.2,1\)\}/);
assert.match(css,/::view-transition-old\(\*\.fg-card\):only-child\{animation:fg-card-out \.2s ease-in both\}/);
assert.match(css,/::view-transition-new\(\*\.fg-card\):only-child\{animation:fg-card-appear \.3s cubic-bezier\(\.2,\.8,\.2,1\) both\}/);
assert.match(css,/@keyframes fg-card-out\{to\{opacity:0;transform:scale\(\.92\)\}\}/);
assert.match(css,/@keyframes fg-card-appear\{from\{opacity:0;transform:scale\(\.92\)\}\}/);
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
for(const pseudo of ['::view-transition-group(*)','::view-transition-old(*)','::view-transition-new(*)'])assert.ok(reduce.includes(pseudo),'reduced motion stops '+pseudo);

console.log('football gallery search reflow ok');
