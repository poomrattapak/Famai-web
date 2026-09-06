-- สำหรับเจ้าของโปรเจกต์ตรวจและรันด้วยตนเองใน SQL Editor ของ famai-motor
-- ต้นฉบับ 20260906102311_33_permission_guards.sql · SHA-256 483f8e98e7ae5c6cdb486cecca88593571e1c7a18b1d32c3d77bb4500e5a3acf
-- ธุรกรรมเดียว: หากส่วนใดผิดพลาด โครงสร้างและประวัติ migration ไม่ถูกบันทึกบางส่วน
BEGIN;

-- 33 · สิทธิ์ดู/แก้ระดับ API ของตารางเดิมที่หลายหน้าใช้ร่วมกัน
-- ใช้ action และหน้าต้นทางร่วมกัน โดยตรวจคอลัมน์เพื่อไม่ให้สิทธิ์งานหนึ่งแก้ข้อมูลอีกงาน

create or replace function famai_private.page_action(p_page text,p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.allowed('page:'||p_page,true) and famai_private.allowed('act:'||p_action,true)
$$;
create or replace function famai_private.allocate_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.has_role(array['admin','manager']) and famai_private.page_action('sell','allocateUnit')
$$;
create or replace function famai_private.void_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.has_role(array['admin','manager']) and famai_private.page_action('deal','voidSale')
$$;
create or replace function famai_private.parts_ok(p_mode text) returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.allowed('page:parts',true) and famai_private.has_role(
    case p_mode when 'part' then array['admin','manager','stock','tech','acct']
      when 'move' then array['admin','manager','stock','tech']
      else array['admin','manager','stock','sales'] end)
$$;

create or replace function famai_private.unit_write_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare price_changed boolean; identity_changed boolean; move_ok boolean:=false;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติคันรถ' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if not famai_private.any_page(array['recv','imp'],true) then
      raise exception 'ไม่มีสิทธิ์รับหรือนำเข้ารถ' using errcode='42501';
    end if;
    if new.status<>'available' then raise exception 'รถรับใหม่ต้องเริ่มที่พร้อมขาย' using errcode='23514'; end if;
    new.created_at:=clock_timestamp();
    return new;
  end if;
  new.created_at:=old.created_at;
  identity_changed:=(to_jsonb(new)-array['status','branch_id','retail','is_clearance','price_note','priced_by','priced_at'])
    is distinct from (to_jsonb(old)-array['status','branch_id','retail','is_clearance','price_note','priced_by','priced_at']);
  if identity_changed and not famai_private.any_page(array['recv','imp'],true) then
    raise exception 'ไม่มีสิทธิ์แก้ข้อมูลรับรถหรือต้นทุนคันรถ' using errcode='42501';
  end if;
  price_changed:=row(new.retail,new.is_clearance,new.price_note,new.priced_by,new.priced_at)
    is distinct from row(old.retail,old.is_clearance,old.price_note,old.priced_by,old.priced_at);
  if price_changed then
    if not (famai_private.allowed('page:stock',true) and famai_private.page_action('settings','editFin')) then
      raise exception 'ไม่มีสิทธิ์กำหนดราคาสต๊อก' using errcode='42501';
    end if;
    new.priced_at:=clock_timestamp(); new.priced_by:=auth.uid();
  end if;
  if row(new.status,new.branch_id) is not distinct from row(old.status,old.branch_id) then return new; end if;
  if new.branch_id is distinct from old.branch_id then
    move_ok:=(famai_private.page_action('transfer','transfer') and exists(
      select 1 from public.unit_transfer t where t.unit_id=new.id and t.from_branch=old.branch_id
        and t.to_branch=new.branch_id and t.status='received'))
      or (famai_private.page_action('invoice','wholesale') and exists(
        select 1 from public.wholesale_sale w join public.wholesale_sale_item i on i.ws_id=w.id
        where i.unit_id=new.id and ((w.branch_id=old.branch_id and w.dest_branch_id=new.branch_id and w.voided_at is null)
          or (w.branch_id=new.branch_id and w.dest_branch_id=old.branch_id and w.voided_at is not null))));
    if not move_ok then raise exception 'ย้ายสาขาต้องผ่านรายการโอนหรือขายส่งที่มีสิทธิ์' using errcode='42501'; end if;
  end if;
  if new.status is distinct from old.status then
    move_ok:=case
      when new.status='reserved' and old.status='available' then
        famai_private.page_action('booking','booking') and exists(select 1 from public.booking b
          where b.unit_id=new.id and b.status='จองอยู่' and famai_private.customer_ok(b.customer_id,true))
      when new.status='sold' then
        (famai_private.allocate_ok() and exists(select 1 from public.sale s where s.unit_id=new.id and s.voided_at is null))
        or (famai_private.page_action('invoice','wholesale') and exists(select 1 from public.wholesale_sale w
          join public.wholesale_sale_item i on i.ws_id=w.id where i.unit_id=new.id and w.voided_at is null))
      when new.status='in_transfer' and old.status='available' then
        famai_private.page_action('transfer','transfer') and exists(select 1 from public.unit_transfer t
          where t.unit_id=new.id and t.from_branch=old.branch_id and t.status='in_transit')
      when new.status='available' and old.status='reserved' then
        famai_private.page_action('booking','booking') and exists(select 1 from public.booking b
          where b.unit_id=new.id and b.status='ยกเลิก' and famai_private.customer_ok(b.customer_id,true))
      when new.status='available' and old.status='in_transfer' then
        famai_private.page_action('transfer','transfer') and exists(select 1 from public.unit_transfer t
          where t.unit_id=new.id and t.to_branch=new.branch_id and t.status='received')
      when new.status='available' and old.status='sold' then
        (famai_private.void_ok() and exists(select 1 from public.sale s where s.unit_id=new.id and s.voided_at is not null))
        or (famai_private.page_action('invoice','wholesale') and exists(select 1 from public.wholesale_sale w
          join public.wholesale_sale_item i on i.ws_id=w.id where i.unit_id=new.id and w.voided_at is not null))
      else false end;
    if not move_ok then raise exception 'ไม่มีสิทธิ์หรือรายการต้นทางสำหรับเปลี่ยนสถานะรถ' using errcode='42501'; end if;
    if new.status='available' and exists(select 1 from public.sale s where s.unit_id=new.id and s.voided_at is null) then
      raise exception 'คันรถยังมีการขายที่ไม่ยกเลิก' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger unit_permission_guard before insert or update or delete on public.motorcycle_unit
for each row execute function famai_private.unit_write_guard();

create or replace function famai_private.inventory_write_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare metadata_ok boolean; quantity_ok boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  metadata_ok:=famai_private.parts_ok(case when tg_table_name='part' then 'part' else 'gift' end);
  if tg_op in ('INSERT','DELETE') then
    if not metadata_ok then raise exception 'ไม่มีสิทธิ์เพิ่มหรือแก้ข้อมูลอะไหล่และของแถม' using errcode='42501'; end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if (to_jsonb(new)-'qty_on_hand') is distinct from (to_jsonb(old)-'qty_on_hand') and not metadata_ok then
    raise exception 'สิทธิ์ตัดจำนวนไม่ใช่สิทธิ์แก้ชื่อ ราคา หรือต้นทุนสินค้า' using errcode='42501';
  end if;
  if new.qty_on_hand is distinct from old.qty_on_hand then
    quantity_ok:=case when tg_table_name='part' then famai_private.parts_ok('move')
      or (famai_private.allowed('page:service',true) and new.qty_on_hand<=old.qty_on_hand)
      else famai_private.parts_ok('gift')
        or (famai_private.allocate_ok() and new.qty_on_hand<=old.qty_on_hand)
        or (famai_private.void_ok() and new.qty_on_hand>=old.qty_on_hand) end;
    if not quantity_ok then raise exception 'ไม่มีสิทธิ์เปลี่ยนจำนวนสินค้าในงานนี้' using errcode='42501'; end if;
    if new.qty_on_hand<0 then raise exception 'จำนวนคงเหลือติดลบไม่ได้' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger part_permission_guard before insert or update or delete on public.part
for each row execute function famai_private.inventory_write_guard();
create trigger freebie_permission_guard before insert or update or delete on public.freebie
for each row execute function famai_private.inventory_write_guard();

create or replace function famai_private.movement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op<>'INSERT' then raise exception 'เก็บประวัติการเคลื่อนไหวเดิมและเพิ่มรายการปรับใหม่' using errcode='42501'; end if;
  if not (famai_private.parts_ok('move') or (famai_private.allowed('page:service',true)
    and new.kind='job' and new.qty<0 and exists(select 1 from public.service_job j
      where j.id=new.job_id and j.branch_id=new.branch_id and famai_private.customer_ok(j.customer_id,true)))) then
    raise exception 'ไม่มีสิทธิ์ลงเคลื่อนไหวอะไหล่ในงานนี้' using errcode='42501';
  end if;
  if not exists(select 1 from public.part p where p.id=new.part_id and p.branch_id=new.branch_id) then
    raise exception 'อะไหล่และงานเคลื่อนไหวต้องอยู่สาขาเดียวกัน' using errcode='23514';
  end if;
  new.at:=clock_timestamp(); new.by_user:=auth.uid();
  return new;
end $$;
create trigger part_movement_permission_guard before insert or update or delete on public.part_movement
for each row execute function famai_private.movement_guard();

create or replace function famai_private.expense_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if not famai_private.allowed('page:expense',true) then
    raise exception 'หน้าค่าใช้จ่ายไม่มีสิทธิ์เขียน' using errcode='42501';
  end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติค่าใช้จ่าย' using errcode='42501'; end if;
  if (tg_op='INSERT' and coalesce(new.approval->>'status','รอตรวจ')<>'รอตรวจ')
    or (tg_op='UPDATE' and new.approval is distinct from old.approval) then
    if not famai_private.allowed('act:finApprove',true) then
      raise exception 'ไม่มีสิทธิ์ตรวจค่าใช้จ่าย' using errcode='42501';
    end if;
    new.approval:=new.approval||jsonb_build_object('at',clock_timestamp(),'by_id',auth.uid());
  end if;
  if tg_op='INSERT' then new.created_by:=auth.uid(); else new.created_by:=old.created_by; end if;
  return new;
end $$;
create trigger expense_permission_guard before insert or update or delete on public.expense
for each row execute function famai_private.expense_guard();

create or replace function famai_private.wholesale_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare commerce_changed boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติขายส่ง' using errcode='42501'; end if;
  if tg_op='INSERT' then commerce_changed:=true;
  else commerce_changed:=(to_jsonb(new)-array['fin_approval','tax_no','bill_no','created_at'])
      is distinct from (to_jsonb(old)-array['fin_approval','tax_no','bill_no','created_at']); end if;
  if commerce_changed and not famai_private.page_action('invoice','wholesale') then
    raise exception 'ไม่มีสิทธิ์เปิดหรือแก้ขายส่ง' using errcode='42501';
  end if;
  if (tg_op='INSERT' and coalesce(new.fin_approval->>'status','รอตรวจ')<>'รอตรวจ')
    or (tg_op='UPDATE' and new.fin_approval is distinct from old.fin_approval) then
    if not famai_private.page_action('invoice','finApprove') then
      raise exception 'ไม่มีสิทธิ์ตรวจการเงินขายส่ง' using errcode='42501';
    end if;
    if new.voided_at is not null then raise exception 'บิลยกเลิกแล้วตรวจผ่านไม่ได้' using errcode='23514'; end if;
    new.fin_approval:=new.fin_approval||jsonb_build_object('at',clock_timestamp(),'by_id',auth.uid());
  end if;
  if tg_op='UPDATE' then
    if row(new.tax_no,new.bill_no) is distinct from row(old.tax_no,old.bill_no)
      and not famai_private.page_action('invoice','printDoc') then
      raise exception 'ไม่มีสิทธิ์ออกเอกสารขายส่ง' using errcode='42501';
    end if;
    if new.voided_at is distinct from old.voided_at then
      if not famai_private.page_action('invoice','wholesale') then
        raise exception 'ไม่มีสิทธิ์ยกเลิกขายส่ง' using errcode='42501';
      end if;
      if old.fin_approval->>'status'='ผ่าน' or old.tax_no is not null then
        raise exception 'บิลผ่านการเงินหรือออกภาษีแล้วห้ามยกเลิกทางนี้' using errcode='23514';
      end if;
      if old.voided_at is not null and new.voided_at is null then
        raise exception 'คืนสถานะบิลที่ยกเลิกแล้วไม่ได้' using errcode='23514';
      end if;
      new.voided_at:=clock_timestamp();
      select coalesce(nickname,full_name) into new.voided_by from public.app_user where id=auth.uid();
    end if;
    new.created_at:=old.created_at;
  else new.created_at:=clock_timestamp(); end if;
  return new;
end $$;
create trigger wholesale_permission_guard before insert or update or delete on public.wholesale_sale
for each row execute function famai_private.wholesale_guard();

create or replace function famai_private.sale_approval_page_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if auth.uid() is not null and new.fin_approval is distinct from old.fin_approval
    and not famai_private.allowed('page:deal',true) then
    raise exception 'ผลตรวจการขายต้องมีสิทธิ์เขียนหน้าดีล' using errcode='42501';
  end if;
  return new;
end $$;
create trigger sale_permission_page_guard before update on public.sale
for each row execute function famai_private.sale_approval_page_guard();

create or replace function famai_private.transfer_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติโอนรถ' using errcode='42501'; end if;
  if not famai_private.page_action('transfer','transfer') then
    raise exception 'ไม่มีสิทธิ์โอนรถ' using errcode='42501';
  end if;
  if (select company_id from public.branch where id=new.from_branch)
    is distinct from (select company_id from public.branch where id=new.to_branch) then
    raise exception 'โอนข้ามบริษัทต้องเปิดขายส่ง' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    if new.status<>'in_transit' or new.from_branch=new.to_branch
      or not exists(select 1 from public.motorcycle_unit u where u.id=new.unit_id
        and u.branch_id=new.from_branch and u.status='available') then
      raise exception 'คันรถหรือสาขาของรายการโอนไม่ถูกต้อง' using errcode='23514';
    end if;
    new.requested_at:=clock_timestamp(); new.received_at:=null;
  else
    if row(new.unit_id,new.from_branch,new.to_branch) is distinct from row(old.unit_id,old.from_branch,old.to_branch) then
      raise exception 'เปลี่ยนคันหรือสาขาของรายการโอนเดิมไม่ได้' using errcode='23514';
    end if;
    new.requested_at:=old.requested_at;
    if new.status is distinct from old.status then
      if old.status<>'in_transit' or new.status<>'received' then
        raise exception 'สถานะรับโอนไม่ถูกต้อง' using errcode='23514';
      end if;
      new.received_at:=clock_timestamp();
    else new.received_at:=old.received_at; end if;
  end if;
  return new;
end $$;
create trigger transfer_permission_guard before insert or update or delete on public.unit_transfer
for each row execute function famai_private.transfer_guard();

-- punch_clock เป็น SECURITY DEFINER: ใช้ trigger INVOKER เพื่อแยก RPC จับเวลาจริงจาก PATCH ตรง
create or replace function famai_private.attendance_write_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบหลักฐานลงเวลา' using errcode='42501'; end if;
  if not famai_private.allowed('page:hr',true) then
    raise exception 'ไม่มีสิทธิ์ทำรายการหน้าบุคลากร' using errcode='42501';
  end if;
  if current_user in ('authenticated','anon') then
    if not famai_private.allowed('act:hrApprove',true) then
      raise exception 'ลงเวลาต้องใช้จุดลงเวลาที่ตรวจหลักฐาน' using errcode='42501';
    end if;
  elsif not exists(select 1 from public.employee e where e.id=new.employee_id and e.user_id=auth.uid()) then
    raise exception 'ลงเวลาได้เฉพาะตัวเอง' using errcode='42501';
  end if;
  return new;
end $$;
create trigger attendance_permission_guard before insert or update or delete on public.attendance
for each row execute function famai_private.attendance_write_guard();

create or replace function famai_private.doc_counter_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare permitted boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' or current_user in ('authenticated','anon') then
    raise exception 'เลขเอกสารต้องผ่านตัวนับกลาง ห้ามแก้หรือนำเลขกลับมาใช้' using errcode='42501';
  end if;
  permitted:=case new.doc_type
    when 'SALE' then famai_private.allocate_ok()
    when 'WSALE' then famai_private.page_action('invoice','wholesale')
    when 'QUOTE' then famai_private.allowed('page:quote',true)
    when 'SERVICE' then famai_private.allowed('page:service',true) or famai_private.page_action('aftercare','care')
    when 'RECEIPT' then famai_private.page_action('booking','booking')
      or (famai_private.allowed('act:printDoc',true) and famai_private.any_page(array['invoice','deal'],true))
    when 'BILLING' then famai_private.page_action('invoice','printDoc')
    when 'TAX' then famai_private.allowed('act:printDoc',true) and famai_private.any_page(array['invoice','deal'],true)
    else false end;
  if not permitted or not famai_private.branch_ok(new.branch_id) then
    raise exception 'ไม่มีสิทธิ์ออกเลขเอกสารประเภทนี้ในสาขานี้' using errcode='42501';
  end if;
  return new;
end $$;
create trigger doc_counter_permission_guard before insert or update or delete on public.doc_counter
for each row execute function famai_private.doc_counter_guard();

-- ห้ามเปลี่ยนตัวตนงานเดิมเพื่ออาศัย USING ของ source เดิมแล้วบันทึกเป็น source ใหม่
create or replace function famai_private.task_identity_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.branch_id,new.customer_id,new.sale_id,new.task_source,new.service_job_id,new.parent_task_id)
    is distinct from row(old.id,old.branch_id,old.customer_id,old.sale_id,old.task_source,old.service_job_id,old.parent_task_id) then
    raise exception 'ตัวตนและแหล่งงานติดตามเดิมเปลี่ยนไม่ได้' using errcode='23514';
  end if;
  return new;
