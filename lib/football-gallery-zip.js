// Deterministic "stored" (uncompressed) ZIP / ZIP64 writer for original files.
// Bytes are copied unchanged; CRC32 and sizes are known in advance (computed during
// integrity verification), so the archive length is exact, it can be streamed without
// buffering, and any byte range can be served (resumable downloads).
// Runtime-agnostic: only Uint8Array/DataView, so the same module can run in a Worker.

const U32=0xffffffff,U16=0xffff;
const enc=new TextEncoder();

function dosDateTime(date){
 const d=date instanceof Date&&!Number.isNaN(date.getTime())?date:new Date();
 const year=Math.min(Math.max(d.getUTCFullYear(),1980),2107);
 return {
  time:(d.getUTCHours()<<11)|(d.getUTCMinutes()<<5)|(Math.floor(d.getUTCSeconds()/2)),
  date:((year-1980)<<9)|((d.getUTCMonth()+1)<<5)|d.getUTCDate()
 };
}
class Writer{
 constructor(size){this.buf=new Uint8Array(size);this.view=new DataView(this.buf.buffer);this.pos=0}
 u16(v){this.view.setUint16(this.pos,v,true);this.pos+=2;return this}
 u32(v){this.view.setUint32(this.pos,v>>>0,true);this.pos+=4;return this}
 u64(v){this.view.setBigUint64(this.pos,BigInt(v),true);this.pos+=8;return this}
 bytes(b){this.buf.set(b,this.pos);this.pos+=b.length;return this}
}

// entries: [{name, size, crc32 (hex string or number), modified: Date, key?|data?: Uint8Array}]
// Returns {length, segments:[{start,end,kind:'bytes',data}|{start,end,kind:'object',key,size}]}
export function buildZipLayout(entries){
 const segments=[];let offset=0;const central=[];
 const push=(seg)=>{seg.start=offset;offset+=seg.kind==='bytes'?seg.data.length:seg.size;seg.end=offset;segments.push(seg)};
 for(const e of entries){
  const name=enc.encode(e.name),size=Number(e.size),crc=typeof e.crc32==='string'?parseInt(e.crc32,16):Number(e.crc32);
  if(!Number.isSafeInteger(size)||size<0||!Number.isInteger(crc))throw Error('Invalid zip entry '+e.name);
  const big=size>=U32,{time,date}=dosDateTime(e.modified),localOffset=offset;
  const header=new Writer(30+name.length+(big?20:0));
  header.u32(0x04034b50).u16(big?45:20).u16(0x0800).u16(0).u16(time).u16(date).u32(crc)
   .u32(big?U32:size).u32(big?U32:size).u16(name.length).u16(big?20:0).bytes(name);
  if(big)header.u16(0x0001).u16(16).u64(size).u64(size);
  push({kind:'bytes',data:header.buf});
  if(e.data)push({kind:'bytes',data:e.data});else push({kind:'object',key:e.key,size});
  central.push({name,size,crc,time,date,localOffset,big});
 }
 const cdStart=offset;
 for(const c of central){
  const needOffset=c.localOffset>=U32,extraLen=(c.big?16:0)+(needOffset?8:0);
  const w=new Writer(46+c.name.length+(extraLen?4+extraLen:0));
  w.u32(0x02014b50).u16(45).u16(c.big||needOffset?45:20).u16(0x0800).u16(0).u16(c.time).u16(c.date).u32(c.crc)
   .u32(c.big?U32:c.size).u32(c.big?U32:c.size).u16(c.name.length).u16(extraLen?4+extraLen:0).u16(0).u16(0).u16(0).u32(0)
   .u32(needOffset?U32:c.localOffset).bytes(c.name);
  if(extraLen){w.u16(0x0001).u16(extraLen);if(c.big)w.u64(c.size).u64(c.size);if(needOffset)w.u64(c.localOffset)}
  push({kind:'bytes',data:w.buf});
 }
 const cdSize=offset-cdStart,count=central.length;
 const zip64=count>=U16||cdStart>=U32||cdSize>=U32||central.some(c=>c.big||c.localOffset>=U32);
 const tail=new Writer((zip64?56+20:0)+22);
 if(zip64){
  const zip64Start=offset;
  tail.u32(0x06064b50).u64(44).u16(45).u16(45).u32(0).u32(0).u64(count).u64(count).u64(cdSize).u64(cdStart);
  tail.u32(0x07064b50).u32(0).u64(zip64Start).u32(1);
 }
 tail.u32(0x06054b50).u16(0).u16(0).u16(Math.min(count,U16)).u16(Math.min(count,U16)).u32(Math.min(cdSize,U32)).u32(Math.min(cdStart,U32)).u16(0);
 push({kind:'bytes',data:tail.buf});
 return {length:offset,segments};
}

// Streams bytes [start, end) of the archive. readObject(key, from, to) must return an
// async iterable of Uint8Array covering exactly bytes [from, to) of that stored object.
export function zipRangeStream(layout,start,end,readObject){
 const wanted=layout.segments.filter(s=>s.end>start&&s.start<end);
 let index=0,iterator=null,expected=0,received=0,current=null;
 return new ReadableStream({
  async pull(controller){
   try{
    while(true){
     if(iterator){
      const {value,done}=await iterator.next();
      if(!done){
       const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
       received+=bytes.length;
       if(received>expected)throw Error('Stored object longer than recorded for '+current.key);
       controller.enqueue(bytes);return;
      }
      if(received!==expected)throw Error('Stored object shorter than recorded for '+current.key);
      iterator=null;
     }
     if(index>=wanted.length){controller.close();return}
     const s=wanted[index++],from=Math.max(start,s.start)-s.start,to=Math.min(end,s.end)-s.start;
     if(s.kind==='bytes'){controller.enqueue(s.data.subarray(from,to));return}
     current=s;expected=to-from;received=0;
     const source=await readObject(s.key,from,to);
     iterator=(source[Symbol.asyncIterator]||source[Symbol.iterator]).call(source);
    }
   }catch(e){controller.error(e)}
  },
  async cancel(){try{await iterator?.return?.()}catch{}}
 });
}

// Parses a single "bytes=a-b" range against a known length; returns null for "whole file",
// or {start,end} (end exclusive), or false when unsatisfiable.
export function parseRange(header,length){
 if(!header)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
 if(!m||(m[1]===''&&m[2]===''))return false;
 let start,end;
 if(m[1]===''){const suffix=Number(m[2]);if(!suffix)return false;start=Math.max(0,length-suffix);end=length}
 else{start=Number(m[1]);end=m[2]===''?length:Math.min(length,Number(m[2])+1)}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=length||end<=start)return false;
 return {start,end};
}

export function uniqueNames(){
 const used=new Set();
 return name=>{
  let candidate=name,n=2;
  const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  while(used.has(candidate.toLowerCase()))candidate=`${stem} (${n++})${ext}`;
  used.add(candidate.toLowerCase());return candidate;
 };
}
