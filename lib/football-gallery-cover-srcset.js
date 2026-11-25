// Browser-safe helpers for album cover <img> tags (no server-only imports here).
// The cover route (/api/football-gallery/cover/[id]?w=) accepts exactly these widths.
export const COVER_WIDTHS=[360,540,720,1080];
const withWidth=(src,width)=>src+(src.includes('?')?'&':'?')+'w='+width;
export const coverSrc=(src,width=540)=>withWidth(src,width);
export const coverSrcSet=src=>COVER_WIDTHS.map(width=>withWidth(src,width)+' '+width+'w').join(', ');
// .fg-shell is at most 540px wide with 5vw side padding; cards sit in two columns, or one.
export const coverSizes=single=>single?'(min-width: 540px) 492px, 90vw':'(min-width: 540px) 238px, 44vw';
