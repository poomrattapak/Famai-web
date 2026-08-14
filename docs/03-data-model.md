# โครงสร้างข้อมูล (Data Model)

PostgreSQL · ออกแบบให้ครอบคลุมทุกข้อในผังไวท์บอร์ด และแก้ปัญหาโครงสร้างของ v0.5

> **เอกสารนี้อธิบาย — ของจริงที่รันแล้วอยู่ที่ `supabase/migrations/`**
> ไฟล์ในโฟลเดอร์นั้นคือ SQL ที่ถูกรันจริงบนฐานข้อมูล เรียงลำดับให้ FK ไม่ชนกันแล้ว
> ที่นี่จัดกลุ่มตารางตามเรื่องเพื่อให้อ่านง่าย จึงมีบางตารางถูกอ้างถึงก่อนถูกสร้าง
> (`document` → `service_job`, `service_job_line` → `part`, `sale` → `finance_company`)
> ถ้าจะสร้างฐานข้อมูลใหม่ให้รันจาก `supabase/migrations/` ไม่ใช่ก๊อปจากหน้านี้
> วิธีต่อและวิธีย้ายไปโปรเจกต์ใหม่อยู่ใน [`06-supabase-setup.md`](06-supabase-setup.md)
>
> **v1.0 เพิ่ม migration 10** (`10_v1_features.sql` — apply ลงฐานข้อมูลจริงแล้ว 9 ส.ค. 2569):
> `attendance` + คอลัมน์หลักฐานลงเวลา (รูปถ่าย พิกัด อุปกรณ์ ผู้แก้+เหตุผล) ·
> `finance_company.rate_tiers` เรตรายช่วงงวด · `finance_case.stage_log` ประวัติสถานะ ·
> `model_variant.photo_url` · `customer.address, note` · ตารางใหม่ `company_event`
> (ปฏิทินผู้บริหาร — RLS เฉพาะ role admin/manager)

**หลักที่ยึด**

1. ทุกความสัมพันธ์ใช้ **id (UUID)** ไม่ใช้ชื่อคน — v0.5 ผูกด้วยชื่อ แก้ชื่อทีเดียวข้อมูลขาด
2. ทุกตารางธุรกรรมมี **`branch_id`** ของตัวเอง — ไม่ต้องย้อนไปดูจากคันรถ
3. เลขที่เอกสารมาจาก **ตัวนับในฐานข้อมูล** แยกสาขา/ประเภท/ปี
4. ทุกตารางมี `created_at` / `created_by` / `updated_at` / `updated_by`
5. ข้อมูลที่เป็นเงินใช้ `numeric(12,2)` — **ห้ามใช้ `float`**
6. ไม่ลบจริง ใช้ `voided_at` + `voided_reason` (เอกสารภาษีห้ามลบ)

---

## 1. แผนผังความสัมพันธ์

```
branch ──┬─< app_user_branch >── app_user ──< employee
         │                            │
         ├─< motorcycle_unit >───── model_variant ──< price_history
         │        │      │               │
         │        │      │               └──< model_color
         │        │      └──< unit_transfer
         │        │
         │        └──── sale ──┬──< sale_freebie >── freebie
         │              │  │   ├──< document (ใบเสร็จ / ใบกำกับภาษี)
         │              │  │   ├──── registration      (ทะเบียน 6 ขั้น)
         │              │  │   ├──── finance_case ──< finance_case_event
         │              │  │   └──< receivable ──< receipt_payment
         │              │  └──── customer ──┬──< lead_stage_history
         │              │                   ├──< follow_up_task
         │              │                   └──< service_job ──< service_job_line
         │              └──── employee (เซลล์) ──< commission_line
         │
         ├─< part ──< part_movement
         ├─< expense ──< attachment
         ├─< quotation ──< quotation_option
         ├─< promotion
         ├─< attendance / leave_request / payroll_line
         └─< doc_counter
```

---

## 2. ตารางหลัก

### 2.1 สาขาและผู้ใช้

