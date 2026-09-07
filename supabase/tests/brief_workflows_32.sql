-- ตรวจด้วยบทบาท authenticated/anon จริง ภายใน BEGIN ... ROLLBACK เท่านั้น
-- ไฟล์นี้ใช้กับ migration 32 ในธุรกรรมเดียว; ไม่เก็บผู้ใช้/ลูกค้า/ขายทดสอบไว้ในฐาน
create temporary table brief32_fixture(k text primary key,id uuid not null default gen_random_uuid(),payload jsonb);
create temporary table brief32_results(name text,passed boolean);
grant select,insert on brief32_results to authenticated,anon;
insert into brief32_fixture(k) select unnest(array['manager','acct','care','sales1','sales2',
  'customer1','customer2','external','variant','unit1','unit2','case1','sale1','sale2','reg1','reg2',
  'quote1','quote2','service1','task1','task2','appointment']);
insert into brief32_fixture(k) values('new_customer');
insert into brief32_fixture(k,id) select 'branch',id from public.branch order by code limit 1;
grant select,update on brief32_fixture to authenticated;

create or replace function pg_temp.fx(p_key text) returns uuid language sql stable as $$
  select id from pg_temp.brief32_fixture where k=p_key
$$;
create or replace function pg_temp.assert_ok(p_name text,p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'ตรวจไม่ผ่าน: %',p_name; end if;
  insert into pg_temp.brief32_results values(p_name,true);
  raise notice 'ผ่าน: %',p_name;
end $$;
create or replace function pg_temp.expect_error(p_name text,p_query text,p_code text,p_message text default null) returns void language plpgsql as $$
declare got text; got_message text;
begin
  begin execute p_query;
  exception when others then get stacked diagnostics got=returned_sqlstate,got_message=message_text; end;
  if got is distinct from p_code then raise exception 'ตรวจไม่ผ่าน: % expected %, got %',p_name,p_code,coalesce(got,'ไม่มี error'); end if;
  if p_message is not null and position(p_message in coalesce(got_message,''))=0 then
    raise exception 'ตรวจไม่ผ่าน: % error คนละสาเหตุ %',p_name,got_message;
  end if;
  insert into pg_temp.brief32_results values(p_name,true);
  raise notice 'ผ่าน: %',p_name;
end $$;
create or replace function pg_temp.login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',pg_temp.fx(p_key)::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.fx(p_key),'role','authenticated')::text,true);
end $$;

-- ข้อมูลสมมติที่ไม่ใช้ชื่อ/เบอร์/เลขเครื่องจริง และทุก id สุ่มใหม่
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,created_at,updated_at)
select id,'authenticated','authenticated','qa-brief32-'||id||'@example.invalid',now(),now()
from brief32_fixture where k in ('manager','acct','care','sales1','sales2');
insert into public.app_user(id,username,full_name,nickname,all_branch)
select id,'qa32-'||id,'ทดสอบบรีฟฐานข้อมูล '||k,'QA '||k,k in ('manager','acct','care')
from brief32_fixture where k in ('manager','acct','care','sales1','sales2');
update public.app_user set phone='0000000000' where username like 'qa32-%';
insert into public.app_user_role(user_id,role_id)
select f.id,r.id from brief32_fixture f join public.role r
on r.code=case when f.k like 'sales%' then 'sales' else f.k end
where f.k in ('manager','acct','care','sales1','sales2');
insert into public.app_user_role(user_id,role_id)
select pg_temp.fx('sales1'),id from public.role where code='stock';
insert into public.app_user_branch(user_id,branch_id)
select id,pg_temp.fx('branch') from brief32_fixture where k in ('manager','acct','care','sales1','sales2');
insert into public.app_setting(key,value) values('perms','{}'::jsonb)
on conflict(key) do update set value=excluded.value;
insert into public.model_variant(id,code,model_name) values(pg_temp.fx('variant'),'QA32-'||replace(pg_temp.fx('variant')::text,'-',''),'รถทดสอบ');
insert into public.model_color(variant_id,color_code,color_name) values(pg_temp.fx('variant'),'QA','สีทดสอบ');
insert into public.motorcycle_unit(id,branch_id,variant_id,color_code,sku,engine_no,frame_no,received_at,cost,cost_vat,retail)
select id,pg_temp.fx('branch'),pg_temp.fx('variant'),'QA','QA32','QA32-E-'||id,'QA32-F-'||id,current_date,60000,4200,100000
from brief32_fixture where k in ('unit1','unit2');
insert into public.customer(id,branch_id,full_name,owner_id)
values(pg_temp.fx('customer1'),pg_temp.fx('branch'),'ลูกค้าทดสอบหนึ่ง',pg_temp.fx('sales1')),
  (pg_temp.fx('customer2'),pg_temp.fx('branch'),'ลูกค้าทดสอบสอง',pg_temp.fx('sales2')),
  (pg_temp.fx('external'),pg_temp.fx('branch'),'ลูกค้าซ่อมภายนอก',pg_temp.fx('care'));
