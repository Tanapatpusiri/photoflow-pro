// Minimal, read-only EXIF probe used in the admin browser before upload.
// It never modifies the file: it only reports whether a GPS IFD exists (privacy review)
// and the capture time (gallery ordering). Supports JPEG and TIFF-based RAW
// (ARW, CR2, NEF, DNG, PEF, SRW, 3FR, IIQ, and ORF/RW2 variants of the TIFF header).
const TIFF_MAGIC=new Set([42,0x4f52,0x5352,0x55]); // TIFF, ORF ("RO"/"SR"), RW2 (0x55)

function readTiff(view,base){
 if(base+8>view.byteLength)return null;
 const order=view.getUint16(base);
 const le=order===0x4949;if(!le&&order!==0x4d4d)return null;
 const u16=o=>view.getUint16(base+o,le),u32=o=>view.getUint32(base+o,le);
 if(!TIFF_MAGIC.has(u16(2)))return null;
 const ifd=offset=>{
  const entries=new Map();
  if(base+offset+2>view.byteLength)return entries;
  const n=u16(offset);
  for(let i=0;i<n&&i<500;i++){
   const at=offset+2+i*12;if(base+at+12>view.byteLength)break;
   entries.set(u16(at),{type:u16(at+2),count:u32(at+4),valueAt:at+8});
  }
  return entries;
 };
 const ascii=e=>{
  if(!e||e.type!==2)return null;
  const at=e.count>4?u32(e.valueAt):e.valueAt;
  if(base+at+e.count>view.byteLength)return null;
  let s='';for(let i=0;i<e.count-1;i++)s+=String.fromCharCode(view.getUint8(base+at+i));
  return s;
 };
 const ifd0=ifd(u32(4));
 let date=null;
 const exifPtr=ifd0.get(0x8769);
 if(exifPtr){const sub=ifd(u32(exifPtr.valueAt));date=ascii(sub.get(0x9003))||ascii(sub.get(0x9004))}
 date=date||ascii(ifd0.get(0x0132));
 return {hasGps:ifd0.has(0x8825),capturedAt:exifDate(date)};
}
function exifDate(s){
 const m=/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s||'');
 if(!m||m[1]==='0000')return null;
 // EXIF times carry no zone; they are stored as written by the camera for ordering only.
 const iso=`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
 return Number.isNaN(Date.parse(iso))?null:iso;
}
// bytes: Uint8Array of the first ~256 KB of the file.
export function probeExif(bytes){
 try{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.byteLength>4&&view.getUint16(0)===0xffd8){
   let p=2;
   while(p+4<=view.byteLength){
    if(view.getUint8(p)!==0xff)break;
    const marker=view.getUint8(p+1),len=view.getUint16(p+2);
    if(marker===0xe1&&p+10<view.byteLength&&view.getUint32(p+4)===0x45786966)return readTiff(view,p+10)||{hasGps:false,capturedAt:null};
    if(marker===0xda||marker===0xd9)break;
    p+=2+len;
   }
   return {hasGps:false,capturedAt:null};
  }
  return readTiff(view,0); // TIFF-based RAW; null when the format is not understood
 }catch{return null}
}