```sql
create table branch (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,      -- 'FMG01' | 'FMM01' | 'FCG01' (ตรงกับไฟล์ยามาฮ่า)
  name         text not null,             -- 'Famai Motor Group'
  doc_prefix   text not null,             -- นำหน้าเลขเอกสาร เช่น 'FMG'
  tax_id       text,                      -- เลขประจำตัวผู้เสียภาษีของสาขานี้
  branch_no    text default '00000',      -- '00000' = สำนักงานใหญ่
  address      text,
  phone        text,
  is_active    boolean not null default true
);
```
> ⚠️ `code` ต้องตรงกับ `DOC_BRANCH_CODE` ในไฟล์ยามาฮ่า เพราะไฟล์ **ไม่ได้บอกชื่อสาขา**
> (ทุกแถวเขียนว่า `สำนักงานใหญ่`) และ **ห้ามเดาสาขาจาก prefix เลขเอกสาร** เพราะไม่ตรงกัน
>
> 💡 **รองรับได้ทั้งสองแบบ** — `tax_id` และ `branch_no` อยู่ที่ระดับสาขา ดังนั้น
> ถ้า 3 สาขาเป็น**นิติบุคคลเดียวกัน** ให้ใส่ `tax_id` เดียวกันทุกสาขาแล้วต่างกันที่ `branch_no`
> (`00000` = สำนักงานใหญ่ · `00001`, `00002` = สาขา) · ถ้าเป็น**คนละนิติบุคคล** ก็ใส่ `tax_id` ต่างกันได้เลย
> — **ไม่ต้องแก้โครงสร้างทีหลังไม่ว่าคำตอบจะเป็นแบบไหน**

```sql
create table app_user (
  id           uuid primary key references auth.users(id) on delete cascade,  -- ผูกกับบัญชีล็อกอินจริง
  username     text not null unique,
  full_name    text not null,
  nickname     text,
  all_branch   boolean not null default false,   -- ผู้บริหาร/แอดมิน เห็นทุกสาขา
  is_active    boolean not null default true
);

create table role (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique,        -- admin | manager | sales | stock | acct | tech | hr — คีย์ที่โค้ดใช้เทียบสิทธิ์
  name  text not null unique,        -- ผู้ดูแลระบบ / ผู้บริหาร / เซลล์ / สต๊อก / บัญชี / ช่าง / HR
  perms jsonb not null default '{}'  -- {"money":true,"approve":true,"admin":false,...}
);

create table app_user_role   (user_id uuid references app_user, role_id   uuid references role,   primary key (user_id, role_id));
create table app_user_branch (user_id uuid references app_user, branch_id uuid references branch, primary key (user_id, branch_id));
```

> **ต่างจาก v0.5 ตรงนี้:** สิทธิ์ทุกตัวจะถูกบังคับใช้จริง ทั้งที่การกรองเมนู
> และที่ RLS ของฐานข้อมูล ไม่ใช่แค่ `money` ตัวเดียวเหมือนเดิม

### 2.2 รุ่นรถ · สี · ราคา

```sql
create table model_variant (                 -- 'แบบรถ' ในไฟล์ยามาฮ่า
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- 'BTF200'
  model_name  text not null,                 -- 'NMAX'
  model_th    text,                          -- 'เอ็นแม็กซ์ สแตนดาร์ด'
  category    text,                          -- Sport | Automatic | Moped | Big Bike
  cc          numeric(6,2),                  -- 155.09
  model_year  int,                           -- 2569 (พ.ศ.)
  spec        text                           -- 'สตาร์ทมือ/ดิสก์เบรค/ล้อแม็กซ์'
);

create table model_color (
  variant_id  uuid not null references model_variant(id),
  color_code  text not null,                 -- '010A' … '010F' (คอลัมน์สีในตารางราคา)
  color_name  text not null,                 -- 'แดง'
  primary key (variant_id, color_code)
);

create table price_history (                 -- ราคามีอายุ ไม่ใช่ค่าเดียวตายตัว
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references model_variant(id),
  effective_from date not null,              -- '2026-03-05'
  cost          numeric(12,2) not null,      -- มูลค่า (ก่อน VAT)
  vat           numeric(12,2) not null,
  retail        numeric(12,2) not null,      -- ราคาขายปลีกแนะนำ (รวม VAT)
  source        text,                        -- 'ตารางราคายามาฮ่า 5 มี.ค. 2569'
  unique (variant_id, effective_from)
);
```

> **แก้ปัญหาจริงที่พบ:** `แบบรถ` 3 รหัส (`DA6200`, `BJKE00`, `D13100`) ไม่มีในตารางราคา 5 มี.ค. 2569
> ทำให้ **8 จาก 50 คันหาราคาขายไม่ได้ · ต้นทุนจม 423,300 บาท** — โครงนี้เก็บได้หลายรุ่นราคาพร้อมวันที่มีผล
> รถที่หาราคาไม่เจอให้ขึ้นธง `รอกำหนดราคา` **ไม่ใช่เดาเป็นต้นทุน+15% แบบ v0.5**
>
> **เจ้าของร้านตัดสินใจแล้วว่าเคลียร์ออก** — ผู้จัดการกรอกราคาเองทีละคัน แล้วบันทึกลง
> `motorcycle_unit.retail` พร้อมตั้ง `is_clearance = true` และเก็บเหตุผลไว้ที่ `price_note`
> ราคาที่ตั้งเองจึงแยกออกจากราคาที่มาจาก `price_history` ได้ชัดเจนตอนทำรายงาน

