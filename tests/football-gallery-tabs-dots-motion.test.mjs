import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
const at=css.indexOf('@supports selector(:has(*))');
assert.ok(at>=0,'the sliding pill is only used where :has() works');
const sup=css.slice(at,css.indexOf('\n}\n',at)+2);

// Album tabs: one white pill slides to the active tab (transform), the active button itself
// turns transparent only inside @supports, so older browsers keep today's look.
assert.match(sup,/\.fge-album-tabs::before\{[^}]*width:calc\(\(100% - 2 \* var\(--tabs-pad\) - 2 \* var\(--tabs-gap\)\) \/ 3\)/);
assert.match(sup,/\.fge-album-tabs::before\{[^}]*transition:transform/);
assert.match(sup,/\.fge-album-tabs:has\(button:nth-child\(2\)\.active\)::before\{transform:translateX\(calc\(100% \+ var\(--tabs-gap\)\)\)\}/);
assert.match(sup,/\.fge-album-tabs:has\(button:nth-child\(3\)\.active\)::before\{transform:translateX\(calc\(200% \+ 2 \* var\(--tabs-gap\)\)\)\}/);
assert.match(sup,/\.fge-album-tabs button\.active\{background:transparent;box-shadow:none\}/);
// Press feedback from the first motion round is kept on the tab buttons.
assert.match(sup,/\.fge-album-tabs button\{[^}]*transition:transform \.15s ease-out,color/);

// Photos/Videos on a player page: the same pill over two segments.
assert.match(sup,/\.fge-segments::before\{[^}]*width:calc\(\(100% - 2 \* var\(--tabs-pad\) - var\(--tabs-gap\)\) \/ 2\)/);
assert.match(sup,/\.fge-segments:has\(button:nth-child\(2\)\.selected\)::before\{transform:translateX\(calc\(100% \+ var\(--tabs-gap\)\)\)\}/);
assert.match(sup,/\.fge-segments button\.selected\{background:transparent;box-shadow:none\}/);

// Spacing follows event.css: 5px padding/gap, and 4px/3px on screens up to 370px.
assert.match(css,/\.fge-album-tabs,\.fge-segments\{--tabs-pad:5px;--tabs-gap:5px\}/);
assert.match(css,/@media \(max-width:370px\)\{\.fge-album-tabs\{--tabs-pad:4px;--tabs-gap:3px\}\}/);

// Carousel dots: the active dot opens into a short pill. clip-path only (no layout), inside
// the same 26px tap target, and the green/grey colours stay where they are (home-v2.css).
assert.match(css,/\.fg-carousel-dots button::before\{width:22px;border-radius:5px;clip-path:inset\(0 6px round 5px\);transition:clip-path/);
assert.match(css,/\.fg-carousel-dots button\[aria-current="true"\]::before\{clip-path:inset\(0 round 5px\)\}/);
const dotRules=css.match(/\.fg-carousel-dots[^{]*\{[^}]*\}/g)||[];
assert.ok(dotRules.length>=2,'dot rules found');
for(const rule of dotRules)assert.doesNotMatch(rule,/background(-color)?:|#[0-9a-f]{3,6}\b/i,'dot colours are not redefined: '+rule);

// Off for "reduce motion".
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
for(const selector of ['.fge-album-tabs::before','.fge-segments::before','.fg-carousel-dots button::before'])
 assert.ok(reduce.includes(selector),'reduced motion covers '+selector);

console.log('football gallery tabs + dots motion ok');
