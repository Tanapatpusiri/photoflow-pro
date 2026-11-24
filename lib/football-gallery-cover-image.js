import sharp from 'sharp';

const MAX_BYTES=8_000_000;
const MAX_PIXELS=24_000_000;

export async function coverVariant(response,width){
 if(!response.ok||!response.body||Number(response.headers.get('content-length'))>MAX_BYTES){
  await response.body?.cancel();
  throw Error('Cover source unavailable');
 }
 const reader=response.body.getReader();
 const chunks=[];
 let bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>MAX_BYTES){
    await reader.cancel();
    throw Error('Cover source too large');
   }
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const jpeg=Buffer.concat(chunks,bytes);
 if(jpeg[0]!==0xff||jpeg[1]!==0xd8||jpeg[2]!==0xff)throw Error('Invalid JPEG cover');
 return sharp(jpeg,{limitInputPixels:MAX_PIXELS})
  .rotate()
  .resize(width,width*4/3,{fit:'cover',withoutEnlargement:true})
  .webp({quality:74})
  .toBuffer();
}
