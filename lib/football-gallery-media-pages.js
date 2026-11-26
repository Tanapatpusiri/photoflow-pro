// Collects album media across /media list pages with as few requests as possible.
// Unlocked albums allow only so many list requests per visitor and per album (PUBLIC_LIMITS.list),
// so "เลือกทั้งหมด" and saving start from the pages the grid already listed and stop as soon as
// every wanted item is found.
// - listed / listedPages: items of this same listing already in hand (pages 1..listedPages).
// - complete: the last page is already listed.
// - wanted: ids to find; empty means every item of the listing.
// Returns the items in listing order, or null when isCurrent() turns false while loading.
export async function collectMedia({wanted=[],listed=[],listedPages=0,complete=false,loadPage,isCurrent=()=>true,maxPages=100000}){
 const want=new Set(wanted),found=new Map();
 const add=items=>{for(const item of items||[])if(!found.has(item.id))found.set(item.id,item)};
 add(listed);
 const done=()=>want.size?[...want].every(id=>found.has(id)):complete;
 let page=listedPages;
 while(!done()){
  if(++page>maxPages)throw Error('มีภาพจำนวนมากเกินกว่าจะโหลดในครั้งเดียว');
  const data=await loadPage(page);
  if(!isCurrent())return null;
  add(data?.items);
  if(!data?.hasMore)break;
 }
 const items=[...found.values()];
 return want.size?items.filter(item=>want.has(item.id)):items;
}
