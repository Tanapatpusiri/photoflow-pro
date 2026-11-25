import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile('app/football-gallery/admin/admin-motion.css','utf8');
const has=(re,why)=>assert.match(css,re,why);

// Upload progress: soft diagonal stripes keep moving over the filled part while files upload.
// A pseudo-element clipped by the fill moves with transform; the fill colour stays #303033.
has(/\.fga-progress i\{position:relative;overflow:hidden\}/,'fill clips its stripes');
has(/\.fga-progress i::after\{[^}]*repeating-linear-gradient\(135deg,rgba\(255,255,255,\.18\)/,'light stripes');
has(/\.fga-progress i::after\{[^}]*animation:fga-stripes/,'stripes move');
has(/@keyframes fga-stripes\{to\{transform:translateX\(/,'stripes move with transform');
assert.doesNotMatch(css,/#303033/,'fill colour is not redefined');

// Review: the selection toolbar rises in when picking starts (only the toolbar variant).
has(/\.fga-pick-bar\[role="toolbar"\]\{animation:fga-rise/,'toolbar rises in');
has(/@keyframes fga-rise\{from\{opacity:0;transform:translateY\(/,'rise uses opacity/transform');

// No layout-triggering transitions, and everything is off for "reduce motion".
assert.doesNotMatch(css,/transition:[^;}]*\b(width|height|top|left|margin|padding)\b/);
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.length>0,'reduced-motion block');
for(const selector of ['.fga-progress i::after','.fga-pick-bar[role="toolbar"]'])
 assert.ok(reduce.includes(selector),'reduced motion covers '+selector);

// The admin page loads it after admin.css.
const page=await readFile('app/football-gallery/admin/page.jsx','utf8');
assert.match(page,/import '\.\/admin\.css';\nimport '\.\/admin-motion\.css';/);

console.log('football gallery admin motion ok');
