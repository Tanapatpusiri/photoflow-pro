# Football Gallery — ขั้นตอนตั้งค่าโครงสร้างจริงสำหรับ Production (อัปเดต 14 พ.ย. 2026)

## ขอบเขต
ใช้เฉพาะ GitHub repository `Tanapatpusiri/photoflow-pro` และ Vercel project `photoflow-pro` เดิมเท่านั้น
ห้ามสร้าง repository / Vercel project / URL ใหม่ และห้ามทับหน้า PhotoFlow Pro เดิมจนกว่า Football Gallery ผ่าน E2E บน Preview

## 1. สิ่งที่เจ้าของบัญชีต้องทำเอง (ระบบหรือ AI ทำแทนไม่ได้)
1. **Cloudflare R2**: เปิด R2 และอนุมัติ Billing แล้วสร้าง bucket ใหม่สำหรับงานนี้โดยเฉพาะ เช่น `fg-originals`
   - ห้ามเปิด Public access และห้ามผูก Public domain
   - สร้าง R2 API Token แบบ **Object Read & Write** และจำกัดให้ใช้ได้กับ bucket นี้เท่านั้น
2. **PostgreSQL เฉพาะโปรเจกต์นี้** เช่น Neon project ใหม่ **ห้ามใช้ฐานข้อมูล PJAA หรือของโปรเจกต์อื่น**
3. **Vercel Environment Variables** ทั้ง Production และ Preview ให้ใส่ผ่าน Dashboard เท่านั้น ห้ามส่งในแชทและห้าม commit

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | connection string ของฐานข้อมูลใหม่ | ควรใช้ pooled connection |
| `DATABASE_SSL` | เว้นว่าง (ค่าเริ่มต้นตรวจใบรับรอง) | ใส่ `disable` เฉพาะเครื่อง local |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | |
| `R2_BUCKET` | ชื่อ bucket | ตอนนี้รองรับชื่อสั้นแล้ว (เดิมชื่อ ≤12 ตัวอักษรทำให้ระบบปิดทั้งระบบ) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | จาก R2 API Token | |
| `FG_SESSION_SECRET` | สุ่มอย่างน้อย 32 bytes เช่น `openssl rand -hex 32` | ใช้เซ็น cookie และ hash รหัส ห้ามเปลี่ยนหลังเปิดใช้ (รหัส/ลิงก์เดิมจะใช้ไม่ได้) |
| `FG_ZIP_PART_BYTES` | (ไม่บังคับ) ค่าเริ่มต้น 1 GiB | ขนาดสูงสุดต่อไฟล์ ZIP หนึ่งชุด |
| `FG_VERIFY_STEP_BYTES` | (ไม่บังคับ) | จำกัดจำนวน byte ที่ตรวจ SHA-256 ต่อหนึ่งคำขอ |

## 2. ตั้งค่า CORS ของ R2 (จำเป็นสำหรับอัปโหลดจากเบราว์เซอร์)
Cloudflare Dashboard → R2 → bucket → Settings → CORS Policy

```json
[
  {
    "AllowedOrigins": ["https://photoflow-pro.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```
- ระหว่างทดสอบ Preview ให้เพิ่ม origin ของ Preview URL ชั่วคราว แล้วลบออกหลังทดสอบ
- ไม่ต้องเปิด GET ใน CORS เพราะรูปตัวอย่างโหลดผ่าน `<img>` และการดาวน์โหลดเป็นการเปิดลิงก์ปกติ
- ไม่ต้อง expose `ETag` เพราะเซิร์ฟเวอร์อ่านรายการ part จาก R2 เองตอนปิดงาน multipart

## 3. เตรียมฐานข้อมูล (ทำครั้งเดียวจากเครื่องที่เชื่อถือได้)
```bash
DATABASE_URL='...' node scripts/migrate-football-gallery.mjs
FG_ADMIN_EMAIL='owner@...' FG_ADMIN_PASSWORD='อย่างน้อย 14 ตัวอักษร' DATABASE_URL='...' node scripts/bootstrap-football-admin.mjs
```
- สคริปต์ migration รันไฟล์ `db/football_gallery_schema.sql`, `db/football_gallery_ingestion_extension.sql`, `db/football_gallery_003_production.sql` ตามลำดับ ครั้งละไฟล์ใน transaction และจดไว้ในตาราง `fg_schema_migrations` รันซ้ำได้อย่างปลอดภัย
- ลบรหัสผ่านออกจาก shell history / environment หลัง bootstrap

