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
