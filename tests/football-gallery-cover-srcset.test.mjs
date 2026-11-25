import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coverSrc,coverSrcSet,COVER_SIZES} from '../lib/football-gallery-cover-srcset.js';
import {coverWidth} from '../lib/football-gallery-cover-image.js';

const cover='/api/football-gallery/cover/11111111-1111-4111-8111-111111111111?v=1795586538';

// The default src is the 2-column card size; the version query stays in front.
assert.equal(coverSrc(cover),cover+'&w=540');

// Every srcset candidate is a width the cover route accepts, so the two can never drift apart.
const candidates=coverSrcSet(cover).split(', ').map(c=>c.split(' '));
assert.deepEqual(candidates.map(([,d])=>d),['360w','540w','720w','1080w']);
for(const [url,d] of candidates){
 assert.ok(url.startsWith(cover+'&w='));
 assert.equal(coverWidth(new URL(url,'https://app.test').searchParams.get('w')),Number.parseInt(d));
}

// One slot size for both layouts (the carousel card, 80% of the .fg-shell track), so switching
// between grid and carousel never makes the browser pick and download another crop.
assert.equal(COVER_SIZES,'(min-width: 540px) 394px, 72vw');

// The home page uses these helpers for its album cards, with the same sizes in both layouts.
const home=await readFile('app/football-gallery/home-client.jsx','utf8');
assert.match(home,/src=\{coverSrc\(a\.cover\)\}/);
assert.match(home,/srcSet=\{coverSrcSet\(a\.cover\)\}/);
assert.match(home,/sizes=\{COVER_SIZES\}/);
assert.doesNotMatch(home,/coverSizes/);

console.log('football gallery cover srcset ok');
