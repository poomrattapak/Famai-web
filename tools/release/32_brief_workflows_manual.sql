-- สำหรับเจ้าของโปรเจกต์ตรวจและรันด้วยตนเองใน SQL Editor ของ famai-motor
-- ต้นฉบับ 20260906094608_32_brief_workflows.sql · SHA-256 24240f48be4a682266465a5febd5baab93b4f1e00046d67c69d530cb6bb43698
-- ธุรกรรมเดียว: หากส่วนใดผิดพลาด โครงสร้างและประวัติ migration ไม่ถูกบันทึกบางส่วน
BEGIN;

-- 32 · บรีฟ 6 ก.ย. 2569: เคสก่อนขาย สิทธิ์ผู้ดูแลลูกค้า และงานบริการที่บันทึกถาวร
-- ไม่ลบประวัติเดิม · บันทึกเหตุการณ์ด้วยเวลาเซิร์ฟเวอร์ · ห้าม apply ก่อนส่งงานร่วมผ่านด่าน

create schema if not exists famai_private;
revoke all on schema famai_private from public, anon;
grant usage on schema famai_private to authenticated, service_role;

-- ฟังก์ชันอ่านสิทธิ์อยู่ใน schema ที่ไม่เปิด Data API; ไม่รับ user_id จากผู้เรียก
create or replace function famai_private.has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_user_role ur
    join public.role r on r.id=ur.role_id join public.app_user u on u.id=ur.user_id
    where ur.user_id=auth.uid() and u.is_active and r.code=any(p_roles))
$$;

create or replace function famai_private.perm(p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare rr record; cfg jsonb; v text; best integer:=0; defroles text[];
begin
  if auth.uid() is null then return 'none'; end if;
  select value into cfg from public.app_setting where key='perms';
  -- ค่าเริ่มต้นตรงกับ MENU/PERM_ACTS/PERM_DATA; ค่าที่แอดมินบันทึกชนะรายบทบาท
  defroles := case p_key
    when 'page:dash' then array['admin','manager','acct','sales','stock','hr','tech']
    when 'page:cal' then array['admin','manager','acct','sales','stock','hr','tech','care','reg']
    when 'page:report' then array['admin','manager','acct','stock','hr']
    when 'page:recv' then array['admin','manager','stock']
    when 'page:stock' then array['admin','manager','stock','sales','acct']
    when 'page:sell' then array['admin','manager','sales']
    when 'page:transfer' then array['admin','manager','stock']
    when 'page:quote' then array['admin','manager','sales']
    when 'page:deal' then array['admin','manager','acct','sales']
    when 'page:invoice' then array['admin','manager','acct']
    when 'page:booking' then array['admin','manager','sales']
    when 'page:plate' then array['admin','manager','reg']
    when 'page:ar' then array['admin','manager','acct']
    when 'page:service' then array['admin','manager','tech','stock','care']
    when 'page:aftercare' then array['admin','manager','care']
    when 'page:parts' then array['admin','manager','stock','tech','acct','sales']
    when 'page:expense' then array['admin','manager','acct']
    when 'page:attend' then array['admin','manager','hr']
    when 'page:hr' then array['admin','manager','hr','sales','stock','tech','acct','care','reg']
    when 'page:payroll' then array['admin','manager','hr','acct']
    when 'page:users' then array['admin']
    when 'page:imp' then array['admin','manager','stock']
    when 'page:settings' then array['admin','manager']
    when 'page:custom' then array['admin','manager','sales','stock','acct','hr','tech','care','reg']
    when 'page:flow' then array['admin','manager','sales','stock','acct','hr','tech','care','reg']
    when 'act:finApprove' then array['admin','acct']
    when 'act:printDoc' then array['admin','manager','acct']
    when 'act:editFin' then array['admin','manager']
    when 'act:transfer' then array['admin','manager','stock']
    when 'act:wholesale' then array['admin','manager']
    when 'act:org' then array['admin','manager']
    when 'act:sites' then array['admin','manager']
    when 'act:care' then array['admin','manager','care']
    when 'act:voidSale' then array['admin','manager']
    when 'act:finStage' then array['admin','manager','sales']
    when 'act:hrApprove' then array['admin','manager','hr']
    when 'act:plate' then array['admin','manager','reg']
    when 'act:booking' then array['admin','manager','sales']
    when 'act:execCal' then array['admin','manager']
    when 'act:allocateUnit' then array['admin','manager']
    when 'act:deliver' then array['admin','manager','sales']
    when 'act:archiveCustomer' then array['admin','manager','sales']
    when 'data:idNo' then array['admin','manager','acct']
    when 'data:money' then array['admin','manager','acct','hr']
    else array[]::text[] end;
  for rr in select r.code from public.app_user_role ur
    join public.role r on r.id=ur.role_id join public.app_user u on u.id=ur.user_id
    where ur.user_id=auth.uid() and u.is_active
  loop
    if rr.code='admin' then return case when p_key like 'data:%' then 'read' else 'write' end; end if;
    v:=cfg -> rr.code ->> p_key;
    if v is null then v:=case when rr.code=any(defroles)
      then case when p_key like 'data:%' then 'read' else 'write' end else 'none' end; end if;
    best:=greatest(best,case v when 'write' then 2 when 'read' then 1 else 0 end);
  end loop;
  return case best when 2 then 'write' when 1 then 'read' else 'none' end;
end $$;

create or replace function famai_private.allowed(p_key text,p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_write then famai_private.perm(p_key)='write'
    else famai_private.perm(p_key)<>'none' end
$$;
create or replace function famai_private.any_page(p_pages text[],p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from unnest(p_pages) p where famai_private.allowed('page:'||p,p_write))
$$;
create or replace function famai_private.branch_ok(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_user u where u.id=auth.uid() and u.is_active
    and (p_branch is null or u.all_branch
      or famai_private.has_role(array['admin','manager','acct','hr','care','reg'])
      or exists(select 1 from public.app_user_branch b where b.user_id=u.id and b.branch_id=p_branch)))
$$;
create or replace function famai_private.frontline_sales() returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.has_role(array['sales'])
    and not famai_private.has_role(array['admin','manager','acct','care','reg'])
$$;

-- ข้อมูลหลัก: รหัสผู้รับผิดชอบมีอยู่แล้ว ใช้ UUID เดิมโดยไม่สร้างเจ้าของซ้ำด้วยชื่อ
alter table public.customer
  add column if not exists note text,
  add column if not exists finance_history jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.app_user(id),
  add column if not exists updated_by uuid references public.app_user(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.app_user(id),
  add column if not exists archived_reason text;
-- เติมเจ้าของเท่าที่มีหลักฐานจากใบขายจริง ลูกค้าที่ไม่มีหลักฐานคงว่างให้ผู้บริหารจัดสรร
update public.customer c set owner_id=(select s.salesperson_id from public.sale s
  where s.customer_id=c.id and s.salesperson_id is not null
  order by s.created_at desc,s.id desc limit 1)
where c.owner_id is null and exists(select 1 from public.sale s where s.customer_id=c.id and s.salesperson_id is not null);
update public.customer set updated_at=created_at;
create index if not exists customer_owner_updated_idx on public.customer(owner_id,updated_at desc);
create index if not exists customer_branch_updated_idx on public.customer(branch_id,updated_at desc);

alter table public.finance_case
  add column if not exists reject_with text,
  add column if not exists reject_note text,
  add column if not exists variant_id uuid references public.model_variant(id),
  add column if not exists variant_code text,
  add column if not exists model_name text,
  add column if not exists color_code text,
  add column if not exists color_name text,
  add column if not exists list_price numeric(12,2),
  add column if not exists discount numeric(12,2) not null default 0,
  add column if not exists down_payment numeric(12,2),
  add column if not exists term_months integer,
  add column if not exists rate_pct numeric(8,4),
  add column if not exists monthly_installment numeric(12,2),
  add column if not exists loan_total numeric(12,2),
  add column if not exists pay_now numeric(12,2),
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.app_user(id),
  add column if not exists updated_by uuid references public.app_user(id);
alter table public.sale
  add column if not exists finance_case_id uuid references public.finance_case(id),
  add column if not exists allocated_by uuid references public.app_user(id),
  add column if not exists updated_at timestamptz not null default now();
alter table public.registration
  add column if not exists delivered_by uuid references public.app_user(id),
  add column if not exists delivered_recorded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.quotation
  add column if not exists seller_id uuid references public.app_user(id),
  add column if not exists seller_name text,
  add column if not exists seller_phone text,
  add column if not exists pay_method text not null default 'finance' check(pay_method in ('cash','finance')),
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
update public.quotation set seller_id=created_by where seller_id is null;
alter table public.booking add column if not exists created_by uuid references public.app_user(id);
alter table public.service_job
  add column if not exists model_name text,
  add column if not exists next_appointment_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.follow_up_task
  add column if not exists title text,
  add column if not exists amount numeric(12,2) check(amount is null or amount>=0),
  add column if not exists task_source text not null default 'legacy'
    check(task_source in ('legacy','delivery_month','manual','service_next')),
  add column if not exists parent_task_id uuid references public.follow_up_task(id),
  add column if not exists service_job_id uuid references public.service_job(id),
  add column if not exists appointment_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.app_user(id);
create unique index if not exists task_delivery_month_uniq on public.follow_up_task(sale_id)
  where task_source='delivery_month';
create unique index if not exists task_service_appointment_uniq on public.follow_up_task(service_job_id,appointment_at)
  where task_source='service_next' and service_job_id is not null;
create index if not exists task_customer_due_idx on public.follow_up_task(customer_id,due_at);
create index if not exists finance_customer_updated_idx on public.finance_case(customer_id,updated_at desc);

create table public.notification_seen(
  user_id uuid not null default auth.uid() references public.app_user(id),
  notification_id text not null check(length(notification_id) between 1 and 240),
  seen_at timestamptz not null default now(),
  primary key(user_id,notification_id)
);
alter table public.notification_seen enable row level security;
revoke all on public.notification_seen from public, anon, authenticated;
grant select,insert,update on public.notification_seen to authenticated;
grant all on public.notification_seen to service_role;

create or replace function famai_private.customer_ok(p_id uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.customer c where c.id=p_id
    and famai_private.branch_ok(c.branch_id)
    and (not famai_private.frontline_sales() or c.owner_id=auth.uid())
    and famai_private.any_page(array['deal','sell','booking','service','aftercare','plate','ar'],p_write))
$$;
create or replace function famai_private.sale_ok(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sale s where s.id=p_id
    and famai_private.branch_ok(s.branch_id) and famai_private.customer_ok(s.customer_id))
$$;

-- เวลาทุกครั้งประทับที่ฐาน; ไม่รับ created_at ที่ client ส่งมาเพื่อย้อนลำดับงาน
create or replace function famai_private.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then new.created_at:=clock_timestamp();
  else new.created_at:=old.created_at; end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create or replace function famai_private.customer_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.created_at:=clock_timestamp(); new.created_by:=auth.uid();
    new.owner_id:=coalesce(new.owner_id,auth.uid());
  else
    new.created_at:=old.created_at; new.created_by:=old.created_by;
    if auth.uid() is not null and new.owner_id is distinct from old.owner_id
       and not (famai_private.has_role(array['admin','manager'])
         and famai_private.allowed('page:deal',true)) then
      raise exception 'เฉพาะผู้บริหารที่เปลี่ยนผู้ดูแลลูกค้าได้' using errcode='42501';
    end if;
  end if;
  if auth.uid() is not null and tg_op='INSERT' and new.owner_id is distinct from auth.uid()
    and not (famai_private.has_role(array['admin','manager']) and famai_private.allowed('page:deal',true)) then
    raise exception 'เฉพาะผู้บริหารที่จัดผู้ดูแลลูกค้าคนอื่นได้' using errcode='42501';
  end if;
  if auth.uid() is not null and famai_private.frontline_sales()
     and new.owner_id is distinct from auth.uid() then
    raise exception 'บันทึกได้เฉพาะลูกค้าของคุณ' using errcode='42501';
  end if;
  if (tg_op='INSERT' and new.archived_at is not null)
     or (tg_op='UPDATE' and (new.archived_at is distinct from old.archived_at
       or new.archived_reason is distinct from old.archived_reason)) then
    if auth.uid() is not null and not famai_private.allowed('act:archiveCustomer',true) then
      raise exception 'ไม่มีสิทธิ์ย้ายลูกค้าเข้าคลัง' using errcode='42501';
    end if;
    if new.archived_at is not null then
      if nullif(btrim(new.archived_reason),'') is null then
        raise exception 'กรอกเหตุผลที่ยุติการติดตาม' using errcode='23514';
      end if;
      if exists(select 1 from public.sale s where s.customer_id=new.id and s.voided_at is null
          and not exists(select 1 from public.registration r where r.sale_id=s.id and r.delivered_at is not null))
        or exists(select 1 from public.booking b where b.customer_id=new.id and b.status='จองอยู่')
        or exists(select 1 from public.finance_case f where f.customer_id=new.id and f.sale_id is null
          and f.status not in ('ปฏิเสธ','ยกเลิก')) then
        raise exception 'ต้องปิดงานขาย จอง และไฟแนนซ์ที่ค้างก่อนเก็บลูกค้าเข้าคลัง' using errcode='23514';
      end if;
      new.archived_at:=clock_timestamp(); new.archived_by:=auth.uid();
    else new.archived_by:=null; end if;
  elsif tg_op='UPDATE' then new.archived_by:=old.archived_by; end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end $$;
create trigger customer_brief_guard before insert or update on public.customer
for each row execute function famai_private.customer_guard();

create or replace function famai_private.booking_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare customer_archived timestamptz;
begin
  if new.status='จองอยู่' then
    select archived_at into customer_archived from public.customer where id=new.customer_id for share;
    if not found or customer_archived is not null then
      raise exception 'ลูกค้าอยู่ในคลัง ต้องเปิดติดตามใหม่ก่อนจอง' using errcode='23514';
    end if;
  end if;
  new.updated_at:=clock_timestamp();
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); new.created_by:=auth.uid();
  else new.created_at:=old.created_at; new.created_by:=old.created_by; end if;
  return new;
end $$;
create trigger booking_brief_guard before insert or update on public.booking
for each row execute function famai_private.booking_guard();

-- เคสที่ยังไม่มีใบขายต้องมี snapshot ครบ; เคสเก่าที่มีใบขายยังเดินต่อได้
create or replace function famai_private.finance_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allocating boolean:=false; customer_archived timestamptz;
begin
  if tg_op='INSERT' and auth.uid() is not null and new.sale_id is not null then
    raise exception 'เคสใหม่ต้องยื่นก่อนเปิดขายและจัดคัน' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    -- ใช้ใบขายเป็นจุดล็อกร่วมกับการเงินและส่งมอบ ก่อนอ่านสถานะทะเบียน
    if old.sale_id is not null then
      perform 1 from public.sale where id=old.sale_id for update;
      if new.sale_id is distinct from old.sale_id then
        raise exception 'เคสที่เปิดขายแล้วถอดหรือเปลี่ยนใบขายย้อนหลังไม่ได้' using errcode='23514';
      end if;
    end if;
    allocating:=new.sale_id is distinct from old.sale_id and new.sale_id is not null
      and famai_private.allowed('act:allocateUnit',true)
      and famai_private.has_role(array['admin','manager']);
    if old.sale_id is not null and (old.variant_id is not null or exists(
      select 1 from public.registration r where r.sale_id=old.sale_id and r.delivered_at is not null))
      and row(new.status,new.company_id,new.reject_reason,new.reject_with,new.reject_note)
      is distinct from row(old.status,old.company_id,old.reject_reason,old.reject_with,old.reject_note) then
      raise exception 'เคสที่จัดคันแล้วแก้ผลย้อนหลังไม่ได้' using errcode='23514';
    end if;
    if old.sale_id is not null and row(new.customer_id,new.branch_id,new.variant_id,new.color_code,
      new.company_id,new.list_price,new.discount,new.down_payment,new.term_months,new.rate_pct,
      new.monthly_installment,new.loan_total,new.pay_now)
      is distinct from row(old.customer_id,old.branch_id,old.variant_id,old.color_code,
      old.company_id,old.list_price,old.discount,old.down_payment,old.term_months,old.rate_pct,
      old.monthly_installment,old.loan_total,old.pay_now) then
      raise exception 'เคสที่เปิดขายแล้วแก้เงื่อนไขย้อนหลังไม่ได้' using errcode='23514';
    end if;
  end if;
  if auth.uid() is not null and not allocating
    and not (famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)) then
    raise exception 'ไม่มีสิทธิ์แก้เคสไฟแนนซ์' using errcode='42501';
  end if;
  if new.sale_id is null then
    -- SHARE ชนกับ UPDATE archive ของลูกค้า ทำให้สองคำสั่งพร้อมกันไม่ข้ามกัน
    select archived_at into customer_archived from public.customer where id=new.customer_id for share;
    if not found or (customer_archived is not null and new.status not in ('ปฏิเสธ','ยกเลิก')) then
      raise exception 'ลูกค้าอยู่ในคลัง ต้องเปิดติดตามใหม่ก่อนยื่นไฟแนนซ์' using errcode='23514';
    end if;
    if new.variant_id is null or nullif(btrim(new.color_code),'') is null
      or new.list_price is null or new.list_price<=0 or new.down_payment is null
      or new.down_payment<0 or new.term_months is null or new.term_months<=0
      or new.rate_pct is null or new.rate_pct<0 or new.monthly_installment is null
      or new.monthly_installment<0 or new.loan_total is null or new.pay_now is null then
      raise exception 'ข้อมูลรุ่น สี และเงื่อนไขยื่นไฟแนนซ์ไม่ครบ' using errcode='23514';
    end if;
    if not exists(select 1 from public.model_color mc where mc.variant_id=new.variant_id and mc.color_code=new.color_code) then
      raise exception 'สีไม่ตรงกับรหัสรุ่นที่ยื่น' using errcode='23514';
    end if;
    select code,model_name into new.variant_code,new.model_name from public.model_variant where id=new.variant_id;
    select color_name into new.color_name from public.model_color where variant_id=new.variant_id and color_code=new.color_code;
  end if;
  if new.sale_id is not null and not exists(select 1 from public.sale s
      where s.id=new.sale_id and s.customer_id=new.customer_id and s.branch_id=new.branch_id) then
    raise exception 'ใบขายไม่ตรงกับลูกค้าและสาขาของเคส' using errcode='23514';
  end if;
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); new.created_by:=auth.uid();
  else new.created_at:=old.created_at; new.created_by:=old.created_by; end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end $$;
