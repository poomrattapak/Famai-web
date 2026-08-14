-- v1.19 · บรีฟแก้ไขครั้งที่ 1 กลุ่ม ⑤ — พนักงาน
-- ใบลา: หลักฐาน+เหตุผลตอนตัดสิน (K10/H6) · ขอออกนอกสถานที่ล่วงหน้า (H4)
-- วันหยุดบริษัท (H5) · bucket ส่วนตัวเก็บรูปลงเวลา/หลักฐานใบลา (H1/H6)

-- helper: ใครมีหน้าที่ตรวจฝั่ง HR — ตรงกับ canFixAtt ฝั่งหน้า (admin/manager/hr)
create or replace function is_hr_boss() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_user_role ur join role r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code in ('admin','manager','hr'));
$$;

-- ใบลา — approved_by/approved_at/reason มีแล้วจาก migration 03 เพิ่มเฉพาะที่ขาด
alter table leave_request
  add column if not exists evidence    jsonb not null default '[]'::jsonb,  -- path รูปใน bucket hr-photo
  add column if not exists decide_note text,                                -- เหตุผลตอนไม่อนุมัติ (K10)
  add column if not exists created_at  timestamptz not null default now();

-- ขอออกนอกสถานที่ล่วงหน้า (H4) — ยื่นได้เฉพาะของตัวเอง ผู้ตรวจ HR เป็นคนตัดสิน
create table if not exists offsite_request (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee(id),
  on_date     date not null,
  time_range  text,
  place       text not null,
  reason      text,
  status      text not null default 'รออนุมัติ',
  approved_by uuid references app_user(id),
  approved_at timestamptz,
  decide_note text,
  created_at  timestamptz not null default now()
);
alter table offsite_request enable row level security;
create policy offsite_sel on offsite_request for select to authenticated
  using (exists (select 1 from employee e where e.id = employee_id
          and (e.user_id = auth.uid() or is_all_branch() or e.branch_id in (select my_branches()))));
create policy offsite_ins on offsite_request for insert to authenticated
  with check (exists (select 1 from employee e where e.id = employee_id and e.user_id = auth.uid()));
create policy offsite_upd on offsite_request for update to authenticated
  using (is_hr_boss()) with check (is_hr_boss());

-- วันหยุดบริษัท (H5) — ทุกคนที่ล็อกอินอ่านได้ แอดมิน/ผู้บริหารเขียน
create table if not exists company_holiday (
  id         uuid primary key default gen_random_uuid(),
  on_date    date not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table company_holiday enable row level security;
create policy holiday_read  on company_holiday for select to authenticated using (true);
create policy holiday_write on company_holiday for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());

-- bucket ส่วนตัวรูป HR (รูปลงเวลา att/<uid>/… + หลักฐานใบลา leave/<uid>/…)
-- ไม่ public เด็ดขาด — รูปหน้า/พิกัด/ใบรับรองแพทย์เป็นข้อมูลอ่อนไหว (กฎ 13)
insert into storage.buckets (id, name, public) values ('hr-photo','hr-photo',false)
  on conflict (id) do nothing;
-- โฟลเดอร์ชั้นที่สองคือ uid เจ้าของ — เขียน/ทับได้เฉพาะของตัวเอง อ่านได้เจ้าของ+ผู้ตรวจ HR
create policy hr_photo_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-photo' and (storage.foldername(name))[2] = auth.uid()::text);
create policy hr_photo_upd on storage.objects for update to authenticated
  using (bucket_id = 'hr-photo' and (storage.foldername(name))[2] = auth.uid()::text);
create policy hr_photo_sel on storage.objects for select to authenticated
  using (bucket_id = 'hr-photo'
         and ((storage.foldername(name))[2] = auth.uid()::text or is_hr_boss()));
