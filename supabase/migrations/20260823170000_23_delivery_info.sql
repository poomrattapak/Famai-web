-- 23 · กล่องข้อมูลส่งมอบ (บรีฟแก้ไขครั้งที่ 2 · ข้อ 14)
-- เจ้าของสั่ง: ขั้นส่งมอบมีกล่องบอก วันที่ส่งมอบ สถานที่รับรถ ผู้ส่งมอบ และหมายเหตุ
-- delivered_at มีอยู่แล้ว — เพิ่มอีก 3 ช่องที่เหลือ

alter table registration add column if not exists dlv_place text;
alter table registration add column if not exists dlv_by    text;
alter table registration add column if not exists dlv_note  text;

comment on column registration.dlv_place is 'สถานที่รับรถตอนส่งมอบ (ว่าง = ที่ร้าน)';
comment on column registration.dlv_by    is 'ชื่อผู้ส่งมอบรถ';
comment on column registration.dlv_note  is 'หมายเหตุการส่งมอบ';