### 2.3 คันรถ

```sql
create table motorcycle_unit (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  variant_id    uuid not null references model_variant(id),
  color_code    text not null,
  sku           text not null,               -- 'BTF200010E' = variant.code + color_code
  engine_no     text not null unique,        -- 🔑 คีย์ธรรมชาติ
  frame_no      text not null unique,        -- 17 ตัวอักษร
  unit_kind     text not null default 'รถใหม่',   -- เผื่อ 'รถมือสอง'
  status        text not null default 'available',
       -- available | reserved | in_transfer | sold | returned
  received_at   date not null,               -- 'วันที่ใบรับ' — ใช้คำนวณอายุสต๊อก
  cost          numeric(12,2) not null,
  cost_vat      numeric(12,2) not null,
  retail        numeric(12,2),               -- null = รอกำหนดราคา
  is_clearance  boolean not null default false, -- ตั้งราคาเคลียร์สต๊อกด้วยมือ (ไม่ใช่ราคาจากตารางยามาฮ่า)
  price_note    text,                        -- เหตุผลที่ตั้งราคานี้ — ต้องตรวจสอบย้อนหลังได้
  priced_by     uuid references app_user(id),
  priced_at     timestamptz,
  photo_url     text,
  -- ที่มาจากไฟล์ยามาฮ่า (เก็บไว้ตรวจสอบย้อนหลัง)
  src_file      text,
  recv_no       text,                        -- 'เลขที่รับ'
  po_no         text,                        -- 'เลขที่เอกสาร'
  po_date       date,
  supplier_tax_id text,
  supplier_inv_no text,
  imported_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index on motorcycle_unit (branch_id, status);
create index on motorcycle_unit (received_at);

create table unit_transfer (                 -- โอนย้ายรถระหว่างสาขา (v0.5 ไม่มี)
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references motorcycle_unit(id),
  from_branch   uuid not null references branch(id),
  to_branch     uuid not null references branch(id),
  requested_at  timestamptz not null default now(),
  received_at   timestamptz,
  status        text not null default 'in_transit',
  note          text
);
```

### 2.4 ลูกค้าและ Lead

```sql
create table customer (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branch(id),    -- สาขาที่ดูแล
  full_name   text not null,
  nickname    text,
  phone       text,
  address     text,
  tax_id      text,                          -- สำหรับใบกำกับภาษี (ข้อมูลอ่อนไหว — จำกัดสิทธิ์)
  source      text,                          -- Facebook / เดินเข้าร้าน / แนะนำ / LINE
  stage       text not null default 'เข้ามาดูรถ',
       -- เข้ามาดูรถ | สนใจ | ทำสัญญา | ผ่าน | ไม่ผ่าน | รับรถสำเร็จ
  interested_variant_id uuid references model_variant(id),
  owner_id    uuid references app_user(id),  -- เซลล์ที่ดูแล
  consent_at  timestamptz,                   -- PDPA: วันที่ให้ความยินยอม
  consent_scope text,
  created_at  timestamptz not null default now()
);

create table lead_stage_history (            -- v0.5 เก็บแค่สถานะปัจจุบัน ไม่มีประวัติ
  id          bigserial primary key,
  customer_id uuid not null references customer(id),
  from_stage  text, to_stage text not null,
  changed_by  uuid references app_user(id),
  changed_at  timestamptz not null default now(),
  note        text
);
```

> ครบตามผังไวท์บอร์ด: `เข้ามาดูรถ → สนใจ → สัญญา → ผ่าน/ไม่ผ่าน → รับรถสำเร็จ`
> **v0.5 ขาดขั้น "ผ่าน / ไม่ผ่าน"**

### 2.5 การขาย

