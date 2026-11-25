import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withViewTransition} from '../lib/football-gallery-motion.js';

let unhandled=0;process.on('unhandledRejection',()=>{unhandled++});
const tick=()=>new Promise(r=>setTimeout(r,20));
let ran=0;const update=()=>{ran++};

// No View Transitions (or "reduce motion", or no document): the update runs at once.
ran=0;assert.equal(withViewTransition(update,{reduce:true,doc:{startViewTransition:()=>{throw Error('must not be called')}}}),null);assert.equal(ran,1);
ran=0;assert.equal(withViewTransition(update,{reduce:false,doc:{}}),null);assert.equal(ran,1);
ran=0;assert.equal(withViewTransition(update,{reduce:false,doc:null}),null);assert.equal(ran,1);

// Supported: the browser gets the update (and calls it itself).
ran=0;let given=null;
const fake={ready:Promise.resolve(),finished:Promise.resolve()};
assert.equal(withViewTransition(update,{reduce:false,doc:{startViewTransition:fn=>{given=fn;return fake}}}),fake);
assert.equal(ran,0);given();assert.equal(ran,1);

// Starting a transition throws: the update still runs.
ran=0;assert.equal(withViewTransition(update,{reduce:false,doc:{startViewTransition:()=>{throw Error('InvalidStateError')}}}),null);assert.equal(ran,1);

// A skipped transition (rejected ready/finished) never surfaces as an unhandled rejection.
withViewTransition(update,{reduce:false,doc:{startViewTransition:()=>({ready:Promise.reject(Error('skipped')),finished:Promise.reject(Error('skipped'))})}});
await tick();assert.equal(unhandled,0);

// Album page wiring.
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/import \{flushSync\} from 'react-dom';/);
assert.match(album,/import \{withViewTransition\} from '\.\.\/\.\.\/\.\.\/lib\/football-gallery-motion';/);
// The tapped tile hands its image over, and every tile image can be found again on the way back.
assert.match(album,/<button className="fge-tile-image" onClick=\{e=>openDetail\(item,e\.currentTarget\.querySelector\('img'\)\)\}/);
assert.match(album,/<img src=\{imageFor\(item\)\} data-media-id=\{item\.id\}/);
// Opening remembers where the grid was, names the tapped image and swaps pages inside the transition.
const open=album.slice(album.indexOf('const openDetail='),album.indexOf('\n',album.indexOf('const openDetail=')+200));
assert.match(album,/const openDetail=\(item,img\)=>\{gridScroll\.current=window\.scrollY;/);
assert.match(album,/img\.style\.viewTransitionName='fg-photo'/);
assert.match(album,/withViewTransition\(\(\)=>\{flushSync\(\(\)=>\{setDetail\(item\);setPage\('detail'\);setArchive\(null\)\}\)/);
// Back: same grid position, and the photo shrinks into its own tile.
assert.match(album,/if\(page==='detail'\)closeDetail\(\);/);
assert.match(album,/window\.scrollTo\(\{top:gridScroll\.current,behavior:'instant'\}\)/);
assert.match(album,/\.fge-tile-image img\[data-media-id="'\+CSS\.escape\(id\)\+'"\]/);
assert.ok(open.length>0);

// Styles: the detail photo is the shared element; timing; off for "reduce motion".
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
assert.match(css,/\.fge-detail-image img\{view-transition-name:fg-photo\}/);
assert.match(css,/::view-transition-group\(fg-photo\)\{animation-duration:/);
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.includes('::view-transition-group(*)'),'reduced motion stops view transitions');

console.log('football gallery photo transition ok');