insert into public.sale(id,branch_id,unit_id,customer_id,salesperson_id,sold_at,list_price,net_price,cost,gross_profit,pay_method)
values(pg_temp.fx('sale2'),pg_temp.fx('branch'),pg_temp.fx('unit2'),pg_temp.fx('customer2'),pg_temp.fx('sales2'),current_date,100000,100000,60000,40000,'cash');
insert into public.registration(id,sale_id,branch_id,stage)
values(pg_temp.fx('reg2'),pg_temp.fx('sale2'),pg_temp.fx('branch'),'ขายแล้ว');
-- จำลองทะเบียนเก่าที่มีเพียงชื่อขั้นตอน แต่ไม่มีหลักฐานส่งมอบ ก่อนใช้ migration นี้
alter table public.registration disable trigger registration_brief_guard;
update public.registration set stage='รอทะเบียน' where id=pg_temp.fx('reg2');
alter table public.registration enable trigger registration_brief_guard;
insert into public.quotation(id,branch_id,doc_no,quote_date,customer_id,customer_name,seller_id,pay_method)
values(pg_temp.fx('quote2'),pg_temp.fx('branch'),'QA-QUOTE2',current_date,pg_temp.fx('customer2'),'ลูกค้าทดสอบสอง',pg_temp.fx('sales2'),'cash');
insert into public.follow_up_task(id,branch_id,customer_id,kind,due_at)
values(pg_temp.fx('task2'),pg_temp.fx('branch'),pg_temp.fx('customer2'),'งานทดสอบ',current_date);

select pg_temp.login('sales1'); set local role authenticated;
select pg_temp.assert_ok('เซลล์+สต๊อกเห็นลูกค้าของตน',(select count(*)=1 from public.customer where id in(pg_temp.fx('customer1'),pg_temp.fx('customer2'))));
select pg_temp.assert_ok('เซลล์อ่านใบขายคนอื่นไม่ได้',(select count(*)=0 from public.sale where id=pg_temp.fx('sale2')));
select pg_temp.assert_ok('เซลล์อ่านทะเบียนคนอื่นไม่ได้',(select count(*)=0 from public.registration where id=pg_temp.fx('reg2')));
select pg_temp.assert_ok('เซลล์อ่านงานติดตามคนอื่นไม่ได้',(select count(*)=0 from public.follow_up_task where id=pg_temp.fx('task2')));
select pg_temp.assert_ok('เซลล์อ่านใบเสนอราคาคนอื่นไม่ได้',(select count(*)=0 from public.quotation where id=pg_temp.fx('quote2')));
select pg_temp.expect_error('เปลี่ยนเจ้าของหลบขอบเขตไม่ได้',
  $$update public.customer set owner_id=pg_temp.fx('sales2') where id=pg_temp.fx('customer1')$$,'42501');
select pg_temp.expect_error('ปลอมลูกค้าใหม่เป็นของเซลล์อื่นไม่ได้',
  $$insert into public.customer(full_name,branch_id,owner_id) values('ลูกค้าทดสอบปลอม',pg_temp.fx('branch'),pg_temp.fx('sales2'))$$,'42501');
with c as(insert into public.customer(id,full_name,branch_id,owner_id)
  values(pg_temp.fx('new_customer'),'ลูกค้าทดสอบเพิ่มพร้อมคืนข้อมูล',pg_temp.fx('branch'),auth.uid()) returning id)
select pg_temp.assert_ok('เพิ่มลูกค้าพร้อม RETURNING ผ่าน RLS',(select count(*)=1 from c));
update public.customer set created_at='2000-01-01',updated_at='2000-01-01' where id=pg_temp.fx('customer1');
select pg_temp.assert_ok('client ย้อน created/updated timestamp ไม่ได้',
  (select created_at>now()-interval '1 minute' and updated_at>now()-interval '1 minute' from public.customer where id=pg_temp.fx('customer1')));
