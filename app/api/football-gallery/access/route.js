import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function POST(request){
 const length=Number(request.headers.get('content-length')||0);
 if(length>1024) return NextResponse.json({message:'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป'},{status:413,headers:{'Cache-Control':'no-store'}});
 let body;
 try{body=await request.json()}catch{return NextResponse.json({message:'รูปแบบคำขอไม่ถูกต้อง'},{status:400,headers:{'Cache-Control':'no-store'}})}
 const code=typeof body?.code==='string'?body.code.trim():'';
 if(code.length<4 || code.length>100) return NextResponse.json({message:'กรุณาตรวจสอบรหัสอัลบั้ม'},{status:400,headers:{'Cache-Control':'no-store'}});
 // Fail closed: never accept a code until an authorized database-backed
 // event-grant service, revocation checks and rate limits are configured.
 return NextResponse.json({message:'ระบบอัลบั้มส่วนตัวยังไม่เปิดให้เข้าชม กรุณาติดต่อผู้ดูแล'},{status:503,headers:{'Cache-Control':'no-store'}});
}
