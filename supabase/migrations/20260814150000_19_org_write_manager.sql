-- v1.22 · QA รอบส่งมอบ — สิทธิ์เขียนบริษัท/สาขาให้ตรงกับแอป
-- แอปให้ act:org กับ admin + manager (หน้า ตั้งค่า → บริษัทและสาขา) แต่ RLS เดิมให้เฉพาะ is_admin()
-- (branch_admin จาก migration 06 · company_write จาก migration 17) — manager กดแก้ = 42501
-- แล้วงานค้างในคิว write-through พังทั้งเส้น · แบบเดียวกับ wholesale_partner ที่เปิด admin+manager อยู่แล้ว
drop policy if exists branch_admin on branch;
create policy branch_admin on branch for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());

drop policy if exists company_write on company;
create policy company_write on company for all to authenticated
  using (is_admin() or is_manager()) with check (is_admin() or is_manager());
