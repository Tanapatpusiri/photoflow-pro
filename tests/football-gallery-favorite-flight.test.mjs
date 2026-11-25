import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {flightKeyframes,flyHeart} from '../lib/football-gallery-motion.js';

// Flight path: starts where the tapped heart is, rises in a small arc, ends on the header count.
const from={left:300,top:600,width:30,height:30},to={left:320,top:20,width:60,height:40};
const frames=flightKeyframes(from,to,{viewportHeight:800});
assert.equal(frames.length,3);
assert.deepEqual(frames[0],{transform:'translate(0px,0px) scale(1)',opacity:1});
// centre (315,615) -> (350,40): dx 35, dy -575
assert.equal(frames[2].transform,'translate(35px,-575px) scale(.5)');
const mid=frames[1].transform.match(/translate\((-?\d+)px,(-?\d+)px\)/).map(Number);
assert.equal(mid[1],18,'halfway across');
assert.ok(mid[2]<-575/2,'the middle point is lifted above the straight line');
assert.equal(frames[1].offset,.45);
for(const frame of frames)assert.deepEqual(Object.keys(frame).filter(k=>!['transform','opacity','offset'].includes(k)),[],'transform/opacity only');
// A header that is off screen: the heart still ends inside the screen (16px from the edge).
assert.match(flightKeyframes(from,{left:320,top:-120,width:60,height:40},{viewportHeight:800})[2].transform,/translate\(35px,-599px\)/);

// flyHeart: onArrive always runs exactly once; nothing is left on the page.
function fakeDoc({animate=true}={}){
 const body={children:[],appendChild(el){this.children.push(el);el.parent=this}};
 const doc={body,defaultView:{innerHeight:800},created:[],createElement(){
  const el={style:{},attrs:{},kids:[],setAttribute(k,v){this.attrs[k]=v},appendChild(c){this.kids.push(c)},remove(){const i=body.children.indexOf(this);if(i>=0)body.children.splice(i,1)}};
  if(animate)el.animate=(keyframes,options)=>{el.run={keyframes,options};return el.run};
  doc.created.push(el);return el}};
 return doc;
}
const source={cloneNode:deep=>({clone:true,deep})};
let arrived=0;const onArrive=()=>{arrived++};
let timers=[];const schedule=(fn,ms)=>{timers.push({fn,ms})};

// "Reduce motion": no element, arrives at once.
arrived=0;let doc=fakeDoc();
assert.equal(flyHeart({from,to,source,doc,reduce:true,onArrive,schedule}),null);
assert.equal(arrived,1);assert.equal(doc.created.length,0);
// No Web Animations: no element left behind, arrives at once.
arrived=0;doc=fakeDoc({animate:false});
assert.equal(flyHeart({from,to,source,doc,reduce:false,onArrive,schedule}),null);
assert.equal(arrived,1);assert.equal(doc.body.children.length,0);
// Missing target (no header count): arrives at once.
arrived=0;doc=fakeDoc();
assert.equal(flyHeart({from,to:null,source,doc,reduce:false,onArrive,schedule}),null);
assert.equal(arrived,1);

// Normal flight: a fixed copy of the heart is added at the start point, animated, then removed.
arrived=0;timers=[];doc=fakeDoc();
const el=flyHeart({from,to,source,doc,reduce:false,duration:560,onArrive,schedule});
assert.ok(el);assert.equal(el.className,'fge-flying-heart');assert.equal(el.attrs['aria-hidden'],'true');
assert.deepEqual(el.style,{left:'300px',top:'600px',width:'30px',height:'30px'});
assert.deepEqual(el.kids,[{clone:true,deep:true}]);
assert.equal(doc.body.children.length,1);
assert.deepEqual(el.run.keyframes,flightKeyframes(from,to,{viewportHeight:800}));
assert.equal(el.run.options.duration,560);
assert.equal(arrived,0,'not before it lands');
el.run.onfinish();
assert.equal(arrived,1);assert.equal(doc.body.children.length,0);
// The safety timer (animation never finishing) ends it too, but never twice.
assert.equal(timers.length,1);assert.equal(timers[0].ms,810);
timers[0].fn();el.run.oncancel();
assert.equal(arrived,1);