end $$;

create policy receivable_permission_update on public.receivable as restrictive for update to authenticated
using(famai_private.page_action('ar','finApprove')) with check(famai_private.page_action('ar','finApprove'));
create policy payment_permission_insert on public.receipt_payment as restrictive for insert to authenticated
with check(famai_private.page_action('ar','finApprove'));
create policy payment_permission_update on public.receipt_payment as restrictive for update to authenticated
using(famai_private.page_action('ar','finApprove')) with check(famai_private.page_action('ar','finApprove'));

-- สิทธิ์หน้าเดียวกันต้องใช้กับไฟล์จริงด้วย คงด่านเจ้าของ path ของ hr-photo เดิม
create policy brief33_storage_write_i on storage.objects as restrictive for insert to authenticated
with check((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)));
create policy brief33_storage_write_u on storage.objects as restrictive for update to authenticated
using((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)))
with check((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)));
create policy brief33_storage_write_d on storage.objects as restrictive for delete to authenticated
using((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)));
create policy brief33_model_storage_i on storage.objects for insert to authenticated
with check(bucket_id='model-photo' and famai_private.allowed('page:settings',true));
create policy brief33_model_storage_u on storage.objects for update to authenticated
using(bucket_id='model-photo' and famai_private.allowed('page:settings',true))
with check(bucket_id='model-photo' and famai_private.allowed('page:settings',true));
create policy brief33_model_storage_d on storage.objects for delete to authenticated
using(bucket_id='model-photo' and famai_private.allowed('page:settings',true));
create trigger task_identity_permission_guard before update on public.follow_up_task
for each row execute function famai_private.task_identity_guard();

