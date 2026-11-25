// Small motion helpers for Football Gallery UI (styles in app/football-gallery/gallery-motion.css).
export const prefersReducedMotion=()=>typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Close something with an exit animation without ever depending on the animation running:
// start() shows the exit state, and a timer always calls finish(). With "reduce motion" it
// finishes at once. A missing stylesheet or a skipped animation can never leave it stuck open.
export function animatedClose({reduce,start,finish,ms=200,schedule=setTimeout}){
 if(reduce){finish();return null}
 start();
 return schedule(finish,ms);
}

// Run a DOM update inside a View Transition where the browser supports it and motion is allowed.
// Otherwise (no support, "reduce motion", or starting one fails) the update simply runs now, so an
// animation can never block opening a photo. A skipped transition is not reported as an error.
export function withViewTransition(update,{reduce=prefersReducedMotion(),doc=typeof document==='undefined'?null:document}={}){
 if(reduce||typeof doc?.startViewTransition!=='function'){update();return null}
 try{
  const transition=doc.startViewTransition(update);
  transition?.ready?.catch(()=>{});
  transition?.finished?.catch(()=>{});
  return transition;
 }catch{update();return null}
}

// Favourite added: a copy of the heart flies from the tapped button to the ♥ count in the album
// header along a small arc (transform/opacity only). The end point is kept inside the screen.
export function flightKeyframes(from,to,{viewportHeight=Infinity}={}){
 const centre=r=>[r.left+r.width/2,r.top+r.height/2];
 const [x0,y0]=centre(from),[x1,raw]=centre(to);
 const y1=Math.min(Math.max(raw,16),viewportHeight-16);
 const dx=Math.round(x1-x0),dy=Math.round(y1-y0),lift=Math.round(Math.min(60,24+Math.abs(dy)/4));
 return [
  {transform:'translate(0px,0px) scale(1)',opacity:1},
  {transform:'translate('+Math.round(dx/2)+'px,'+(Math.round(dy/2)-lift)+'px) scale(1.2)',opacity:1,offset:.45},
  {transform:'translate('+dx+'px,'+dy+'px) scale(.5)',opacity:.6}
 ];
}

// Runs the flight and always ends it: onArrive is called exactly once, when the animation ends or
// is cancelled, or by a safety timer. With "reduce motion", no Web Animations or nothing to aim at,
// it arrives at once and nothing is added to the page.
export function flyHeart({from,to,source,doc=typeof document==='undefined'?null:document,reduce=prefersReducedMotion(),duration=560,schedule=setTimeout,onArrive=()=>{}}){
 if(reduce||!doc?.body||!from||!to||!source){onArrive();return null}
 const el=doc.createElement('span');
 if(typeof el.animate!=='function'){onArrive();return null}
 el.className='fge-flying-heart';el.setAttribute('aria-hidden','true');
 Object.assign(el.style,{left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px'});
 el.appendChild(source.cloneNode(true));doc.body.appendChild(el);
 let done=false;const finish=()=>{if(done)return;done=true;el.remove();onArrive()};
 try{
  const run=el.animate(flightKeyframes(from,to,{viewportHeight:doc.defaultView?.innerHeight??Infinity}),{duration,easing:'cubic-bezier(.45,0,.25,1)',fill:'forwards'});
  run.onfinish=finish;run.oncancel=finish;
 }catch{finish();return null}
 schedule(finish,duration+250);
 return el;
}

// Sticky album header: hidden while scrolling down (below hideAfter), shown again on any scroll up.
// Movements up to jitter px from the last turning point change nothing, so a resting finger or
// momentum wobble never flips it, while slow scrolling still adds up.
export function headerState({y,anchor,hidden},{hideAfter=120,jitter=8}={}){
 if(y<=hideAfter)return {hidden:false,scrolled:y>4,anchor:y};
 if(Math.abs(y-anchor)<=jitter)return {hidden,scrolled:true,anchor};
 return {hidden:y>anchor,scrolled:true,anchor:y};
}
