-- 25 · หน้าใบกำกับภาษี (บรีฟรอบ 2 ข้อ 26-30 · v1.36)
-- other_doc = ใบกำกับภาษี "อื่นๆ" นอกระบบสต๊อกรถ (กรอกอิสระ) — เลขมาจากซีรีส์รวมต่อบริษัทฝั่งแอป
-- wholesale_sale ได้ช่องเลขซีรีส์รวม (tax_no) และเลขใบวางบิล (bill_no) — ออกครั้งแรกครั้งเดียวตอนพิมพ์

create table other_doc (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references branch(id),
  doc_no       text not null,
  buyer_name   text not null,
  buyer_tax_id text,
  buyer_addr   text,
  item         text not null,
  amount       numeric not null,
  issued_at    date not null,
  note         text,
  created_at   timestamptz not null default now()
);
alter table other_doc enable row level security;
create policy other_doc_scope on other_doc for all to authenticated
  using (is_all_branch() or branch_id in (select my_branches()))
  with check (is_all_branch() or branch_id in (select my_branches()));

alter table wholesale_sale add column if not exists tax_no  text;
alter table wholesale_sale add column if not exists bill_no text;
comment on column wholesale_sale.tax_no  is 'เลขใบกำกับภาษี (ซีรีส์รวมต่อบริษัทต่อปี — คำตอบเจ้าของข้อ 7)';
comment on column wholesale_sale.bill_no is 'เลขใบวางบิล — 1 ใบต่อ 1 บิลขายส่ง';