// Album page wiring.
const album=await readFile('app/football-gallery/[slug]/event-client.jsx','utf8');
assert.match(album,/import \{flyHeart,headerState,(?:\w+,)*withViewTransition\} from '\.\.\/\.\.\/\.\.\/lib\/football-gallery-motion';/);
// The count is the favourites among the photos/videos listed now, so it matches what the filter shows.
assert.match(album,/const favCount=useMemo\(\(\)=>items\.reduce\(\(n,item\)=>n\+\(favorites\.includes\(item\.id\)\?1:0\),0\),\[items,favorites\]\);/);
assert.match(album,/const showFav=isMediaPage&&\(favCount>0\|\|filter==='favorites'\);/);
// The ♥ button sits in the header where the empty spacer was (no layout jump when it appears).
assert.match(album,/\{showFav\?<button type="button" ref=\{favChip\} className=\{'fge-fav-chip'\+\(filter==='favorites'\?' active':''\)\} aria-pressed=\{filter==='favorites'\} aria-label=\{'รายการโปรด '\+fmt\(favCount\)\+' รายการ'\} onClick=\{toggleFavFilter\}><Icon name="heart" size=\{16\} filled\/><span className="fge-fav-count" key=\{bump\} data-bump=\{bump\?'true':undefined\}>\{fmt\(favCount\)\}<\/span><\/button>:<span className="fge-nav-spacer"\/>\}/);
assert.match(album,/const toggleFavFilter=\(\)=>\{setFilter\(f=>f==='favorites'\?'all':'favorites'\);window\.scrollTo\(\{top:0,behavior:'instant'\}\)\};/);
// Only adding a favourite launches the heart (removing one does not), and the header comes back.
assert.match(album,/onClick=\{e=>\{const adding=!favorites\.includes\(item\.id\);toggleFav\(item\.id\);setPopFav\(item\.id\);if\(adding\)launchHeart\(e\.currentTarget\)\}\}/);
assert.match(album,/const launchHeart=button=>\{flight\.current=\{button,wasHidden:headingState\.current\.hidden\};revealHeading\(\)\};/);
// The flight starts after the render that shows the count; a header that was hidden is aimed at
// its resting place (top of the screen). Landing bumps the count.
assert.match(album,/to=trip\.wasHidden\?\{left:box\.left,top:chip\.offsetTop,width:box\.width,height:box\.height\}:box;/);
assert.match(album,/flyHeart\(\{from:trip\.button\.getBoundingClientRect\(\),to,source:trip\.button\.querySelector\('svg'\),onArrive:\(\)=>setBump\(n=>n\+1\)\}\)\},\[favorites\]\);/);

// Styles: the flying copy never takes taps; the count bumps; both are off for "reduce motion".
const page=await readFile('app/football-gallery/[slug]/event.css','utf8');
assert.match(page,/\.fge-flying-heart\{position:fixed;z-index:30;pointer-events:none;/);
assert.match(page,/\.fge-fav-chip\{[^}]*flex-shrink:0/);
assert.match(page,/\.fge-fav-chip\.active\{background:#303033;color:#fff\}/);
const css=await readFile('app/football-gallery/gallery-motion.css','utf8');
assert.match(css,/\.fge-fav-count\[data-bump="true"\]\{display:inline-block;animation:fg-count-bump \.4s cubic-bezier\(\.3,1\.6,\.5,1\)\}/);
assert.match(css,/@keyframes fg-count-bump\{35%\{scale:1\.45\}\}/);
const reduce=css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
assert.ok(reduce.includes('.fge-fav-count[data-bump="true"]'),'reduced motion covers the count bump');

console.log('football gallery favourite flight ok');