insert into public.finance_case(id,branch_id,customer_id,company_id,variant_id,color_code,list_price,discount,
  down_payment,term_months,rate_pct,monthly_installment,loan_total,pay_now,amount,status,submitted_at)
select pg_temp.fx('case1'),pg_temp.fx('branch'),pg_temp.fx('customer1'),id,pg_temp.fx('variant'),'QA',100000,0,
  20000,24,1,4133,99200,20000,80000,'ส่งเรื่อง',current_date from public.finance_company order by id limit 1;
select pg_temp.assert_ok('ยื่นไฟแนนซ์ก่อนมีใบขายได้',(select sale_id is null and variant_code is not null from public.finance_case where id=pg_temp.fx('case1')));
select pg_temp.assert_ok('ยื่นแล้วรถไม่ถูกตัดสต๊อก',(select status='available' from public.motorcycle_unit where id=pg_temp.fx('unit1')));
select pg_temp.expect_error('เคสไฟแนนซ์ค้างห้ามเก็บลูกค้าเข้าคลัง',
  $$update public.customer set archived_at=now(),archived_reason='ทดสอบ' where id=pg_temp.fx('customer1')$$,
  '23514','ต้องปิดงานขาย จอง และไฟแนนซ์');
insert into public.booking(branch_id,customer_id,name,phone,booked_at)
values(pg_temp.fx('branch'),pg_temp.fx('new_customer'),'ลูกค้าจองทดสอบ','0000000000',current_date);
select pg_temp.expect_error('จองค้างห้ามเก็บลูกค้าเข้าคลัง',
  $$update public.customer set archived_at=now(),archived_reason='ทดสอบ' where id=pg_temp.fx('new_customer')$$,
  '23514','ต้องปิดงานขาย จอง และไฟแนนซ์');
update public.booking set status='ยกเลิก' where customer_id=pg_temp.fx('new_customer');
update public.finance_case set status='อนุมัติแล้ว' where id=pg_temp.fx('case1');
select pg_temp.expect_error('เซลล์เรียกเปิดขาย RPC ตรงไม่ได้',
  $$select public.create_sale_bundle(null,'{}','{}',null,null,'[]')$$,'42501');
insert into public.quotation(id,branch_id,doc_no,quote_date,customer_id,customer_name,seller_id,seller_name,seller_phone,pay_method,snapshot)
values(pg_temp.fx('quote1'),pg_temp.fx('branch'),'QA-QUOTE1',current_date,pg_temp.fx('customer1'),'ลูกค้าทดสอบหนึ่ง',pg_temp.fx('sales1'),'QA เซลล์','0000000000','cash','{"price":100000}');
select pg_temp.assert_ok('ใบเสนอเงินสดเก็บผู้เสนอและsnapshot',(select seller_id=auth.uid() and seller_name=(select full_name from public.app_user where id=auth.uid()) and snapshot->>'price'='100000' from public.quotation where id=pg_temp.fx('quote1')));
reset role;

-- สิทธิ์ read ของหน้าต้องกัน API เขียน แม้ action ยังเป็น write
update public.app_setting set value=jsonb_build_object('sales',jsonb_build_object('page:deal','read')) where key='perms';
set local role authenticated;
with u as(update public.finance_case set note='ไม่ควรเขียนได้' where id=pg_temp.fx('case1') returning id)
select pg_temp.assert_ok('หน้าดีลอ่านอย่างเดียวเขียนเคสไม่ได้',(select count(*)=0 from u));
reset role; update public.app_setting set value='{}'::jsonb where key='perms';

select pg_temp.login('manager'); set local role authenticated;
update brief32_fixture set payload=(select jsonb_build_object(
  'id',pg_temp.fx('sale1'),'branch_id',pg_temp.fx('branch'),'unit_id',pg_temp.fx('unit1'),
  'customer_id',pg_temp.fx('customer1'),'salesperson_id',pg_temp.fx('sales1'),'sold_at',current_date,
  'list_price',100000,'discount',0,'net_price',100000,'cost',60000,'freebie_cost',0,'gross_profit',40000,
  'pay_method','finance','finance_id',f.company_id,'finance_case_id',f.id,'down_payment',20000,
  'term_months',24,'rate_pct',1,'monthly_installment',4133,'loan_total',99200,'pay_now',20000,'doc_no','QA-SALE1')
  from public.finance_case f where id=pg_temp.fx('case1')) where k='sale1';