## 4. Background integrity worker (แนะนำ)
ไฟล์ทุกขนาดตรวจ SHA-256 ได้จากหน้า Admin อยู่แล้ว (ตรวจเป็นช่วง ๆ ต่อจากจุดเดิม) แต่ถ้าอัปโหลดทีละหลายพันไฟล์ ให้รัน worker จากเครื่องที่เชื่อถือได้เพื่อตรวจไฟล์ที่ค้างทั้งหมดโดยไม่จำกัดเวลา:
```bash
node --env-file=.env.worker scripts/verify-pending-originals.mjs --limit 5000
```
`.env.worker` ใช้ตัวแปรชุดเดียวกับ Vercel และต้องไม่ถูก commit

## 5. ทดสอบก่อน merge
1. Deploy Preview จาก branch นี้ (มี env ของ Preview แล้ว)
2. รัน migration + bootstrap กับฐานข้อมูลของ Preview
3. รันชุดทดสอบ E2E กับ Preview URL (ชุดทดสอบสร้างงานทดสอบเองและอัปโหลดไฟล์ทดสอบเข้า bucket):
```bash
FG_E2E_BASE='https://<preview-url>' FG_E2E_ADMIN_EMAIL='...' FG_E2E_ADMIN_PASSWORD='...' \
FG_E2E_MEDIA=/path/to/media FG_E2E_THUMBS=/path/to/thumbs node tests/football-gallery-e2e.mjs
```
   Preview ที่เปิด Vercel Authentication อยู่ ต้องใช้ Protection Bypass หรือทดสอบผ่านเบราว์เซอร์ที่ล็อกอิน Vercel แล้ว
4. ทดสอบด้วย iPhone จริง: Safari และ LINE in-app browser (เปิดลิงก์เชิญจากแชท LINE) รวมถึงดาวน์โหลด ZIP อย่างน้อย 1 ชุด

## 6. ข้อจำกัดของแพลตฟอร์มที่ต้องตัดสินใจ
- **Vercel Hobby** ใช้ได้เฉพาะงานที่ไม่ใช่เชิงพาณิชย์ ถ้าแกลเลอรีนี้ใช้กับธุรกิจช่างภาพ ควรย้ายเป็น Pro ก่อนเปิดใช้จริง
- **ZIP ผ่าน Vercel Function**: ไฟล์ ZIP ถูกสตรีมจาก R2 ผ่าน Function (route `archive/[jobId]/[part]`, `maxDuration=300`) ข้อมูลทุก byte นับเป็น bandwidth ของ Vercel และแต่ละชุดต้องดาวน์โหลดเสร็จภายในเวลาสูงสุดของ Function (ถ้าสะดุด กดชุดเดิมซ้ำจะทำต่อด้วย HTTP Range)
  - งานหนึ่งมีต้นฉบับหลายสิบถึงหลายร้อย GB ถ้าผู้ปกครองหลายคนกด "ดาวน์โหลดทั้งหมด" bandwidth จะสูงมาก
  - ทางที่แนะนำสำหรับปริมาณจริง: ย้าย route นี้ไปรันบน **Cloudflare Worker ที่ผูกกับ R2** (egress จาก R2 ไม่มีค่าใช้จ่าย และไม่มีข้อจำกัดเวลาแบบเดียวกัน) โมดูล `lib/football-gallery-zip.js` เขียนให้รันบน Worker ได้โดยไม่ต้องแก้ แต่ต้องสร้างไฟล์ config ของ Worker (`wrangler`) ซึ่งต้องได้รับอนุญาตจากเจ้าของก่อน
- **LINE in-app browser** บน iPhone ดาวน์โหลดไฟล์ใหญ่ได้ไม่เสถียร ระบบจึงสร้าง "ลิงก์สำหรับเปิดด้วย Safari/Chrome" (`?openExternalBrowser=1`) ให้ผู้ดูแลเลือกส่งได้ และหน้าดาวน์โหลดจะแสดงคำแนะนำเมื่อเปิดใน LINE

Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/get-started/s3/
