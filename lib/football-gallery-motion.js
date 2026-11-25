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