select pg_temp.expect_error('เงื่อนไขต่างจากเคสไม่ผ่านsnapshot',
  $$select public.create_sale_bundle(null,(select payload||jsonb_build_object('down_payment',10000) from brief32_fixture where k='sale1'),jsonb_build_object('id',pg_temp.fx('reg1')),null,null,'[]')$$,'23514');
select pg_temp.assert_ok('ธุรกรรมที่ไม่ผ่านไม่ทิ้งใบขาย',(select count(*)=0 from public.sale where id=pg_temp.fx('sale1')));
select pg_temp.expect_error('ของแถมล้มเหลวหลังสร้างใบขายต้อง rollback ทั้งชุด',
  $$select public.create_sale_bundle(null,(select payload from brief32_fixture where k='sale1'),
    jsonb_build_object('id',pg_temp.fx('reg1')),null,null,
    jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'qty',1)))$$,'23514');
select pg_temp.assert_ok('rollback ครบทั้งใบขายคันรถและเคส',
  (select count(*)=0 from public.sale where id=pg_temp.fx('sale1'))
  and (select status='available' from public.motorcycle_unit where id=pg_temp.fx('unit1'))
  and (select sale_id is null from public.finance_case where id=pg_temp.fx('case1')));
select public.create_sale_bundle(null,(select payload from brief32_fixture where k='sale1'),
  jsonb_build_object('id',pg_temp.fx('reg1'),'due_at',current_date+30),
  jsonb_build_object('kind','finance','amount_due',80000,'payer_finance_id',(select company_id from public.finance_case where id=pg_temp.fx('case1'))),null,'[]') is not null as opened_bundle;
select pg_temp.assert_ok('เปิดขายแล้วเคสผูก sale และคันถูกตัดพร้อมกัน',
  (select sale_id=pg_temp.fx('sale1') from public.finance_case where id=pg_temp.fx('case1'))
  and (select status='sold' from public.motorcycle_unit where id=pg_temp.fx('unit1')));
select public.create_sale_bundle(null,(select payload from brief32_fixture where k='sale1'),'{}',null,null,'[]') is not null as retry_same_sale;
select pg_temp.assert_ok('ส่งซ้ำหลังเน็ตขาดได้ใบขายเดิมใบเดียว',(select count(*)=1 from public.sale where id=pg_temp.fx('sale1')));
select pg_temp.expect_error('ผู้บริหารไม่มีสิทธิ์ปลอมผลการเงิน',
  $$update public.sale set fin_approval='{"status":"ผ่าน"}' where id=pg_temp.fx('sale1')$$,'42501');
select pg_temp.expect_error('ขายที่ยังไม่ส่งมอบห้ามเก็บลูกค้าเข้าคลัง',
  $$update public.customer set archived_at=now(),archived_reason='ทดสอบ' where id=pg_temp.fx('customer2')$$,
  '23514','ต้องปิดงานขาย จอง และไฟแนนซ์');
select pg_temp.expect_error('ทะเบียนเก่ามีขั้นรอทะเบียนแต่ไม่มีวันยังต้องผ่านการเงิน',
  $$update public.registration set stage='ส่งมอบแล้ว' where id=pg_temp.fx('reg2')$$,
  '23514','การเงินภายในต้องตรวจผ่าน');
select pg_temp.expect_error('เงินสดยังส่งมอบไม่ได้ก่อนการเงินผ่าน',
  $$update public.registration set stage='ส่งมอบแล้ว',delivered_at=current_date where id=pg_temp.fx('reg2')$$,'23514');
select pg_temp.expect_error('เงินผ่อนยังส่งมอบไม่ได้ก่อนการเงินผ่าน',
  $$update public.registration set stage='ส่งมอบแล้ว',delivered_at=current_date where id=pg_temp.fx('reg1')$$,'23514');
select pg_temp.expect_error('ข้ามไปขั้นรอทะเบียนเพื่อหลบด่านส่งมอบไม่ได้',
  $$update public.registration set stage='รอทะเบียน' where id=pg_temp.fx('reg1')$$,'23514');
select pg_temp.expect_error('เคสใหม่หลังจัดคันแล้วแก้ผลไม่ได้',
  $$update public.finance_case set status='ปฏิเสธ' where id=pg_temp.fx('case1')$$,'23514');
reset role;

