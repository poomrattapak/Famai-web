# สำรองข้อมูล (บรีฟรอบ 1 · A2)

ยังไม่ได้สมัคร Supabase Pro จึงไม่มี backup อัตโนมัติ — ใช้สคริปต์นี้แทนไปก่อน

## สำรอง

```bash
SUPABASE_URL=https://hpsmjavfvrdctclmlmhp.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx \
node tools/backup/backup.js
```

- ได้ `backups/<วันที่ พ.ศ.>/<ตาราง>.json` ครบทุกตาราง + `_manifest.json` นับแถว
- คีย์ `service_role` เอาจาก Supabase Dashboard → Settings → API — **ส่งผ่าน env เท่านั้น
  ห้ามพิมพ์ลงไฟล์ ห้าม commit** (ข้ามผ่าน RLS ได้ทั้งฐาน ใครได้ไปคือได้ทุกอย่าง)
- โฟลเดอร์ `backups/` อยู่ใน `.gitignore` แล้ว — ข้อมูลลูกค้าห้ามขึ้น GitHub
- แนะนำรันวันละครั้งหลังปิดร้าน แล้วก๊อปโฟลเดอร์ไปเก็บอีกเครื่อง/ไดรฟ์

## กู้คืน (ทีละตาราง)

ไฟล์อยู่ในรูปแถวของ REST ตรง ๆ จึงยิงกลับได้ด้วย upsert เรียงตามลำดับไฟล์ใน manifest
(ลำดับใน `TABLES` ของสคริปต์เรียงตาม FK แล้ว — บริษัทก่อนสาขา สาขาก่อนรถ ฯลฯ):

```bash
curl -X POST "$SUPABASE_URL/rest/v1/branch?on_conflict=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=minimal" \
  --data @backups/2569-08-14/branch.json
```

## สิ่งที่สคริปต์นี้ยังไม่ครอบ

- ไฟล์ใน Storage (รูปรุ่นรถ bucket `model-photo` · รูปลงเวลา/หลักฐาน bucket `hr-photo`)
  — ต้องสำรองแยกผ่าน Dashboard หรือ Storage API
- โครงสร้างตาราง (schema) — อยู่ใน `supabase/migrations/` ครบอยู่แล้ว รันซ้ำได้จากศูนย์
