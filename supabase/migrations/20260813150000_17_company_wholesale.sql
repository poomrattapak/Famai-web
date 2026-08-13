-- v1.18 · บรีฟแก้ไขครั้งที่ 1 กลุ่ม ④ — ชั้นบริษัทเหนือสาขา + ขายส่ง B2B
-- คำตอบเจ้าของ (A3): 3 "สาขา" ที่มีอยู่แท้จริงคือ 3 บริษัท · สาขาจริงจะเพิ่มทีหลังจาก UI
-- โอนรถในบริษัทเดียวกัน = โอนย้ายธรรมดา · ข้ามบริษัท = ต้องเปิดการขาย (ขายส่ง) มีใบเสร็จ

create table if not exists company (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  tax_id     text,                        -- เลขผู้เสียภาษีของนิติบุคคลนี้ — รอเลขจริงจากเจ้าของ
  address    text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- migration 06 เปิด RLS ด้วยลูปเหนือตารางที่มีอยู่ตอนนั้น — ตารางใหม่ต้องเปิดเองเสมอ
alter table company enable row level security;
-- แบบเดียวกับตารางอ้างอิง (branch ฯลฯ): ทุกคนที่ล็อกอินอ่านได้ แอดมินเขียน
create policy company_read  on company for select to authenticated using (true);
create policy company_write on company for all    to authenticated
  using (is_admin()) with check (is_admin());

alter table branch add column if not exists company_id uuid references company(id);

-- ยก 3 แถวเดิมขึ้นเป็นบริษัท แล้วผูกสาขาเข้าบริษัทของตัวเอง
-- (แถวสาขาเดิมกลายเป็นสำนักงานใหญ่ branch_no 00000 ของบริษัทตัวเอง — โค้ดสาขาเดิมคงที่ทุกตัว)
insert into company (name, tax_id, address)
  select name, tax_id, address from branch
  on conflict (name) do nothing;
update branch b set company_id = c.id from company c where c.name = b.name and b.company_id is null;

comment on column branch.company_id is
  'นิติบุคคลเจ้าของสาขา — ใบกำกับภาษีดึงชื่อ/เลขภาษีจาก company ไม่ใช่จาก CFG (แก้บั๊ก O4)';

-- ---------- ขายส่ง B2B (F1-F5) ----------
create table if not exists wholesale_partner (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tax_id     text,
  address    text,
  phone      text,
  own_company_id uuid references company(id),  -- ไม่ null = บริษัทในเครือ (โอนข้ามบริษัท)
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ราคาขายส่งแยกชุดจากราคาปลีก (F2) — ต่อรุ่น
create table if not exists wholesale_price (
  variant_id uuid primary key references model_variant(id) on delete cascade,
  price      numeric(12,2) not null,
  updated_at timestamptz not null default now()
);

-- บิลขายส่งหลายคัน (F3) — หัวบิล + รายการรายคัน
create table if not exists wholesale_sale (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(id),      -- สาขาผู้ขาย (สต๊อกออกจากที่นี่)
  partner_id  uuid not null references wholesale_partner(id),
  sold_at     date not null,
  doc_no      text,
  total       numeric(12,2) not null default 0,
  note        text,
  due_at      date,                                     -- เครดิต (F4 — ยังไม่รู้เงื่อนไข เก็บช่องไว้)
  fin_approval jsonb not null default '{"status":"รอตรวจ"}'::jsonb,
  voided_at   timestamptz,
  created_at  timestamptz not null default now()
);
create table if not exists wholesale_sale_item (
  id       uuid primary key default gen_random_uuid(),
  ws_id    uuid not null references wholesale_sale(id) on delete cascade,
  unit_id  uuid not null references motorcycle_unit(id),
  price    numeric(12,2) not null,
  unique (ws_id, unit_id)
);

alter table wholesale_partner   enable row level security;
alter table wholesale_price     enable row level security;
alter table wholesale_sale      enable row level security;
alter table wholesale_sale_item enable row level security;

create policy ws_partner_read  on wholesale_partner for select to authenticated using (true);
create policy ws_partner_write on wholesale_partner for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());
create policy ws_price_read  on wholesale_price for select to authenticated using (true);
create policy ws_price_write on wholesale_price for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());
-- บิลขายส่งเห็นตามขอบเขตสาขาแบบเดียวกับ sale
create policy ws_sale_sel on wholesale_sale for select to authenticated
  using (is_all_branch() or branch_id in (select my_branches()));
create policy ws_sale_ins on wholesale_sale for insert to authenticated
  with check (is_all_branch() or branch_id in (select my_branches()));
create policy ws_sale_upd on wholesale_sale for update to authenticated
  using (is_all_branch() or branch_id in (select my_branches()));
create policy ws_item_all on wholesale_sale_item for all to authenticated
  using (ws_id in (select id from wholesale_sale))
  with check (ws_id in (select id from wholesale_sale));