select pg_temp.login('acct'); set local role authenticated;
update public.sale set fin_approval='{"status":"ผ่าน","at":"2000-01-01T00:00:00Z"}' where id in(pg_temp.fx('sale1'),pg_temp.fx('sale2'));
select pg_temp.assert_ok('การเงินอนุมัติได้และเวลาใช้เซิร์ฟเวอร์',(select (fin_approval->>'at')::timestamptz>now()-interval '1 minute' and fin_approval->>'by_id'=auth.uid()::text from public.sale where id=pg_temp.fx('sale1')));
select pg_temp.expect_error('สิทธิ์อนุมัติไม่ใช่สิทธิ์เปลี่ยนราคาขาย',
  $$update public.sale set net_price=1 where id=pg_temp.fx('sale1')$$,'42501');
reset role;

select pg_temp.login('sales1'); set local role authenticated;
select pg_temp.expect_error('วันส่งมอบจริงห้ามอนาคต',
  $$update public.registration set stage='ส่งมอบแล้ว',delivered_at=(clock_timestamp() at time zone 'Asia/Bangkok')::date+1 where id=pg_temp.fx('reg1')$$,'23514');
update public.registration set stage='ส่งมอบแล้ว',delivered_at='2026-01-31' where id=pg_temp.fx('reg1');
select pg_temp.assert_ok('หลังการเงินผ่านเซลล์ส่งมอบลูกค้าตนได้',(select delivered_at='2026-01-31' and delivered_by=auth.uid() from public.registration where id=pg_temp.fx('reg1')));
select pg_temp.assert_ok('หนึ่งเดือนปฏิทินจากวันส่งมอบ clamp ปลายเดือน',
  (select count(*)=1 and min(due_at)='2026-02-28' from public.follow_up_task where sale_id=pg_temp.fx('sale1') and task_source='delivery_month'));
update public.registration set dlv_note='ทดสอบเปิดซ้ำ' where id=pg_temp.fx('reg1');
select pg_temp.assert_ok('บันทึกส่งมอบซ้ำไม่สร้างงานติดตามซ้ำ',
  (select count(*)=1 from public.follow_up_task where sale_id=pg_temp.fx('sale1') and task_source='delivery_month'));
select pg_temp.expect_error('ล้างวันส่งมอบเพื่อหลบด่านไม่ได้',
  $$update public.registration set delivered_at=null where id=pg_temp.fx('reg1')$$,'23514','ล้างหลักฐานวันส่งมอบ');
insert into public.notification_seen(notification_id,seen_at) values('QA32-owned','2000-01-01');
select pg_temp.assert_ok('อ่านแจ้งเตือนใช้เวลาเซิร์ฟเวอร์',(select seen_at>now()-interval '1 minute' from public.notification_seen where notification_id='QA32-owned'));
select pg_temp.expect_error('ปลอมสถานะอ่านของคนอื่นไม่ได้',
  $$insert into public.notification_seen(user_id,notification_id) values(pg_temp.fx('sales2'),'QA32-other')$$,'42501');
reset role;

update public.app_setting set value='{"care":{"page:service":"read","page:aftercare":"write"}}'::jsonb where key='perms';
select pg_temp.login('care'); set local role authenticated;
select pg_temp.assert_ok('ฝ่ายบริการเห็นลูกค้าต่างเซลล์ตามหน้าที่',
  (select count(*)=2 from public.customer where id in(pg_temp.fx('customer1'),pg_temp.fx('customer2'))));
insert into public.service_job(id,branch_id,job_no,customer_id,unit_id,engine_no,frame_no,model_name,service_type,next_appointment_at)
values(pg_temp.fx('service1'),pg_temp.fx('branch'),'QA32-SERVICE',pg_temp.fx('external'),null,
  'QA32-EXTERNAL-E','QA32-EXTERNAL-F','รุ่นนอกร้านพิมพ์เอง','ซ่อม','2026-10-15T10:30:00+07:00');
select pg_temp.assert_ok('ใบงานนอกร้านเก็บรุ่นและเลขเครื่องถัง',(select unit_id is null and model_name='รุ่นนอกร้านพิมพ์เอง' and frame_no='QA32-EXTERNAL-F' from public.service_job where id=pg_temp.fx('service1')));
update public.service_job set symptom='เพิ่มงานผ่านหน้าดูแลหลังขาย' where id=pg_temp.fx('service1');
select pg_temp.assert_ok('aftercare เขียนได้แม้หน้าช่างอ่านอย่างเดียว',
  (select symptom='เพิ่มงานผ่านหน้าดูแลหลังขาย' from public.service_job where id=pg_temp.fx('service1')));