-- เก็บ RLS สาขาเดิม แล้วเพิ่มด่านเฉพาะการเขียน ไม่เปลี่ยนหน้าอ่านเป็นหน้าเขียน
do $$ declare t text; gate text; begin
  for t,gate in select * from (values
    ('unit_transfer','famai_private.page_action(''transfer'',''transfer'')'),
    ('wholesale_sale_item','famai_private.page_action(''invoice'',''wholesale'')'),
    ('sale_freebie','famai_private.allocate_ok()'),
    ('other_doc','famai_private.page_action(''invoice'',''printDoc'')'),
    ('import_log','famai_private.allowed(''page:imp'',true)')
  ) x(t,gate) loop
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(%s)',t||'_permission_i',t,gate);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(%s) with check(%s)',t||'_permission_u',t,gate,gate);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(%s)',t||'_permission_d',t,gate);
  end loop;
end $$;

-- บรีฟ B18: ด่านเขียนหน้าจอสำหรับตารางตั้งค่าและบุคลากร
-- ส่วนนี้เพิ่มด่าน restrictive โดยไม่เปลี่ยน SELECT หรือขอบเขตสาขาเดิม
-- ตารางตั้งค่าที่เดิมจำกัดบทบาท เพิ่มทางเขียนตามสิทธิ์ที่แอดมินกำหนดตรง UI
-- (company/branch/partner เป็นข้อมูลตั้งค่ากลาง ไม่มีการทำรายการขายผ่านตารางเหล่านี้)
do $$
declare t text; gate text; p text; a text; rec record;
begin
  for rec in select * from (values
    ('company','settings','org'), ('branch','settings','org'),
    ('wholesale_partner','settings','org'), ('wholesale_price','settings','org'),
    ('branch_site','settings','sites'), ('company_event','cal','execCal'),
    ('company_holiday','cal','execCal'), ('model_photo','settings',null)
  ) as cfg(tbl,page,act)
  loop
    t:=rec.tbl;
    gate:=format('famai_private.allowed(%L,true)','page:'||rec.page);
    if rec.act is not null then gate:=gate||format(' and famai_private.allowed(%L,true)','act:'||rec.act); end if;
    -- site เป็นจุดลงเวลาประจำสาขา จึงตรวจสาขาทั้งแถวเก่าและแถวใหม่
    if t='branch_site' then gate:=gate||' and famai_private.branch_ok(branch_id)'; end if;
    execute format('create policy %I on public.%I for insert to authenticated with check(%s)',t||'_brief33_allow_i',t,gate);
    execute format('create policy %I on public.%I for update to authenticated using(%s) with check(%s)',t||'_brief33_allow_u',t,gate,gate);
    execute format('create policy %I on public.%I for delete to authenticated using(%s)',t||'_brief33_allow_d',t,gate);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(%s)',t||'_brief33_gate_i',t,gate);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(%s) with check(%s)',t||'_brief33_gate_u',t,gate,gate);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(%s)',t||'_brief33_gate_d',t,gate);
  end loop;
  for rec in select * from (values
    ('app_setting','famai_private.allowed(''page:settings'',true) and famai_private.has_role(array[''admin''])'),
    ('employee','famai_private.allowed(''page:users'',true) and famai_private.has_role(array[''admin''])'),
    ('app_user_role','famai_private.allowed(''page:users'',true) and famai_private.has_role(array[''admin''])'),
    ('app_user_branch','famai_private.allowed(''page:users'',true) and famai_private.has_role(array[''admin''])'),
    ('payroll_period','famai_private.allowed(''page:payroll'',true)'),
    ('payroll_line','famai_private.allowed(''page:payroll'',true)'),
    ('leave_request','famai_private.allowed(''page:hr'',true)'),
    ('offsite_request','famai_private.allowed(''page:hr'',true)')
  ) as cfg(tbl,expr)
  loop
    t:=rec.tbl; gate:=rec.expr;
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(%s)',t||'_brief33_gate_i',t,gate);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(%s) with check(%s)',t||'_brief33_gate_u',t,gate,gate);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(%s)',t||'_brief33_gate_d',t,gate);
  end loop;
