-- 29 · คอลัมน์รองรับการเขียนกลับครบตาราง (v1.49 — โหลดข้อมูลกลับ ครึ่งแรก)
--     เจ้าของสั่ง 31 ส.ค. 2569: ทาง ก. "รวมโหลดข้อมูลกลับด้วย" — รอบนี้แอปเริ่มเขียนธุรกรรม
--     ทุกตาราง สคีมาเดิมขาดสองที่:
--
-- (ก) registration ไม่มีที่เก็บประวัติการเดินขั้น (rg.log ของแอป — ใครเปลี่ยนขั้นไหนเมื่อไหร่
--     เป็นหลักฐานที่ careCreate ใช้อ่าน "วันได้ป้าย" ตามกฎ §9i) — finance_case มี stage_log
--     อยู่แล้วตั้งแต่ migration 02 ฝั่งทะเบียนต้องสมมาตรกัน
alter table registration add column if not exists stage_log jsonb;
comment on column registration.stage_log is
  'ประวัติการเดินขั้น [{to,at},…] — careCreate อ่านวันได้ป้ายจากนี่ ห้ามคำนวณใหม่ (§9i)';

-- (ข) ค่าใช้จ่าย: บรีฟให้พิมพ์หมวดใหม่ได้เลย ("ทำรายจ่ายเป็นหมวดหมู่ เช่น ออกบูธ …")
--     แอปจึงเก็บหมวดเป็นตัวหนังสือเสรี — คอลัมน์ category_id (FK บังคับ) ของสคีมาเดิม
--     ใช้กับพฤติกรรมนี้ไม่ได้ เปิดคอลัมน์ข้อความคู่กันและเลิกบังคับ FK
--     (ตาราง expense_category ยังอยู่ ใครอยาก normalize ทีหลังทำ migration แปลงได้)
alter table expense add column if not exists category text;
alter table expense alter column category_id drop not null;
comment on column expense.category is
  'หมวดหมู่แบบพิมพ์เสรีตามบรีฟ — แอปเขียนช่องนี้ · category_id เหลือไว้เพื่ออนาคต ไม่บังคับ';
