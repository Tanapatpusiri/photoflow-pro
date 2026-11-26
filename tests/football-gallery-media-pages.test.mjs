import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collectMedia} from '../lib/football-gallery-media-pages.js';

// A fake album listing: 10 pages of 36 photos (like the 353-photo album), counting every page request.
const PAGE=36,TOTAL=353;
const album=Array.from({length:TOTAL},(_,i)=>({id:'m'+(i+1),files:[{id:'f'+(i+1),variant:'JPEG'}]}));
const pageOf=n=>({items:album.slice((n-1)*PAGE,n*PAGE),hasMore:n*PAGE<TOTAL});
const counter=()=>{const asked=[];return {asked,loadPage:async n=>{asked.push(n);return pageOf(n)}}};
const listedUpTo=pages=>album.slice(0,pages*PAGE);

// Saving the photo that is open: it is already listed, so no list page is requested again.
{
 const c=counter();
 const items=await collectMedia({wanted:['m5'],listed:listedUpTo(1),listedPages:1,loadPage:c.loadPage});
 assert.deepEqual(items.map(i=>i.id),['m5']);
 assert.deepEqual(c.asked,[],'a listed photo needs no /media request');
}

// Every wanted photo is listed already (the whole album was scrolled): no page is requested again.
{
 const c=counter();
 const all=album.map(i=>i.id);
 const items=await collectMedia({wanted:all,listed:album,listedPages:10,complete:true,loadPage:c.loadPage});
 assert.equal(items.length,TOTAL);
 assert.deepEqual(c.asked,[]);
}

// A wanted photo that is not listed yet: pages after the listed ones are read only until it is found.
{
 const c=counter();
 const items=await collectMedia({wanted:['m100'],listed:listedUpTo(1),listedPages:1,loadPage:c.loadPage});
 assert.deepEqual(items.map(i=>i.id),['m100']);
 assert.deepEqual(c.asked,[2,3],'stops at page 3 (photos 73-108) even though more pages exist');
}

// "เลือกทั้งหมด" after scrolling 3 pages: only pages 4-10 are requested, in listing order, no duplicates.
{
 const c=counter();
 const items=await collectMedia({listed:listedUpTo(3),listedPages:3,loadPage:c.loadPage});
 assert.deepEqual(c.asked,[4,5,6,7,8,9,10]);
 assert.deepEqual(items.map(i=>i.id),album.map(i=>i.id));
}

// The whole listing is already in (grid shows "ดูครบแล้ว"): no request at all.
{
 const c=counter();
 const items=await collectMedia({listed:album,listedPages:10,complete:true,loadPage:c.loadPage});
 assert.equal(items.length,TOTAL);
 assert.deepEqual(c.asked,[]);
}

// Nothing listed yet (another tab, or the list is still loading): starts at page 1 as before.
{
 const c=counter();
 const items=await collectMedia({loadPage:c.loadPage});
 assert.equal(items.length,TOTAL);
 assert.deepEqual(c.asked,[1,2,3,4,5,6,7,8,9,10]);
}

// A wanted id that no longer exists: reads to the last page, returns what it found, never throws.
{
 const c=counter();
 const items=await collectMedia({wanted:['m2','gone'],listed:listedUpTo(1),listedPages:1,loadPage:c.loadPage});
 assert.deepEqual(items.map(i=>i.id),['m2']);
 assert.deepEqual(c.asked,[2,3,4,5,6,7,8,9,10]);
}

// Items come back in listing order (the order photos are saved), not in the order they were tapped.
{
 const c=counter();
 const items=await collectMedia({wanted:['m30','m3','m12'],listed:listedUpTo(1),listedPages:1,loadPage:c.loadPage});
 assert.deepEqual(items.map(i=>i.id),['m3','m12','m30']);
}

// A page that repeats an item (offset paging while photos are published) keeps the first copy only.
{
 const items=await collectMedia({listed:[album[0]],listedPages:1,loadPage:async()=>({items:[album[0],album[1]],hasMore:false})});
 assert.deepEqual(items.map(i=>i.id),['m1','m2']);
}

// Cancelled (selection changed while loading): stops after the current page and returns null.
{
 const c=counter();let live=true;
 const result=await collectMedia({loadPage:async n=>{const page=await c.loadPage(n);if(n===2)live=false;return page},isCurrent:()=>live});
 assert.equal(result,null);
 assert.deepEqual(c.asked,[1,2]);
}

// A listing that never ends is cut off instead of looping forever.
await assert.rejects(collectMedia({loadPage:async()=>({items:[],hasMore:true}),maxPages:5}),/มีภาพจำนวนมากเกินกว่าจะโหลดในครั้งเดียว/);

// The album page uses the helper for "เลือกทั้งหมด" and for saving, with the pages it already listed,
// and saving no longer reads /media by itself.
const client=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(client,/import \{collectMedia\} from '\.\.\/\.\.\/\.\.\/lib\/football-gallery-media-pages';/);
assert.match(client,/const listedPhotos=\(\)=>mediaPage==='photos'&&!matchdays\?\{listed:items,listedPages:loadedPage,complete:loadedPage>0&&!hasMore\}:\{\};/);
assert.match(client,/const all=await collectMedia\(\{\.\.\.listedPhotos\(\),loadPage:n=>listMedia\('photo',player\?\.id,n\),isCurrent:\(\)=>current===selectionRequest\.current\}\);/);
assert.match(client,/const photos=await collectMedia\(\{wanted,\.\.\.listedPhotos\(\),loadPage:n=>listMedia\('photo',player\?\.id,n\)\}\);/);
assert.doesNotMatch(client,/await fetch\(base\(slug\)\+'\/media\?'/,'saving reads list pages through listMedia, which shares the short cache');
console.log('football-gallery-media-pages: ok');
