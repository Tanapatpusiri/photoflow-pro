import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {swipeStep,dragOffset} from '../lib/football-gallery-swipe.js';

// Where a horizontal drag on the photo goes: 1 = next (drag left), -1 = previous (drag right), 0 = stay.
const at={width:360,index:3,count:10,ms:400,dy:0};
assert.equal(swipeStep({...at,dx:-100}),1,'a long drag left goes to the next photo');
assert.equal(swipeStep({...at,dx:100}),-1,'a long drag right goes back');
assert.equal(swipeStep({...at,dx:-60}),0,'a short slow drag snaps back');
assert.equal(swipeStep({...at,dx:-60,ms:90}),1,'a quick flick counts even when short');
assert.equal(swipeStep({...at,dx:-20,ms:20}),0,'a tiny twitch never changes photo');
assert.equal(swipeStep({...at,dx:-100,dy:140}),0,'mostly vertical: that was a scroll');
assert.equal(swipeStep({...at,dx:100,index:0}),0,'nothing before the first photo');
assert.equal(swipeStep({...at,dx:-100,index:9}),0,'nothing after the last photo');
assert.equal(swipeStep({...at,dx:-100,index:-1}),0,'photo not in the list');

// While dragging the photo follows the finger, with resistance where there is nothing to go to.
assert.equal(dragOffset(-90,{atStart:false,atEnd:false}),-90);
assert.equal(dragOffset(90,{atStart:true,atEnd:false}),30);
assert.equal(dragOffset(-90,{atStart:false,atEnd:true}),-30);
assert.equal(dragOffset(-90,{atStart:true,atEnd:false}),-90,'the start only resists dragging right');

const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/import \{(?:\w+,)*dragOffset,(?:\w+,)*swipeStep(?:,\w+)*\} from '\.\.\/\.\.\/\.\.\/lib\/football-gallery-swipe';/);
assert.match(album,/import \{flyHeart,headerState,prefersReducedMotion,withViewTransition\} from '\.\.\/\.\.\/\.\.\/lib\/football-gallery-motion';/);
// Neighbours come from the list the visitor was looking at (filters such as favourites included).
assert.match(album,/const detailIndex=detail\?viewed\.findIndex\(item=>item\.id===detail\.id\):-1;/);
// The photo frame takes the drag (pointer events, so touch, pen and mouse) and the photo cannot be
// dragged out as an image.
assert.match(album,/<div className="fge-detail-image" ref=\{detailFrame\} onPointerDown=\{dragStart\} onPointerMove=\{dragMove\} onPointerUp=\{dragEnd\} onPointerCancel=\{dragEnd\}>/);
assert.match(album,/<img src=\{imageFor\(detail\)\} draggable=\{false\}/);
// The direction is decided once the finger has moved 8px: sideways changes photo (vertical moves,
// zoomed panning and swipe-down-to-close are covered in football-gallery-photo-gestures.test.mjs).
assert.match(album,/if\(Math\.abs\(dx\)<8&&Math\.abs\(dy\)<8\)return;g\.mode=zoom\.current\.scale>1\?'pan':Math\.abs\(dx\)>Math\.abs\(dy\)\?'x':dy>0&&window\.scrollY<=0\?'down':'scroll'/);
// Changing photo: the old one slides out, the page swaps the photo, the new one slides in. A timer
// always finishes the swap; "reduce motion" or no Web Animations swaps at once. A save in progress
// keeps its photo.
assert.match(album,/const stepDetail=\(step,fromDx=0\)=>\{const next=viewed\[detailIndex\+step\],img=detailFrame\.current\?\.querySelector\('img'\);if\(!next\|\|preparing\)return false;/);
assert.match(album,/const swap=\(\)=>\{flushSync\(\(\)=>\{setDetail\(next\);setDownloadProgress\(''\);setSavedAt\(0\)\}\)\};/);
assert.match(album,/if\(prefersReducedMotion\(\)\|\|typeof img\?\.animate!=='function'\)\{if\(img\)img\.style\.transform='';swap\(\);return true\}/);
assert.match(album,/out\.onfinish=enter;out\.oncancel=enter;setTimeout\(enter,300\);return true\};/);
// Arrow keys do the same on a keyboard (not while typing in a field).
assert.match(album,/if\(e\.key==='ArrowRight'&&stepDetail\(1\)\)e\.preventDefault\(\);else if\(e\.key==='ArrowLeft'&&stepDetail\(-1\)\)e\.preventDefault\(\)/);
// The photos next to the one shown are fetched ahead, so a swipe lands on a ready photo.
assert.match(album,/for\(const step of \[-1,1\]\)\{const near=viewed\[detailIndex\+step\],src=near&&imageFor\(near\);if\(src\)\{const pre=new Image\(\);pre\.decoding='async';pre\.src=src\}\}/);
// Back after swiping: the grid comes back where it was, and if the photo now shown is off screen
// its tile is scrolled into view, so the photo still shrinks into its own tile.
assert.match(album,/if\(tile\)\{const r=tile\.getBoundingClientRect\(\);if\(r\.bottom<0\|\|r\.top>innerHeight\)window\.scrollTo\(\{top:window\.scrollY\+r\.top\+r\.height\/2-innerHeight\/2,behavior:'instant'\}\)/);

// Styles: the page handles every move on the photo (swipe, close, zoom, pan; scrolling is passed on).
const page=await readFile('app/football-gallery/[slug]/event.css','utf8');
assert.match(page,/\.fge-detail-image\{touch-action:none;user-select:none;-webkit-user-select:none\}/);

console.log('football gallery photo swipe ok');