```sql
create table sale (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),   -- ← v0.5 ไม่มีช่องนี้
  unit_id       uuid not null references motorcycle_unit(id),
  customer_id   uuid not null references customer(id),
  salesperson_id uuid references app_user(id),
  sold_at       date not null,
  list_price    numeric(12,2) not null,
  discount      numeric(12,2) not null default 0,
  net_price     numeric(12,2) not null,
  cost          numeric(12,2) not null,      -- snapshot ต้นทุน ณ วันขาย
  freebie_cost  numeric(12,2) not null default 0,
  gross_profit  numeric(12,2) not null,
  pay_method    text not null,               -- cash | finance
  finance_id    uuid references finance_company(id),  -- ขายผ่อนผ่านเจ้าไหน (ต้องสร้าง finance_company ก่อน sale)
  down_payment  numeric(12,2),               -- ← v0.5 กรอกได้แต่ไม่บันทึก
  term_months   int,                         -- ← เช่นกัน
  note          text,                        -- ← เช่นกัน
  voided_at     timestamptz, voided_reason text,
  created_at    timestamptz not null default now()
);

create table freebie (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  name text not null, cost numeric(12,2) not null,
  qty_on_hand int not null default 0,        -- ← v0.5 ไม่มีสต๊อกของแถม
  min_qty int not null default 0
);

create table sale_freebie (
  sale_id uuid references sale(id), freebie_id uuid references freebie(id),
  qty int not null default 1, cost_each numeric(12,2) not null,
  primary key (sale_id, freebie_id)
);
```

### 2.6 ทะเบียน — pipeline 6 ขั้น

```sql
create table registration (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null unique references sale(id),
  branch_id    uuid not null references branch(id),
  stage        text not null default 'ขายแล้ว',
       -- ขายแล้ว → ส่งไฟแนนซ์ → อนุมัติ → รอทะเบียน → ป้ายขาว → ส่งมอบแล้ว
  plate_no     text,
  book_no      text,                         -- เล่มทะเบียน
  submitted_at date, approved_at date, plate_received_at date, delivered_at date,
  due_at       date,                          -- ครบกำหนดคาดการณ์
  note         text
);

create table registration_event (             -- ประวัติทุกครั้งที่ขยับขั้น
  id bigserial primary key,
  registration_id uuid not null references registration(id),
  from_stage text, to_stage text not null,
  at timestamptz not null default now(), by_user uuid references app_user(id), note text
);
```

> deck เขียนว่า *"This is usually the #1 thing managers ask"* — **v0.5 ไม่มีเลย**
> มีแค่วันครบกำหนด = วันขาย + 30 วัน โดยไม่มีสถานะจริง

### 2.7 ไฟแนนซ์และเงินค้างรับ

```sql
create table finance_company (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                 -- กรุงศรี / ธนชาต / ทิสโก้ / …
  flat_rate_pct numeric(6,4),                -- ดอกเบี้ยคงที่ต่อเดือน (เรตจริง ไม่ใช่ค่าสมมุติ)
  min_down_pct  numeric(5,2),                -- เงินดาวน์ขั้นต่ำ (%)
  commission    numeric(12,2) default 0,     -- ค่าคอมที่ร้านได้ต่อสัญญา — กำไรจริงของการขายผ่อน
  note          text,
  is_active boolean not null default true    -- ปิดใช้งานแทนการลบเมื่อมีเคสอ้างถึงอยู่
);
```

> **ห้ามลบเมื่อมีคนใช้อยู่** — `finance_case`, `receivable` และ `sale` อ้าง `finance_company(id)`
> ถ้ามีแถวอ้างถึงให้ตั้ง `is_active = false` แทน รายการเก่าจะยังแสดงชื่อได้ถูกต้อง

```sql
create table finance_case (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  sale_id       uuid references sale(id),    -- ← v0.5 ไม่ผูกกับใบขายเลย
  customer_id   uuid not null references customer(id),
  company_id    uuid not null references finance_company(id),
  status        text not null default 'ส่งเรื่อง',
       -- ส่งเรื่อง → ยื่นเอกสาร → รอผล → ติดตามต่อ → อนุมัติแล้ว | ปฏิเสธ | ยกเลิก
  amount        numeric(12,2),
  submitted_at  date, decided_at date, reject_reason text
);

create table finance_case_event (             -- เดินหน้า/ถอยหลัง/ปฏิเสธ ได้ครบ
  id bigserial primary key,
  case_id uuid not null references finance_case(id),
  from_status text, to_status text not null,
  at timestamptz not null default now(), by_user uuid references app_user(id), note text
);

create table receivable (                     -- เงินค้างรับ (v0.5 ไม่มีเลย)
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(id),
  sale_id     uuid not null references sale(id),
  kind        text not null,                 -- finance | customer | อื่นๆ
  payer_finance_id uuid references finance_company(id),
  amount_due  numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0,
  due_at      date,
  settled_at  date,
  balance     numeric(12,2) generated always as (amount_due - amount_paid) stored  -- คงค้าง
);

create table receipt_payment (                -- ลงรับเงินจริง → เข้าบัญชีเงินสด
  id           uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references receivable(id),
  paid_at      date not null,
  amount       numeric(12,2) not null,
  method       text,                          -- เงินสด | โอน | เช็ค
  ref_no       text,
  by_user      uuid references app_user(id)
);
```

