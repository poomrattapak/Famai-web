-- v1.61: เบอร์ติดต่อในประวัติพนักงาน + ใบเสนอผูกเจ้าของดีลอัตโนมัติ
-- เก็บเฉพาะเบอร์ติดต่อทางธุรกิจใน app_user (employee.user_id อ้างบัญชีนี้)
-- ไม่มีการเดา/เติมเบอร์จริง และไม่เปลี่ยนเอกสารที่บันทึกไว้แล้ว
alter table public.app_user add column phone text;
alter table public.app_user add constraint app_user_contact_phone check(
 phone is null or (phone ~ '^\+?[0-9 ()-]{8,24}$' and length(regexp_replace(phone,'[^0-9]','','g')) between 8 and 15));
alter table public.quotation add column customer_id uuid references public.customer(id);
create index quotation_customer_idx on public.quotation(customer_id);

create or replace function public.staff_set_contact(p_user uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare contact text:=btrim(p_phone); saved jsonb;
begin
 if not famai_private.branch_ok(null) or (p_user is distinct from auth.uid()
   and not (famai_private.has_role(array['admin']) and famai_private.allowed('page:users',true))) then
   raise exception 'ไม่มีสิทธิ์แก้ข้อมูลติดต่อพนักงานคนนี้' using errcode='42501';
 end if;
 if contact is null or contact !~ '^\+?[0-9 ()-]{8,24}$'
   or length(regexp_replace(contact,'[^0-9]','','g')) not between 8 and 15 then
   raise exception 'กรอกเบอร์ติดต่อพนักงานให้ครบ' using errcode='23514';
 end if;
 update public.app_user set phone=contact where id=p_user and is_active
 returning jsonb_build_object('id',id,'phone',phone) into saved;
 if saved is null then raise exception 'ไม่พบพนักงานที่ใช้งานอยู่' using errcode='23503'; end if;
 return saved;
end $$;
revoke all on function public.staff_set_contact(uuid,text) from public,anon;
grant execute on function public.staff_set_contact(uuid,text) to authenticated;

create or replace function famai_private.quote_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.customer; seller public.app_user;
begin
 if tg_op='UPDATE' then
   new.created_by:=old.created_by;
   if row(new.seller_id,new.seller_name,new.seller_phone,new.customer_id)
     is distinct from row(old.seller_id,old.seller_name,old.seller_phone,old.customer_id) then
     raise exception 'เอกสารที่บันทึกแล้วต้องเก็บผู้ขายและเบอร์เดิม' using errcode='42501';
   end if;
   return new;
 end if;
 new.created_by:=auth.uid();
 if new.customer_id is not null then
   if auth.uid() is not null and not famai_private.customer_ok(new.customer_id) then
     raise exception 'ไม่มีสิทธิ์ทำใบเสนอให้ลูกค้ารายนี้' using errcode='42501';
   end if;
   select * into c from public.customer where id=new.customer_id;
   if c.id is null or c.archived_at is not null or c.branch_id is distinct from new.branch_id then
     raise exception 'ตรวจลูกค้าและสาขาของใบเสนอราคา' using errcode='23514';
   end if;
   new.seller_id:=coalesce(c.owner_id,auth.uid());
 else
   -- ไม่มีดีลเดิม: ผู้สร้างใบเสนอเป็นผู้รับผิดชอบ ไม่รับผู้ขายที่กรอกมาจากไคลเอนต์
   new.seller_id:=coalesce(auth.uid(),new.seller_id);
 end if;
 if famai_private.frontline_sales() and new.seller_id is distinct from auth.uid() then
   raise exception 'บันทึกใบเสนอราคาได้เฉพาะของคุณ' using errcode='42501';
 end if;
 select * into seller from public.app_user where id=new.seller_id and is_active;
 if seller.id is null or (auth.uid() is not null and coalesce(seller.phone,'')='') then
   raise exception 'เพิ่มเบอร์ติดต่อในประวัติพนักงานก่อนสร้างใบเสนอราคา' using errcode='23514';
 end if;
 new.seller_name:=seller.full_name;new.seller_phone:=seller.phone;
 return new;
end $$;

-- หัวใบและตัวเลือกรถบันทึกในธุรกรรมเดียว ใช้ RLS เดิมทุกตาราง
create or replace function public.quote_save(p_quote jsonb,p_options jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.quotation; o jsonb; qid uuid:=coalesce((p_quote->>'id')::uuid,gen_random_uuid());
begin
 if not famai_private.allowed('page:quote',true) or not famai_private.branch_ok(null) then
   raise exception 'ไม่มีสิทธิ์บันทึกใบเสนอราคา' using errcode='42501';
 end if;
 if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) not between 1 and 2 then
   raise exception 'เลือกรุ่นรถสำหรับใบเสนอราคา 1 ถึง 2 รุ่น' using errcode='23514';
 end if;
 select * into q from public.quotation where id=qid;
 if found then return to_jsonb(q); end if;
 insert into public.quotation(id,branch_id,doc_no,quote_date,valid_until,customer_id,customer_name,customer_phone,
   seller_id,seller_name,seller_phone,pay_method,snapshot)
 values(qid,(p_quote->>'branch_id')::uuid,p_quote->>'doc_no',(p_quote->>'quote_date')::date,
   (p_quote->>'valid_until')::date,(p_quote->>'customer_id')::uuid,p_quote->>'customer_name',p_quote->>'customer_phone',
   (p_quote->>'seller_id')::uuid,p_quote->>'seller_name',p_quote->>'seller_phone',p_quote->>'pay_method',coalesce(p_quote->'snapshot','{}'::jsonb))
 returning * into q;
 for o in select value from jsonb_array_elements(p_options) loop
   if (o->>'price')::numeric<=0 or (o->>'slot')::int not between 1 and 2
     or exists(select 1 from public.quotation_option where quotation_id=qid and slot=(o->>'slot')::int) then
     raise exception 'ตรวจราคาและตัวเลือกรถในใบเสนอ' using errcode='23514';
   end if;
   insert into public.quotation_option(quotation_id,slot,variant_id,price,finance_id,down_payment,terms)
   values(qid,(o->>'slot')::int,(o->>'variant_id')::uuid,(o->>'price')::numeric,
     (o->>'finance_id')::uuid,coalesce((o->>'down_payment')::numeric,0),o->'terms');
 end loop;
 return to_jsonb(q);
end $$;
revoke all on function public.quote_save(jsonb,jsonb) from public,anon;
grant execute on function public.quote_save(jsonb,jsonb) to authenticated;

create or replace function famai_private.sale_staff_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.salesperson_id:=coalesce((select owner_id from public.customer where id=new.customer_id),new.salesperson_id,auth.uid());
 return new;
end $$;
create trigger sale_staff_owner before insert on public.sale for each row execute function famai_private.sale_staff_owner();
revoke all on function famai_private.sale_staff_owner() from public,anon,authenticated;
notify pgrst,'reload schema';
