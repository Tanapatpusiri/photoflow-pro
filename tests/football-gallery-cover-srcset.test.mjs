import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coverSrc,coverSrcSet,coverSizes} from '../lib/football-gallery-cover-srcset.js';
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

// Slot sizes follow the .fg-shell (max 540px, 5vw gutter): two grid columns, or the horizontal
// carousel whose cards are 80% of the track (--card-width in home-v2.css).
assert.equal(coverSizes(false),'(min-width: 540px) 238px, 44vw');
assert.equal(coverSizes(true),'(min-width: 540px) 394px, 72vw');

// The home page uses these helpers for its album cards, following the layout switch.
const home=await readFile('app/football-gallery/home-client.jsx','utf8');
assert.match(home,/src=\{coverSrc\(a\.cover\)\}/);
assert.match(home,/srcSet=\{coverSrcSet\(a\.cover\)\}/);
assert.match(home,/sizes=\{coverSizes\(singleColumn\)\}/);

console.log('football gallery cover srcset ok');
