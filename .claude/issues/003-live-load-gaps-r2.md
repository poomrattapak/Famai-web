# 003 · ช่องว่างโหมดข้อมูลจริงของฟีเจอร์รอบบรีฟ 2 (v1.31–v1.39)

เปิด 24 ส.ค. 2569 · แนวเดียวกับ issue 001: เขียนขึ้นฐานข้อมูล (write-through) ครบแล้ว
แต่**การโหลดกลับตอนเปิดแอป**ยังไม่ทำ — โหมดจริงเริ่มรายการว่างตามธรรมเนียมเดิมของแอป

| ระเบียน | เขียนขึ้น DB | โหลดกลับ | ตารางฝั่ง DB |
|---|---|---|---|
| BOOKINGS (การจอง) | ✅ dbUp/dbPatch | ❌ | `booking` (migration 26) |
| ODOCS (ใบกำกับอื่นๆ) | ✅ dbUp | ❌ | `other_doc` (migration 25) |
| TRANSFERS (โอนย้าย — B8) | ✅ dbUp | ❌ | `unit_transfer` (migration 01) |
| w.taxNo / w.billNo | ✅ dbPatch | ❌ | `wholesale_sale.tax_no/bill_no` |
| c.finHist (ประวัติไฟแนนซ์) | ❌ (ในเครื่อง) | ❌ | ยังไม่มีตาราง — ต้องออกแบบ (event log) |
| a.review.waiveLate | ตาม attendance_review เดิม | ตามเดิม | มีอยู่ (jsonb ใน migration 11) |
| s.docs (เลขเอกสารที่ออกแล้ว) | ❌ | ❌ | ควรเก็บใน `document` ต่อใบ |
| STAFF[].roles (หลายตำแหน่ง) | ❌ | ❌ | `app_user_role` มีอยู่แล้ว (many-to-many) — เขียน/อ่าน join + อัป `app_user.all_branch` เป็น OR ของ role |

หมายเหตุ: RLS ไม่ต้องแก้สำหรับ multi-role — policy กรองตามสาขา (`is_all_branch`/`my_branches`)
ไม่เคยอ่านชื่อ role · เลขเอกสารยังออกจากตัวนับในเครื่อง (ประเด็นเดิม issue 001 — `next_doc_no()` ฝั่ง SQL
มีแล้วแต่ยังไม่ถูกใช้ และ `nextTaxNo` ต้องมีคู่ SQL ก่อนใช้หลายเครื่องพร้อมกัน)

## คู่มือ PDF ยังเป็นของ v1.30

`docs/manual/famai-*.pdf` (8 เล่ม + flow) สร้างจาก `tools/manual/build.js` — ยังไม่รวม
หน้าใหม่ 3 หน้า (ใบกำกับภาษี/จองรถ/ทะเบียนรถ) กับบทบาท reg · ต้องรันสร้างใหม่
(ระวังพอร์ต 8123 ชนกับ QA server — ปิดตัวหนึ่งก่อน) และเพิ่มเนื้อหาใน `tools/manual/content.js`
(บรรทัด "ดูแลหลังส่งมอบ → รายการเรียงตามความเร่ง" ต้องอัปเดตเป็นกระดานงานใหม่ด้วย)