end $$;

-- ใบลาและคำขอออกนอกสถานที่: ยื่นเองได้ อนุมัติตัวเองไม่ได้ และแก้เนื้อหาแอบในคำสั่งอนุมัติไม่ได้
create or replace function famai_private.hr_request_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare staff_user uuid; staff_branch uuid; j jsonb;
begin
  if auth.uid() is null then
    if current_setting('role',true) in ('anon','authenticated') then raise exception 'ต้องเข้าสู่ระบบ' using errcode='42501'; end if;
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if not famai_private.allowed('page:hr',true) then raise exception 'ไม่มีสิทธิ์แก้ไขหน้าบุคลากร' using errcode='42501'; end if;
  if TG_OP='DELETE' then raise exception 'คำขอบุคลากรต้องคงประวัติไว้' using errcode='42501'; end if;
  select e.user_id,e.branch_id into staff_user,staff_branch from public.employee e where e.id=new.employee_id;
  if not found or not famai_private.branch_ok(staff_branch) then raise exception 'พนักงานอยู่นอกสาขาที่ดูแล' using errcode='42501'; end if;
  if TG_OP='INSERT' then
    if staff_user is distinct from auth.uid() or new.status<>'รออนุมัติ'
      or new.approved_by is not null or new.approved_at is not null or new.decide_note is not null then
      raise exception 'ยื่นได้เฉพาะคำขอรออนุมัติของตนเอง' using errcode='42501';
    end if;
  else
    if staff_user is not distinct from auth.uid() or not famai_private.allowed('act:hrApprove',true) then
      raise exception 'ต้องให้ผู้มีสิทธิ์คนอื่นตรวจคำขอ' using errcode='42501';
    end if;
    if (to_jsonb(new)-array['status','approved_by','approved_at','decide_note']) is distinct from
       (to_jsonb(old)-array['status','approved_by','approved_at','decide_note']) then
      raise exception 'การตรวจคำขอแก้เนื้อหาเดิมไม่ได้' using errcode='42501';
    end if;
    if old.status<>'รออนุมัติ' or new.status not in ('อนุมัติแล้ว','ไม่อนุมัติ') then
      raise exception 'คำขอนี้ไม่ได้อยู่ระหว่างรออนุมัติ' using errcode='42501';
    end if;
    if new.status='ไม่อนุมัติ' and coalesce(btrim(new.decide_note),'')='' then
      raise exception 'ไม่อนุมัติต้องระบุเหตุผล' using errcode='23514';
    end if;
    new.approved_by:=auth.uid(); new.approved_at:=now();
  end if;
  return new;
end $$;
create trigger leave_request_brief33_guard before insert or update or delete on public.leave_request
for each row execute function famai_private.hr_request_guard();
create trigger offsite_request_brief33_guard before insert or update or delete on public.offsite_request
for each row execute function famai_private.hr_request_guard();
-- offsite_upd เดิมจำกัดบทบาทคงที่ จึงเปิดการตรวจผ่านสิทธิ์ที่แอดมินตั้ง โดย trigger ยังตรวจเจ้าของ/สาขา/เนื้อหา
create policy offsite_brief33_review on public.offsite_request for update to authenticated
using(famai_private.allowed('page:hr',true) and famai_private.allowed('act:hrApprove',true))
with check(famai_private.allowed('page:hr',true) and famai_private.allowed('act:hrApprove',true));
revoke all on function famai_private.hr_request_guard() from public, anon;
grant execute on function famai_private.hr_request_guard() to authenticated, service_role;
-- ต้องเติมด่าน page:hr write ใน RPC punch_clock (SECURITY DEFINER) ด้วย RLS attendance เพียงอย่างเดียวไม่ครอบคลุม

