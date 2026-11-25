// Fade photos in when they arrive (styles in app/football-gallery/gallery-motion.css).
// Only an image that is still loading is hidden: images already loaded (browser cache, or before
// React hydrates) and pages where JavaScript does not run are never hidden.
// Eager images are the first photos on screen and the LCP candidates. Hiding them would delay LCP
// by the whole fade (measured about +250 ms), so they only get the light sweep while loading.
export function watchImage(img){
 if(img&&!img.complete)img.dataset.fade=img.loading==='eager'?'loading':'pending';
}
export function imageShown(event){
 event.currentTarget.dataset.fade='done';
}
// A failed image stays hidden only while a retry with a new src is on its way; otherwise it is
// shown again so a broken tile never stays invisible.
export function imageFailed(event,retry){
 const img=event.currentTarget,before=img.src;
 retry?.(event);
 if(img.src===before)img.dataset.fade='done';
}