create trigger finance_brief_guard before insert or update on public.finance_case
for each row execute function famai_private.finance_guard();

-- กฎการขายตรวจที่จุดเขียนจริง: เซลล์ส่งเคสได้ แต่การจัดคันเป็นงานผู้บริหาร
create or replace function famai_private.sale_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u public.motorcycle_unit; f public.finance_case; financial_changed boolean; allocating boolean; customer_archived timestamptz;
begin
  allocating:=famai_private.has_role(array['admin','manager'])
    and famai_private.allowed('act:allocateUnit',true) and famai_private.allowed('page:sell',true);
  if tg_op='INSERT' then financial_changed:=true;
  else financial_changed:=row(new.unit_id,new.customer_id,new.branch_id,new.list_price,new.discount,new.net_price,
    new.pay_method,new.finance_id,new.finance_case_id,new.down_payment,new.term_months,new.rate_pct,
    new.monthly_installment,new.loan_total,new.pay_now,new.cost,new.freebie_cost,new.gross_profit)
    is distinct from row(old.unit_id,old.customer_id,old.branch_id,old.list_price,old.discount,old.net_price,
    old.pay_method,old.finance_id,old.finance_case_id,old.down_payment,old.term_months,old.rate_pct,
    old.monthly_installment,old.loan_total,old.pay_now,old.cost,old.freebie_cost,old.gross_profit);
  end if;
  if auth.uid() is not null and financial_changed and not allocating then
    raise exception 'ผู้บริหารเป็นผู้เลือกคันรถและเปิดการขาย' using errcode='42501';
  end if;
  if financial_changed then
    select archived_at into customer_archived from public.customer where id=new.customer_id for share;
    if not found or customer_archived is not null then
      raise exception 'ลูกค้าอยู่ในคลัง ต้องเปิดติดตามใหม่ก่อนเปิดขาย' using errcode='23514';
    end if;
    select * into u from public.motorcycle_unit where id=new.unit_id for update;
    if not found or u.branch_id<>new.branch_id then
      raise exception 'รถไม่อยู่ในสาขาที่เปิดขาย' using errcode='23514';
    end if;
    if tg_op='INSERT' and u.status not in ('available','reserved') then
      raise exception 'คันรถนี้ไม่พร้อมขาย' using errcode='23514';
    end if;
    if new.pay_method not in ('cash','finance') then
      raise exception 'วิธีชำระไม่ถูกต้อง' using errcode='23514';
    end if;
    if new.pay_method='finance' and (tg_op='INSERT' or new.finance_case_id is not null) then
      select * into f from public.finance_case where id=new.finance_case_id for update;
      if not found or f.status<>'อนุมัติแล้ว' or f.customer_id<>new.customer_id
        or f.branch_id<>new.branch_id or (f.sale_id is not null and f.sale_id<>new.id)
        or f.variant_id is distinct from u.variant_id or f.color_code is distinct from u.color_code
        or f.company_id is distinct from new.finance_id
        or row(f.list_price,f.discount,f.down_payment,f.term_months,f.rate_pct,f.monthly_installment,f.loan_total,f.pay_now)
        is distinct from row(new.list_price,new.discount,new.down_payment,new.term_months,new.rate_pct,new.monthly_installment,new.loan_total,new.pay_now) then
        raise exception 'ต้องเลือกคันและเงื่อนไขตรงกับเคสไฟแนนซ์ที่อนุมัติแล้ว' using errcode='23514';
      end if;
    end if;
    if tg_op='INSERT' then new.allocated_by:=auth.uid(); end if;
    if tg_op='UPDATE' and exists(select 1 from public.registration r
      where r.sale_id=new.id and r.delivered_at is not null) then
      raise exception 'รถส่งมอบแล้ว ต้องเก็บเงื่อนไขขายเดิมเป็นหลักฐาน' using errcode='23514';
    end if;
  end if;
  if (tg_op='INSERT' and coalesce(new.fin_approval->>'status','รอตรวจ')<>'รอตรวจ')
    or (tg_op='UPDATE' and new.fin_approval is distinct from old.fin_approval) then
    if tg_op='UPDATE' and exists(select 1 from public.registration r
      where r.sale_id=new.id and r.delivered_at is not null) then
      raise exception 'ส่งมอบแล้ว ต้องเก็บผลตรวจการเงินเดิมเป็นหลักฐาน' using errcode='23514';
    end if;
    if coalesce(new.fin_approval->>'status','') not in ('รอตรวจ','ผ่าน','ไม่ผ่าน') then
      raise exception 'สถานะตรวจการเงินไม่ถูกต้อง' using errcode='23514';
    end if;
    if auth.uid() is not null and not (famai_private.allowed('act:finApprove',true)
      and famai_private.any_page(array['deal','invoice'],true))
      and not (tg_op='UPDATE' and new.fin_approval->>'status'='รอตรวจ'
        and famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)) then
      raise exception 'เฉพาะการเงินที่ตรวจอนุมัติการขายได้' using errcode='42501';
    end if;
    new.fin_approval:=coalesce(new.fin_approval,'{}'::jsonb)
      ||jsonb_build_object('at',clock_timestamp(),'by_id',auth.uid());
  elsif tg_op='UPDATE' and financial_changed then
    new.fin_approval:=jsonb_build_object('status','รอตรวจ','note','เงื่อนไขการขายเปลี่ยน ต้องตรวจใหม่');
  end if;
  if tg_op='UPDATE' then
    if auth.uid() is not null and new.voided_at is distinct from old.voided_at
      and not famai_private.allowed('act:voidSale',true) then
      raise exception 'ไม่มีสิทธิ์ยกเลิกการขาย' using errcode='42501';
    end if;
    if auth.uid() is not null and new.doc_ov is distinct from old.doc_ov
      and not famai_private.allowed('act:printDoc',true) then
      raise exception 'ไม่มีสิทธิ์แก้เอกสารการขาย' using errcode='42501';
    end if;
    new.created_at:=old.created_at; new.allocated_by:=old.allocated_by;
  else new.created_at:=clock_timestamp(); end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger sale_brief_guard before insert or update on public.sale
for each row execute function famai_private.sale_guard();

create or replace function famai_private.finance_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.finance_case_event(case_id,from_status,to_status,at,by_user,note)
    values(new.id,case when tg_op='UPDATE' then old.status else null end,
      new.status,clock_timestamp(),auth.uid(),new.reject_reason);
    -- เคสเดิมที่เปิดขายมาก่อนบรีฟนี้ยังเดินงานได้ แต่ผลใหม่ต้องให้การเงินตรวจใหม่
    if tg_op='UPDATE' and old.sale_id is not null then
      update public.sale set fin_approval=jsonb_build_object('status','รอตรวจ','note','ผลไฟแนนซ์เปลี่ยน ต้องตรวจใหม่')
      where id=old.sale_id;
    end if;
  end if;
  return new;
end $$;
create trigger finance_brief_event after insert or update on public.finance_case
for each row execute function famai_private.finance_event();

create or replace function famai_private.sale_link_case() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.finance_case_id is not null then
    update public.finance_case set sale_id=new.id where id=new.finance_case_id;
  end if;
  update public.motorcycle_unit set status='sold' where id=new.unit_id;
  return new;
end $$;
create trigger sale_brief_link after insert on public.sale
for each row execute function famai_private.sale_link_case();

create or replace function famai_private.registration_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sale; delivery_now boolean; was_delivered boolean:=false;
begin
  -- ล็อกใบขายจนจบธุรกรรม ป้องกันส่งมอบโดยอ่านผลตรวจที่เปลี่ยนพร้อมกัน
  select * into s from public.sale where id=new.sale_id for update;
  if not found or s.branch_id<>new.branch_id then
    raise exception 'ใบขายและสาขาของงานทะเบียนไม่ตรงกัน' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    was_delivered:=old.delivered_at is not null;
    if was_delivered and new.delivered_at is null then
      raise exception 'ล้างหลักฐานวันส่งมอบย้อนหลังไม่ได้' using errcode='23514';
    end if;
  end if;
  delivery_now:=(not was_delivered and (new.delivered_at is not null
    or new.stage in ('ส่งมอบแล้ว','รอทะเบียน','ยื่นขนส่ง','ได้ทะเบียนแล้ว')))
    or (tg_op='UPDATE' and new.delivered_at is distinct from old.delivered_at and new.delivered_at is not null);
  if delivery_now then
    if auth.uid() is not null and not (famai_private.allowed('act:deliver',true)
      and famai_private.allowed('page:deal',true)) then
      raise exception 'ไม่มีสิทธิ์ส่งมอบรถ' using errcode='42501';
    end if;
    if s.voided_at is not null or coalesce(s.fin_approval->>'status','รอตรวจ')<>'ผ่าน' then
      raise exception 'การเงินภายในต้องตรวจผ่านก่อนส่งมอบรถ' using errcode='23514';
    end if;
    if s.pay_method='finance' and not exists(select 1 from public.finance_case f
      where f.sale_id=s.id and f.customer_id=s.customer_id and f.status='อนุมัติแล้ว') then
      raise exception 'ไฟแนนซ์ยังไม่อนุมัติ ส่งมอบไม่ได้' using errcode='23514';
    end if;
    new.delivered_at:=coalesce(new.delivered_at,(clock_timestamp() at time zone 'Asia/Bangkok')::date);
    if new.delivered_at>(clock_timestamp() at time zone 'Asia/Bangkok')::date then
      raise exception 'วันส่งมอบจริงเป็นวันอนาคตไม่ได้' using errcode='23514';
    end if;
    new.delivered_by:=auth.uid(); new.delivered_recorded_at:=clock_timestamp();
  elsif tg_op='UPDATE' then
    new.delivered_by:=old.delivered_by; new.delivered_recorded_at:=old.delivered_recorded_at;
    if auth.uid() is not null and new.stage is distinct from old.stage
      and not (famai_private.allowed('act:plate',true) and famai_private.allowed('page:plate',true))
      and not (famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)) then
      raise exception 'ไม่มีสิทธิ์เดินขั้นงานทะเบียน' using errcode='42501';
    end if;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger registration_brief_guard before insert or update on public.registration
