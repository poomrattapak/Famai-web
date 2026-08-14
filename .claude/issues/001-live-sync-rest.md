# write-through ส่วนที่เหลือของโหมดข้อมูลจริง

รอบ v1.16 เขียนแล้ว: customer · sale · motorcycle_unit.status (ใน `saveSale`) + fin_approval (ใน `finApprove`)
รอบ v1.18 (กลุ่ม ④) เขียนแล้ว: company · branch · wholesale_partner · wholesale_price (รวมลบ)
· wholesale_sale + รายการรายคัน + รถย้ายสาขา/sold (ใน `wsSave`) · `app_setting` คีย์ `perms` (ตารางสิทธิ์ J3)
และตอน login โหลดกลับครบ: company/branch/partner/price/perms (merge ทับ default · แถว admin ไม่รับค่าทับ)

รอบ v1.19 (กลุ่ม ⑤) เขียนแล้ว: ลงเวลา → RPC `punch_clock` (ยิงตรง ไม่เข้าคิว — RPC มีด่านหลักฐานสด 120 วิ
คิว retry จะพังถาวร) + รูปขึ้น `hr-photo` · ใบลาของตัวเอง + หลักฐาน (`lvLivePush`) · คำขอออกนอกสถานที่ ·
`company_holiday`/`company_event` (เขียน+โหลดกลับตอน login) · `ME.empId` จากตาราง employee

ยังไม่เขียน (เรียงตามลำดับที่ควรทำ):
- [ ] โหลด `sale`/`wholesale_sale`/`leave_request`/`offsite_request` ย้อนกลับตอน login —
  โหมดจริงเริ่มรายการว่างเสมอ (แนวเดิม "ข้อมูลจริงมีแต่รถ") ของที่บันทึกเซสชันก่อนอยู่ในฐานข้อมูลแต่ไม่โผล่ในจอ
  ติดที่ต้องโหลด STAFF จริงจาก `app_user`/`employee` ก่อน ไม่งั้นชื่อ/สาขาจับคู่ไม่ได้
- [ ] รูปหลักฐาน/รูปลงเวลาใน bucket `hr-photo` เป็น private — ดูข้ามเครื่องต้องยิง signed URL
  (ตอนนี้ดูได้เฉพาะเครื่องที่ถ่ายเพราะ preview มาจาก IndexedDB/หน่วยความจำ)
- [ ] registration + credit_case + receivable ตอน saveSale (ตารางมีครบใน migration 02)
- [ ] expense + approval (ตาราง expense มีคอลัมน์แล้วจาก migration 16)
- [ ] finance_company: tiers/terms ที่แก้จากหน้าตั้งค่า (คอลัมน์มีแล้ว — ต้อง map ชื่อคอลัมน์เดิมก่อน)
- [ ] freebie.price + คลังของแถม
- [ ] เลขเอกสาร: ย้ายจากตัวนับในเครื่องไป `next_doc_no()` RPC — **ต้องทำก่อนเปิดใช้หลายเครื่องพร้อมกัน**
  ไม่งั้นเลขชนกันข้ามเครื่อง (ตอนนี้จดไว้ในคอมเมนต์ใน saveSale แล้ว)
- [ ] cancelSale → voided_at/voided_reason
- [ ] ทดสอบด้วยผู้ใช้จริง: ยังไม่มีบัญชีจริงให้ลอง (ข้อค้างเดิมจาก docs/08 §8) — write-through
  ทั้งหมดผ่านคิว dbUp ที่ retry เอง แต่ยังไม่เคยเห็นมันยิงสำเร็จกับ RLS จริง