### 2.8 เอกสารและตัวนับเลขที่

```sql
create table doc_counter (
  branch_id uuid not null references branch(id),
  doc_type  text not null,   -- RECEIPT | TAX_INV | TAX_INV_DOWN | QUOTE | PAYSLIP | SERVICE
  year_be   int  not null,
  last_no   bigint not null default 0,
  primary key (branch_id, doc_type, year_be)
);

create table document (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(id),
  doc_type    text not null,
  doc_no      text not null,                -- 'FMG-TAX_INV-2569-00042'
  doc_date    date not null,                -- ← v0.5 ฝังวันที่ตายตัว
  sale_id     uuid references sale(id),
  service_job_id uuid references service_job(id),
  customer_id uuid references customer(id),
  amount_base numeric(12,2), amount_vat numeric(12,2), amount_total numeric(12,2),
  -- snapshot ข้อมูลผู้ขาย/ผู้ซื้อ ณ วันออก (เอกสารต้องไม่เปลี่ยนตามข้อมูลปัจจุบัน)
  seller_snapshot jsonb not null,
  buyer_snapshot  jsonb not null,
  printed_count int not null default 0,
  voided_at   timestamptz, voided_reason text,
  unique (branch_id, doc_type, doc_no)
);
```

> **แก้ปัญหาใหญ่สุดของ v0.5** — เลขเอกสารเดิมคือ `'RC-' + จำนวนใบขาย` ซึ่งซ้ำและรีเซ็ตทุกครั้งที่เปิดหน้า
> ที่นี่เลขมาจาก `next_doc_no()` (ดู `02-architecture.md` §4.1) และ **snapshot ข้อมูลผู้ขาย/ผู้ซื้อไว้ในเอกสาร**
> เพราะใบกำกับภาษีที่ออกไปแล้วต้องไม่เปลี่ยนตามการแก้ข้อมูลลูกค้าภายหลัง

### 2.9 ใบเสนอราคา

```sql
create table quotation (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  doc_no text not null, quote_date date not null, valid_until date,
  customer_name text not null, customer_phone text, customer_address text,
  created_by uuid references app_user(id)
);

create table quotation_option (               -- รถ 2 คัน × ไฟแนนซ์ 2 เจ้า × หลายงวด
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotation(id),
  slot int not null,                          -- 1 = คันที่ 1, 2 = คันที่ 2
  variant_id uuid references model_variant(id),
  price numeric(12,2) not null,
  finance_id uuid references finance_company(id),
  down_payment numeric(12,2),
  terms jsonb                                 -- [{"months":12,"monthly":9720.57}, …]
);
```

### 2.10 Service — โมดูลที่หายไปทั้งก้อน

```sql
create table service_job (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  job_no        text not null,
  customer_id   uuid references customer(id),
  unit_id       uuid references motorcycle_unit(id),  -- ถ้าเป็นรถที่ขายจากร้าน
  engine_no     text,                                 -- ถ้าเป็นรถนอก
  frame_no      text,
  customer_kind text,                                 -- ลูกค้าเก่า | ลูกค้าใหม่
  odometer_km   int,                                  -- เลขไมล์ → ผูกกับรอบเช็กระยะ
  service_type  text,                                 -- เช็กระยะ | ซ่อม | เคลม | อื่นๆ
  symptom       text,
  checked_in_at timestamptz not null default now(),   -- 'ลงเวลาเข้า Service จริง'
  started_at    timestamptz, finished_at timestamptz,
  status        text not null default 'รับเข้า',
       -- รับเข้า → กำลังซ่อม → รออะไหล่ → เสร็จ → ส่งมอบแล้ว
  labor_cost    numeric(12,2) not null default 0,
  parts_cost    numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  technician_id uuid references app_user(id)
);

create index on service_job (engine_no);
create index on service_job (frame_no);

create table service_job_line (
  id bigserial primary key,
  job_id  uuid not null references service_job(id),
  kind    text not null,                    -- part | labor
  part_id uuid references part(id),
  description text, qty numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null, amount numeric(12,2) not null
);

create table service_reminder (              -- 500 / 1,000 / 4,000 / 8,000 กม.
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id),
  unit_id     uuid references motorcycle_unit(id),
  target_km   int not null,
  due_date    date,
  status      text not null default 'รอถึงกำหนด',   -- รอถึงกำหนด | แจ้งแล้ว | มาแล้ว | ข้าม
  notified_at timestamptz
);
```

