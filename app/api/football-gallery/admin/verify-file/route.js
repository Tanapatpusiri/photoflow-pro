import {isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
import {verifyStep} from '../../../../../lib/football-gallery-integrity';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Each call hashes up to ~40 s of the stored original and returns 202 with progress until finished.
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let body;try{body=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(body?.fileId))return send({message:'ไฟล์ไม่ถูกต้อง'},400);
 try{
  // FG_VERIFY_STEP_BYTES optionally caps bytes hashed per call (bounds function time on slow storage).
  const r=await verifyStep(body.fileId,{budgetMs:40000,maxBytes:Number(process.env.FG_VERIFY_STEP_BYTES)||Infinity});
  if(r.status===404)return send({message:'ไม่พบไฟล์ต้นฉบับ'},404);
  if(r.reason==='NOT_UPLOADED')return send({message:'ไฟล์ยังอัปโหลดไม่เสร็จ'},409);
  if(r.done)await audit(null,{adminId:admin.id,eventId:r.eventId,action:r.verified?'original.integrity-verified':'original.integrity-failed',resourceId:body.fileId,detail:{bytes:r.bytes}});
  return send({done:r.done,verified:!!r.verified,offset:r.offset??r.bytes,bytes:r.bytes,sha256:r.sha256||null},r.status);
 }catch(err){console.error('fg integrity streaming',err?.name||err?.code||'unknown');return send({message:'ตรวจสอบไฟล์ไม่สำเร็จ กรุณาลองใหม่ ระบบจะทำต่อจากจุดเดิม'},503)}
}
