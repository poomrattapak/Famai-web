-- 28 · กันขายซ้ำระดับฐานข้อมูล + audit ครอบตารางหลังแยกสาย (v1.48)
--     คำสั่งเจ้าของ 31 ส.ค. 2569: "ผสานจุดแข็งของ grape เข้าฝั่งเราตามทาง ก."
--     จุดแข็งที่ยืมสองข้อ: unique index กันขายคันเดียวสองบิล (จากร่าง migration 20 ของสาย Next.js)
--     และการให้ audit trigger ครอบทุกตารางเขียนสำคัญ
--
-- (ก) กันขายซ้ำ: ด่านในแอป (saveSale เช็คสถานะรถ) กันคนกดปกติได้ แต่กันสองเครื่องกดพร้อมกัน
--     ไม่ได้ — ชั้นสุดท้ายต้องเป็นโครงสร้างของฐานข้อมูลเอง ไม่ใช่ convention
--     เงื่อนไข where voided_at is null = การขายที่ถูกยกเลิกแล้วไม่ขวางการขายรอบใหม่ของคันเดิม
--     (ฝั่งแอป v1.48 เริ่มเขียน sale.voided_at ตอนยกเลิกใน voidSaleCore แล้ว — คู่กันพอดี)
create unique index if not exists sale_unit_active_uniq
  on sale (unit_id) where voided_at is null;

comment on index sale_unit_active_uniq is
  'รถหนึ่งคันมีการขายที่ยังไม่ยกเลิกได้ใบเดียว — ด่านชั้นฐานข้อมูล กันสองเครื่องขายพร้อมกัน (v1.48)';

-- (ข) audit ครอบตารางที่เกิดหลัง migration 05: บิลขายส่ง (17) · เอกสารอื่น ๆ (25) · การจอง (26)
--     ตัว audit_changes() มีอยู่แล้วและเก็บเฉพาะคอลัมน์ที่เปลี่ยนจริง — แค่ผูกเพิ่ม
--     (drop ก่อน create เพื่อให้ไฟล์นี้รันซ้ำได้โดยไม่พัง)
drop trigger if exists audit_wholesale_sale on wholesale_sale;
create trigger audit_wholesale_sale after insert or update or delete on wholesale_sale
  for each row execute function audit_changes();

drop trigger if exists audit_other_doc on other_doc;
create trigger audit_other_doc after insert or update or delete on other_doc
  for each row execute function audit_changes();

drop trigger if exists audit_booking on booking;
create trigger audit_booking after insert or update or delete on booking
  for each row execute function audit_changes();
