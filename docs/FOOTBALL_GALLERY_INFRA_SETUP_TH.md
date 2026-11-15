# Football Gallery — ขั้นตอนตั้งค่าโครงสร้างจริงสำหรับ Production (อัปเดต 14 พ.ย. 2026)

## ขอบเขต
ใช้เฉพาะ GitHub repository `Tanapatpusiri/photoflow-pro` และ Vercel project `photoflow-pro` เดิมเท่านั้น
ห้ามสร้าง repository / Vercel project / URL ใหม่ และห้ามทับหน้า PhotoFlow Pro เดิมจนกว่า Football Gallery ผ่าน E2E บน Preview

## ภาพรวมที่เก็บไฟล์ (เลือกด้วย `FG_STORAGE`)
| โหมด | ต้นฉบับเก็บที่ | ใครส่ง byte ของไฟล์ | สถานะ |
|---|---|---|---|
| `FG_STORAGE=drive` (หลัก) | Google Drive ของเจ้าของ (Google One) โฟลเดอร์ส่วนตัวที่แอปสร้าง | อัปโหลด: เบราว์เซอร์ → Google โดยตรง · ดาวน์โหลด/ZIP/ภาพตัวอย่าง: Cloudflare Worker (แผนฟรี) | ผ่าน E2E 129 ข้อบน Google/Worker จำลองในเครื่อง ยังไม่ทดสอบกับบัญชี Google จริง |
| ไม่ตั้ง (ค่าเริ่มต้น) | Cloudflare R2 / S3 แบบ private | อัปโหลด: เบราว์เซอร์ → R2 · ZIP: Vercel Function | ผ่าน E2E 120 ข้อ (ต้องเปิด R2 ซึ่งต้องผูกบัตร) |

Vercel ไม่ส่ง byte ของไฟล์ต้นฉบับในโหมด Drive จึงไม่กินโควตา Fast Origin Transfer 10 GB ของ Hobby

## 1. สิ่งที่เจ้าของบัญชีต้องทำเอง (ระบบหรือ AI ทำแทนไม่ได้)

### 1.1 Google Cloud (ฟรี)
1. https://console.cloud.google.com → สร้าง Project ใหม่ เช่น `photoflow-football-gallery` (ใช้บัญชี Google เดียวกับ Drive ที่จะเก็บไฟล์)
2. APIs & Services → Library → เปิด **Google Drive API**
3. APIs & Services → OAuth consent screen
   - User type: **External** · App name: Football Gallery · ใส่อีเมลติดต่อ
   - Scopes: เพิ่ม **`https://www.googleapis.com/auth/drive.file`** อย่างเดียว (แอปเห็นเฉพาะไฟล์ที่แอปสร้าง ไม่เห็นไฟล์อื่นใน Drive และเป็น scope แบบ non-sensitive จึงไม่ต้องผ่านการตรวจของ Google)
   - Publishing status: กด **Publish app → In production** (ถ้าค้างเป็น Testing สิทธิ์จะหมดอายุทุก 7 วันและระบบอัปโหลด/ดาวน์โหลดจะหยุด)
4. APIs & Services → Credentials → Create credentials → **OAuth client ID** → Web application
   - Authorized redirect URIs:
     - `https://photoflow-pro.vercel.app/api/football-gallery/admin/google/callback`
     - (ทดสอบ Preview) `https://<preview-branch-url>/api/football-gallery/admin/google/callback`
   - เก็บ Client ID และ Client secret ไว้ใส่ใน Vercel (ห้ามส่งในแชท ห้าม commit)

### 1.2 Cloudflare Worker สำหรับดาวน์โหลด (แผนฟรี ไม่ต้องผูกบัตร)
ทำจากเครื่องของเจ้าของ (ต้องล็อกอิน Cloudflare):
```bash
cd workers/football-gallery-download
npx wrangler login
npx wrangler secret put FG_DOWNLOAD_SECRET      # ค่าเดียวกับใน Vercel (สุ่มใหม่ด้วย openssl rand -hex 32)
npx wrangler deploy                              # ได้ URL แบบ https://football-gallery-download.<subdomain>.workers.dev
```
- Worker ไม่มี refresh token ของ Google และไม่มีสิทธิ์ฐานข้อมูล ทุกครั้งที่ดาวน์โหลดต้นฉบับหรือ ZIP Worker จะถามแอปว่าลิงก์ยังใช้ได้ไหม (คำเชิญถูกยกเลิก/ถอดภาพแล้ว ลิงก์ที่ออกไปก่อนหน้าจะใช้ไม่ได้ทันที)
- ภาพตัวอย่างใช้ลิงก์ที่เซ็นแล้วอายุ 15 นาที

