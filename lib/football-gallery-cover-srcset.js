// Browser-safe helpers for album cover <img> tags (no server-only imports here).
// The cover route (/api/football-gallery/cover/[id]?w=) accepts exactly these widths.
export const COVER_WIDTHS=[360,540,720,1080];
const withWidth=(src,width)=>src+(src.includes('?')?'&':'?')+'w='+width;
export const coverSrc=(src,width=540)=>withWidth(src,width);
export const coverSrcSet=src=>COVER_WIDTHS.map(width=>withWidth(src,width)+' '+width+'w').join(', ');
// One slot size for both home layouts: the carousel card (80% of the .fg-shell track, which is at
// most 540px wide with a 5vw gutter; --card-width in home-v2.css). Grid cards are smaller, so they
// get the same crop and the layout switch never downloads a cover again.
export const COVER_SIZES='(min-width: 540px) 394px, 72vw';
