-- 26 · การจองรถ (บรีฟรอบ 2 ข้อ 2 + คำตอบเจ้าของข้อ 1-2 · v1.37)
-- จอง = พักรถเป็นสถานะ reserved กันขายทับ ยังไม่ใช่การขาย · มัดจำเลือกได้ ยกเลิกคืน
-- หน้าสาธารณะไม่ต้องแก้: วิว pub นับเฉพาะ status='available' อยู่แล้ว รถติดจองจึงไม่โชว์ว่า "มี"

create table booking (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid references branch(id),
  customer_id   uuid references customer(id),
  unit_id       uuid references motorcycle_unit(id),
  name          text not null,
  phone         text not null,
  deposit       numeric not null default 0,
  deposit_no    text,
  status        text not null default 'จองอยู่',   -- จองอยู่ | เปิดขายแล้ว | ยกเลิก
  booked_at     date not null,
  sale_id       uuid references sale(id),
  canceled_at   date,
  cancel_reason text,
  refunded      boolean not null default false,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table booking enable row level security;
create policy booking_scope on booking for all to authenticated
  using (is_all_branch() or branch_id in (select my_branches()))
  with check (is_all_branch() or branch_id in (select my_branches()));