for each row execute function famai_private.registration_guard();

-- งานอัตโนมัติเกิดจากการส่งมอบที่ฐานข้อมูลครั้งเดียว; บวกเดือนปฏิทินและ clamp วันปลายเดือน
create or replace function famai_private.delivery_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.delivered_at is not null and (tg_op='INSERT' or old.delivered_at is null) then
    insert into public.follow_up_task(branch_id,customer_id,sale_id,kind,title,due_at,task_source,created_by)
    select s.branch_id,s.customer_id,s.id,'care 1 เดือน','ติดตาม 1 เดือนหลังส่งมอบ',
      (new.delivered_at+interval '1 month')::date,'delivery_month',auth.uid()
    from public.sale s where s.id=new.sale_id and s.voided_at is null
    on conflict(sale_id) where task_source='delivery_month' do nothing;
  end if;
  return new;
end $$;
create trigger registration_brief_task after insert or update on public.registration
for each row execute function famai_private.delivery_task();

create or replace function famai_private.quote_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.seller_id:=coalesce(new.seller_id,auth.uid()); new.created_by:=auth.uid();
  else
    new.created_by:=old.created_by;
    if auth.uid() is not null and new.seller_id is distinct from old.seller_id
      and not famai_private.has_role(array['admin','manager']) then
      raise exception 'ไม่มีสิทธิ์เปลี่ยนผู้เสนอราคา' using errcode='42501';
    end if;
  end if;
  if famai_private.frontline_sales() and new.seller_id is distinct from auth.uid() then
    raise exception 'บันทึกใบเสนอราคาได้เฉพาะของคุณ' using errcode='42501';
  end if;
  return new;
end $$;
create trigger quotation_brief_guard before insert or update on public.quotation
for each row execute function famai_private.quote_guard();

create or replace function famai_private.task_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then new.created_by:=auth.uid();
  else new.created_by:=old.created_by; end if;
  if new.appointment_at is not null then
    new.due_at:=(new.appointment_at at time zone 'Asia/Bangkok')::date;
  end if;
  if new.done_at is not null and (tg_op='INSERT' or old.done_at is null) then
    new.done_at:=clock_timestamp(); new.done_by:=auth.uid();
  elsif tg_op='UPDATE' and new.done_at is not null then
    new.done_at:=old.done_at; new.done_by:=old.done_by;
  elsif new.done_at is null then new.done_by:=null; end if;
  if new.sale_id is not null and not exists(select 1 from public.sale s
    where s.id=new.sale_id and s.customer_id=new.customer_id and s.branch_id=new.branch_id) then
    raise exception 'งานติดตามไม่ตรงกับลูกค้าของใบขาย' using errcode='23514';
  end if;
  if new.service_job_id is not null and not exists(select 1 from public.service_job s
    where s.id=new.service_job_id and s.customer_id=new.customer_id and s.branch_id=new.branch_id) then
    raise exception 'นัดหมายไม่ตรงกับลูกค้าของใบงานซ่อม' using errcode='23514';
  end if;
  if new.parent_task_id is not null and not exists(select 1 from public.follow_up_task t
    where t.id=new.parent_task_id and t.customer_id=new.customer_id and t.branch_id=new.branch_id) then
    raise exception 'นัดหมายไม่ตรงกับลูกค้าของงานเดิม' using errcode='23514';
  end if;
  return new;
end $$;
create trigger follow_up_task_brief_guard before insert or update on public.follow_up_task
for each row execute function famai_private.task_guard();

create or replace function famai_private.seen_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.seen_at:=clock_timestamp();
  return new;
end $$;
create trigger notification_seen_stamp before insert or update on public.notification_seen
for each row execute function famai_private.seen_guard();

do $$ declare t text; begin
  foreach t in array array['quotation','service_job','follow_up_task'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function famai_private.stamp_row()',t||'_brief_stamp',t);
  end loop;
end $$;

-- ขยับเวลาอัปเดตของลูกค้าเมื่อธุรกรรมจริงเปลี่ยน เพื่อให้หลายเครื่องเรียงลำดับตรงกัน
create or replace function famai_private.touch_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if tg_table_name='registration' then
    select customer_id into cid from public.sale where id=new.sale_id;
  else cid:=new.customer_id; end if;
  if cid is not null then update public.customer set updated_at=clock_timestamp() where id=cid; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['sale','finance_case','registration','service_job','follow_up_task','booking'] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function famai_private.touch_customer()',t||'_brief_touch',t);
  end loop;
end $$;

-- เปลี่ยนนโยบายเดิมทั้งชุดบนตารางที่เกี่ยวข้อง ไม่ปล่อย policy ALL เดิม OR ข้ามด่านใหม่
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename=any(array['customer','sale','finance_case','registration','quotation','quotation_option',
      'booking','service_job','service_job_line','service_reminder','follow_up_task',
      'lead_stage_history','finance_case_event','registration_event','sale_freebie','receivable','receipt_payment','document']) loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;

-- SELECT ของตารางตัวเองใช้คอลัมน์แถวโดยตรง: helper ที่ SELECT กลับหาตัวเองยังไม่เห็น
-- แถวใหม่ใน snapshot ของ INSERT ... RETURNING ทำให้ RLS ปฏิเสธการเพิ่มข้อมูลที่ถูกต้อง
create policy customer_read on public.customer for select to authenticated using(
  famai_private.branch_ok(branch_id) and (not famai_private.frontline_sales() or owner_id=auth.uid())
  and famai_private.any_page(array['deal','sell','booking','service','aftercare','plate','ar']));
create policy customer_insert on public.customer for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and (not famai_private.frontline_sales() or owner_id=auth.uid())
  and famai_private.any_page(array['deal','sell','booking','service','aftercare'],true));
create policy customer_update on public.customer for update to authenticated
  using(famai_private.customer_ok(id,true)) with check(famai_private.branch_ok(branch_id)
    and (not famai_private.frontline_sales() or owner_id=auth.uid()));

create policy sale_read on public.sale for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id));
create policy sale_insert on public.sale for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id)
  and famai_private.allowed('page:sell',true) and famai_private.allowed('act:allocateUnit',true)
  and famai_private.has_role(array['admin','manager']));
create policy sale_update on public.sale for update to authenticated
  using(famai_private.sale_ok(id) and famai_private.any_page(array['sell','deal','invoice'],true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id));

create policy finance_read on public.finance_case for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id)
  and famai_private.any_page(array['deal','invoice','report','ar']));
create policy finance_insert on public.finance_case for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
  and famai_private.allowed('page:deal',true) and famai_private.allowed('act:finStage',true));
create policy finance_update on public.finance_case for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
    and famai_private.allowed('page:deal',true) and famai_private.allowed('act:finStage',true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));

create policy registration_read on public.registration for select to authenticated using(famai_private.sale_ok(sale_id));
create policy registration_insert on public.registration for insert to authenticated with check(
  famai_private.sale_ok(sale_id) and famai_private.allowed('act:allocateUnit',true)
  and famai_private.allowed('page:sell',true));
create policy registration_update on public.registration for update to authenticated
  using(famai_private.sale_ok(sale_id) and famai_private.any_page(array['deal','plate'],true))
  with check(famai_private.sale_ok(sale_id) and famai_private.branch_ok(branch_id));

create policy quote_read on public.quotation for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.allowed('page:quote')
  and (not famai_private.frontline_sales() or coalesce(seller_id,created_by)=auth.uid()));
create policy quote_insert on public.quotation for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.allowed('page:quote',true)
  and (not famai_private.frontline_sales() or seller_id=auth.uid()));
create policy quote_update on public.quotation for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.allowed('page:quote',true)
    and (not famai_private.frontline_sales() or seller_id=auth.uid()))
  with check(famai_private.branch_ok(branch_id)
    and (not famai_private.frontline_sales() or seller_id=auth.uid()));
create policy quote_option_read on public.quotation_option for select to authenticated using(
  exists(select 1 from public.quotation q where q.id=quotation_id));
create policy quote_option_write on public.quotation_option for all to authenticated
  using(famai_private.allowed('page:quote',true) and exists(select 1 from public.quotation q where q.id=quotation_id))
  with check(famai_private.allowed('page:quote',true) and exists(select 1 from public.quotation q where q.id=quotation_id));

create policy booking_read on public.booking for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.any_page(array['booking','deal','sell'])
  and (famai_private.customer_ok(customer_id) or (customer_id is null and not famai_private.frontline_sales())));
create policy booking_insert on public.booking for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.allowed('page:booking',true)
  and famai_private.allowed('act:booking',true) and famai_private.customer_ok(customer_id,true));
create policy booking_update on public.booking for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
    and (famai_private.allowed('act:booking',true) or famai_private.allowed('act:allocateUnit',true))
    and famai_private.any_page(array['booking','sell'],true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));

create policy service_read on public.service_job for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.any_page(array['service','aftercare'])
  and (famai_private.customer_ok(customer_id) or (customer_id is null and not famai_private.frontline_sales())));
create policy service_insert on public.service_job for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and (famai_private.allowed('page:service',true)
    or (famai_private.allowed('page:aftercare',true) and famai_private.allowed('act:care',true)))
  and famai_private.customer_ok(customer_id,true));
create policy service_update on public.service_job for update to authenticated
  using(famai_private.branch_ok(branch_id) and (famai_private.allowed('page:service',true)
    or (famai_private.allowed('page:aftercare',true) and famai_private.allowed('act:care',true)))
    and famai_private.customer_ok(customer_id,true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));
create policy service_line_read on public.service_job_line for select to authenticated using(
  exists(select 1 from public.service_job j where j.id=job_id));
create policy service_line_write on public.service_job_line for all to authenticated
  using(famai_private.allowed('page:service',true) and exists(select 1 from public.service_job j where j.id=job_id))
  with check(famai_private.allowed('page:service',true) and exists(select 1 from public.service_job j where j.id=job_id));
create policy reminder_read on public.service_reminder for select to authenticated using(
  famai_private.customer_ok(customer_id));
create policy reminder_write on public.service_reminder for all to authenticated
  using(famai_private.customer_ok(customer_id,true) and famai_private.any_page(array['service','aftercare','sell'],true))
  with check(famai_private.customer_ok(customer_id,true) and famai_private.any_page(array['service','aftercare','sell'],true));

create policy task_read on public.follow_up_task for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id)
  and famai_private.any_page(array['deal','aftercare','service']));
create policy task_insert on public.follow_up_task for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
  and ((task_source='legacy' and famai_private.allowed('page:deal',true))
    or (task_source in ('manual','service_next') and famai_private.allowed('act:care',true)
      and famai_private.any_page(array['aftercare','service'],true))));
create policy task_update on public.follow_up_task for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
    and ((task_source='legacy' and famai_private.allowed('page:deal',true))
      or (famai_private.allowed('act:care',true) and famai_private.allowed('page:aftercare',true))))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));

create policy notification_seen_read on public.notification_seen for select to authenticated
  using(user_id=auth.uid() and famai_private.branch_ok(null));
create policy notification_seen_insert on public.notification_seen for insert to authenticated
  with check(user_id=auth.uid() and famai_private.branch_ok(null));
create policy notification_seen_update on public.notification_seen for update to authenticated
  using(user_id=auth.uid() and famai_private.branch_ok(null))
  with check(user_id=auth.uid() and famai_private.branch_ok(null));

-- ตารางลูกห้ามเป็นทางลัดอ่านข้อมูลลูกค้าข้ามเซลล์; ประวัติไม่มี DELETE policy
create policy lead_history_read on public.lead_stage_history for select to authenticated using(famai_private.customer_ok(customer_id));
create policy lead_history_insert on public.lead_stage_history for insert to authenticated with check(famai_private.customer_ok(customer_id,true));
create policy finance_event_read on public.finance_case_event for select to authenticated using(
  exists(select 1 from public.finance_case f where f.id=case_id));
create policy finance_event_insert on public.finance_case_event for insert to authenticated with check(
  famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)
  and exists(select 1 from public.finance_case f where f.id=case_id));
create policy registration_event_read on public.registration_event for select to authenticated using(
  exists(select 1 from public.registration r where r.id=registration_id));
create policy registration_event_insert on public.registration_event for insert to authenticated with check(
  famai_private.any_page(array['deal','plate'],true)
  and exists(select 1 from public.registration r where r.id=registration_id));
create policy sale_freebie_read on public.sale_freebie for select to authenticated using(famai_private.sale_ok(sale_id));
create policy sale_freebie_write on public.sale_freebie for all to authenticated
  using(famai_private.sale_ok(sale_id) and famai_private.allowed('act:allocateUnit',true))
  with check(famai_private.sale_ok(sale_id) and famai_private.allowed('act:allocateUnit',true));
create policy receivable_read on public.receivable for select to authenticated using(
  famai_private.sale_ok(sale_id) and famai_private.any_page(array['ar','deal','invoice']));
create policy receivable_write on public.receivable for all to authenticated
  using(famai_private.sale_ok(sale_id) and ((famai_private.allowed('act:finApprove',true)
    and famai_private.any_page(array['ar','deal'],true)) or (famai_private.allowed('act:allocateUnit',true)
    and famai_private.allowed('page:sell',true))))
  with check(famai_private.sale_ok(sale_id) and ((famai_private.allowed('act:finApprove',true)
    and famai_private.any_page(array['ar','deal'],true)) or (famai_private.allowed('act:allocateUnit',true)
    and famai_private.allowed('page:sell',true))));
create policy receipt_payment_read on public.receipt_payment for select to authenticated using(
  exists(select 1 from public.receivable r where r.id=receivable_id));
create policy receipt_payment_write on public.receipt_payment for all to authenticated
  using(famai_private.allowed('act:finApprove',true) and famai_private.any_page(array['ar','deal'],true)
    and exists(select 1 from public.receivable r where r.id=receivable_id))
  with check(famai_private.allowed('act:finApprove',true) and famai_private.any_page(array['ar','deal'],true)
    and exists(select 1 from public.receivable r where r.id=receivable_id));
create policy document_read on public.document for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.allowed('act:printDoc')
  and (sale_id is null or famai_private.sale_ok(sale_id)));
create policy document_insert on public.document for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.allowed('act:printDoc',true)
  and famai_private.any_page(array['invoice','deal'],true) and (sale_id is null or famai_private.sale_ok(sale_id)));
