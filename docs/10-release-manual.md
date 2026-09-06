# บันทึกเผยแพร่ v1.57

รอบนี้ทำต่อจาก work/brief-r56-ready และเพิ่ม RPC งานบริการที่บันทึกเป็นชุดพร้อมกัน รวมเอกสารสรุปบรีฟสองแบบ การอัปเดตฐานที่ถูกบล็อกในแชทก่อนทำสำเร็จแล้ว **ไม่ต้องรันไฟล์ manual 32–33 ซ้ำ** ไฟล์ใน tools/release เก็บเพื่ออ้างอิงประวัติเท่านั้น

## ฐานข้อมูลจริง

โปรเจกต์ famai-motor (`hpsmjavfvrdctclmlmhp`) ใช้เครื่องมือ apply_migration สำเร็จตามลำดับ:

| ชื่อ | version ใน production |
|---|---|
| 32_brief_workflows | 20260906200933 |
| 33_permission_guards | 20260906200937 |
| 34_service_bundle | 20260906200941 |

ตรวจ schema/คอลัมน์ใหม่ครบ ตารางงานหลัก 8 ตารางเปิด RLS พร้อม policy; create_sale_bundle, catalog_save_variant และ create_care_service เป็น SECURITY INVOKER ทั้งหมด authenticated เรียกได้ แต่ anon ไม่มี EXECUTE จำนวนลูกค้า/ใบขาย/งานบริการยังเป็น 0 เท่าก่อนอัปเดต ไม่มีการเติมข้อมูลทดสอบลง production

## การตรวจ

Chromium รวม 96 ชุด (รวมการตรวจซ้ำ care-r17 หลังแก้ fixture เวลา), PostgreSQL 98 assertions, mutation ฐาน 36/36 และ browser 3/3 ภาพ 68 ภาพครบ 1440/390 และสองธีม PDF ทีม 9 หน้า/ลูกค้า 5 หน้า ฝังฟอนต์ไทยและตรวจขอบหน้า

คำสั่งทำซ้ำใช้ QA_PLAYWRIGHT/QA_CHROMIUM ชี้ package และ Chromium ที่ติดตั้ง และ PGLITE_PACKAGE ชี้ @electric-sql/pglite:

```sh
node tools/qa/run.js
node tools/qa/sql/brief32-pglite.mjs --mutations
node tools/qa/mutations/care-ack-r57.cjs
node tools/qa/ci-visual.js
node tools/brief/build.js
```

## เว็บจริง

รอบก่อน production คือ a9055ff534a386c1b62c83bd2dfd2d0684009474 บน branch claude/start-b18xi3 เว็บ https://famai-web.vercel.app สถานะการตรวจหลังเผยแพร่จะบันทึกเพิ่มเติมเมื่อ Vercel พร้อม

## ข้อสังเกตเดิมของ Security Advisor

หลัง migration พบข้อสังเกตเดิม 13 รายการ ไม่มีข้อใหม่จากงานนี้: public_lookup_log เปิด RLS โดยไม่มี policy, ฟังก์ชัน SECURITY DEFINER เดิมเรียกได้ตาม role และ leaked-password protection ยังปิด ไม่ควรตีความจำนวนนี้เป็นช่องโหว่ที่ยืนยันทั้งหมดหรือปิดสิทธิ์เดิมโดยไม่ตรวจผู้ใช้งาน

แนวทางของ Supabase: [ตาราง RLS ไม่มี policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [ฟังก์ชันที่ anon เรียกได้](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [ฟังก์ชันที่ผู้ลงชื่อเข้าใช้เรียกได้](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [ป้องกันรหัสผ่านรั่ว](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

ข้อจำกัดการทดสอบและข้อเสนอเพิ่มเติมดู docs/08-state-and-handoff.md และ PDF ทีม ไม่มี credentials พนักงานจริง จึงไม่อ้างผลธุรกรรมผ่าน HTTP ด้วยบัญชีพนักงานบน production
