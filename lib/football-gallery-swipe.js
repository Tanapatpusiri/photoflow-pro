// Photo detail swipe (album page): where a horizontal drag on the photo goes.
// Returns 1 for the next photo (drag left), -1 for the previous one (drag right), 0 to stay.
// A drag counts when it is mostly horizontal and either long enough (a share of the photo width)
// or quick enough (a flick); tiny twitches and moves past the first/last photo never count.
export function swipeStep({dx,dy=0,ms,width,index,count},{distance=.2,speed=.45,minDx=24}={}){
 if(index<0||Math.abs(dx)<minDx||Math.abs(dx)<Math.abs(dy))return 0;
 const far=Math.abs(dx)>=width*distance,fast=Math.abs(dx)/Math.max(ms,1)>=speed;
 if(!far&&!fast)return 0;
 const step=dx<0?1:-1,next=index+step;
 return next>=0&&next<count?step:0;
}

// While dragging the photo follows the finger, with resistance where there is nothing to go to.
export function dragOffset(dx,{atStart,atEnd}){
 if((dx>0&&atStart)||(dx<0&&atEnd))return Math.round(dx/3);
 return dx;
}

// Zoom on the photo detail (double tap or pinch, then one finger pans).
// State: transform = translate(x, y) scale(scale) with the origin at the frame centre; points are
// relative to the frame centre. Never smaller than the frame, never panned past the photo's edges.
export const MAX_ZOOM=4;
export function clampZoom({scale,x,y},{width,height}){
 if(scale<=1)return {scale:1,x:0,y:0};
 const mx=(scale-1)*width/2,my=(scale-1)*height/2;
 return {scale,x:Math.max(-mx,Math.min(mx,x)),y:Math.max(-my,Math.min(my,y))};
}
// New scale with the screen point p kept under the finger.
export function zoomAround(z,scale,p,box){
 const s=Math.max(1,Math.min(MAX_ZOOM,scale)),qx=(p.x-z.x)/z.scale,qy=(p.y-z.y)/z.scale;
 return clampZoom({scale:s,x:p.x-s*qx,y:p.y-s*qy},box);
}
// Double tap: 2.5x at the tapped point, or back to 1x.
export const zoomToggle=(z,p,box)=>z.scale>1?{scale:1,x:0,y:0}:zoomAround(z,2.5,p,box);
// Pinch: scale follows the finger distance, anchored at the starting midpoint and following it.
export function pinchZoom(z0,{d0,d,m0,m},box){
 const s=Math.max(1,Math.min(MAX_ZOOM,z0.scale*d/Math.max(d0,1))),qx=(m0.x-z0.x)/z0.scale,qy=(m0.y-z0.y)/z0.scale;
 return clampZoom({scale:s,x:m.x-s*qx,y:m.y-s*qy},box);
}
export const panZoom=(z0,{dx,dy},box)=>clampZoom({scale:z0.scale,x:z0.x+dx,y:z0.y+dy},box);

// Swipe down to close: the photo shrinks a little while dragged (not below 75%); a long or quick
// enough drag closes it.
export const dismissScale=dy=>Math.max(.75,1-dy/800);
export function shouldDismiss({dy,ms},{distance=110,speed=.5}={}){
 return dy>=distance||(dy>=30&&dy/Math.max(ms,1)>=speed);
}