create policy document_update on public.document for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.allowed('act:printDoc',true)
    and famai_private.any_page(array['invoice','deal'],true) and (sale_id is null or famai_private.sale_ok(sale_id)))
  with check(famai_private.branch_ok(branch_id) and (sale_id is null or famai_private.sale_ok(sale_id)));

-- เปิดขายหนึ่งครั้งเป็นธุรกรรมเดียว: ไม่มีใบขายค้างที่รถ/จอง/ของแถมเขียนไม่ครบ
-- SECURITY INVOKER ให้ RLS และ trigger ของแต่ละตารางเป็นด่านจริงตามเดิม
create or replace function public.create_sale_bundle(
  p_customer jsonb,p_sale jsonb,p_registration jsonb,p_receivable jsonb,p_booking uuid,p_gifts jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.sale; r public.registration; a public.receivable; f public.finance_case;
  sid uuid:=coalesce((p_sale->>'id')::uuid,gen_random_uuid());
  cid uuid:=(p_sale->>'customer_id')::uuid; gift jsonb; gid uuid; qty integer; n integer;
begin
  if auth.uid() is null or not (famai_private.has_role(array['admin','manager'])
    and famai_private.allowed('act:allocateUnit',true) and famai_private.allowed('page:sell',true)) then
    raise exception 'ผู้บริหารเป็นผู้เปิดการขาย' using errcode='42501';
  end if;
  -- ส่งซ้ำหลังเน็ตขาดใช้ id เดิมได้ ต้องเป็นรายการเดิมทุกเงื่อนไขหลัก
  select * into s from public.sale where id=sid;
  if found then
    if s.customer_id is distinct from cid or s.unit_id is distinct from (p_sale->>'unit_id')::uuid
      or s.net_price is distinct from (p_sale->>'net_price')::numeric
      or s.pay_method is distinct from p_sale->>'pay_method'
      or s.finance_case_id is distinct from (p_sale->>'finance_case_id')::uuid then
      raise exception 'รหัสการขายนี้ถูกใช้กับรายการอื่นแล้ว' using errcode='23514';
    end if;
    select * into r from public.registration where sale_id=sid;
    select * into a from public.receivable where sale_id=sid order by id limit 1;
    select * into f from public.finance_case where id=s.finance_case_id;
    return jsonb_build_object('sale',to_jsonb(s),'registration',to_jsonb(r),'receivable',to_jsonb(a),'finance_case',to_jsonb(f));
  end if;
  if p_customer is not null and jsonb_typeof(p_customer)='object' then
    if (p_customer->>'id')::uuid is distinct from cid then
      raise exception 'ข้อมูลลูกค้าไม่ตรงกับใบขาย' using errcode='23514';
    end if;
    insert into public.customer(id,branch_id,full_name,phone,address,tax_id,owner_id,note,birth_date,purchase_intent,interested_variant_id)
    values(cid,(p_customer->>'branch_id')::uuid,p_customer->>'full_name',p_customer->>'phone',
      p_customer->>'address',p_customer->>'tax_id',(p_customer->>'owner_id')::uuid,p_customer->>'note',
      (p_customer->>'birth_date')::date,p_customer->>'purchase_intent',(p_customer->>'interested_variant_id')::uuid)
    on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,address=excluded.address,
      tax_id=excluded.tax_id,note=excluded.note,birth_date=excluded.birth_date;
  end if;
  if not exists(select 1 from public.customer where id=cid and archived_at is null) then
    raise exception 'ลูกค้าไม่มีอยู่หรือถูกยุติการติดตามแล้ว' using errcode='23514';
  end if;
  if p_booking is not null then
    perform 1 from public.booking b where b.id=p_booking and b.customer_id=cid
      and b.unit_id=(p_sale->>'unit_id')::uuid and b.status='จองอยู่' for update;
    if not found then raise exception 'การจองไม่ตรงกับลูกค้าและคันรถ' using errcode='23514'; end if;
  elsif exists(select 1 from public.booking b where b.unit_id=(p_sale->>'unit_id')::uuid
    and b.status='จองอยู่' and b.customer_id is distinct from cid) then
    raise exception 'คันรถติดจองของลูกค้าคนอื่น' using errcode='23514';
  end if;
  insert into public.sale(id,branch_id,unit_id,customer_id,salesperson_id,sold_at,list_price,discount,net_price,
    cost,freebie_cost,gross_profit,pay_method,down_payment,term_months,note,finance_id,doc_no,public_token,
    rate_pct,monthly_installment,loan_total,pay_now,gifts,fin_approval,doc_ov,finance_case_id)
  values(sid,(p_sale->>'branch_id')::uuid,(p_sale->>'unit_id')::uuid,cid,(p_sale->>'salesperson_id')::uuid,
    coalesce((p_sale->>'sold_at')::date,(clock_timestamp() at time zone 'Asia/Bangkok')::date),
    (p_sale->>'list_price')::numeric,coalesce((p_sale->>'discount')::numeric,0),(p_sale->>'net_price')::numeric,
    (p_sale->>'cost')::numeric,coalesce((p_sale->>'freebie_cost')::numeric,0),(p_sale->>'gross_profit')::numeric,
    p_sale->>'pay_method',(p_sale->>'down_payment')::numeric,(p_sale->>'term_months')::integer,
    p_sale->>'note',(p_sale->>'finance_id')::uuid,p_sale->>'doc_no',coalesce(nullif(p_sale->>'public_token',''),pub.gen_token()),
    (p_sale->>'rate_pct')::numeric,(p_sale->>'monthly_installment')::numeric,(p_sale->>'loan_total')::numeric,
    (p_sale->>'pay_now')::numeric,coalesce(p_gifts,'[]'::jsonb),'{"status":"รอตรวจ"}'::jsonb,p_sale->'doc_ov',
    (p_sale->>'finance_case_id')::uuid) returning * into s;
  insert into public.registration(id,sale_id,branch_id,stage,due_at,stage_log)
  values(coalesce((p_registration->>'id')::uuid,gen_random_uuid()),sid,s.branch_id,'ขายแล้ว',
    (p_registration->>'due_at')::date,jsonb_build_array(jsonb_build_object('to','ขายแล้ว','at',s.sold_at)))
  returning * into r;
  if p_receivable is not null and jsonb_typeof(p_receivable)='object' then
    insert into public.receivable(id,branch_id,sale_id,kind,payer_finance_id,amount_due,amount_paid,due_at)
    values(coalesce((p_receivable->>'id')::uuid,gen_random_uuid()),s.branch_id,sid,
      coalesce(p_receivable->>'kind','finance'),(p_receivable->>'payer_finance_id')::uuid,
      (p_receivable->>'amount_due')::numeric,0,(p_receivable->>'due_at')::date) returning * into a;
  end if;
  for gift in select value from jsonb_array_elements(coalesce(p_gifts,'[]'::jsonb)) loop
    if nullif(gift->>'id','') is null then continue; end if;
    gid:=(gift->>'id')::uuid; qty:=coalesce((gift->>'qty')::integer,1);
    if qty<1 then raise exception 'จำนวนของแถมต้องมากกว่าศูนย์' using errcode='23514'; end if;
    update public.freebie set qty_on_hand=qty_on_hand-qty
      where id=gid and branch_id=s.branch_id and qty_on_hand>=qty;
    get diagnostics n=row_count;
    if n<>1 then raise exception 'ของแถมไม่พอหรือไม่อยู่ในสาขานี้' using errcode='23514'; end if;
  end loop;
  update public.booking set status='เปิดขายแล้ว',sale_id=sid,updated_at=clock_timestamp()
    where unit_id=s.unit_id and customer_id=cid and status='จองอยู่';
  select * into f from public.finance_case where id=s.finance_case_id;
  return jsonb_build_object('sale',to_jsonb(s),'registration',to_jsonb(r),'receivable',to_jsonb(a),'finance_case',to_jsonb(f));
end $$;
revoke all on function public.create_sale_bundle(jsonb,jsonb,jsonb,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.create_sale_bundle(jsonb,jsonb,jsonb,jsonb,uuid,jsonb) to authenticated;

-- รุ่น/สี/ราคาบันทึกครบพร้อมกัน; ไม่ลบสีเก่าที่ธุรกรรมหรือรูปเคยอ้างถึง
create or replace function public.catalog_save_variant(p_code text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.model_variant; pr public.price_history; col jsonb; v_code text:=upper(btrim(p_code));
  price_cost numeric; price_vat numeric; result_price jsonb;
begin
  if auth.uid() is null or not famai_private.allowed('page:settings',true) then
    raise exception 'ไม่มีสิทธิ์แก้รุ่นรถ' using errcode='42501';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9._-]{0,39}$' or nullif(btrim(p_data->>'model_name'),'') is null then
    raise exception 'กรอกรหัสรุ่นและชื่อรุ่นให้ถูกต้อง' using errcode='23514';
  end if;
  if coalesce((p_data->>'is_new')::boolean,false) and exists(select 1 from public.model_variant m where m.code=v_code) then
    raise exception 'รหัสรุ่นนี้มีอยู่แล้ว' using errcode='23505';
  end if;
  if jsonb_typeof(p_data->'colors') is distinct from 'array' or jsonb_array_length(p_data->'colors')=0 then
    raise exception 'เพิ่มสีอย่างน้อยหนึ่งสี' using errcode='23514';
  end if;
  insert into public.model_variant(code,model_name,model_th,category,cc,model_year)
  values(v_code,btrim(p_data->>'model_name'),p_data->>'model_th',p_data->>'category',
    (p_data->>'cc')::numeric,(p_data->>'model_year')::integer)
  on conflict(code) do update set model_name=excluded.model_name,model_th=excluded.model_th,
    category=excluded.category,cc=excluded.cc,model_year=excluded.model_year returning * into v;
  for col in select value from jsonb_array_elements(p_data->'colors') loop
    if nullif(btrim(col->>'code'),'') is null or nullif(btrim(col->>'name'),'') is null then
      raise exception 'รหัสสีและชื่อสีต้องครบ' using errcode='23514';
    end if;
    insert into public.model_color(variant_id,color_code,color_name)
    values(v.id,upper(btrim(col->>'code')),btrim(col->>'name'))
    on conflict(variant_id,color_code) do update set color_name=excluded.color_name;
  end loop;
  if famai_private.allowed('data:money') then
    price_cost:=(p_data->>'cost')::numeric; price_vat:=(p_data->>'vat')::numeric;
  else
    select cost,vat into price_cost,price_vat from public.price_history
      where variant_id=v.id order by effective_from desc,id desc limit 1;
  end if;
  if coalesce((p_data->>'retail')::numeric,-1)<0 or coalesce(price_cost,-1)<0
    or coalesce(price_vat,-1)<0 then
    raise exception 'ราคาและต้นทุนต้องไม่ติดลบ' using errcode='23514';
  end if;
  insert into public.price_history(variant_id,effective_from,cost,vat,retail,source)
  values(v.id,(clock_timestamp() at time zone 'Asia/Bangkok')::date,price_cost,
    price_vat,(p_data->>'retail')::numeric,'ตั้งค่ารุ่นรถ')
  on conflict(variant_id,effective_from) do update set cost=excluded.cost,vat=excluded.vat,retail=excluded.retail
  returning * into pr;
  result_price:=to_jsonb(pr);
  if not famai_private.allowed('data:money') then
    result_price:=result_price||jsonb_build_object('cost',null,'vat',null);
  end if;
  return jsonb_build_object('variant',to_jsonb(v),'price',result_price,
    'colors',(select jsonb_agg(jsonb_build_object('code',m.color_code,'name',m.color_name,
      'color_code',m.color_code,'color_name',m.color_name) order by m.color_code)
      from public.model_color m where m.variant_id=v.id));
end $$;
revoke all on function public.catalog_save_variant(text,jsonb) from public,anon;
grant execute on function public.catalog_save_variant(text,jsonb) to authenticated;

create or replace function famai_private.price_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare prior_cost numeric; prior_vat numeric;
begin
  if auth.uid() is not null and not famai_private.allowed('data:money') then
    if tg_op='UPDATE' then prior_cost:=old.cost; prior_vat:=old.vat;
    else select cost,vat into prior_cost,prior_vat from public.price_history
      where variant_id=new.variant_id order by effective_from desc,id desc limit 1; end if;
    if prior_cost is null or row(new.cost,new.vat) is distinct from row(prior_cost,prior_vat) then
      raise exception 'ไม่มีสิทธิ์แก้ต้นทุน' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger price_history_brief_guard before insert or update on public.price_history
for each row execute function famai_private.price_guard();

-- policy restrictive คุมสิทธิ์ดู/แก้ของหน้า แม้ policy สาขาหรือ admin เดิมยังอนุญาต
do $$ declare t text; p record; begin
  foreach t in array array['model_variant','model_color','price_history'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd='ALL' loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy %I on public.%I for insert to authenticated with check(famai_private.allowed(''page:settings'',true))',t||'_brief_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using(famai_private.allowed(''page:settings'',true)) with check(famai_private.allowed(''page:settings'',true))',t||'_brief_update',t);
  end loop;
  -- หน้าอ่านอย่างเดียวต้องไม่อาศัย policy admin/manager เดิมเพื่อเขียนค่าอ้างอิง
  foreach t in array array['finance_company'] loop
    execute format('create policy %I on public.%I for all to authenticated using(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true)) with check(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_config',t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_gate_i',t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true)) with check(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_gate_u',t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_gate_d',t);
  end loop;
  -- ทุกตารางที่มีประวัติทางธุรกิจในรอบนี้เลิกใช้การลบถาวร
  foreach t in array array['customer','sale','finance_case','registration','quotation','booking','service_job',
    'follow_up_task','lead_stage_history','finance_case_event','registration_event','receivable','receipt_payment','document'] loop
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(false)',t||'_brief_preserve',t);
  end loop;
end $$;

-- จำกัด execute หลังสร้างครบทุกตัว; ฟังก์ชัน trigger ไม่ใช่ RPC และห้ามเรียกจาก anon
revoke all on all functions in schema famai_private from public, anon;
grant execute on all functions in schema famai_private to authenticated, service_role;
comment on schema famai_private is 'ด่านสิทธิ์ภายใน ไม่เพิ่ม schema นี้ใน exposed schemas ของ Data API';
notify pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260906094608', '32_brief_workflows', ARRAY[$release_source_32$-- 32 · บรีฟ 6 ก.ย. 2569: เคสก่อนขาย สิทธิ์ผู้ดูแลลูกค้า และงานบริการที่บันทึกถาวร
-- ไม่ลบประวัติเดิม · บันทึกเหตุการณ์ด้วยเวลาเซิร์ฟเวอร์ · ห้าม apply ก่อนส่งงานร่วมผ่านด่าน

create schema if not exists famai_private;
revoke all on schema famai_private from public, anon;
grant usage on schema famai_private to authenticated, service_role;

-- ฟังก์ชันอ่านสิทธิ์อยู่ใน schema ที่ไม่เปิด Data API; ไม่รับ user_id จากผู้เรียก
create or replace function famai_private.has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_user_role ur
    join public.role r on r.id=ur.role_id join public.app_user u on u.id=ur.user_id
    where ur.user_id=auth.uid() and u.is_active and r.code=any(p_roles))
$$;

create or replace function famai_private.perm(p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare rr record; cfg jsonb; v text; best integer:=0; defroles text[];
begin
  if auth.uid() is null then return 'none'; end if;
  select value into cfg from public.app_setting where key='perms';
  -- ค่าเริ่มต้นตรงกับ MENU/PERM_ACTS/PERM_DATA; ค่าที่แอดมินบันทึกชนะรายบทบาท
  defroles := case p_key
    when 'page:dash' then array['admin','manager','acct','sales','stock','hr','tech']
    when 'page:cal' then array['admin','manager','acct','sales','stock','hr','tech','care','reg']
    when 'page:report' then array['admin','manager','acct','stock','hr']
    when 'page:recv' then array['admin','manager','stock']
    when 'page:stock' then array['admin','manager','stock','sales','acct']
    when 'page:sell' then array['admin','manager','sales']
    when 'page:transfer' then array['admin','manager','stock']
    when 'page:quote' then array['admin','manager','sales']
    when 'page:deal' then array['admin','manager','acct','sales']
    when 'page:invoice' then array['admin','manager','acct']
    when 'page:booking' then array['admin','manager','sales']
    when 'page:plate' then array['admin','manager','reg']
    when 'page:ar' then array['admin','manager','acct']
    when 'page:service' then array['admin','manager','tech','stock','care']
    when 'page:aftercare' then array['admin','manager','care']
    when 'page:parts' then array['admin','manager','stock','tech','acct','sales']
    when 'page:expense' then array['admin','manager','acct']
    when 'page:attend' then array['admin','manager','hr']
    when 'page:hr' then array['admin','manager','hr','sales','stock','tech','acct','care','reg']
    when 'page:payroll' then array['admin','manager','hr','acct']
    when 'page:users' then array['admin']
    when 'page:imp' then array['admin','manager','stock']
    when 'page:settings' then array['admin','manager']
    when 'page:custom' then array['admin','manager','sales','stock','acct','hr','tech','care','reg']
    when 'page:flow' then array['admin','manager','sales','stock','acct','hr','tech','care','reg']
    when 'act:finApprove' then array['admin','acct']
    when 'act:printDoc' then array['admin','manager','acct']
    when 'act:editFin' then array['admin','manager']
    when 'act:transfer' then array['admin','manager','stock']
    when 'act:wholesale' then array['admin','manager']
    when 'act:org' then array['admin','manager']
    when 'act:sites' then array['admin','manager']
    when 'act:care' then array['admin','manager','care']
    when 'act:voidSale' then array['admin','manager']
    when 'act:finStage' then array['admin','manager','sales']
    when 'act:hrApprove' then array['admin','manager','hr']
    when 'act:plate' then array['admin','manager','reg']
    when 'act:booking' then array['admin','manager','sales']
    when 'act:execCal' then array['admin','manager']
    when 'act:allocateUnit' then array['admin','manager']
    when 'act:deliver' then array['admin','manager','sales']
    when 'act:archiveCustomer' then array['admin','manager','sales']
    when 'data:idNo' then array['admin','manager','acct']
    when 'data:money' then array['admin','manager','acct','hr']
    else array[]::text[] end;
  for rr in select r.code from public.app_user_role ur
    join public.role r on r.id=ur.role_id join public.app_user u on u.id=ur.user_id
    where ur.user_id=auth.uid() and u.is_active
  loop
    if rr.code='admin' then return case when p_key like 'data:%' then 'read' else 'write' end; end if;
    v:=cfg -> rr.code ->> p_key;
    if v is null then v:=case when rr.code=any(defroles)
      then case when p_key like 'data:%' then 'read' else 'write' end else 'none' end; end if;
    best:=greatest(best,case v when 'write' then 2 when 'read' then 1 else 0 end);
  end loop;
  return case best when 2 then 'write' when 1 then 'read' else 'none' end;
end $$;

create or replace function famai_private.allowed(p_key text,p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_write then famai_private.perm(p_key)='write'
    else famai_private.perm(p_key)<>'none' end
$$;
create or replace function famai_private.any_page(p_pages text[],p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from unnest(p_pages) p where famai_private.allowed('page:'||p,p_write))
$$;
create or replace function famai_private.branch_ok(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_user u where u.id=auth.uid() and u.is_active
    and (p_branch is null or u.all_branch
      or famai_private.has_role(array['admin','manager','acct','hr','care','reg'])
      or exists(select 1 from public.app_user_branch b where b.user_id=u.id and b.branch_id=p_branch)))
$$;
create or replace function famai_private.frontline_sales() returns boolean
language sql stable security definer set search_path = '' as $$
  select famai_private.has_role(array['sales'])
    and not famai_private.has_role(array['admin','manager','acct','care','reg'])
$$;

-- ข้อมูลหลัก: รหัสผู้รับผิดชอบมีอยู่แล้ว ใช้ UUID เดิมโดยไม่สร้างเจ้าของซ้ำด้วยชื่อ
alter table public.customer
  add column if not exists note text,
  add column if not exists finance_history jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.app_user(id),
  add column if not exists updated_by uuid references public.app_user(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.app_user(id),
  add column if not exists archived_reason text;
-- เติมเจ้าของเท่าที่มีหลักฐานจากใบขายจริง ลูกค้าที่ไม่มีหลักฐานคงว่างให้ผู้บริหารจัดสรร
update public.customer c set owner_id=(select s.salesperson_id from public.sale s
  where s.customer_id=c.id and s.salesperson_id is not null
  order by s.created_at desc,s.id desc limit 1)
where c.owner_id is null and exists(select 1 from public.sale s where s.customer_id=c.id and s.salesperson_id is not null);
update public.customer set updated_at=created_at;
create index if not exists customer_owner_updated_idx on public.customer(owner_id,updated_at desc);
create index if not exists customer_branch_updated_idx on public.customer(branch_id,updated_at desc);

alter table public.finance_case
  add column if not exists reject_with text,
  add column if not exists reject_note text,
  add column if not exists variant_id uuid references public.model_variant(id),
  add column if not exists variant_code text,
  add column if not exists model_name text,
  add column if not exists color_code text,
  add column if not exists color_name text,
  add column if not exists list_price numeric(12,2),
  add column if not exists discount numeric(12,2) not null default 0,
  add column if not exists down_payment numeric(12,2),
  add column if not exists term_months integer,
  add column if not exists rate_pct numeric(8,4),
  add column if not exists monthly_installment numeric(12,2),
  add column if not exists loan_total numeric(12,2),
  add column if not exists pay_now numeric(12,2),
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.app_user(id),
  add column if not exists updated_by uuid references public.app_user(id);
alter table public.sale
  add column if not exists finance_case_id uuid references public.finance_case(id),
  add column if not exists allocated_by uuid references public.app_user(id),
  add column if not exists updated_at timestamptz not null default now();
alter table public.registration
  add column if not exists delivered_by uuid references public.app_user(id),
  add column if not exists delivered_recorded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.quotation
  add column if not exists seller_id uuid references public.app_user(id),
  add column if not exists seller_name text,
  add column if not exists seller_phone text,
  add column if not exists pay_method text not null default 'finance' check(pay_method in ('cash','finance')),
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
update public.quotation set seller_id=created_by where seller_id is null;
alter table public.booking add column if not exists created_by uuid references public.app_user(id);
alter table public.service_job
  add column if not exists model_name text,
  add column if not exists next_appointment_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.follow_up_task
  add column if not exists title text,
  add column if not exists amount numeric(12,2) check(amount is null or amount>=0),
  add column if not exists task_source text not null default 'legacy'
    check(task_source in ('legacy','delivery_month','manual','service_next')),
  add column if not exists parent_task_id uuid references public.follow_up_task(id),
  add column if not exists service_job_id uuid references public.service_job(id),
  add column if not exists appointment_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.app_user(id);
create unique index if not exists task_delivery_month_uniq on public.follow_up_task(sale_id)
  where task_source='delivery_month';
create unique index if not exists task_service_appointment_uniq on public.follow_up_task(service_job_id,appointment_at)
  where task_source='service_next' and service_job_id is not null;
create index if not exists task_customer_due_idx on public.follow_up_task(customer_id,due_at);
create index if not exists finance_customer_updated_idx on public.finance_case(customer_id,updated_at desc);

create table public.notification_seen(
  user_id uuid not null default auth.uid() references public.app_user(id),
  notification_id text not null check(length(notification_id) between 1 and 240),
  seen_at timestamptz not null default now(),
  primary key(user_id,notification_id)
);
alter table public.notification_seen enable row level security;
revoke all on public.notification_seen from public, anon, authenticated;
grant select,insert,update on public.notification_seen to authenticated;
grant all on public.notification_seen to service_role;

create or replace function famai_private.customer_ok(p_id uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.customer c where c.id=p_id
    and famai_private.branch_ok(c.branch_id)
    and (not famai_private.frontline_sales() or c.owner_id=auth.uid())
    and famai_private.any_page(array['deal','sell','booking','service','aftercare','plate','ar'],p_write))
$$;
create or replace function famai_private.sale_ok(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sale s where s.id=p_id
    and famai_private.branch_ok(s.branch_id) and famai_private.customer_ok(s.customer_id))
$$;

-- เวลาทุกครั้งประทับที่ฐาน; ไม่รับ created_at ที่ client ส่งมาเพื่อย้อนลำดับงาน
create or replace function famai_private.stamp_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then new.created_at:=clock_timestamp();
  else new.created_at:=old.created_at; end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create or replace function famai_private.customer_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.created_at:=clock_timestamp(); new.created_by:=auth.uid();
    new.owner_id:=coalesce(new.owner_id,auth.uid());
  else
    new.created_at:=old.created_at; new.created_by:=old.created_by;
    if auth.uid() is not null and new.owner_id is distinct from old.owner_id
       and not (famai_private.has_role(array['admin','manager'])
         and famai_private.allowed('page:deal',true)) then
      raise exception 'เฉพาะผู้บริหารที่เปลี่ยนผู้ดูแลลูกค้าได้' using errcode='42501';
    end if;
  end if;
  if auth.uid() is not null and tg_op='INSERT' and new.owner_id is distinct from auth.uid()
    and not (famai_private.has_role(array['admin','manager']) and famai_private.allowed('page:deal',true)) then
    raise exception 'เฉพาะผู้บริหารที่จัดผู้ดูแลลูกค้าคนอื่นได้' using errcode='42501';
  end if;
  if auth.uid() is not null and famai_private.frontline_sales()
     and new.owner_id is distinct from auth.uid() then
    raise exception 'บันทึกได้เฉพาะลูกค้าของคุณ' using errcode='42501';
  end if;
  if (tg_op='INSERT' and new.archived_at is not null)
     or (tg_op='UPDATE' and (new.archived_at is distinct from old.archived_at
       or new.archived_reason is distinct from old.archived_reason)) then
    if auth.uid() is not null and not famai_private.allowed('act:archiveCustomer',true) then
      raise exception 'ไม่มีสิทธิ์ย้ายลูกค้าเข้าคลัง' using errcode='42501';
    end if;
    if new.archived_at is not null then
      if nullif(btrim(new.archived_reason),'') is null then
        raise exception 'กรอกเหตุผลที่ยุติการติดตาม' using errcode='23514';
      end if;
      if exists(select 1 from public.sale s where s.customer_id=new.id and s.voided_at is null
          and not exists(select 1 from public.registration r where r.sale_id=s.id and r.delivered_at is not null))
        or exists(select 1 from public.booking b where b.customer_id=new.id and b.status='จองอยู่')
        or exists(select 1 from public.finance_case f where f.customer_id=new.id and f.sale_id is null
          and f.status not in ('ปฏิเสธ','ยกเลิก')) then
        raise exception 'ต้องปิดงานขาย จอง และไฟแนนซ์ที่ค้างก่อนเก็บลูกค้าเข้าคลัง' using errcode='23514';
      end if;
      new.archived_at:=clock_timestamp(); new.archived_by:=auth.uid();
    else new.archived_by:=null; end if;
  elsif tg_op='UPDATE' then new.archived_by:=old.archived_by; end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end $$;
create trigger customer_brief_guard before insert or update on public.customer
for each row execute function famai_private.customer_guard();

create or replace function famai_private.booking_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare customer_archived timestamptz;
begin
  if new.status='จองอยู่' then
    select archived_at into customer_archived from public.customer where id=new.customer_id for share;
    if not found or customer_archived is not null then
      raise exception 'ลูกค้าอยู่ในคลัง ต้องเปิดติดตามใหม่ก่อนจอง' using errcode='23514';
    end if;
  end if;
  new.updated_at:=clock_timestamp();
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); new.created_by:=auth.uid();
  else new.created_at:=old.created_at; new.created_by:=old.created_by; end if;
  return new;
end $$;
create trigger booking_brief_guard before insert or update on public.booking
for each row execute function famai_private.booking_guard();

-- เคสที่ยังไม่มีใบขายต้องมี snapshot ครบ; เคสเก่าที่มีใบขายยังเดินต่อได้
create or replace function famai_private.finance_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allocating boolean:=false; customer_archived timestamptz;
begin
  if tg_op='INSERT' and auth.uid() is not null and new.sale_id is not null then
    raise exception 'เคสใหม่ต้องยื่นก่อนเปิดขายและจัดคัน' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    -- ใช้ใบขายเป็นจุดล็อกร่วมกับการเงินและส่งมอบ ก่อนอ่านสถานะทะเบียน
    if old.sale_id is not null then
      perform 1 from public.sale where id=old.sale_id for update;
      if new.sale_id is distinct from old.sale_id then
        raise exception 'เคสที่เปิดขายแล้วถอดหรือเปลี่ยนใบขายย้อนหลังไม่ได้' using errcode='23514';
      end if;
    end if;
    allocating:=new.sale_id is distinct from old.sale_id and new.sale_id is not null
      and famai_private.allowed('act:allocateUnit',true)
      and famai_private.has_role(array['admin','manager']);
    if old.sale_id is not null and (old.variant_id is not null or exists(
      select 1 from public.registration r where r.sale_id=old.sale_id and r.delivered_at is not null))
      and row(new.status,new.company_id,new.reject_reason,new.reject_with,new.reject_note)
      is distinct from row(old.status,old.company_id,old.reject_reason,old.reject_with,old.reject_note) then
      raise exception 'เคสที่จัดคันแล้วแก้ผลย้อนหลังไม่ได้' using errcode='23514';
    end if;
    if old.sale_id is not null and row(new.customer_id,new.branch_id,new.variant_id,new.color_code,
      new.company_id,new.list_price,new.discount,new.down_payment,new.term_months,new.rate_pct,
      new.monthly_installment,new.loan_total,new.pay_now)
      is distinct from row(old.customer_id,old.branch_id,old.variant_id,old.color_code,
      old.company_id,old.list_price,old.discount,old.down_payment,old.term_months,old.rate_pct,
      old.monthly_installment,old.loan_total,old.pay_now) then
      raise exception 'เคสที่เปิดขายแล้วแก้เงื่อนไขย้อนหลังไม่ได้' using errcode='23514';
    end if;
  end if;
  if auth.uid() is not null and not allocating
    and not (famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)) then
    raise exception 'ไม่มีสิทธิ์แก้เคสไฟแนนซ์' using errcode='42501';
  end if;
  if new.sale_id is null then
    -- SHARE ชนกับ UPDATE archive ของลูกค้า ทำให้สองคำสั่งพร้อมกันไม่ข้ามกัน
    select archived_at into customer_archived from public.customer where id=new.customer_id for share;
    if not found or (customer_archived is not null and new.status not in ('ปฏิเสธ','ยกเลิก')) then
      raise exception 'ลูกค้าอยู่ในคลัง ต้องเปิดติดตามใหม่ก่อนยื่นไฟแนนซ์' using errcode='23514';
    end if;
    if new.variant_id is null or nullif(btrim(new.color_code),'') is null
      or new.list_price is null or new.list_price<=0 or new.down_payment is null
      or new.down_payment<0 or new.term_months is null or new.term_months<=0
      or new.rate_pct is null or new.rate_pct<0 or new.monthly_installment is null
      or new.monthly_installment<0 or new.loan_total is null or new.pay_now is null then
      raise exception 'ข้อมูลรุ่น สี และเงื่อนไขยื่นไฟแนนซ์ไม่ครบ' using errcode='23514';
    end if;
    if not exists(select 1 from public.model_color mc where mc.variant_id=new.variant_id and mc.color_code=new.color_code) then
      raise exception 'สีไม่ตรงกับรหัสรุ่นที่ยื่น' using errcode='23514';
    end if;
    select code,model_name into new.variant_code,new.model_name from public.model_variant where id=new.variant_id;
    select color_name into new.color_name from public.model_color where variant_id=new.variant_id and color_code=new.color_code;
  end if;
  if new.sale_id is not null and not exists(select 1 from public.sale s
      where s.id=new.sale_id and s.customer_id=new.customer_id and s.branch_id=new.branch_id) then
    raise exception 'ใบขายไม่ตรงกับลูกค้าและสาขาของเคส' using errcode='23514';
  end if;
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); new.created_by:=auth.uid();
  else new.created_at:=old.created_at; new.created_by:=old.created_by; end if;
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end $$;
create trigger finance_brief_guard before insert or update on public.finance_case
for each row execute function famai_private.finance_guard();

-- กฎการขายตรวจที่จุดเขียนจริง: เซลล์ส่งเคสได้ แต่การจัดคันเป็นงานผู้บริหาร
create or replace function famai_private.sale_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u public.motorcycle_unit; f public.finance_case; financial_changed boolean; allocating boolean; customer_archived timestamptz;
begin
  allocating:=famai_private.has_role(array['admin','manager'])
    and famai_private.allowed('act:allocateUnit',true) and famai_private.allowed('page:sell',true);
  if tg_op='INSERT' then financial_changed:=true;
  else financial_changed:=row(new.unit_id,new.customer_id,new.branch_id,new.list_price,new.discount,new.net_price,
    new.pay_method,new.finance_id,new.finance_case_id,new.down_payment,new.term_months,new.rate_pct,
    new.monthly_installment,new.loan_total,new.pay_now,new.cost,new.freebie_cost,new.gross_profit)
    is distinct from row(old.unit_id,old.customer_id,old.branch_id,old.list_price,old.discount,old.net_price,
    old.pay_method,old.finance_id,old.finance_case_id,old.down_payment,old.term_months,old.rate_pct,
    old.monthly_installment,old.loan_total,old.pay_now,old.cost,old.freebie_cost,old.gross_profit);
  end if;
  if auth.uid() is not null and financial_changed and not allocating then
    raise exception 'ผู้บริหารเป็นผู้เลือกคันรถและเปิดการขาย' using errcode='42501';
  end if;
  if financial_changed then
    select archived_at into customer_archived from public.customer where id=new.customer_id for share;
    if not found or customer_archived is not null then
      raise exception 'ลูกค้าอยู่ในคลัง ต้องเปิดติดตามใหม่ก่อนเปิดขาย' using errcode='23514';
    end if;
    select * into u from public.motorcycle_unit where id=new.unit_id for update;
    if not found or u.branch_id<>new.branch_id then
      raise exception 'รถไม่อยู่ในสาขาที่เปิดขาย' using errcode='23514';
    end if;
    if tg_op='INSERT' and u.status not in ('available','reserved') then
      raise exception 'คันรถนี้ไม่พร้อมขาย' using errcode='23514';
    end if;
    if new.pay_method not in ('cash','finance') then
      raise exception 'วิธีชำระไม่ถูกต้อง' using errcode='23514';
    end if;
    if new.pay_method='finance' and (tg_op='INSERT' or new.finance_case_id is not null) then
      select * into f from public.finance_case where id=new.finance_case_id for update;
      if not found or f.status<>'อนุมัติแล้ว' or f.customer_id<>new.customer_id
        or f.branch_id<>new.branch_id or (f.sale_id is not null and f.sale_id<>new.id)
        or f.variant_id is distinct from u.variant_id or f.color_code is distinct from u.color_code
        or f.company_id is distinct from new.finance_id
        or row(f.list_price,f.discount,f.down_payment,f.term_months,f.rate_pct,f.monthly_installment,f.loan_total,f.pay_now)
        is distinct from row(new.list_price,new.discount,new.down_payment,new.term_months,new.rate_pct,new.monthly_installment,new.loan_total,new.pay_now) then
        raise exception 'ต้องเลือกคันและเงื่อนไขตรงกับเคสไฟแนนซ์ที่อนุมัติแล้ว' using errcode='23514';
      end if;
    end if;
    if tg_op='INSERT' then new.allocated_by:=auth.uid(); end if;
    if tg_op='UPDATE' and exists(select 1 from public.registration r
      where r.sale_id=new.id and r.delivered_at is not null) then
      raise exception 'รถส่งมอบแล้ว ต้องเก็บเงื่อนไขขายเดิมเป็นหลักฐาน' using errcode='23514';
    end if;
  end if;
  if (tg_op='INSERT' and coalesce(new.fin_approval->>'status','รอตรวจ')<>'รอตรวจ')
    or (tg_op='UPDATE' and new.fin_approval is distinct from old.fin_approval) then
    if tg_op='UPDATE' and exists(select 1 from public.registration r
      where r.sale_id=new.id and r.delivered_at is not null) then
      raise exception 'ส่งมอบแล้ว ต้องเก็บผลตรวจการเงินเดิมเป็นหลักฐาน' using errcode='23514';
    end if;
    if coalesce(new.fin_approval->>'status','') not in ('รอตรวจ','ผ่าน','ไม่ผ่าน') then
      raise exception 'สถานะตรวจการเงินไม่ถูกต้อง' using errcode='23514';
    end if;
    if auth.uid() is not null and not (famai_private.allowed('act:finApprove',true)
      and famai_private.any_page(array['deal','invoice'],true))
      and not (tg_op='UPDATE' and new.fin_approval->>'status'='รอตรวจ'
        and famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)) then
      raise exception 'เฉพาะการเงินที่ตรวจอนุมัติการขายได้' using errcode='42501';
    end if;
    new.fin_approval:=coalesce(new.fin_approval,'{}'::jsonb)
      ||jsonb_build_object('at',clock_timestamp(),'by_id',auth.uid());
  elsif tg_op='UPDATE' and financial_changed then
    new.fin_approval:=jsonb_build_object('status','รอตรวจ','note','เงื่อนไขการขายเปลี่ยน ต้องตรวจใหม่');
  end if;
  if tg_op='UPDATE' then
    if auth.uid() is not null and new.voided_at is distinct from old.voided_at
      and not famai_private.allowed('act:voidSale',true) then
      raise exception 'ไม่มีสิทธิ์ยกเลิกการขาย' using errcode='42501';
    end if;
    if auth.uid() is not null and new.doc_ov is distinct from old.doc_ov
      and not famai_private.allowed('act:printDoc',true) then
      raise exception 'ไม่มีสิทธิ์แก้เอกสารการขาย' using errcode='42501';
    end if;
    new.created_at:=old.created_at; new.allocated_by:=old.allocated_by;
  else new.created_at:=clock_timestamp(); end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger sale_brief_guard before insert or update on public.sale
for each row execute function famai_private.sale_guard();

create or replace function famai_private.finance_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.finance_case_event(case_id,from_status,to_status,at,by_user,note)
    values(new.id,case when tg_op='UPDATE' then old.status else null end,
      new.status,clock_timestamp(),auth.uid(),new.reject_reason);
    -- เคสเดิมที่เปิดขายมาก่อนบรีฟนี้ยังเดินงานได้ แต่ผลใหม่ต้องให้การเงินตรวจใหม่
    if tg_op='UPDATE' and old.sale_id is not null then
      update public.sale set fin_approval=jsonb_build_object('status','รอตรวจ','note','ผลไฟแนนซ์เปลี่ยน ต้องตรวจใหม่')
      where id=old.sale_id;
    end if;
  end if;
  return new;
end $$;
create trigger finance_brief_event after insert or update on public.finance_case
for each row execute function famai_private.finance_event();

create or replace function famai_private.sale_link_case() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.finance_case_id is not null then
    update public.finance_case set sale_id=new.id where id=new.finance_case_id;
  end if;
  update public.motorcycle_unit set status='sold' where id=new.unit_id;
  return new;
end $$;
create trigger sale_brief_link after insert on public.sale
for each row execute function famai_private.sale_link_case();

create or replace function famai_private.registration_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sale; delivery_now boolean; was_delivered boolean:=false;
begin
  -- ล็อกใบขายจนจบธุรกรรม ป้องกันส่งมอบโดยอ่านผลตรวจที่เปลี่ยนพร้อมกัน
  select * into s from public.sale where id=new.sale_id for update;
  if not found or s.branch_id<>new.branch_id then
    raise exception 'ใบขายและสาขาของงานทะเบียนไม่ตรงกัน' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    was_delivered:=old.delivered_at is not null;
    if was_delivered and new.delivered_at is null then
      raise exception 'ล้างหลักฐานวันส่งมอบย้อนหลังไม่ได้' using errcode='23514';
    end if;
  end if;
  delivery_now:=(not was_delivered and (new.delivered_at is not null
    or new.stage in ('ส่งมอบแล้ว','รอทะเบียน','ยื่นขนส่ง','ได้ทะเบียนแล้ว')))
    or (tg_op='UPDATE' and new.delivered_at is distinct from old.delivered_at and new.delivered_at is not null);
  if delivery_now then
    if auth.uid() is not null and not (famai_private.allowed('act:deliver',true)
      and famai_private.allowed('page:deal',true)) then
      raise exception 'ไม่มีสิทธิ์ส่งมอบรถ' using errcode='42501';
    end if;
    if s.voided_at is not null or coalesce(s.fin_approval->>'status','รอตรวจ')<>'ผ่าน' then
      raise exception 'การเงินภายในต้องตรวจผ่านก่อนส่งมอบรถ' using errcode='23514';
    end if;
    if s.pay_method='finance' and not exists(select 1 from public.finance_case f
      where f.sale_id=s.id and f.customer_id=s.customer_id and f.status='อนุมัติแล้ว') then
      raise exception 'ไฟแนนซ์ยังไม่อนุมัติ ส่งมอบไม่ได้' using errcode='23514';
    end if;
    new.delivered_at:=coalesce(new.delivered_at,(clock_timestamp() at time zone 'Asia/Bangkok')::date);
    if new.delivered_at>(clock_timestamp() at time zone 'Asia/Bangkok')::date then
      raise exception 'วันส่งมอบจริงเป็นวันอนาคตไม่ได้' using errcode='23514';
    end if;
    new.delivered_by:=auth.uid(); new.delivered_recorded_at:=clock_timestamp();
  elsif tg_op='UPDATE' then
    new.delivered_by:=old.delivered_by; new.delivered_recorded_at:=old.delivered_recorded_at;
    if auth.uid() is not null and new.stage is distinct from old.stage
      and not (famai_private.allowed('act:plate',true) and famai_private.allowed('page:plate',true))
      and not (famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)) then
      raise exception 'ไม่มีสิทธิ์เดินขั้นงานทะเบียน' using errcode='42501';
    end if;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger registration_brief_guard before insert or update on public.registration
for each row execute function famai_private.registration_guard();

-- งานอัตโนมัติเกิดจากการส่งมอบที่ฐานข้อมูลครั้งเดียว; บวกเดือนปฏิทินและ clamp วันปลายเดือน
create or replace function famai_private.delivery_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.delivered_at is not null and (tg_op='INSERT' or old.delivered_at is null) then
    insert into public.follow_up_task(branch_id,customer_id,sale_id,kind,title,due_at,task_source,created_by)
    select s.branch_id,s.customer_id,s.id,'care 1 เดือน','ติดตาม 1 เดือนหลังส่งมอบ',
      (new.delivered_at+interval '1 month')::date,'delivery_month',auth.uid()
    from public.sale s where s.id=new.sale_id and s.voided_at is null
    on conflict(sale_id) where task_source='delivery_month' do nothing;
  end if;
  return new;
end $$;
create trigger registration_brief_task after insert or update on public.registration
for each row execute function famai_private.delivery_task();

create or replace function famai_private.quote_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.seller_id:=coalesce(new.seller_id,auth.uid()); new.created_by:=auth.uid();
  else
    new.created_by:=old.created_by;
    if auth.uid() is not null and new.seller_id is distinct from old.seller_id
      and not famai_private.has_role(array['admin','manager']) then
      raise exception 'ไม่มีสิทธิ์เปลี่ยนผู้เสนอราคา' using errcode='42501';
    end if;
  end if;
  if famai_private.frontline_sales() and new.seller_id is distinct from auth.uid() then
    raise exception 'บันทึกใบเสนอราคาได้เฉพาะของคุณ' using errcode='42501';
  end if;
  return new;
end $$;
create trigger quotation_brief_guard before insert or update on public.quotation
for each row execute function famai_private.quote_guard();

create or replace function famai_private.task_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then new.created_by:=auth.uid();
  else new.created_by:=old.created_by; end if;
  if new.appointment_at is not null then
    new.due_at:=(new.appointment_at at time zone 'Asia/Bangkok')::date;
  end if;
  if new.done_at is not null and (tg_op='INSERT' or old.done_at is null) then
    new.done_at:=clock_timestamp(); new.done_by:=auth.uid();
  elsif tg_op='UPDATE' and new.done_at is not null then
    new.done_at:=old.done_at; new.done_by:=old.done_by;
  elsif new.done_at is null then new.done_by:=null; end if;
  if new.sale_id is not null and not exists(select 1 from public.sale s
    where s.id=new.sale_id and s.customer_id=new.customer_id and s.branch_id=new.branch_id) then
    raise exception 'งานติดตามไม่ตรงกับลูกค้าของใบขาย' using errcode='23514';
  end if;
  if new.service_job_id is not null and not exists(select 1 from public.service_job s
    where s.id=new.service_job_id and s.customer_id=new.customer_id and s.branch_id=new.branch_id) then
    raise exception 'นัดหมายไม่ตรงกับลูกค้าของใบงานซ่อม' using errcode='23514';
  end if;
  if new.parent_task_id is not null and not exists(select 1 from public.follow_up_task t
    where t.id=new.parent_task_id and t.customer_id=new.customer_id and t.branch_id=new.branch_id) then
    raise exception 'นัดหมายไม่ตรงกับลูกค้าของงานเดิม' using errcode='23514';
  end if;
  return new;
end $$;
create trigger follow_up_task_brief_guard before insert or update on public.follow_up_task
for each row execute function famai_private.task_guard();

create or replace function famai_private.seen_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.seen_at:=clock_timestamp();
  return new;
end $$;
create trigger notification_seen_stamp before insert or update on public.notification_seen
for each row execute function famai_private.seen_guard();

do $$ declare t text; begin
  foreach t in array array['quotation','service_job','follow_up_task'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function famai_private.stamp_row()',t||'_brief_stamp',t);
  end loop;
end $$;

-- ขยับเวลาอัปเดตของลูกค้าเมื่อธุรกรรมจริงเปลี่ยน เพื่อให้หลายเครื่องเรียงลำดับตรงกัน
create or replace function famai_private.touch_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if tg_table_name='registration' then
    select customer_id into cid from public.sale where id=new.sale_id;
  else cid:=new.customer_id; end if;
  if cid is not null then update public.customer set updated_at=clock_timestamp() where id=cid; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['sale','finance_case','registration','service_job','follow_up_task','booking'] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function famai_private.touch_customer()',t||'_brief_touch',t);
  end loop;
end $$;

-- เปลี่ยนนโยบายเดิมทั้งชุดบนตารางที่เกี่ยวข้อง ไม่ปล่อย policy ALL เดิม OR ข้ามด่านใหม่
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename=any(array['customer','sale','finance_case','registration','quotation','quotation_option',
      'booking','service_job','service_job_line','service_reminder','follow_up_task',
      'lead_stage_history','finance_case_event','registration_event','sale_freebie','receivable','receipt_payment','document']) loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;

-- SELECT ของตารางตัวเองใช้คอลัมน์แถวโดยตรง: helper ที่ SELECT กลับหาตัวเองยังไม่เห็น
-- แถวใหม่ใน snapshot ของ INSERT ... RETURNING ทำให้ RLS ปฏิเสธการเพิ่มข้อมูลที่ถูกต้อง
create policy customer_read on public.customer for select to authenticated using(
  famai_private.branch_ok(branch_id) and (not famai_private.frontline_sales() or owner_id=auth.uid())
  and famai_private.any_page(array['deal','sell','booking','service','aftercare','plate','ar']));
create policy customer_insert on public.customer for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and (not famai_private.frontline_sales() or owner_id=auth.uid())
  and famai_private.any_page(array['deal','sell','booking','service','aftercare'],true));
create policy customer_update on public.customer for update to authenticated
  using(famai_private.customer_ok(id,true)) with check(famai_private.branch_ok(branch_id)
    and (not famai_private.frontline_sales() or owner_id=auth.uid()));

create policy sale_read on public.sale for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id));
create policy sale_insert on public.sale for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id)
  and famai_private.allowed('page:sell',true) and famai_private.allowed('act:allocateUnit',true)
  and famai_private.has_role(array['admin','manager']));