revoke all on all functions in schema famai_private from public,anon;
grant execute on all functions in schema famai_private to authenticated,service_role;
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260906102311', '33_permission_guards', ARRAY[$release_source_33$-- 33 · สิทธิ์ดู/แก้ระดับ API ของตารางเดิมที่หลายหน้าใช้ร่วมกัน
-- ใช้ action และหน้าต้นทางร่วมกัน โดยตรวจคอลัมน์เพื่อไม่ให้สิทธิ์งานหนึ่งแก้ข้อมูลอีกงาน

create or replace function famai_private.page_action(p_page text,p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.allowed('page:'||p_page,true) and famai_private.allowed('act:'||p_action,true)
$$;
create or replace function famai_private.allocate_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.has_role(array['admin','manager']) and famai_private.page_action('sell','allocateUnit')
$$;
create or replace function famai_private.void_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.has_role(array['admin','manager']) and famai_private.page_action('deal','voidSale')
$$;
create or replace function famai_private.parts_ok(p_mode text) returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.allowed('page:parts',true) and famai_private.has_role(
    case p_mode when 'part' then array['admin','manager','stock','tech','acct']
      when 'move' then array['admin','manager','stock','tech']
      else array['admin','manager','stock','sales'] end)
$$;

create or replace function famai_private.unit_write_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare price_changed boolean; identity_changed boolean; move_ok boolean:=false;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติคันรถ' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if not famai_private.any_page(array['recv','imp'],true) then
      raise exception 'ไม่มีสิทธิ์รับหรือนำเข้ารถ' using errcode='42501';
    end if;
    if new.status<>'available' then raise exception 'รถรับใหม่ต้องเริ่มที่พร้อมขาย' using errcode='23514'; end if;
    new.created_at:=clock_timestamp();
    return new;
  end if;
  new.created_at:=old.created_at;
  identity_changed:=(to_jsonb(new)-array['status','branch_id','retail','is_clearance','price_note','priced_by','priced_at'])
    is distinct from (to_jsonb(old)-array['status','branch_id','retail','is_clearance','price_note','priced_by','priced_at']);
  if identity_changed and not famai_private.any_page(array['recv','imp'],true) then
    raise exception 'ไม่มีสิทธิ์แก้ข้อมูลรับรถหรือต้นทุนคันรถ' using errcode='42501';
  end if;
  price_changed:=row(new.retail,new.is_clearance,new.price_note,new.priced_by,new.priced_at)
    is distinct from row(old.retail,old.is_clearance,old.price_note,old.priced_by,old.priced_at);
  if price_changed then
    if not (famai_private.allowed('page:stock',true) and famai_private.page_action('settings','editFin')) then
      raise exception 'ไม่มีสิทธิ์กำหนดราคาสต๊อก' using errcode='42501';
    end if;
    new.priced_at:=clock_timestamp(); new.priced_by:=auth.uid();
  end if;
  if row(new.status,new.branch_id) is not distinct from row(old.status,old.branch_id) then return new; end if;
  if new.branch_id is distinct from old.branch_id then
    move_ok:=(famai_private.page_action('transfer','transfer') and exists(
      select 1 from public.unit_transfer t where t.unit_id=new.id and t.from_branch=old.branch_id
        and t.to_branch=new.branch_id and t.status='received'))
      or (famai_private.page_action('invoice','wholesale') and exists(
        select 1 from public.wholesale_sale w join public.wholesale_sale_item i on i.ws_id=w.id
        where i.unit_id=new.id and ((w.branch_id=old.branch_id and w.dest_branch_id=new.branch_id and w.voided_at is null)
          or (w.branch_id=new.branch_id and w.dest_branch_id=old.branch_id and w.voided_at is not null))));
    if not move_ok then raise exception 'ย้ายสาขาต้องผ่านรายการโอนหรือขายส่งที่มีสิทธิ์' using errcode='42501'; end if;
  end if;
  if new.status is distinct from old.status then
    move_ok:=case
      when new.status='reserved' and old.status='available' then
        famai_private.page_action('booking','booking') and exists(select 1 from public.booking b
          where b.unit_id=new.id and b.status='จองอยู่' and famai_private.customer_ok(b.customer_id,true))
      when new.status='sold' then
        (famai_private.allocate_ok() and exists(select 1 from public.sale s where s.unit_id=new.id and s.voided_at is null))
        or (famai_private.page_action('invoice','wholesale') and exists(select 1 from public.wholesale_sale w
          join public.wholesale_sale_item i on i.ws_id=w.id where i.unit_id=new.id and w.voided_at is null))
      when new.status='in_transfer' and old.status='available' then
        famai_private.page_action('transfer','transfer') and exists(select 1 from public.unit_transfer t
          where t.unit_id=new.id and t.from_branch=old.branch_id and t.status='in_transit')
      when new.status='available' and old.status='reserved' then
        famai_private.page_action('booking','booking') and exists(select 1 from public.booking b
          where b.unit_id=new.id and b.status='ยกเลิก' and famai_private.customer_ok(b.customer_id,true))
      when new.status='available' and old.status='in_transfer' then
        famai_private.page_action('transfer','transfer') and exists(select 1 from public.unit_transfer t
          where t.unit_id=new.id and t.to_branch=new.branch_id and t.status='received')
      when new.status='available' and old.status='sold' then
        (famai_private.void_ok() and exists(select 1 from public.sale s where s.unit_id=new.id and s.voided_at is not null))
        or (famai_private.page_action('invoice','wholesale') and exists(select 1 from public.wholesale_sale w
          join public.wholesale_sale_item i on i.ws_id=w.id where i.unit_id=new.id and w.voided_at is not null))
      else false end;
    if not move_ok then raise exception 'ไม่มีสิทธิ์หรือรายการต้นทางสำหรับเปลี่ยนสถานะรถ' using errcode='42501'; end if;
    if new.status='available' and exists(select 1 from public.sale s where s.unit_id=new.id and s.voided_at is null) then
      raise exception 'คันรถยังมีการขายที่ไม่ยกเลิก' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger unit_permission_guard before insert or update or delete on public.motorcycle_unit
for each row execute function famai_private.unit_write_guard();

create or replace function famai_private.inventory_write_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare metadata_ok boolean; quantity_ok boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  metadata_ok:=famai_private.parts_ok(case when tg_table_name='part' then 'part' else 'gift' end);
  if tg_op in ('INSERT','DELETE') then
    if not metadata_ok then raise exception 'ไม่มีสิทธิ์เพิ่มหรือแก้ข้อมูลอะไหล่และของแถม' using errcode='42501'; end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if (to_jsonb(new)-'qty_on_hand') is distinct from (to_jsonb(old)-'qty_on_hand') and not metadata_ok then
    raise exception 'สิทธิ์ตัดจำนวนไม่ใช่สิทธิ์แก้ชื่อ ราคา หรือต้นทุนสินค้า' using errcode='42501';
  end if;
  if new.qty_on_hand is distinct from old.qty_on_hand then
    quantity_ok:=case when tg_table_name='part' then famai_private.parts_ok('move')
      or (famai_private.allowed('page:service',true) and new.qty_on_hand<=old.qty_on_hand)
      else famai_private.parts_ok('gift')
        or (famai_private.allocate_ok() and new.qty_on_hand<=old.qty_on_hand)
        or (famai_private.void_ok() and new.qty_on_hand>=old.qty_on_hand) end;
    if not quantity_ok then raise exception 'ไม่มีสิทธิ์เปลี่ยนจำนวนสินค้าในงานนี้' using errcode='42501'; end if;
    if new.qty_on_hand<0 then raise exception 'จำนวนคงเหลือติดลบไม่ได้' using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger part_permission_guard before insert or update or delete on public.part
for each row execute function famai_private.inventory_write_guard();
create trigger freebie_permission_guard before insert or update or delete on public.freebie
for each row execute function famai_private.inventory_write_guard();

create or replace function famai_private.movement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op<>'INSERT' then raise exception 'เก็บประวัติการเคลื่อนไหวเดิมและเพิ่มรายการปรับใหม่' using errcode='42501'; end if;
  if not (famai_private.parts_ok('move') or (famai_private.allowed('page:service',true)
    and new.kind='job' and new.qty<0 and exists(select 1 from public.service_job j
      where j.id=new.job_id and j.branch_id=new.branch_id and famai_private.customer_ok(j.customer_id,true)))) then
    raise exception 'ไม่มีสิทธิ์ลงเคลื่อนไหวอะไหล่ในงานนี้' using errcode='42501';
  end if;
  if not exists(select 1 from public.part p where p.id=new.part_id and p.branch_id=new.branch_id) then
    raise exception 'อะไหล่และงานเคลื่อนไหวต้องอยู่สาขาเดียวกัน' using errcode='23514';
  end if;
  new.at:=clock_timestamp(); new.by_user:=auth.uid();
  return new;
end $$;
create trigger part_movement_permission_guard before insert or update or delete on public.part_movement
for each row execute function famai_private.movement_guard();

create or replace function famai_private.expense_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if not famai_private.allowed('page:expense',true) then
    raise exception 'หน้าค่าใช้จ่ายไม่มีสิทธิ์เขียน' using errcode='42501';
  end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติค่าใช้จ่าย' using errcode='42501'; end if;
  if (tg_op='INSERT' and coalesce(new.approval->>'status','รอตรวจ')<>'รอตรวจ')
    or (tg_op='UPDATE' and new.approval is distinct from old.approval) then
    if not famai_private.allowed('act:finApprove',true) then
      raise exception 'ไม่มีสิทธิ์ตรวจค่าใช้จ่าย' using errcode='42501';
    end if;
    new.approval:=new.approval||jsonb_build_object('at',clock_timestamp(),'by_id',auth.uid());
  end if;
  if tg_op='INSERT' then new.created_by:=auth.uid(); else new.created_by:=old.created_by; end if;
  return new;
end $$;
create trigger expense_permission_guard before insert or update or delete on public.expense
for each row execute function famai_private.expense_guard();

create or replace function famai_private.wholesale_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare commerce_changed boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติขายส่ง' using errcode='42501'; end if;
  if tg_op='INSERT' then commerce_changed:=true;
  else commerce_changed:=(to_jsonb(new)-array['fin_approval','tax_no','bill_no','created_at'])
      is distinct from (to_jsonb(old)-array['fin_approval','tax_no','bill_no','created_at']); end if;
  if commerce_changed and not famai_private.page_action('invoice','wholesale') then
    raise exception 'ไม่มีสิทธิ์เปิดหรือแก้ขายส่ง' using errcode='42501';
  end if;
  if (tg_op='INSERT' and coalesce(new.fin_approval->>'status','รอตรวจ')<>'รอตรวจ')
    or (tg_op='UPDATE' and new.fin_approval is distinct from old.fin_approval) then
    if not famai_private.page_action('invoice','finApprove') then
      raise exception 'ไม่มีสิทธิ์ตรวจการเงินขายส่ง' using errcode='42501';
    end if;
    if new.voided_at is not null then raise exception 'บิลยกเลิกแล้วตรวจผ่านไม่ได้' using errcode='23514'; end if;
    new.fin_approval:=new.fin_approval||jsonb_build_object('at',clock_timestamp(),'by_id',auth.uid());
  end if;
  if tg_op='UPDATE' then
    if row(new.tax_no,new.bill_no) is distinct from row(old.tax_no,old.bill_no)
      and not famai_private.page_action('invoice','printDoc') then
      raise exception 'ไม่มีสิทธิ์ออกเอกสารขายส่ง' using errcode='42501';
    end if;
    if new.voided_at is distinct from old.voided_at then
      if not famai_private.page_action('invoice','wholesale') then
        raise exception 'ไม่มีสิทธิ์ยกเลิกขายส่ง' using errcode='42501';
      end if;
      if old.fin_approval->>'status'='ผ่าน' or old.tax_no is not null then
        raise exception 'บิลผ่านการเงินหรือออกภาษีแล้วห้ามยกเลิกทางนี้' using errcode='23514';
      end if;
      if old.voided_at is not null and new.voided_at is null then
        raise exception 'คืนสถานะบิลที่ยกเลิกแล้วไม่ได้' using errcode='23514';
      end if;
      new.voided_at:=clock_timestamp();
      select coalesce(nickname,full_name) into new.voided_by from public.app_user where id=auth.uid();
    end if;
    new.created_at:=old.created_at;
  else new.created_at:=clock_timestamp(); end if;
  return new;
end $$;
create trigger wholesale_permission_guard before insert or update or delete on public.wholesale_sale
for each row execute function famai_private.wholesale_guard();

create or replace function famai_private.sale_approval_page_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if auth.uid() is not null and new.fin_approval is distinct from old.fin_approval
    and not famai_private.allowed('page:deal',true) then
    raise exception 'ผลตรวจการขายต้องมีสิทธิ์เขียนหน้าดีล' using errcode='42501';
  end if;
  return new;
end $$;
create trigger sale_permission_page_guard before update on public.sale
for each row execute function famai_private.sale_approval_page_guard();

create or replace function famai_private.transfer_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบประวัติโอนรถ' using errcode='42501'; end if;
  if not famai_private.page_action('transfer','transfer') then
    raise exception 'ไม่มีสิทธิ์โอนรถ' using errcode='42501';
  end if;
  if (select company_id from public.branch where id=new.from_branch)
    is distinct from (select company_id from public.branch where id=new.to_branch) then
    raise exception 'โอนข้ามบริษัทต้องเปิดขายส่ง' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    if new.status<>'in_transit' or new.from_branch=new.to_branch
      or not exists(select 1 from public.motorcycle_unit u where u.id=new.unit_id
        and u.branch_id=new.from_branch and u.status='available') then
      raise exception 'คันรถหรือสาขาของรายการโอนไม่ถูกต้อง' using errcode='23514';
    end if;
    new.requested_at:=clock_timestamp(); new.received_at:=null;
  else
    if row(new.unit_id,new.from_branch,new.to_branch) is distinct from row(old.unit_id,old.from_branch,old.to_branch) then
      raise exception 'เปลี่ยนคันหรือสาขาของรายการโอนเดิมไม่ได้' using errcode='23514';
    end if;
    new.requested_at:=old.requested_at;
    if new.status is distinct from old.status then
      if old.status<>'in_transit' or new.status<>'received' then
        raise exception 'สถานะรับโอนไม่ถูกต้อง' using errcode='23514';
      end if;
      new.received_at:=clock_timestamp();
    else new.received_at:=old.received_at; end if;
  end if;
  return new;
end $$;
create trigger transfer_permission_guard before insert or update or delete on public.unit_transfer
for each row execute function famai_private.transfer_guard();

-- punch_clock เป็น SECURITY DEFINER: ใช้ trigger INVOKER เพื่อแยก RPC จับเวลาจริงจาก PATCH ตรง
create or replace function famai_private.attendance_write_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'ห้ามลบหลักฐานลงเวลา' using errcode='42501'; end if;
  if not famai_private.allowed('page:hr',true) then
    raise exception 'ไม่มีสิทธิ์ทำรายการหน้าบุคลากร' using errcode='42501';
  end if;
  if current_user in ('authenticated','anon') then
    if not famai_private.allowed('act:hrApprove',true) then
      raise exception 'ลงเวลาต้องใช้จุดลงเวลาที่ตรวจหลักฐาน' using errcode='42501';
    end if;
  elsif not exists(select 1 from public.employee e where e.id=new.employee_id and e.user_id=auth.uid()) then
    raise exception 'ลงเวลาได้เฉพาะตัวเอง' using errcode='42501';
  end if;
  return new;
end $$;
create trigger attendance_permission_guard before insert or update or delete on public.attendance
for each row execute function famai_private.attendance_write_guard();

create or replace function famai_private.doc_counter_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare permitted boolean;
begin
  if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' or current_user in ('authenticated','anon') then
    raise exception 'เลขเอกสารต้องผ่านตัวนับกลาง ห้ามแก้หรือนำเลขกลับมาใช้' using errcode='42501';
  end if;
  permitted:=case new.doc_type
    when 'SALE' then famai_private.allocate_ok()
    when 'WSALE' then famai_private.page_action('invoice','wholesale')
    when 'QUOTE' then famai_private.allowed('page:quote',true)
    when 'SERVICE' then famai_private.allowed('page:service',true) or famai_private.page_action('aftercare','care')
    when 'RECEIPT' then famai_private.page_action('booking','booking')
      or (famai_private.allowed('act:printDoc',true) and famai_private.any_page(array['invoice','deal'],true))
    when 'BILLING' then famai_private.page_action('invoice','printDoc')
    when 'TAX' then famai_private.allowed('act:printDoc',true) and famai_private.any_page(array['invoice','deal'],true)
    else false end;
  if not permitted or not famai_private.branch_ok(new.branch_id) then
    raise exception 'ไม่มีสิทธิ์ออกเลขเอกสารประเภทนี้ในสาขานี้' using errcode='42501';
  end if;
  return new;
end $$;
create trigger doc_counter_permission_guard before insert or update or delete on public.doc_counter
for each row execute function famai_private.doc_counter_guard();

-- ห้ามเปลี่ยนตัวตนงานเดิมเพื่ออาศัย USING ของ source เดิมแล้วบันทึกเป็น source ใหม่
create or replace function famai_private.task_identity_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.branch_id,new.customer_id,new.sale_id,new.task_source,new.service_job_id,new.parent_task_id)
    is distinct from row(old.id,old.branch_id,old.customer_id,old.sale_id,old.task_source,old.service_job_id,old.parent_task_id) then
    raise exception 'ตัวตนและแหล่งงานติดตามเดิมเปลี่ยนไม่ได้' using errcode='23514';
  end if;
  return new;
