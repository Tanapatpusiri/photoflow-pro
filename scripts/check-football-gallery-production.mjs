// Production-only, public-metadata smoke test. Does not fetch child originals,
// log cookies or bypass album access rules. Run: node scripts/check-football-gallery-production.mjs
const base=(process.env.FG_CHECK_ORIGIN||'https://photoflow-pro.vercel.app').replace(/\/$/,'');
const slowMs=Number(process.env.FG_MAX_INITIAL_HTML_MS||8000);
async function read(path){
 const start=performance.now();
 const response=await fetch(base+path,{redirect:'follow',signal:AbortSignal.timeout(20000),headers:{'user-agent':'FootballGallerySmoke/1.0','cache-control':'no-cache'}});
 const body=await response.text();
 const ms=Math.round(performance.now()-start);
 console.log(path,response.status,ms+'ms');
 return {status:response.status,body,ms};
}
function assert(ok,message){if(!ok)throw new Error(message)}
const home=await read('/football-gallery');
assert(home.status===200,'Homepage not HTTP 200');
assert(home.ms<slowMs,'Homepage initial HTML exceeded '+slowMs+'ms');
const api=await read('/api/football-gallery/albums');
assert(api.status===200,'Album API not HTTP 200');
const albums=JSON.parse(api.body).albums;
assert(Array.isArray(albums),'Malformed album directory');
for(const album of albums.slice(0,3)){
 // The album card must ship in server-rendered HTML, not only a later JS fetch.
 assert(home.body.includes(album.slug),'Homepage does not server-render album '+album.slug);
 if(album.locked){
  const restricted=await read('/api/football-gallery/events/'+encodeURIComponent(album.slug));
  assert([401,403,404].includes(restricted.status),'Locked album appears accessible without a grant');
  continue;
 }
 const page=await read('/football-gallery/'+encodeURIComponent(album.slug));
 assert(page.status===200,'Event page failed '+album.slug);
 assert(page.ms<slowMs,'Event initial HTML exceeded '+slowMs+'ms for '+album.slug);
 assert(page.body.includes(album.title),'Event metadata not server-rendered for '+album.slug);
 const eventApi=await read('/api/football-gallery/events/'+encodeURIComponent(album.slug));
 assert(eventApi.status===200,'Unlocked event requires a second open request '+album.slug);
 const event=JSON.parse(eventApi.body).event;
 assert((event.coverUrl||null)===(album.cover||null),'Home/event cover URLs differ for '+album.slug);
}
const admin=await read('/football-gallery/admin');
assert(admin.status===200,'Admin route not available');
console.log('Production SSR, access rules and cover URL smoke checks passed');
