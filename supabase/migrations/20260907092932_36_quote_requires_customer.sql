-- v1.62: ใบเสนอใหม่อ้างลูกค้าที่บันทึกไว้ก่อนเสมอ
-- ใช้ trigger เฉพาะ INSERT เพื่อคงใบเสนอเก่าที่ customer_id ยังว่าง ไม่เดาหรือสร้างลูกค้าแทน
create or replace function famai_private.quote_customer_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.customer;
begin
 if new.customer_id is null then
   raise exception 'เลือกลูกค้าในระบบก่อนออกใบเสนอราคา' using errcode='23514';
 end if;
 if auth.uid() is not null and not famai_private.customer_ok(new.customer_id) then
   raise exception 'ไม่มีสิทธิ์ออกใบเสนอให้ลูกค้ารายนี้' using errcode='42501';
 end if;
 select * into c from public.customer where id=new.customer_id;
 if c.id is null or c.archived_at is not null or c.branch_id is distinct from new.branch_id then
   raise exception 'ตรวจลูกค้าและสาขาของใบเสนอราคา' using errcode='23514';
 end if;
 new.customer_name:=c.full_name;
 new.customer_phone:=c.phone;
 new.customer_address:=c.address;
 return new;
end $$;
-- ทำก่อน quotation_brief_guard ซึ่งบันทึกเซลล์และเบอร์จากประวัติพนักงาน
create trigger quotation_aa_customer_guard before insert on public.quotation
for each row execute function famai_private.quote_customer_guard();
revoke all on function famai_private.quote_customer_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
