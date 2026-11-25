import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MAX_ZOOM,clampZoom,zoomAround,zoomToggle,pinchZoom,panZoom,dismissScale,shouldDismiss} from '../lib/football-gallery-swipe.js';

// Zoom state of the detail photo: transform = translate(x, y) scale(scale), origin at the frame centre.
const box={width:360,height:270};
const flat={scale:1,x:0,y:0};
// Never smaller than the frame, and never panned past the photo's edges.
assert.deepEqual(clampZoom({scale:.8,x:30,y:20},box),flat);
assert.deepEqual(clampZoom({scale:2,x:400,y:-400},box),{scale:2,x:180,y:-135});
assert.deepEqual(clampZoom({scale:2,x:-50,y:60},box),{scale:2,x:-50,y:60});
// Double tap: 2.5x around the tapped point (the point stays under the finger), and back to 1x.
const tapped=zoomToggle(flat,{x:60,y:-30},box);
assert.equal(tapped.scale,2.5);
assert.deepEqual({x:tapped.x,y:tapped.y},{x:-90,y:45},'point (60,-30) stays where it was');
assert.deepEqual(zoomToggle(tapped,{x:0,y:0},box),flat);
// Tapping near an edge: the photo edge is not pulled inside the frame.
assert.deepEqual(zoomToggle(flat,{x:180,y:135},box),{scale:2.5,x:-270,y:-202.5});
// zoomAround keeps the scale between 1 and MAX_ZOOM.
assert.equal(zoomAround(flat,9,{x:0,y:0},box).scale,MAX_ZOOM);
assert.deepEqual(zoomAround({scale:2,x:20,y:10},.5,{x:0,y:0},box),flat);
// Pinch: scale follows the finger distance, anchored at the starting midpoint, following it.
const pinched=pinchZoom(flat,{d0:100,d:200,m0:{x:40,y:20},m:{x:40,y:20}},box);
assert.deepEqual(pinched,{scale:2,x:-40,y:-20});
assert.deepEqual(pinchZoom(flat,{d0:100,d:200,m0:{x:40,y:20},m:{x:60,y:20}},box),{scale:2,x:-20,y:-20},'moving both fingers pans');
assert.deepEqual(pinchZoom({scale:2,x:-40,y:-20},{d0:200,d:50,m0:{x:0,y:0},m:{x:0,y:0}},box),flat,'pinching in past 1x ends flat');
// Pan while zoomed, clamped.
assert.deepEqual(panZoom({scale:2,x:0,y:0},{dx:50,dy:-500},box),{scale:2,x:50,y:-135});
// Swipe down to close: the photo shrinks a little while dragged (not below 75%), and a long or
// quick enough drag closes it.
assert.equal(dismissScale(0),1);assert.equal(dismissScale(80),.9);assert.equal(dismissScale(900),.75);
assert.equal(shouldDismiss({dy:120,ms:600}),true,'far enough');
assert.equal(shouldDismiss({dy:60,ms:80}),true,'a quick flick');
assert.equal(shouldDismiss({dy:60,ms:600}),false,'short and slow: back in place');
assert.equal(shouldDismiss({dy:20,ms:10}),false,'a twitch is never a close');

const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/import \{clampZoom,dismissScale,dragOffset,panZoom,pinchZoom,shouldDismiss,swipeStep,zoomToggle\} from '\.\.\/\.\.\/\.\.\/lib\/football-gallery-swipe';/);
// Every pointer on the photo is tracked; two fingers start a pinch.
assert.match(album,/const pointers=useRef\(new Map\(\)\),gesture=useRef\(null\),zoom=useRef\(\{scale:1,x:0,y:0\}\),lastTap=useRef\(null\);/);
assert.match(album,/if\(pointers\.current\.size===2\)\{const \[a,b\]=\[\.\.\.pointers\.current\.values\(\)\],box=frameBox\(el\);gesture\.current=\{mode:'pinch',d0:Math\.hypot\(a\.x-b\.x,a\.y-b\.y\),m0:\{x:\(a\.x\+b\.x\)\/2-box\.cx,y:\(a\.y\+b\.y\)\/2-box\.cy\},z0:\{\.\.\.zoom\.current\},box\};/);
// Zoomed: one finger pans. Not zoomed: sideways = change photo, down at the top of the page =
// close, anything else scrolls the page (the photo frame has touch-action:none).
assert.match(album,/if\(g\.mode==='pan'\)\{zoom\.current=panZoom\(g\.z0,\{dx,dy\},g\.box\);if\(img\)paintZoom\(img,false\);return\}/);
assert.match(album,/if\(g\.mode==='scroll'\)\{window\.scrollBy\(0,g\.lastY-e\.clientY\);g\.lastY=e\.clientY;return\}/);
assert.match(album,/if\(g\.mode==='down'\)\{g\.dy=Math\.max\(0,dy\);if\(img\)img\.style\.transform='translate\('\+Math\.round\(dx\*\.5\)\+'px,'\+Math\.round\(g\.dy\)\+'px\) scale\('\+dismissScale\(g\.dy\)\+'\)';return\}/);
// While dragged down the photo leaves its frame (the frame normally clips it, e.g. when zoomed).
assert.match(album,/if\(g\.mode==='down'\)e\.currentTarget\.dataset\.gesture='down'/);
const page=await readFile('app/football-gallery/[slug]/event.css','utf8');
assert.match(page,/\.fge-detail-image\[data-gesture="down"\]\{overflow:visible;position:relative;z-index:5;background:transparent\}/);
// Letting go after a downward drag: close with the photo morph back into its tile (#45), or settle back.
assert.match(album,/if\(g\.mode==='down'\)\{if\(e\.type==='pointerup'&&shouldDismiss\(\{dy:e\.clientY-g\.y,ms:e\.timeStamp-g\.t\}\)\)\{closeDetail\(\);return\}delete e\.currentTarget\.dataset\.gesture;settle\(img\);return\}/);
// A double tap (two taps within 300 ms and 30 px) zooms in at that point, or back out.
assert.match(album,/if\(last&&e\.timeStamp-last\.t<300&&Math\.hypot\(e\.clientX-last\.x,e\.clientY-last\.y\)<30\)\{lastTap\.current=null;const box=frameBox\(e\.currentTarget\);zoom\.current=zoomToggle\(zoom\.current,\{x:e\.clientX-box\.cx,y:e\.clientY-box\.cy\},box\);if\(img\)paintZoom\(img,true\)\}/);
// A pinch that ends near 1x settles flat.
assert.match(album,/if\(zoom\.current\.scale<1\.05\)\{zoom\.current=\{scale:1,x:0,y:0\};if\(img\)paintZoom\(img,true\)\}/);
// The zoom never carries over to another photo.
assert.match(album,/useEffect\(\(\)=>\{zoom\.current=\{scale:1,x:0,y:0\};gesture\.current=null;pointers\.current\.clear\(\);lastTap\.current=null\},\[detail\?\.id\]\);/);
// Zooming animates only for a double tap (never during a pinch), and not with "reduce motion".
assert.match(album,/const paintZoom=\(img,animate\)=>\{const z=clampZoom\(zoom\.current,frameBox\(img\.parentElement\)\);zoom\.current=z;img\.style\.transition=animate&&!prefersReducedMotion\(\)\?'transform \.25s cubic-bezier\(\.2,\.8,\.2,1\)':'';img\.style\.transform=z\.scale>1\?'translate\('\+Math\.round\(z\.x\)\+'px,'\+Math\.round\(z\.y\)\+'px\) scale\('\+z\.scale\.toFixed\(3\)\+'\)':''\};/);

console.log('football gallery photo gestures ok');