### 1.3 PostgreSQL เฉพาะโปรเจกต์นี้
Neon project `super-butterfly-50034316` ฐานข้อมูล `football_gallery` (สร้างไว้แล้ว ใช้เฉพาะงานนี้ ห้ามใช้ฐานข้อมูล PJAA หรือของโปรเจกต์อื่น)
แนะนำให้สร้าง Neon branch แยกสำหรับ Preview เพื่อไม่ให้ข้อมูลทดสอบปนกับของจริง

### 1.4 Vercel Environment Variables (ใส่ผ่าน Dashboard เท่านั้น)
| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `FG_STORAGE` | `drive` | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | จากข้อ 1.1 | |
| `FG_DOWNLOAD_BASE` | URL ของ Worker จากข้อ 1.2 | ไม่มี `/` ท้าย |
| `FG_DOWNLOAD_SECRET` | ค่าเดียวกับ secret ของ Worker | อย่างน้อย 32 ตัวอักษร |
| `DATABASE_URL` | connection string (pooled) | |
| `FG_SESSION_SECRET` | สุ่มอย่างน้อย 32 bytes | ใช้เซ็น cookie, เข้ารหัส refresh token ของ Google ใน DB ห้ามเปลี่ยนหลังเปิดใช้ (ถ้าเปลี่ยนต้องเชื่อม Drive ใหม่) |
| `FG_ZIP_PART_BYTES` | (ไม่บังคับ) ค่าเริ่มต้น 1 GiB | |
| `FG_ZIP_MAX_FILES` | (ไม่บังคับ) ค่าเริ่มต้น 45 ในโหมด Drive | Worker แผนฟรีเรียก Google ได้ 50 ครั้งต่อคำขอ ถ้าอัปเกรด Workers Paid ปรับเพิ่มได้ |

Settings → Functions → Function Region: เลือก `sin1` (Singapore) ให้ใกล้ผู้ใช้และ Neon

### 1.5 เชื่อม Google Drive (ครั้งเดียว)
หลัง deploy: เข้า `/football-gallery/admin` ด้วยบัญชีเจ้าของ → การ์ด "ที่เก็บต้นฉบับ · Google Drive" → **เชื่อม Google Drive** → เลือกบัญชี Google One → อนุญาต
ระบบสร้างโฟลเดอร์ "Football Gallery (PhotoFlow Pro)" และโฟลเดอร์ย่อยต่อหนึ่งงาน **ห้ามแชร์โฟลเดอร์นี้และห้ามแก้ไข/ย้ายไฟล์ด้วยมือ**

## 2. เตรียมฐานข้อมูล
```bash
DATABASE_URL='...' node scripts/migrate-football-gallery.mjs
FG_ADMIN_EMAIL='owner@...' FG_ADMIN_PASSWORD='อย่างน้อย 14 ตัวอักษร' DATABASE_URL='...' node scripts/bootstrap-football-admin.mjs
```
- migration รัน `db/football_gallery_schema.sql`, `..._ingestion_extension.sql`, `..._003_production.sql`, `..._004_google_drive.sql`, `..._005_retention_deletion.sql` ตามลำดับ รันซ้ำได้อย่างปลอดภัย (005 จำเป็นสำหรับการตั้งระยะเวลาเก็บและการตรวจลบ)
- ลบรหัสผ่านออกจาก shell history หลัง bootstrap

