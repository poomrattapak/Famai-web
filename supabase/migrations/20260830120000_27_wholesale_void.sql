-- 27 · ยกเลิกบิลขายส่ง (คำสั่งเจ้าของ 28 ส.ค. 2569: "ถ้าเกิดไม่มีให้ยกเลิก ทำยกเลิกบิลด้วย"
--      + คำตอบเพิ่ม: "ยกเลิกได้ก่อนการเงินตรวจผ่านเท่านั้น" · v1.45)
--
-- soft void เท่านั้น: ตารางนี้ไม่มี DELETE policy มาตั้งแต่ migration 17 และจะไม่มี —
-- เลขเอกสารที่ออกไปแล้วห้ามหายและห้ามคืนเข้าตัวนับ (กฎสรรพากร) ยกเลิกคือ "บันทึกว่ายกเลิก"
--
-- voided_at มีอยู่แล้วตั้งแต่ migration 17 แต่ไม่เคยมีโค้ดฝั่งไหนเขียนเลย รอบนี้เริ่มใช้จริง
-- และเป็น **แหล่งความจริงเดียว** ของสถานะยกเลิก (ไม่มีคอลัมน์ is_void แยก — กฎ §9g)

alter table wholesale_sale add column if not exists voided_reason  text;
alter table wholesale_sale add column if not exists voided_by      text;
alter table wholesale_sale add column if not exists dest_branch_id uuid references branch(id);

comment on column wholesale_sale.voided_at is
  'ยกเลิกเมื่อ — null = บิลยังใช้อยู่ · สถานะคำนวณจากช่องนี้ช่องเดียว ไม่มีฟิลด์สถานะซ้ำ (§9g)';
comment on column wholesale_sale.voided_reason is
  'เหตุผลที่ยกเลิก — ฝั่งแอปบังคับกรอกใน wsVoid() ก่อนเขียนอะไรทั้งสิ้น';
comment on column wholesale_sale.voided_by is
  'ชื่อเล่นผู้กดยกเลิก ณ เวลาทำรายการ — แช่ลงหลักฐาน ไม่ join ใหม่ตอนวาดจอ (§9i)';
comment on column wholesale_sale.dest_branch_id is
  'สาขาปลายทางของบิลในเครือ (รถย้ายไปไหน) · คู่ค้าภายนอกเป็น null — เดิมบิลไม่เคยเก็บ
   รู้แค่ตอนเขียน motorcycle_unit.branch_id จึงย้อนรายการและตรวจสอบไม่ได้';

-- รายงานภาษี / ชุดส่งบัญชี / หน้าขายส่ง อ่านเฉพาะบิลที่ยังไม่ยกเลิกตามช่วงวันที่ของสาขา
create index if not exists ws_sale_live_idx
  on wholesale_sale (branch_id, sold_at) where voided_at is null;

-- ws_sale_upd เดิมมีแต่ using ไม่มี with check: ผู้ใช้ที่แก้แถวได้ สามารถ PATCH branch_id
-- ย้ายบิลออกนอกขอบเขตตัวเองแล้วมองไม่เห็นอีก (และคนสาขาปลายทางได้บิลผี)
-- การยกเลิกเป็น UPDATE จึงเป็นจังหวะที่ควรปิดรูนี้ให้ตรงกับ policy ของ booking (migration 26)
drop policy if exists ws_sale_upd on wholesale_sale;
create policy ws_sale_upd on wholesale_sale for update to authenticated
  using      (is_all_branch() or branch_id in (select my_branches()))
  with check (is_all_branch() or branch_id in (select my_branches()));