end $$;

create policy receivable_permission_update on public.receivable as restrictive for update to authenticated
using(famai_private.page_action('ar','finApprove')) with check(famai_private.page_action('ar','finApprove'));
create policy payment_permission_insert on public.receipt_payment as restrictive for insert to authenticated
with check(famai_private.page_action('ar','finApprove'));
create policy payment_permission_update on public.receipt_payment as restrictive for update to authenticated
using(famai_private.page_action('ar','finApprove')) with check(famai_private.page_action('ar','finApprove'));

-- สิทธิ์หน้าเดียวกันต้องใช้กับไฟล์จริงด้วย คงด่านเจ้าของ path ของ hr-photo เดิม
create policy brief33_storage_write_i on storage.objects as restrictive for insert to authenticated
with check((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)));
create policy brief33_storage_write_u on storage.objects as restrictive for update to authenticated
using((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)))
with check((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)));
create policy brief33_storage_write_d on storage.objects as restrictive for delete to authenticated
using((bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))
  and (bucket_id<>'hr-photo' or famai_private.allowed('page:hr',true)));
create policy brief33_model_storage_i on storage.objects for insert to authenticated
with check(bucket_id='model-photo' and famai_private.allowed('page:settings',true));
create policy brief33_model_storage_u on storage.objects for update to authenticated
using(bucket_id='model-photo' and famai_private.allowed('page:settings',true))
with check(bucket_id='model-photo' and famai_private.allowed('page:settings',true));
create policy brief33_model_storage_d on storage.objects for delete to authenticated
using(bucket_id='model-photo' and famai_private.allowed('page:settings',true));
create trigger task_identity_permission_guard before update on public.follow_up_task
for each row execute function famai_private.task_identity_guard();