create policy sale_update on public.sale for update to authenticated
  using(famai_private.sale_ok(id) and famai_private.any_page(array['sell','deal','invoice'],true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id));

create policy finance_read on public.finance_case for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id)
  and famai_private.any_page(array['deal','invoice','report','ar']));
create policy finance_insert on public.finance_case for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
  and famai_private.allowed('page:deal',true) and famai_private.allowed('act:finStage',true));
create policy finance_update on public.finance_case for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
    and famai_private.allowed('page:deal',true) and famai_private.allowed('act:finStage',true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));

create policy registration_read on public.registration for select to authenticated using(famai_private.sale_ok(sale_id));
create policy registration_insert on public.registration for insert to authenticated with check(
  famai_private.sale_ok(sale_id) and famai_private.allowed('act:allocateUnit',true)
  and famai_private.allowed('page:sell',true));
create policy registration_update on public.registration for update to authenticated
  using(famai_private.sale_ok(sale_id) and famai_private.any_page(array['deal','plate'],true))
  with check(famai_private.sale_ok(sale_id) and famai_private.branch_ok(branch_id));

create policy quote_read on public.quotation for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.allowed('page:quote')
  and (not famai_private.frontline_sales() or coalesce(seller_id,created_by)=auth.uid()));
create policy quote_insert on public.quotation for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.allowed('page:quote',true)
  and (not famai_private.frontline_sales() or seller_id=auth.uid()));