> ค้นด้วย `engine_no` / `frame_no` แล้วเจอลูกค้าเก่า → ดึงประวัติซื้อ + ประวัติซ่อมมาแสดงทันที
> ตรงตามที่ไวท์บอร์ดเขียนว่า *"ถ้าลูกค้าเก่า จะดึงหน้าติดตามลูกค้าเก่ามา show"*
>
> และ `service_reminder` ทำให้ `CFG.km` ของ v0.5 (ที่ตั้งค่าได้แต่ไม่มีโค้ดใช้) **ทำงานจริง**

### 2.11 อะไหล่

```sql
create table part (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  code text not null, name text not null,
  cost numeric(12,2) not null, price numeric(12,2) not null,
  qty_on_hand int not null default 0, min_qty int not null default 0,
  unique (branch_id, code)
);

create table part_movement (
  id bigserial primary key,
  part_id uuid not null references part(id),
  branch_id uuid not null references branch(id),
  kind text not null,                        -- receive | sale | job | adjust | transfer
  qty int not null,                          -- + เข้า / − ออก
  job_id uuid references service_job(id),    -- ← v0.5 มีช่องนี้แต่ว่างเสมอ
  sale_id uuid references sale(id),
  unit_price numeric(12,2), at timestamptz not null default now(),
  by_user uuid references app_user(id), note text
);
```

### 2.12 ค่าใช้จ่ายและไฟล์แนบ

```sql
create table expense_category (
  id uuid primary key default gen_random_uuid(),
  name text not null unique                  -- ออกบูธ / Payroll / ค่าน้ำไฟ / ค่าอาหารเลี้ยงแขก
);

create table expense (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  category_id uuid not null references expense_category(id),
  spent_at date not null, amount numeric(12,2) not null,
  vendor text, tax_invoice_no text,
  has_receipt boolean not null default false,   -- ธง "ใบเสร็จหาย"
  note text, created_by uuid references app_user(id)
);

create table attachment (                       -- ← v0.5 ไม่มี input file แม้แต่ตัวเดียว
  id uuid primary key default gen_random_uuid(),
  owner_table text not null,                    -- 'expense' | 'motorcycle_unit' | 'registration' | …
  owner_id    uuid not null,
  file_path   text not null,                    -- path ใน Supabase Storage
  file_name   text not null, mime_type text, size_bytes bigint,
  kind        text,                             -- บิล | ใบทะเบียน | รูปรถ | ใบเสร็จ
  uploaded_by uuid references app_user(id),
  uploaded_at timestamptz not null default now()
);
create index on attachment (owner_table, owner_id);
```

### 2.13 พนักงาน · เวลา · เงินเดือน

```sql
create table employee (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references app_user(id),
  branch_id uuid not null references branch(id),
  emp_code text unique, position text,
  hired_at date, resigned_at date,
  base_salary numeric(12,2),                 -- ← v0.5 ไม่มีช่องเงินเดือนเลย
  ssn_no text,                               -- เลขประกันสังคม
  bank_code text, bank_account text          -- สำหรับไฟล์โอนเงินเดือน
);

create table attendance (
  id bigserial primary key,
  employee_id uuid not null references employee(id),   -- ← v0.5 ผูกด้วย "ลำดับที่"
  work_date date not null,
  check_in timestamptz, check_out timestamptz,         -- ← v0.5 ใช้เวลาปลอม
  status text,                                          -- ปกติ | สาย | ลา | ขาด
  late_minutes int,                                     -- คิดตอนบันทึก ไม่ใช่ generated column
                                                        -- (ต้องเทียบกับเวลาเข้างานใน app_setting = subquery ซึ่ง generated column ห้าม)
  work_minutes int, ot_minutes int not null default 0,  -- ← v0.5 ไม่คิด OT
  unique (employee_id, work_date)
);

create table leave_request (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id),
  leave_type text not null,                  -- ลาป่วย | ลากิจ | ลาพักร้อน
  date_from date not null, date_to date not null,
  status text not null default 'รออนุมัติ',
  approved_by uuid references app_user(id), approved_at timestamptz, reason text
);

create table payroll_period (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  period_start date not null, period_end date not null,
  status text not null default 'ร่าง',       -- ร่าง | ปิดงวดแล้ว | จ่ายแล้ว
  unique (branch_id, period_start, period_end)
);

create table payroll_line (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references payroll_period(id),
  employee_id uuid not null references employee(id),
  base_salary numeric(12,2) not null default 0,
  ot_amount   numeric(12,2) not null default 0,
  commission  numeric(12,2) not null default 0,
  allowance   numeric(12,2) not null default 0,
  deduct_late numeric(12,2) not null default 0,
  deduct_ssn  numeric(12,2) not null default 0,   -- ประกันสังคม (ลูกจ้าง)
  employer_ssn numeric(12,2) not null default 0,  -- ส่วนนายจ้าง (สำหรับรายงาน)
  deduct_tax  numeric(12,2) not null default 0,
  net_pay     numeric(12,2) not null default 0,
  unique (period_id, employee_id)
);

create table commission_rule (               -- ← v0.5 ไม่มีค่าคอมเลย
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  applies_to text not null,                  -- motorcycle | part | service
  basis text not null,                       -- per_unit | pct_of_gp | pct_of_revenue
  value numeric(12,4) not null,
  effective_from date not null
);
```