-- เก็บ RLS สาขาเดิม แล้วเพิ่มด่านเฉพาะการเขียน ไม่เปลี่ยนหน้าอ่านเป็นหน้าเขียน
do $$ declare t text; gate text; begin
  for t,gate in select * from (values
    ('unit_transfer','famai_private.page_action(''transfer'',''transfer'')'),
    ('wholesale_sale_item','famai_private.page_action(''invoice'',''wholesale'')'),
    ('sale_freebie','famai_private.allocate_ok()'),
    ('other_doc','famai_private.page_action(''invoice'',''printDoc'')'),
    ('import_log','famai_private.allowed(''page:imp'',true)')
  ) x(t,gate) loop
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(%s)',t||'_permission_i',t,gate);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(%s) with check(%s)',t||'_permission_u',t,gate,gate);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(%s)',t||'_permission_d',t,gate);
  end loop;
end $$;

-- บรีฟ B18: ด่านเขียนหน้าจอสำหรับตารางตั้งค่าและบุคลากร
-- ส่วนนี้เพิ่มด่าน restrictive โดยไม่เปลี่ยน SELECT หรือขอบเขตสาขาเดิม
-- ตารางตั้งค่าที่เดิมจำกัดบทบาท เพิ่มทางเขียนตามสิทธิ์ที่แอดมินกำหนดตรง UI
-- (company/branch/partner เป็นข้อมูลตั้งค่ากลาง ไม่มีการทำรายการขายผ่านตารางเหล่านี้)
do $$
declare t text; gate text; p text; a text; rec record;
begin
  for rec in select * from (values
    ('company','settings','org'), ('branch','settings','org'),
    ('wholesale_partner','settings','org'), ('wholesale_price','settings','org'),
    ('branch_site','settings','sites'), ('company_event','cal','execCal'),
    ('company_holiday','cal','execCal'), ('model_photo','settings',null)
  ) as cfg(tbl,page,act)
  loop
    t:=rec.tbl;
    gate:=format('famai_private.allowed(%L,true)','page:'||rec.page);
    if rec.act is not null then gate:=gate||format(' and famai_private.allowed(%L,true)','act:'||rec.act); end if;
    -- site เป็นจุดลงเวลาประจำสาขา จึงตรวจสาขาทั้งแถวเก่าและแถวใหม่
    if t='branch_site' then gate:=gate||' and famai_private.branch_ok(branch_id)'; end if;
    execute format('create policy %I on public.%I for insert to authenticated with check(%s)',t||'_brief33_allow_i',t,gate);
    execute format('create policy %I on public.%I for update to authenticated using(%s) with check(%s)',t||'_brief33_allow_u',t,gate,gate);
    execute format('create policy %I on public.%I for delete to authenticated using(%s)',t||'_brief33_allow_d',t,gate);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(%s)',t||'_brief33_gate_i',t,gate);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(%s) with check(%s)',t||'_brief33_gate_u',t,gate,gate);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(%s)',t||'_brief33_gate_d',t,gate);
  end loop;
  for rec in select * from (values
    ('app_setting','famai_private.allowed(''page:settings'',true) and famai_private.has_role(array[''admin''])'),
    ('employee','famai_private.allowed(''page:users'',true) and famai_private.has_role(array[''admin''])'),
    ('app_user_role','famai_private.allowed(''page:users'',true) and famai_private.has_role(array[''admin''])'),
    ('app_user_branch','famai_private.allowed(''page:users'',true) and famai_private.has_role(array[''admin''])'),
    ('payroll_period','famai_private.allowed(''page:payroll'',true)'),
    ('payroll_line','famai_private.allowed(''page:payroll'',true)'),
    ('leave_request','famai_private.allowed(''page:hr'',true)'),
    ('offsite_request','famai_private.allowed(''page:hr'',true)')
  ) as cfg(tbl,expr)
  loop
    t:=rec.tbl; gate:=rec.expr;
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(%s)',t||'_brief33_gate_i',t,gate);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(%s) with check(%s)',t||'_brief33_gate_u',t,gate,gate);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(%s)',t||'_brief33_gate_d',t,gate);
  end loop;