select pg_temp.assert_ok('เปิดใบงานนอกร้านไม่สร้างงานหลังขายเอง',
  (select count(*)=0 from public.follow_up_task where customer_id=pg_temp.fx('external') and task_source='delivery_month'));
insert into public.follow_up_task(id,branch_id,customer_id,service_job_id,kind,title,due_at,task_source,note,amount)
values(pg_temp.fx('task1'),pg_temp.fx('branch'),pg_temp.fx('external'),pg_temp.fx('service1'),
  'care งานบริการ','งานที่ฝ่ายบริการเพิ่มเอง',current_date,'manual','รายละเอียดทดสอบ',null);
insert into public.follow_up_task(id,branch_id,customer_id,service_job_id,parent_task_id,kind,title,due_at,task_source,appointment_at)
values(pg_temp.fx('appointment'),pg_temp.fx('branch'),pg_temp.fx('external'),pg_temp.fx('service1'),pg_temp.fx('task1'),
  'care นัดหมาย','นัดครั้งถัดไป',current_date,'service_next','2026-10-15T10:30:00+07:00');
update public.follow_up_task set done_at='2000-01-01',done_by=pg_temp.fx('sales2') where id=pg_temp.fx('task1');
select pg_temp.assert_ok('งานบริการเงินไม่บังคับและเสร็จด้วยเวลาผู้ทำจริง',
  (select amount is null and done_at>now()-interval '1 minute' and done_by=auth.uid() from public.follow_up_task where id=pg_temp.fx('task1')));
select pg_temp.assert_ok('นัดหมายเก็บเวลาและสรุปวันแบบไทย',
  (select due_at='2026-10-15' and appointment_at='2026-10-15T03:30:00Z' from public.follow_up_task where id=pg_temp.fx('appointment')));
reset role;
update public.app_setting set value='{}'::jsonb where key='perms';

select pg_temp.login('sales1'); set local role authenticated;
update public.customer set archived_at='2000-01-01',archived_reason='ยุติการติดตามเพื่อเก็บประวัติ' where id=pg_temp.fx('customer1');
select pg_temp.assert_ok('คลังการตลาดเก็บลูกค้าเดิมและเวลาจริง',
  (select archived_at>now()-interval '1 minute' and archived_by=auth.uid() from public.customer where id=pg_temp.fx('customer1')));
with d as(delete from public.customer where id=pg_temp.fx('customer1') returning id)
select pg_temp.assert_ok('ไม่มีทางลบประวัติลูกค้าจริง',(select count(*)=0 from d));
reset role;

select pg_temp.login('manager'); set local role authenticated;
update public.registration set stage='ส่งมอบแล้ว',delivered_at=current_date where id=pg_temp.fx('reg2');
select pg_temp.assert_ok('เงินสดส่งมอบได้หลังการเงินอนุมัติ',(select delivered_at=current_date from public.registration where id=pg_temp.fx('reg2')));
select pg_temp.assert_ok('บันทึกรหัสรุ่นยาวพร้อมรุ่นสีราคาได้จริง',
  public.catalog_save_variant('QA32-LONG-CODE-'||substr(replace(gen_random_uuid()::text,'-',''),1,10),
    '{"is_new":true,"model_name":"รุ่นทดสอบยาว","model_year":2569,"retail":99999,"cost":50000,"vat":3500,"colors":[{"code":"TEST","name":"สีทดสอบ"}]}')->'variant'->>'id' is not null);
reset role;

select pg_temp.login('acct'); set local role authenticated;
select pg_temp.expect_error('การเงินเปลี่ยนผลย้อนหลังหลังส่งมอบไม่ได้',
  $$update public.sale set fin_approval='{"status":"ไม่ผ่าน"}' where id=pg_temp.fx('sale1')$$,
  '23514','เก็บผลตรวจการเงินเดิม');
reset role;

-- anon ไม่มีสิทธิ์อ่านตารางธุรกรรมหรือเรียก RPC ใหม่
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select pg_temp.expect_error('anon อ่าน customer ไม่ได้',$$select id from public.customer limit 1$$,'42501');
select pg_temp.expect_error('anon อ่าน seen ไม่ได้',$$select notification_id from public.notification_seen limit 1$$,'42501');
select pg_temp.expect_error('anon เรียก RPC เปิดขายไม่ได้',$$select public.create_sale_bundle(null,'{}','{}',null,null,'[]')$$,'42501');
reset role;
select count(*)::int as assertions_passed,bool_and(passed) as all_passed from brief32_results;
