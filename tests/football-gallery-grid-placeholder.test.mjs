import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile('app/football-gallery/[slug]/event.css','utf8');
const rule=selector=>{
 const at=css.lastIndexOf(selector+'{');
 assert.ok(at>=0,'missing rule '+selector);
 return css.slice(at+selector.length+1,css.indexOf('}',at));
};

// Album photo tiles keep their natural shape once the JPEG arrives (aspect-ratio: auto ...).
// Until then the browser reserves a 3:2 box: nearly all match previews are landscape 3:2
// (39 of 40 on Production, 2026-11-25), so the grid no longer jumps as photos load.
const img=rule('.fge-photo-column .fge-tile-image img');
assert.match(img,/aspect-ratio:auto 3\/2/);
assert.doesNotMatch(img,/aspect-ratio:auto 3\/4/);

// Tiles without any preview keep their existing 3:4 placeholder shape (what people see, not a loading box).
assert.match(rule('.fge-photo-column .fge-photo-fallback'),/aspect-ratio:3\/4/);

console.log('football gallery grid placeholder ok');