end $$;

-- ใบลาและคำขอออกนอกสถานที่: ยื่นเองได้ อนุมัติตัวเองไม่ได้ และแก้เนื้อหาแอบในคำสั่งอนุมัติไม่ได้
create or replace function famai_private.hr_request_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare staff_user uuid; staff_branch uuid; j jsonb;
begin
  if auth.uid() is null then
    if current_setting('role',true) in ('anon','authenticated') then raise exception 'ต้องเข้าสู่ระบบ' using errcode='42501'; end if;
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if not famai_private.allowed('page:hr',true) then raise exception 'ไม่มีสิทธิ์แก้ไขหน้าบุคลากร' using errcode='42501'; end if;
  if TG_OP='DELETE' then raise exception 'คำขอบุคลากรต้องคงประวัติไว้' using errcode='42501'; end if;
  select e.user_id,e.branch_id into staff_user,staff_branch from public.employee e where e.id=new.employee_id;
  if not found or not famai_private.branch_ok(staff_branch) then raise exception 'พนักงานอยู่นอกสาขาที่ดูแล' using errcode='42501'; end if;
  if TG_OP='INSERT' then
    if staff_user is distinct from auth.uid() or new.status<>'รออนุมัติ'
      or new.approved_by is not null or new.approved_at is not null or new.decide_note is not null then
      raise exception 'ยื่นได้เฉพาะคำขอรออนุมัติของตนเอง' using errcode='42501';
    end if;
  else
    if staff_user is not distinct from auth.uid() or not famai_private.allowed('act:hrApprove',true) then
      raise exception 'ต้องให้ผู้มีสิทธิ์คนอื่นตรวจคำขอ' using errcode='42501';
    end if;
    if (to_jsonb(new)-array['status','approved_by','approved_at','decide_note']) is distinct from
       (to_jsonb(old)-array['status','approved_by','approved_at','decide_note']) then
      raise exception 'การตรวจคำขอแก้เนื้อหาเดิมไม่ได้' using errcode='42501';
    end if;
    if old.status<>'รออนุมัติ' or new.status not in ('อนุมัติแล้ว','ไม่อนุมัติ') then
      raise exception 'คำขอนี้ไม่ได้อยู่ระหว่างรออนุมัติ' using errcode='42501';
    end if;
    if new.status='ไม่อนุมัติ' and coalesce(btrim(new.decide_note),'')='' then
      raise exception 'ไม่อนุมัติต้องระบุเหตุผล' using errcode='23514';
    end if;
    new.approved_by:=auth.uid(); new.approved_at:=now();
  end if;
  return new;
end $$;
create trigger leave_request_brief33_guard before insert or update or delete on public.leave_request
for each row execute function famai_private.hr_request_guard();
create trigger offsite_request_brief33_guard before insert or update or delete on public.offsite_request
for each row execute function famai_private.hr_request_guard();
-- offsite_upd เดิมจำกัดบทบาทคงที่ จึงเปิดการตรวจผ่านสิทธิ์ที่แอดมินตั้ง โดย trigger ยังตรวจเจ้าของ/สาขา/เนื้อหา
create policy offsite_brief33_review on public.offsite_request for update to authenticated
using(famai_private.allowed('page:hr',true) and famai_private.allowed('act:hrApprove',true))
with check(famai_private.allowed('page:hr',true) and famai_private.allowed('act:hrApprove',true));
revoke all on function famai_private.hr_request_guard() from public, anon;
grant execute on function famai_private.hr_request_guard() to authenticated, service_role;
-- ต้องเติมด่าน page:hr write ใน RPC punch_clock (SECURITY DEFINER) ด้วย RLS attendance เพียงอย่างเดียวไม่ครอบคลุม

revoke all on all functions in schema famai_private from public,anon;
grant execute on all functions in schema famai_private to authenticated,service_role;
notify pgrst,'reload schema';
$release_source_33$]);

COMMIT;
