const base='/football-gallery-face-model';
let loading;
function loadLibrary(){
 if(window.Human?.default)return Promise.resolve(window.Human.default);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=base+'/human.js';
  script.onload=()=>window.Human?.default?resolve(window.Human.default):reject(Error('เปิดระบบจัดกลุ่มใบหน้าไม่สำเร็จ'));
  script.onerror=()=>reject(Error('โหลดระบบจัดกลุ่มใบหน้าไม่สำเร็จ'));
  document.head.appendChild(script);
 }).catch(err=>{loading=null;throw err});
 return loading;
}
let model;
export async function faceModel(){
 const Human=await loadLibrary();
 if(!model)model=(async()=>{
  const options={
   modelBasePath:base+'/',cacheSensitivity:0,
   filter:{enabled:false},
   face:{enabled:true,detector:{maxDetected:20,minConfidence:0.55,rotation:true,skipFrames:0,skipTime:0},mesh:{enabled:true},
    iris:{enabled:false},description:{enabled:true,skipFrames:0,skipTime:0},emotion:{enabled:false},antispoof:{enabled:false},liveness:{enabled:false}},
   body:{enabled:false},hand:{enabled:false},gesture:{enabled:false},object:{enabled:false},segmentation:{enabled:false}
  };
  for(const backend of ['webgl','cpu']){
   try{const human=new Human({...options,backend});await human.load();return human}
   catch(err){if(backend==='cpu')throw err}
  }
 })().catch(err=>{model=null;throw err});
 return model;
}

export function addFaces(groups,faces,photo,similarity,portrait){
 for(const face of faces){
  if(!face.embedding?.length||!face.box||Math.min(face.box[2],face.box[3])<26)continue;
  let best=null,score=0,runnerUp=0;
  for(const group of groups){
   if(group.photos.has(photo.id))continue;
   const current=Math.max(...group.samples.map(sample=>similarity(sample,face.embedding)));
   if(current>score){runnerUp=score;score=current;best=group}
   else runnerUp=Math.max(runnerUp,current);
  }
  if(!best||score<0.67||score-runnerUp<0.06){
   groups.push({id:groups.length+1,portrait:portrait(face.box),photos:new Map([[photo.id,photo]]),samples:[face.embedding]});
  }else{
   best.photos.set(photo.id,photo);
   if(best.samples.length<4&&score>=0.75)best.samples.push(face.embedding);
  }
 }
}
