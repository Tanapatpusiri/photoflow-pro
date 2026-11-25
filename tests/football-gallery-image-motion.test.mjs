import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {watchImage,imageShown,imageFailed} from '../lib/football-gallery-image-fade.js';

const img=(complete,src='a.jpg',loading='lazy')=>({complete,src,loading,dataset:{}});

// Only an image that is still loading is hidden for the fade. Images already loaded (cache, or
// before React hydrates) are never hidden, and nothing is hidden when JavaScript does not run.
assert.doesNotThrow(()=>watchImage(null));
const loading=img(false);watchImage(loading);
assert.equal(loading.dataset.fade,'pending');
const cached=img(true);watchImage(cached);
assert.equal(cached.dataset.fade,undefined);

// Eager images are the first photos on screen and the LCP candidates: they are never hidden
// (a fade would delay LCP by its whole duration), they only get the light sweep while loading.
const eager=img(false,'c.jpg','eager');watchImage(eager);
assert.equal(eager.dataset.fade,'loading');
imageShown({currentTarget:eager});
assert.equal(eager.dataset.fade,'done');

// The load event shows it.
imageShown({currentTarget:loading});
assert.equal(loading.dataset.fade,'done');

// A failed preview stays hidden only while a retry is on its way; otherwise it is shown again
// so a broken tile never stays invisible.
const retried=img(false);watchImage(retried);
imageFailed({currentTarget:retried},event=>{event.currentTarget.src='b.jpg?retry=1'});
assert.equal(retried.dataset.fade,'pending');
const gaveUp=img(false);watchImage(gaveUp);
imageFailed({currentTarget:gaveUp},()=>{});
assert.equal(gaveUp.dataset.fade,'done');
const noRetry=img(false);watchImage(noRetry);
imageFailed({currentTarget:noRetry});
assert.equal(noRetry.dataset.fade,'done');

// Motion styles: opacity/transform only, and all of it off for "reduce motion".
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
assert.match(css,/img\[data-fade="pending"\]\{[^}]*opacity:0/);
assert.match(css,/transition:opacity/);
assert.match(css,/:has\(img\[data-fade="pending"\],img\[data-fade="loading"\]\)::after/);
assert.doesNotMatch(css,/img\[data-fade="loading"\]\{[^}]*opacity/,'eager photos are never hidden');
assert.match(css,/@keyframes fg-shimmer\{[^}]*transform:translateX/);
for(const target of ['.fg-album-card:active','.fge-tile-image:active','.fg-home-control:active','.fge-album-tabs button:active'])
 assert.ok(css.includes(target),'press feedback for '+target);
assert.match(css,/transform:scale\(\.97\)/);
assert.doesNotMatch(css,/transition:[^;}]*\b(width|height|top|left|margin|padding)\b/,'no layout-triggering transitions');
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.length>0,'reduced-motion block');
assert.match(reduce,/transition:none/);
assert.match(reduce,/animation:none/);
assert.match(reduce,/transform:none/);

// Both pages load the styles and wire the helpers to their photos.
const home=await readFile('app/football-gallery/home-client.jsx','utf8');
assert.match(home,/import '\.\/gallery-motion\.css';/);
assert.match(home,/<img src=\{coverSrc\(a\.cover\)\}[^>]*onLoad=\{imageShown\}/);
assert.match(home,/<img src=\{coverSrc\(a\.cover\)\}[^>]*ref=\{img=>\{watchImage\(img\);/);
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/import '\.\.\/gallery-motion\.css';/);
const grid=album.slice(album.indexOf("<button className=\"fge-tile-image\""),album.indexOf('</button>',album.indexOf("<button className=\"fge-tile-image\"")));
assert.match(grid,/ref=\{watchImage\}/);
assert.match(grid,/onLoad=\{imageShown\}/);
assert.match(grid,/onError=\{e=>imageFailed\(e,event=>retryPreview\(event,preview\(item\)\)\)\}/);

console.log('football gallery image motion ok');