create policy quote_update on public.quotation for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.allowed('page:quote',true)
    and (not famai_private.frontline_sales() or seller_id=auth.uid()))
  with check(famai_private.branch_ok(branch_id)
    and (not famai_private.frontline_sales() or seller_id=auth.uid()));
create policy quote_option_read on public.quotation_option for select to authenticated using(
  exists(select 1 from public.quotation q where q.id=quotation_id));
create policy quote_option_write on public.quotation_option for all to authenticated
  using(famai_private.allowed('page:quote',true) and exists(select 1 from public.quotation q where q.id=quotation_id))
  with check(famai_private.allowed('page:quote',true) and exists(select 1 from public.quotation q where q.id=quotation_id));

create policy booking_read on public.booking for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.any_page(array['booking','deal','sell'])
  and (famai_private.customer_ok(customer_id) or (customer_id is null and not famai_private.frontline_sales())));
create policy booking_insert on public.booking for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.allowed('page:booking',true)
  and famai_private.allowed('act:booking',true) and famai_private.customer_ok(customer_id,true));
create policy booking_update on public.booking for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
    and (famai_private.allowed('act:booking',true) or famai_private.allowed('act:allocateUnit',true))
    and famai_private.any_page(array['booking','sell'],true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));

create policy service_read on public.service_job for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.any_page(array['service','aftercare'])
  and (famai_private.customer_ok(customer_id) or (customer_id is null and not famai_private.frontline_sales())));