> ครบตามไวท์บอร์ด: เงินเดือน → สลิป · OT · **รายงานส่งประกันสังคม** (จาก `deduct_ssn` + `employer_ssn`)
> · **ไฟล์โอนเงินเดือนให้ธนาคาร** (จาก `bank_code` + `bank_account` + `net_pay`)

### 2.14 งานติดตาม · โปรโมชัน · นำเข้า · audit

```sql
create table follow_up_task (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branch(id),
  customer_id uuid not null references customer(id),
  sale_id uuid references sale(id),
  kind text not null,                        -- 7d | 30d | 90d | 1y | 3y | ทะเบียน | เช็กระยะ
  due_at date not null,
  done_at timestamptz, done_by uuid references app_user(id),
  assigned_to uuid references app_user(id), note text
);
create index on follow_up_task (branch_id, due_at) where done_at is null;

create table promotion (                     -- ← "เด้งแถบบนเตือน เซลล์ วีคโปร"
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),      -- null = ทุกสาขา
  variant_id uuid references model_variant(id),
  title text not null,                       -- 'Grand ลด 5,000'
  discount_amount numeric(12,2),
  starts_on date not null, ends_on date not null,
  is_active boolean not null default true
);

create table import_log (                    -- ← v0.5 มีตารางแต่ไม่เคยเพิ่มข้อมูล
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branch(id),
  file_name text not null, file_hash text,
  rows_total int, rows_inserted int, rows_duplicate int, rows_invalid int,
  warnings jsonb,                            -- เช่น เตือนวันที่ผิดปกติ / รหัสสีต้อง normalize
  imported_by uuid references app_user(id),
  imported_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid references app_user(id),
  table_name text not null, row_id text not null,
  action text not null,                      -- INSERT | UPDATE | DELETE | VIEW_PII
  before jsonb, after jsonb
);

create table app_setting (                   -- ทุกเกณฑ์ปรับได้โดยไม่แก้โค้ด (ยกมาจาก v0.5)
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
```

---

## 3. ค่าตั้งต้นใน `app_setting`

ยกมาจาก v0.5 (ซึ่งออกแบบส่วนนี้ไว้ดี) + เพิ่มที่ขาด

| key | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `aging_days` | 90 | เกณฑ์รถค้างสต๊อก |
| `aging_buckets` | `[30,60,90]` | ช่วงในกราฟ aging |
| `low_stock` | 2 | เตือนรุ่นใกล้หมด |
| `reg_days` | 30 | เตือนเมื่อรอทะเบียนเกินกี่วัน |
| `follow_up_cadence` | `[7,30,90,365,1095]` | รอบติดตามลูกค้า (วัน) |
| `service_km` | `[500,1000,4000,8000]` | รอบเช็กระยะ — **ต้องใช้จริง ไม่ใช่ตั้งไว้เฉย ๆ** |
| `vat_pct` | 7 | |
| `finance_terms` | `[12,18,24,30,36,42,48]` | งวดที่ใช้เทียบ |
| `freebie_is_cost` | true | ของแถมหักจากกำไรหรือไม่ |
| `company_*` | — | **ชื่อ/ที่อยู่/เลขผู้เสียภาษี — v0.5 ฝังไว้ในโค้ด** |
| `work_start` / `work_end` | 08:30 / 17:30 | ใช้คิดสายและ OT |
| `ot_rate` | 1.5 | |
| `ssn_pct` / `ssn_cap` | 5 / 750 | ประกันสังคม |

---

## 4. RLS — เปิดทุกตารางที่มี `branch_id`

```sql
create or replace function my_branches() returns setof uuid
language sql stable security definer as $$
  select branch_id from app_user_branch where user_id = auth.uid()
$$;

create or replace function is_all_branch() returns boolean
language sql stable security definer as $$
  select coalesce((select all_branch from app_user where id = auth.uid()), false)
$$;

-- ใช้รูปแบบนี้กับทุกตารางที่มี branch_id
create policy branch_scope on sale for all to authenticated
using (is_all_branch() or branch_id in (select my_branches()))
with check (is_all_branch() or branch_id in (select my_branches()));
```

