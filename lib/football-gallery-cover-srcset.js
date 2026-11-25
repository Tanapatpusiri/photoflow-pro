// Browser-safe helpers for album cover <img> tags (no server-only imports here).
// The cover route (/api/football-gallery/cover/[id]?w=) accepts exactly these widths.
export const COVER_WIDTHS=[360,540,720,1080];
const withWidth=(src,width)=>src+(src.includes('?')?'&':'?')+'w='+width;
export const coverSrc=(src,width=540)=>withWidth(src,width);
export const coverSrcSet=src=>COVER_WIDTHS.map(width=>withWidth(src,width)+' '+width+'w').join(', ');
// .fg-shell is at most 540px wide with a 5vw gutter. Cards sit in two grid columns, or in the
// horizontal carousel at 80% of the track (--card-width in home-v2.css).
export const coverSizes=carousel=>carousel?'(min-width: 540px) 394px, 72vw':'(min-width: 540px) 238px, 44vw';