create policy service_insert on public.service_job for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and (famai_private.allowed('page:service',true)
    or (famai_private.allowed('page:aftercare',true) and famai_private.allowed('act:care',true)))
  and famai_private.customer_ok(customer_id,true));
create policy service_update on public.service_job for update to authenticated
  using(famai_private.branch_ok(branch_id) and (famai_private.allowed('page:service',true)
    or (famai_private.allowed('page:aftercare',true) and famai_private.allowed('act:care',true)))
    and famai_private.customer_ok(customer_id,true))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));
create policy service_line_read on public.service_job_line for select to authenticated using(
  exists(select 1 from public.service_job j where j.id=job_id));
create policy service_line_write on public.service_job_line for all to authenticated
  using(famai_private.allowed('page:service',true) and exists(select 1 from public.service_job j where j.id=job_id))
  with check(famai_private.allowed('page:service',true) and exists(select 1 from public.service_job j where j.id=job_id));
create policy reminder_read on public.service_reminder for select to authenticated using(
  famai_private.customer_ok(customer_id));
create policy reminder_write on public.service_reminder for all to authenticated
  using(famai_private.customer_ok(customer_id,true) and famai_private.any_page(array['service','aftercare','sell'],true))
  with check(famai_private.customer_ok(customer_id,true) and famai_private.any_page(array['service','aftercare','sell'],true));

create policy task_read on public.follow_up_task for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id)
  and famai_private.any_page(array['deal','aftercare','service']));
create policy task_insert on public.follow_up_task for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
  and ((task_source='legacy' and famai_private.allowed('page:deal',true))
    or (task_source in ('manual','service_next') and famai_private.allowed('act:care',true)
      and famai_private.any_page(array['aftercare','service'],true))));
create policy task_update on public.follow_up_task for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true)
    and ((task_source='legacy' and famai_private.allowed('page:deal',true))
      or (famai_private.allowed('act:care',true) and famai_private.allowed('page:aftercare',true))))
  with check(famai_private.branch_ok(branch_id) and famai_private.customer_ok(customer_id,true));

create policy notification_seen_read on public.notification_seen for select to authenticated
  using(user_id=auth.uid() and famai_private.branch_ok(null));
create policy notification_seen_insert on public.notification_seen for insert to authenticated
  with check(user_id=auth.uid() and famai_private.branch_ok(null));
create policy notification_seen_update on public.notification_seen for update to authenticated
  using(user_id=auth.uid() and famai_private.branch_ok(null))
  with check(user_id=auth.uid() and famai_private.branch_ok(null));

-- ตารางลูกห้ามเป็นทางลัดอ่านข้อมูลลูกค้าข้ามเซลล์; ประวัติไม่มี DELETE policy
create policy lead_history_read on public.lead_stage_history for select to authenticated using(famai_private.customer_ok(customer_id));
create policy lead_history_insert on public.lead_stage_history for insert to authenticated with check(famai_private.customer_ok(customer_id,true));
create policy finance_event_read on public.finance_case_event for select to authenticated using(
  exists(select 1 from public.finance_case f where f.id=case_id));
create policy finance_event_insert on public.finance_case_event for insert to authenticated with check(
  famai_private.allowed('act:finStage',true) and famai_private.allowed('page:deal',true)
  and exists(select 1 from public.finance_case f where f.id=case_id));
create policy registration_event_read on public.registration_event for select to authenticated using(
  exists(select 1 from public.registration r where r.id=registration_id));
create policy registration_event_insert on public.registration_event for insert to authenticated with check(
  famai_private.any_page(array['deal','plate'],true)
  and exists(select 1 from public.registration r where r.id=registration_id));
create policy sale_freebie_read on public.sale_freebie for select to authenticated using(famai_private.sale_ok(sale_id));
create policy sale_freebie_write on public.sale_freebie for all to authenticated
  using(famai_private.sale_ok(sale_id) and famai_private.allowed('act:allocateUnit',true))
  with check(famai_private.sale_ok(sale_id) and famai_private.allowed('act:allocateUnit',true));
create policy receivable_read on public.receivable for select to authenticated using(
  famai_private.sale_ok(sale_id) and famai_private.any_page(array['ar','deal','invoice']));
create policy receivable_write on public.receivable for all to authenticated
  using(famai_private.sale_ok(sale_id) and ((famai_private.allowed('act:finApprove',true)
    and famai_private.any_page(array['ar','deal'],true)) or (famai_private.allowed('act:allocateUnit',true)
    and famai_private.allowed('page:sell',true))))
  with check(famai_private.sale_ok(sale_id) and ((famai_private.allowed('act:finApprove',true)
    and famai_private.any_page(array['ar','deal'],true)) or (famai_private.allowed('act:allocateUnit',true)
    and famai_private.allowed('page:sell',true))));
create policy receipt_payment_read on public.receipt_payment for select to authenticated using(
  exists(select 1 from public.receivable r where r.id=receivable_id));
create policy receipt_payment_write on public.receipt_payment for all to authenticated
  using(famai_private.allowed('act:finApprove',true) and famai_private.any_page(array['ar','deal'],true)
    and exists(select 1 from public.receivable r where r.id=receivable_id))
  with check(famai_private.allowed('act:finApprove',true) and famai_private.any_page(array['ar','deal'],true)
    and exists(select 1 from public.receivable r where r.id=receivable_id));
create policy document_read on public.document for select to authenticated using(
  famai_private.branch_ok(branch_id) and famai_private.allowed('act:printDoc')
  and (sale_id is null or famai_private.sale_ok(sale_id)));
create policy document_insert on public.document for insert to authenticated with check(
  famai_private.branch_ok(branch_id) and famai_private.allowed('act:printDoc',true)
  and famai_private.any_page(array['invoice','deal'],true) and (sale_id is null or famai_private.sale_ok(sale_id)));
create policy document_update on public.document for update to authenticated
  using(famai_private.branch_ok(branch_id) and famai_private.allowed('act:printDoc',true)
    and famai_private.any_page(array['invoice','deal'],true) and (sale_id is null or famai_private.sale_ok(sale_id)))
  with check(famai_private.branch_ok(branch_id) and (sale_id is null or famai_private.sale_ok(sale_id)));

