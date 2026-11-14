import {storageDriver} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {driveStatus,disconnect} from '../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Storage status for the admin page: which driver is active and whether Google Drive is connected.
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 if(storageDriver()!=='drive')return reply({driver:'s3'});
 try{return reply({driver:'drive',...await driveStatus()})}
 catch(e){console.error('fg drive status',e?.code||'unknown');return reply({driver:'drive',connected:false,error:'DRIVE_STATUS_FAILED'})}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของระบบเท่านั้น'},403);
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(d?.action!=='disconnect')return reply({message:'คำสั่งไม่ถูกต้อง'},400);
 await disconnect();
 await audit(null,{adminId:admin.id,action:'storage.drive-disconnected'});
 return reply({ok:true});
}
