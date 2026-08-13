# write-through ส่วนที่เหลือของโหมดข้อมูลจริง

รอบ v1.16 เขียนแล้ว: customer · sale · motorcycle_unit.status (ใน `saveSale`) + fin_approval (ใน `finApprove`)

ยังไม่เขียน (เรียงตามลำดับที่ควรทำ):
- [ ] registration + credit_case + receivable ตอน saveSale (ตารางมีครบใน migration 02)
- [ ] expense + approval (ตาราง expense มีคอลัมน์แล้วจาก migration 16)
- [ ] finance_company: tiers/terms ที่แก้จากหน้าตั้งค่า (คอลัมน์มีแล้ว — ต้อง map ชื่อคอลัมน์เดิมก่อน)
- [ ] freebie.price + คลังของแถม
- [ ] เลขเอกสาร: ย้ายจากตัวนับในเครื่องไป `next_doc_no()` RPC — **ต้องทำก่อนเปิดใช้หลายเครื่องพร้อมกัน**
  ไม่งั้นเลขชนกันข้ามเครื่อง (ตอนนี้จดไว้ในคอมเมนต์ใน saveSale แล้ว)
- [ ] cancelSale → voided_at/voided_reason
- [ ] ทดสอบด้วยผู้ใช้จริง: ยังไม่มีบัญชีจริงให้ลอง (ข้อค้างเดิมจาก docs/08 §8) — write-through
  ทั้งหมดผ่านคิว dbUp ที่ retry เอง แต่ยังไม่เคยเห็นมันยิงสำเร็จกับ RLS จริง