-- เปิดขายหนึ่งครั้งเป็นธุรกรรมเดียว: ไม่มีใบขายค้างที่รถ/จอง/ของแถมเขียนไม่ครบ
-- SECURITY INVOKER ให้ RLS และ trigger ของแต่ละตารางเป็นด่านจริงตามเดิม
create or replace function public.create_sale_bundle(
  p_customer jsonb,p_sale jsonb,p_registration jsonb,p_receivable jsonb,p_booking uuid,p_gifts jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.sale; r public.registration; a public.receivable; f public.finance_case;
  sid uuid:=coalesce((p_sale->>'id')::uuid,gen_random_uuid());
  cid uuid:=(p_sale->>'customer_id')::uuid; gift jsonb; gid uuid; qty integer; n integer;
begin
  if auth.uid() is null or not (famai_private.has_role(array['admin','manager'])
    and famai_private.allowed('act:allocateUnit',true) and famai_private.allowed('page:sell',true)) then
    raise exception 'ผู้บริหารเป็นผู้เปิดการขาย' using errcode='42501';
  end if;
  -- ส่งซ้ำหลังเน็ตขาดใช้ id เดิมได้ ต้องเป็นรายการเดิมทุกเงื่อนไขหลัก
  select * into s from public.sale where id=sid;
  if found then
    if s.customer_id is distinct from cid or s.unit_id is distinct from (p_sale->>'unit_id')::uuid
      or s.net_price is distinct from (p_sale->>'net_price')::numeric
      or s.pay_method is distinct from p_sale->>'pay_method'
      or s.finance_case_id is distinct from (p_sale->>'finance_case_id')::uuid then
      raise exception 'รหัสการขายนี้ถูกใช้กับรายการอื่นแล้ว' using errcode='23514';
    end if;
    select * into r from public.registration where sale_id=sid;
    select * into a from public.receivable where sale_id=sid order by id limit 1;
    select * into f from public.finance_case where id=s.finance_case_id;
    return jsonb_build_object('sale',to_jsonb(s),'registration',to_jsonb(r),'receivable',to_jsonb(a),'finance_case',to_jsonb(f));
  end if;
  if p_customer is not null and jsonb_typeof(p_customer)='object' then
    if (p_customer->>'id')::uuid is distinct from cid then
      raise exception 'ข้อมูลลูกค้าไม่ตรงกับใบขาย' using errcode='23514';
    end if;
    insert into public.customer(id,branch_id,full_name,phone,address,tax_id,owner_id,note,birth_date,purchase_intent,interested_variant_id)
    values(cid,(p_customer->>'branch_id')::uuid,p_customer->>'full_name',p_customer->>'phone',
      p_customer->>'address',p_customer->>'tax_id',(p_customer->>'owner_id')::uuid,p_customer->>'note',
      (p_customer->>'birth_date')::date,p_customer->>'purchase_intent',(p_customer->>'interested_variant_id')::uuid)
    on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,address=excluded.address,
      tax_id=excluded.tax_id,note=excluded.note,birth_date=excluded.birth_date;
  end if;
  if not exists(select 1 from public.customer where id=cid and archived_at is null) then
    raise exception 'ลูกค้าไม่มีอยู่หรือถูกยุติการติดตามแล้ว' using errcode='23514';
  end if;
  if p_booking is not null then
    perform 1 from public.booking b where b.id=p_booking and b.customer_id=cid
      and b.unit_id=(p_sale->>'unit_id')::uuid and b.status='จองอยู่' for update;
    if not found then raise exception 'การจองไม่ตรงกับลูกค้าและคันรถ' using errcode='23514'; end if;
  elsif exists(select 1 from public.booking b where b.unit_id=(p_sale->>'unit_id')::uuid
    and b.status='จองอยู่' and b.customer_id is distinct from cid) then
    raise exception 'คันรถติดจองของลูกค้าคนอื่น' using errcode='23514';
  end if;
  insert into public.sale(id,branch_id,unit_id,customer_id,salesperson_id,sold_at,list_price,discount,net_price,
    cost,freebie_cost,gross_profit,pay_method,down_payment,term_months,note,finance_id,doc_no,public_token,
    rate_pct,monthly_installment,loan_total,pay_now,gifts,fin_approval,doc_ov,finance_case_id)
  values(sid,(p_sale->>'branch_id')::uuid,(p_sale->>'unit_id')::uuid,cid,(p_sale->>'salesperson_id')::uuid,
    coalesce((p_sale->>'sold_at')::date,(clock_timestamp() at time zone 'Asia/Bangkok')::date),
    (p_sale->>'list_price')::numeric,coalesce((p_sale->>'discount')::numeric,0),(p_sale->>'net_price')::numeric,
    (p_sale->>'cost')::numeric,coalesce((p_sale->>'freebie_cost')::numeric,0),(p_sale->>'gross_profit')::numeric,
    p_sale->>'pay_method',(p_sale->>'down_payment')::numeric,(p_sale->>'term_months')::integer,
    p_sale->>'note',(p_sale->>'finance_id')::uuid,p_sale->>'doc_no',coalesce(nullif(p_sale->>'public_token',''),pub.gen_token()),
    (p_sale->>'rate_pct')::numeric,(p_sale->>'monthly_installment')::numeric,(p_sale->>'loan_total')::numeric,
    (p_sale->>'pay_now')::numeric,coalesce(p_gifts,'[]'::jsonb),'{"status":"รอตรวจ"}'::jsonb,p_sale->'doc_ov',
    (p_sale->>'finance_case_id')::uuid) returning * into s;
  insert into public.registration(id,sale_id,branch_id,stage,due_at,stage_log)
  values(coalesce((p_registration->>'id')::uuid,gen_random_uuid()),sid,s.branch_id,'ขายแล้ว',
    (p_registration->>'due_at')::date,jsonb_build_array(jsonb_build_object('to','ขายแล้ว','at',s.sold_at)))
  returning * into r;
  if p_receivable is not null and jsonb_typeof(p_receivable)='object' then
    insert into public.receivable(id,branch_id,sale_id,kind,payer_finance_id,amount_due,amount_paid,due_at)
    values(coalesce((p_receivable->>'id')::uuid,gen_random_uuid()),s.branch_id,sid,
      coalesce(p_receivable->>'kind','finance'),(p_receivable->>'payer_finance_id')::uuid,
      (p_receivable->>'amount_due')::numeric,0,(p_receivable->>'due_at')::date) returning * into a;
  end if;
  for gift in select value from jsonb_array_elements(coalesce(p_gifts,'[]'::jsonb)) loop
    if nullif(gift->>'id','') is null then continue; end if;
    gid:=(gift->>'id')::uuid; qty:=coalesce((gift->>'qty')::integer,1);
    if qty<1 then raise exception 'จำนวนของแถมต้องมากกว่าศูนย์' using errcode='23514'; end if;
    update public.freebie set qty_on_hand=qty_on_hand-qty
      where id=gid and branch_id=s.branch_id and qty_on_hand>=qty;
    get diagnostics n=row_count;
    if n<>1 then raise exception 'ของแถมไม่พอหรือไม่อยู่ในสาขานี้' using errcode='23514'; end if;
  end loop;
  update public.booking set status='เปิดขายแล้ว',sale_id=sid,updated_at=clock_timestamp()
    where unit_id=s.unit_id and customer_id=cid and status='จองอยู่';
  select * into f from public.finance_case where id=s.finance_case_id;
  return jsonb_build_object('sale',to_jsonb(s),'registration',to_jsonb(r),'receivable',to_jsonb(a),'finance_case',to_jsonb(f));
end $$;
revoke all on function public.create_sale_bundle(jsonb,jsonb,jsonb,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.create_sale_bundle(jsonb,jsonb,jsonb,jsonb,uuid,jsonb) to authenticated;

-- รุ่น/สี/ราคาบันทึกครบพร้อมกัน; ไม่ลบสีเก่าที่ธุรกรรมหรือรูปเคยอ้างถึง
create or replace function public.catalog_save_variant(p_code text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v public.model_variant; pr public.price_history; col jsonb; v_code text:=upper(btrim(p_code));
  price_cost numeric; price_vat numeric; result_price jsonb;
begin
  if auth.uid() is null or not famai_private.allowed('page:settings',true) then
    raise exception 'ไม่มีสิทธิ์แก้รุ่นรถ' using errcode='42501';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9._-]{0,39}$' or nullif(btrim(p_data->>'model_name'),'') is null then
    raise exception 'กรอกรหัสรุ่นและชื่อรุ่นให้ถูกต้อง' using errcode='23514';
  end if;
  if coalesce((p_data->>'is_new')::boolean,false) and exists(select 1 from public.model_variant m where m.code=v_code) then
    raise exception 'รหัสรุ่นนี้มีอยู่แล้ว' using errcode='23505';
  end if;
  if jsonb_typeof(p_data->'colors') is distinct from 'array' or jsonb_array_length(p_data->'colors')=0 then
    raise exception 'เพิ่มสีอย่างน้อยหนึ่งสี' using errcode='23514';
  end if;
  insert into public.model_variant(code,model_name,model_th,category,cc,model_year)
  values(v_code,btrim(p_data->>'model_name'),p_data->>'model_th',p_data->>'category',
    (p_data->>'cc')::numeric,(p_data->>'model_year')::integer)
  on conflict(code) do update set model_name=excluded.model_name,model_th=excluded.model_th,
    category=excluded.category,cc=excluded.cc,model_year=excluded.model_year returning * into v;
  for col in select value from jsonb_array_elements(p_data->'colors') loop
    if nullif(btrim(col->>'code'),'') is null or nullif(btrim(col->>'name'),'') is null then
      raise exception 'รหัสสีและชื่อสีต้องครบ' using errcode='23514';
    end if;
    insert into public.model_color(variant_id,color_code,color_name)
    values(v.id,upper(btrim(col->>'code')),btrim(col->>'name'))
    on conflict(variant_id,color_code) do update set color_name=excluded.color_name;
  end loop;
  if famai_private.allowed('data:money') then
    price_cost:=(p_data->>'cost')::numeric; price_vat:=(p_data->>'vat')::numeric;
  else
    select cost,vat into price_cost,price_vat from public.price_history
      where variant_id=v.id order by effective_from desc,id desc limit 1;
  end if;
  if coalesce((p_data->>'retail')::numeric,-1)<0 or coalesce(price_cost,-1)<0
    or coalesce(price_vat,-1)<0 then
    raise exception 'ราคาและต้นทุนต้องไม่ติดลบ' using errcode='23514';
  end if;
  insert into public.price_history(variant_id,effective_from,cost,vat,retail,source)
  values(v.id,(clock_timestamp() at time zone 'Asia/Bangkok')::date,price_cost,
    price_vat,(p_data->>'retail')::numeric,'ตั้งค่ารุ่นรถ')
  on conflict(variant_id,effective_from) do update set cost=excluded.cost,vat=excluded.vat,retail=excluded.retail
  returning * into pr;
  result_price:=to_jsonb(pr);
  if not famai_private.allowed('data:money') then
    result_price:=result_price||jsonb_build_object('cost',null,'vat',null);
  end if;
  return jsonb_build_object('variant',to_jsonb(v),'price',result_price,
    'colors',(select jsonb_agg(jsonb_build_object('code',m.color_code,'name',m.color_name,
      'color_code',m.color_code,'color_name',m.color_name) order by m.color_code)
      from public.model_color m where m.variant_id=v.id));
end $$;
revoke all on function public.catalog_save_variant(text,jsonb) from public,anon;
grant execute on function public.catalog_save_variant(text,jsonb) to authenticated;

create or replace function famai_private.price_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare prior_cost numeric; prior_vat numeric;
begin
  if auth.uid() is not null and not famai_private.allowed('data:money') then
    if tg_op='UPDATE' then prior_cost:=old.cost; prior_vat:=old.vat;
    else select cost,vat into prior_cost,prior_vat from public.price_history
      where variant_id=new.variant_id order by effective_from desc,id desc limit 1; end if;
    if prior_cost is null or row(new.cost,new.vat) is distinct from row(prior_cost,prior_vat) then
      raise exception 'ไม่มีสิทธิ์แก้ต้นทุน' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger price_history_brief_guard before insert or update on public.price_history
for each row execute function famai_private.price_guard();

-- policy restrictive คุมสิทธิ์ดู/แก้ของหน้า แม้ policy สาขาหรือ admin เดิมยังอนุญาต
do $$ declare t text; p record; begin
  foreach t in array array['model_variant','model_color','price_history'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd='ALL' loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy %I on public.%I for insert to authenticated with check(famai_private.allowed(''page:settings'',true))',t||'_brief_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using(famai_private.allowed(''page:settings'',true)) with check(famai_private.allowed(''page:settings'',true))',t||'_brief_update',t);
  end loop;
  -- หน้าอ่านอย่างเดียวต้องไม่อาศัย policy admin/manager เดิมเพื่อเขียนค่าอ้างอิง
  foreach t in array array['finance_company'] loop
    execute format('create policy %I on public.%I for all to authenticated using(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true)) with check(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_config',t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_gate_i',t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true)) with check(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_gate_u',t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(famai_private.allowed(''page:settings'',true) and famai_private.allowed(''act:editFin'',true))',t||'_brief_gate_d',t);
  end loop;
  -- ทุกตารางที่มีประวัติทางธุรกิจในรอบนี้เลิกใช้การลบถาวร
  foreach t in array array['customer','sale','finance_case','registration','quotation','booking','service_job',
    'follow_up_task','lead_stage_history','finance_case_event','registration_event','receivable','receipt_payment','document'] loop
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using(false)',t||'_brief_preserve',t);
  end loop;
end $$;

-- จำกัด execute หลังสร้างครบทุกตัว; ฟังก์ชัน trigger ไม่ใช่ RPC และห้ามเรียกจาก anon
revoke all on all functions in schema famai_private from public, anon;
grant execute on all functions in schema famai_private to authenticated, service_role;
comment on schema famai_private is 'ด่านสิทธิ์ภายใน ไม่เพิ่ม schema นี้ใน exposed schemas ของ Data API';
notify pgrst,'reload schema';
$release_source_32$]);

COMMIT;
