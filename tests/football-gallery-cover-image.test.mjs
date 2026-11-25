import assert from 'node:assert/strict';
import sharp from 'sharp';
import {COVER_WIDTHS,coverWidth,coverVariant} from '../lib/football-gallery-cover-image.js';

const jpeg=(width,height,orientation)=>{
 let image=sharp({create:{width,height,channels:3,background:{r:40,g:120,b:60}}}).jpeg();
 if(orientation)image=image.withMetadata({orientation});
 return image.toBuffer();
};
const size=async buffer=>{const m=await sharp(buffer).metadata();return [m.width,m.height,m.format]};

// Only the widths the home page asks for are accepted; no width keeps the old redirect.
assert.deepEqual(COVER_WIDTHS,[360,540,720,1080]);
assert.equal(coverWidth(null),null);
assert.equal(coverWidth('540'),540);
assert.equal(coverWidth('541'),false);
assert.equal(coverWidth('abc'),false);
assert.equal(coverWidth('5400'),false);

// A landscape upload (1600x1067) becomes a centred 2:3 portrait crop at the asked width.
assert.deepEqual(await size(await coverVariant(await jpeg(1600,1067),540)),[540,810,'jpeg']);

// Never enlarge: a 640x427 photo cover can only give its own 2:3 crop (285x427 at most).
const [w,h]=await size(await coverVariant(await jpeg(640,427),1080));
assert.ok(w<=285&&h<=427,'cover must not be enlarged beyond the source crop');
assert.ok(Math.abs(w/h-2/3)<0.01,'cover keeps the 2:3 card shape');

// EXIF orientation is applied first: a 600x400 file shot in portrait (orientation 6) is 400x600.
assert.deepEqual(await size(await coverVariant(await jpeg(600,400,6),1080)),[400,600,'jpeg']);

// Output is always a JPEG, even for widths the source can fully serve.
const out=await coverVariant(await jpeg(1600,1067),360);
assert.deepEqual([...out.subarray(0,3)],[0xff,0xd8,0xff]);

console.log('football gallery cover image ok');