## 3. การตรวจความครบถ้วนของไฟล์ในโหมด Drive
- เบราว์เซอร์คำนวณ SHA-256 และ CRC32 ก่อนอัปโหลด แล้วส่ง byte ตรงไป Google แบบ resumable (ชิ้นละ 8 MiB) ถ้าเน็ตหลุด ระบบถาม Google ว่าได้ไปกี่ byte แล้วส่งต่อจากจุดนั้น
- หลังอัปโหลด เซิร์ฟเวอร์เทียบ `sha256Checksum` ที่ Google คำนวณจากไฟล์ที่เก็บจริงกับค่าที่ประกาศ ไม่ตรง = ไม่ให้เผยแพร่
- ZIP ใช้ CRC32 ที่เบราว์เซอร์ผู้ดูแลคำนวณจาก byte ชุดเดียวกับที่ยืนยัน SHA-256 และทุก ZIP มี `SHA256SUMS.txt` ให้ตรวจซ้ำ

## 4. ทดสอบก่อน merge
1. Deploy Preview จาก branch นี้ + env ของ Preview + Worker ของ Preview (`npx wrangler deploy --env preview --var FG_APP_ORIGIN:https://<preview-branch-url>`)
   ถ้า Preview เปิด Vercel Authentication ต้องใส่ `wrangler secret put VERCEL_PROTECTION_BYPASS --env preview` (Protection Bypass for Automation)
2. รัน migration + bootstrap กับฐานข้อมูลของ Preview แล้วเชื่อม Google Drive ในหน้า Admin ของ Preview
3. รันชุดทดสอบ (ตรวจโหมดจาก `/admin/google` เอง):
```bash
FG_E2E_BASE='https://<preview-url>' FG_E2E_ADMIN_EMAIL='...' FG_E2E_ADMIN_PASSWORD='...' \
FG_E2E_MEDIA=/path/to/media FG_E2E_THUMBS=/path/to/thumbs node tests/football-gallery-e2e.mjs
```
   (กับ Google จริง ขั้น "เชื่อม Drive" ต้องกดอนุญาตเองในเบราว์เซอร์ก่อน)
4. iPhone จริง: Safari และ LINE in-app browser (เปิดลิงก์เชิญจากแชท LINE) ดาวน์โหลดรูปต้นฉบับ วิดีโอ และ ZIP อย่างน้อย 1 ชุด

## 5. ข้อจำกัดที่ต้องรู้
- **Vercel Hobby** ใช้ได้เฉพาะงานที่ไม่ใช่เชิงพาณิชย์ ถ้าใช้กับธุรกิจช่างภาพ ควรย้ายเป็น Pro
- **Google Drive**: จำกัดอัปโหลด 750 GB ต่อวันต่อบัญชี และ Google อาจจำกัดการดาวน์โหลดไฟล์เดียวกันที่ถูกโหลดถี่มากชั่วคราว (ระบบแสดงข้อความให้ลองใหม่)
- **Worker แผนฟรี**: 100,000 คำขอต่อวัน และ ZIP หนึ่งชุดมีได้ไม่เกิน 45 ไฟล์ ดาวน์โหลดทั้งงานที่มีหลายพันไฟล์จึงแบ่งเป็นหลายชุด (ทยอยกดทีละชุด หรือดาวน์โหลดเฉพาะลูกตัวเอง) CPU 10 ms ต่อคำขอของแผนฟรีต้องยืนยันบน Cloudflare จริง เพราะเครื่องจำลองไม่บังคับขีดจำกัดนี้
- **LINE in-app browser** บน iPhone ดาวน์โหลดไฟล์ใหญ่ได้ไม่เสถียร ระบบจึงมีลิงก์ "เปิดด้วย Safari/Chrome" (`?openExternalBrowser=1`)

## ภาคผนวก: โหมด Cloudflare R2 (ถ้าเปิด R2 ได้ภายหลัง)
ไม่ตั้ง `FG_STORAGE` แล้วใส่ `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (token แบบ Object Read & Write จำกัด bucket เดียว ห้ามเปิด Public)
CORS ของ bucket: AllowedOrigins = URL ของแอป, AllowedMethods = `PUT`, AllowedHeaders = `content-type`
ในโหมดนี้ ZIP ถูกสตรีมผ่าน Vercel Function (นับเป็น bandwidth ของ Vercel) ห้ามสลับโหมดหลังมีไฟล์จริงแล้วโดยไม่ทดสอบก่อน

อ้างอิง: Google Drive resumable upload https://developers.google.com/workspace/drive/api/guides/manage-uploads · Cloudflare Workers limits https://developers.cloudflare.com/workers/platform/limits/