**ตารางที่ต้องเปิด RLS:** `motorcycle_unit`, `sale`, `registration`, `finance_case`, `receivable`,
`receipt_payment`, `document`, `quotation`, `service_job`, `part`, `part_movement`, `expense`,
`freebie`, `customer`, `follow_up_task`, `attendance`, `leave_request`, `payroll_line`, `promotion`, `attachment`

**สิทธิ์เพิ่มเติมที่ต้องบังคับด้วย:**
- คอลัมน์ต้นทุน/กำไร → ซ่อนจากบทบาทที่ไม่มีสิทธิ์ `money` (ทำเป็น view แยก)
- `customer.tax_id`, `employee.ssn_no`, `employee.bank_account` → เฉพาะบัญชี/HR/แอดมิน + **บันทึก `VIEW_PII` ลง audit log**
- `payroll_line` → เห็นได้เฉพาะแถวของตัวเอง เว้นแต่เป็น HR/ผู้บริหาร

---

## 5. ตารางเทียบ v0.5 → v1.0

| v0.5 | ปัญหา | แก้เป็น |
|---|---|---|
| `SALES.customer` = ชื่อลูกค้า | แก้ชื่อแล้วข้อมูลขาด | `sale.customer_id` |
| `TASKS.cust`, `LEAVES.who`, `ATT.who` = ชื่อ | เหมือนกัน | ผูกด้วย id ทั้งหมด |
| `ATT[i]` ↔ `STAFF[i]` ด้วยลำดับ | สลับลำดับ = ข้อมูลสลับคน | `attendance.employee_id` |
| id คันรถ/ผู้ใช้ ใช้ตัวสร้างเดียวกัน | เปราะ | UUID แยกตาราง |
| สาขาเป็นข้อความที่ derive มา | สิทธิ์รายสาขาทำไม่ได้ | ตาราง `branch` + `branch_id` ทุกตาราง |
| `'RC-' + จำนวนใบขาย` | เลขซ้ำ ผิดกฎสรรพากร | `doc_counter` + `next_doc_no()` |
| ไม่มีตาราง expense / service / payroll / registration / receivable | ทำงานจริงไม่ได้ | เพิ่มครบตาม §2 |
| ราคาขายเดาเป็น ต้นทุน + 15% | ตัวเลขผิด | `price_history` + ธง "รอกำหนดราคา" |
| ไม่มี audit | ตรวจสอบย้อนหลังไม่ได้ | `audit_log` + trigger |

---

## 6. ตารางที่เพิ่มในบรีฟแก้ไขครั้งที่ 1 (migration 16–18 · 13-14 ส.ค. 2569)

| ตาราง/คอลัมน์ | migration | ทำไม |
|---|---|---|
| `customer.birth_date` · `sale` +8 คอลัมน์ (snapshot เงินผ่อน 4 · `gifts`/`fin_approval`/`doc_ov` jsonb) · `finance_company.tiers/terms` · `freebie.price` · `expense.note/approval` | 16 | กลุ่มเงิน: ตัวเลข ณ วันขายถูกแช่ลงบันทึก (§9i) · การเงินตรวจก่อนออกใบกำกับ |
| `company` + `branch.company_id` | 17 | 3 "สาขา" เดิมแท้จริงคือ 3 บริษัท (A3) — ใบกำกับดึงชื่อ/เลขภาษีจากบริษัทของสาขา |
| `wholesale_partner/price/sale/sale_item` | 17 | ขายส่ง B2B หลายคันต่อบิล ราคาแยกชุดจากปลีก (F1-F3) — โอนข้ามบริษัทต้องมีบิล |
| `app_setting` คีย์ `perms` | 17 | ตารางสิทธิ์ role×section (J3) — แถวแอดมินไม่รับค่าทับ กันล็อกตัวเองออก |
| `leave_request.evidence/decide_note/created_at` | 18 | หลักฐานใบลา + เหตุผลตอนตีกลับ (K10/H6) |
| `offsite_request` | 18 | ขอออกนอกสถานที่ล่วงหน้า (H4) — ยื่นได้เฉพาะของตัวเองที่ระดับ RLS |
| `company_holiday` | 18 | วันหยุดบริษัทบนปฏิทิน (H5) — ทุกคนอ่าน แอดมิน/ผู้บริหารเขียน |
| bucket `hr-photo` (private) + `is_hr_boss()` | 18/18b | รูปลงเวลา+หลักฐานใบลา — โฟลเดอร์ต่อคน เขียนได้เฉพาะของตัวเอง อ่านได้เจ้าตัว+ผู้ตรวจ HR · 18b ถอนสิทธิ์ anon |

