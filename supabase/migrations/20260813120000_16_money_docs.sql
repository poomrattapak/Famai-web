-- v1.16 · บรีฟแก้ไขครั้งที่ 1 กลุ่ม ② เงินและเอกสาร
-- คอลัมน์ตัวเลขเงินผ่อนเป็น snapshot ณ วันขาย (กฎ §9i) — แก้เรตทีหลังต้องไม่พลิกดีลเก่า

-- ลูกค้า: ข้อมูลออกใบกำกับ (B9) — tax_id/address มีแล้วตั้งแต่ migration 01 ขาดแค่วันเกิด
alter table customer add column if not exists birth_date date;

-- การขาย: ตัวเลขเงินผ่อนที่แช่ไว้ + ของแถมแบบละเอียด + การเงินตรวจ + การแก้เอกสารก่อนพิมพ์
alter table sale
  add column if not exists rate_pct            numeric(6,3),
  add column if not exists monthly_installment numeric(12,2),
  add column if not exists loan_total          numeric(12,2),
  add column if not exists pay_now             numeric(12,2),
  add column if not exists gifts               jsonb not null default '[]'::jsonb,
  add column if not exists fin_approval        jsonb not null default '{"status":"รอตรวจ"}'::jsonb,
  add column if not exists doc_ov              jsonb;

comment on column sale.pay_now is
  'เงินดาวน์ − ส่วนลด = ยอดที่ลูกค้าจ่ายจริงหน้าร้าน (B1) — คนละตัวกับ net_price ที่ขึ้นใบกำกับ';
comment on column sale.loan_total is
  'เงินต้น + ดอกเบี้ยรวมทั้งสัญญา (B2) — snapshot ณ วันขาย ห้ามคิดใหม่จากเรตปัจจุบัน';
comment on column sale.gifts is
  'ของแถมของดีล [{id,name,qty,cost,price}] — price คือมูลค่าที่โชว์ลูกค้า (B8) · id null = ของนอกคลัง';
comment on column sale.fin_approval is
  '{status:รอตรวจ|ผ่าน|ไม่ผ่าน, by, at, note} — ใบกำกับภาษีออกไม่ได้จนกว่าจะผ่าน (G3)';
comment on column sale.doc_ov is
  'การแก้เอกสารก่อนพิมพ์รายประเภท (D2) — แก้ได้เฉพาะ วันที่/ชื่อรายการ/ยอด/หมายเหตุ ไม่แตะข้อมูลขายจริง';

-- ไฟแนนซ์: เรตตามช่วงงวด + งวดที่เปิดขายต่อเจ้า (C1-C4)
alter table finance_company
  add column if not exists tiers jsonb,
  add column if not exists terms jsonb;
comment on column finance_company.tiers is 'เรตตามช่วงงวด [{from,to,rate}] เช่น 12-18 งวด 1.05%/เดือน — ชนะ rate_tiers รูปเก่า';
comment on column finance_company.terms is 'งวดที่เจ้านี้เปิดขาย เช่น [12,24,36,48] — null = ใช้ชุดเริ่มต้นของแอป';

-- ของแถม: มูลค่าที่โชว์ลูกค้า (B8) — คนละตัวกับ cost ที่ตัดกำไร
alter table freebie add column if not exists price numeric(12,2);

-- ค่าใช้จ่าย: หมายเหตุ + การเงินตรวจ (บรีฟหมวดค่าใช้จ่าย)
alter table expense
  add column if not exists note text,
  add column if not exists approval jsonb not null default '{"status":"รอตรวจ"}'::jsonb;
