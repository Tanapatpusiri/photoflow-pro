import sharp from 'sharp';
import {COVER_WIDTHS} from './football-gallery-cover-srcset.js';

// Album cards on the home page are 2:3 portraits. The browser picks one of these widths from
// srcset and the server sends a centred 2:3 crop of that size, so a phone never downloads a
// 1600 px upload for a 160 px card. The cover file in Drive/R2 is never changed.
export {COVER_WIDTHS};
const MAX_INPUT_PIXELS=40_000_000;

// null: no width asked (the old redirect). false: a width the home page never asks for.
export function coverWidth(value){
 if(value===null||value===undefined)return null;
 const width=Number(value);
 return COVER_WIDTHS.includes(width)&&String(width)===String(value)?width:false;
}

export async function coverVariant(input,width){
 const image=sharp(input,{limitInputPixels:MAX_INPUT_PIXELS});
 const meta=await image.metadata();
 // EXIF orientations 5-8 are rotated by 90 degrees, so the visible width is the stored height.
 const [w,h]=meta.orientation>=5?[meta.height,meta.width]:[meta.width,meta.height];
 // Largest centred 2:3 window the source can fill; only ever shrink from there.
 const cropW=Math.min(w,Math.floor(h*2/3)),cropH=Math.min(h,Math.floor(w*3/2));
 let outW=Math.min(width,cropW),outH=Math.round(outW*3/2);
 if(outH>cropH){outH=cropH;outW=Math.round(outH*2/3)}
 return image.rotate().resize(outW,outH,{fit:'cover',position:'centre'}).jpeg({quality:78,mozjpeg:true}).toBuffer();
}
