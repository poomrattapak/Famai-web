-- ต่อจาก fixture ของ brief_workflows_32.sql ภายใน transaction เดียวกันเท่านั้น
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
insert into brief32_fixture(k) select unnest(array['unit3','unit4','unit5','branch2','transfer1','booking3','part3','gift3',
  'sale3','reg3','expense3','partner3','wholesale3','employee2','leave2']);
insert into public.branch(id,code,name,doc_prefix,company_id)
select pg_temp.fx('branch2'),'QA33-'||substr(pg_temp.fx('branch2')::text,1,8),'สาขาทดสอบสิทธิ์','QA33',company_id
from public.branch where id=pg_temp.fx('branch');
insert into public.motorcycle_unit(id,branch_id,variant_id,color_code,sku,engine_no,frame_no,received_at,cost,cost_vat,retail)
select id,pg_temp.fx('branch'),pg_temp.fx('variant'),'QA','QA33','QA33-E-'||id,'QA33-F-'||id,current_date,60000,4200,100000
from brief32_fixture where k in ('unit3','unit4','unit5');
insert into public.part(id,branch_id,code,name,cost,price,qty_on_hand)
values(pg_temp.fx('part3'),pg_temp.fx('branch'),'QA33-PART','อะไหล่ทดสอบ',100,150,5);
insert into public.freebie(id,branch_id,name,cost,price,qty_on_hand)
values(pg_temp.fx('gift3'),pg_temp.fx('branch'),'ของแถมทดสอบ',100,150,5);
insert into public.expense(id,branch_id,category,spent_at,amount)
values(pg_temp.fx('expense3'),pg_temp.fx('branch'),'ทดสอบ',current_date,100);
insert into public.wholesale_partner(id,name) values(pg_temp.fx('partner3'),'คู่ค้าทดสอบ');
insert into public.wholesale_sale(id,branch_id,partner_id,sold_at,total)
values(pg_temp.fx('wholesale3'),pg_temp.fx('branch'),pg_temp.fx('partner3'),current_date,10000);
insert into public.employee(id,user_id,branch_id)
values(pg_temp.fx('employee2'),pg_temp.fx('sales2'),pg_temp.fx('branch'));

select pg_temp.login('sales2'); set local role authenticated;
select pg_temp.expect_error('เปลี่ยน legacy เป็นงาน care เพื่อหลบสิทธิ์ไม่ได้',
  $$update public.follow_up_task set task_source='manual' where id=pg_temp.fx('task2')$$,'23514','แหล่งงานติดตามเดิม');
select pg_temp.assert_ok('งานที่พยายามเปลี่ยนชนิดยังเป็น legacy',
  (select task_source='legacy' from public.follow_up_task where id=pg_temp.fx('task2')));
insert into public.booking(id,branch_id,customer_id,unit_id,name,phone,booked_at)
values(pg_temp.fx('booking3'),pg_temp.fx('branch'),pg_temp.fx('customer2'),pg_temp.fx('unit3'),'QA จอง','0000000000',current_date);
update public.motorcycle_unit set status='reserved' where id=pg_temp.fx('unit3');
select pg_temp.assert_ok('เซลล์จองรถได้โดยไม่ต้องมีสิทธิ์แก้สต๊อก',
  (select status='reserved' from public.motorcycle_unit where id=pg_temp.fx('unit3')));
select pg_temp.expect_error('สิทธิ์จองไม่ให้แก้ต้นทุนคันรถ',
  $$update public.motorcycle_unit set cost=1 where id=pg_temp.fx('unit3')$$,'42501','ข้อมูลรับรถหรือต้นทุน');
select pg_temp.expect_error('สิทธิ์จองไม่ให้ย้ายสาขาคันรถ',
  $$update public.motorcycle_unit set branch_id=pg_temp.fx('branch2') where id=pg_temp.fx('unit3')$$,'42501','ย้ายสาขาต้องผ่าน');
update public.booking set status='ยกเลิก' where id=pg_temp.fx('booking3');
reset role;
update public.app_setting set value='{"sales":{"page:booking":"read"}}' where key='perms';
set local role authenticated;
select pg_temp.expect_error('หน้าจองอ่านอย่างเดียวเปลี่ยนสถานะรถไม่ได้',
  $$update public.motorcycle_unit set status='available' where id=pg_temp.fx('unit3')$$,'42501','รายการต้นทาง');
reset role;
update public.app_setting set value='{}' where key='perms';
set local role authenticated;
update public.motorcycle_unit set status='available' where id=pg_temp.fx('unit3');
select pg_temp.assert_ok('ยกเลิกจองคืนสถานะได้หลังมีสิทธิ์เขียน',
  (select status='available' from public.motorcycle_unit where id=pg_temp.fx('unit3')));
reset role;

update public.app_setting set value='{"manager":{"page:stock":"read","page:settings":"write"}}' where key='perms';
select pg_temp.login('manager'); set local role authenticated;
select pg_temp.expect_error('มีสิทธิ์ตั้งค่าแต่หน้าสต๊อกอ่านอย่างเดียวแก้ราคาคันไม่ได้',
  $$update public.motorcycle_unit set retail=90000 where id=pg_temp.fx('unit4')$$,'42501','กำหนดราคาสต๊อก');
reset role;
update public.app_setting set value='{}' where key='perms';
set local role authenticated;
insert into public.unit_transfer(id,unit_id,from_branch,to_branch)
values(pg_temp.fx('transfer1'),pg_temp.fx('unit4'),pg_temp.fx('branch'),pg_temp.fx('branch2'));
update public.motorcycle_unit set status='in_transfer' where id=pg_temp.fx('unit4');
reset role;
update public.app_setting set value='{"manager":{"page:transfer":"read"}}' where key='perms';
set local role authenticated;
with u as(update public.unit_transfer set status='received' where id=pg_temp.fx('transfer1') returning id)
select pg_temp.assert_ok('หน้าโอนอ่านอย่างเดียวไม่รับโอนผ่าน API',(select count(*)=0 from u));
reset role;
update public.app_setting set value='{}' where key='perms';
set local role authenticated;
update public.unit_transfer set status='received' where id=pg_temp.fx('transfer1');
update public.motorcycle_unit set branch_id=pg_temp.fx('branch2'),status='available' where id=pg_temp.fx('unit4');
select pg_temp.assert_ok('รับโอนที่มีรายการและสิทธิ์ย้ายรถครบ',
  (select branch_id=pg_temp.fx('branch2') and status='available' from public.motorcycle_unit where id=pg_temp.fx('unit4')));
reset role;

select pg_temp.login('care'); set local role authenticated;
insert into public.part_movement(part_id,branch_id,kind,qty,job_id,at,by_user)
values(pg_temp.fx('part3'),pg_temp.fx('branch'),'job',-1,pg_temp.fx('service1'),'2000-01-01',pg_temp.fx('sales1'));
update public.part set qty_on_hand=4 where id=pg_temp.fx('part3');
select pg_temp.assert_ok('งานบริการตัดอะไหล่พร้อมผู้ทำและเวลาเซิร์ฟเวอร์',
  (select qty_on_hand=4 from public.part where id=pg_temp.fx('part3')) and
  (select at>now()-interval '1 minute' and by_user=auth.uid() from public.part_movement where part_id=pg_temp.fx('part3') order by id desc limit 1));
select pg_temp.expect_error('สิทธิ์บริการตัดจำนวนแต่แก้ราคาอะไหล่ไม่ได้',
  $$update public.part set cost=1,price=2 where id=pg_temp.fx('part3')$$,'42501','สิทธิ์ตัดจำนวน');
select pg_temp.expect_error('งานบริการปลอมเคลื่อนไหวปรับสต๊อกเองไม่ได้',
  $$insert into public.part_movement(part_id,branch_id,kind,qty) values(pg_temp.fx('part3'),pg_temp.fx('branch'),'adjust',10)$$,'42501','เคลื่อนไหวอะไหล่');
reset role;

update public.app_setting set value='{"manager":{"page:parts":"read"}}' where key='perms';
select pg_temp.login('manager'); set local role authenticated;
select public.create_sale_bundle(null,jsonb_build_object('id',pg_temp.fx('sale3'),'branch_id',pg_temp.fx('branch'),
  'unit_id',pg_temp.fx('unit5'),'customer_id',pg_temp.fx('customer2'),'salesperson_id',pg_temp.fx('sales2'),
  'pay_method','cash','list_price',100000,'discount',0,'net_price',100000,'cost',60000,'freebie_cost',200,'gross_profit',39800),
  jsonb_build_object('id',pg_temp.fx('reg3')),null,null,jsonb_build_array(jsonb_build_object('id',pg_temp.fx('gift3'),'qty',2)));
select pg_temp.assert_ok('เปิดขายตัดของแถมได้แม้หน้าอะไหล่อ่านอย่างเดียว',
  (select qty_on_hand=3 from public.freebie where id=pg_temp.fx('gift3')));
select pg_temp.expect_error('สิทธิ์เปิดขายไม่ให้แก้ชื่อหรือต้นทุนของแถม',
  $$update public.freebie set cost=1 where id=pg_temp.fx('gift3')$$,'42501','สิทธิ์ตัดจำนวน');
reset role;
update public.app_setting set value='{}' where key='perms';

update public.app_setting set value='{"acct":{"page:expense":"read","page:invoice":"read"}}' where key='perms';
select pg_temp.login('acct'); set local role authenticated;
select pg_temp.expect_error('การเงินมี action แต่หน้าค่าใช้จ่ายอ่านอย่างเดียวอนุมัติไม่ได้',
  $$update public.expense set approval='{"status":"ผ่าน"}' where id=pg_temp.fx('expense3')$$,'42501','ค่าใช้จ่ายไม่มีสิทธิ์เขียน');
select pg_temp.expect_error('การเงินมี action แต่หน้าเอกสารอ่านอย่างเดียวอนุมัติขายส่งไม่ได้',
  $$update public.wholesale_sale set fin_approval='{"status":"ผ่าน"}' where id=pg_temp.fx('wholesale3')$$,'42501','ตรวจการเงินขายส่ง');
reset role;
update public.app_setting set value='{}' where key='perms';
set local role authenticated;
update public.expense set approval='{"status":"ผ่าน","at":"2000-01-01"}' where id=pg_temp.fx('expense3');
update public.wholesale_sale set fin_approval='{"status":"ผ่าน","at":"2000-01-01"}' where id=pg_temp.fx('wholesale3');
select pg_temp.assert_ok('การเงินที่มีสิทธิ์ตรวจค่าใช้จ่ายและขายส่งได้ด้วยเวลาจริง',
  (select (approval->>'at')::timestamptz>now()-interval '1 minute' from public.expense where id=pg_temp.fx('expense3'))
  and (select fin_approval->>'by_id'=auth.uid()::text from public.wholesale_sale where id=pg_temp.fx('wholesale3')));
select pg_temp.expect_error('สิทธิ์การเงินไม่ให้แก้ยอดขายส่ง',
  $$update public.wholesale_sale set total=1 where id=pg_temp.fx('wholesale3')$$,'42501','เปิดหรือแก้ขายส่ง');
reset role;

update public.app_setting set value='{"manager":{"page:settings":"read","page:cal":"read"}}' where key='perms';
select pg_temp.login('manager'); set local role authenticated;
with u as(update public.branch set name='ไม่ควรเปลี่ยนได้' where id=pg_temp.fx('branch2') returning id)
select pg_temp.assert_ok('หน้าตั้งค่าอ่านอย่างเดียวแก้สาขาไม่ได้',(select count(*)=0 from u));
select pg_temp.expect_error('หน้าตั้งค่าอ่านอย่างเดียวอัปโหลดรูปรุ่นไม่ได้',
  $$insert into storage.objects(bucket_id,name) values('model-photo','QA33/readonly.jpg')$$,'42501');
select pg_temp.expect_error('ปฏิทินอ่านอย่างเดียวสร้างกิจกรรมไม่ได้',
  $$insert into public.company_event(event_date,event_type,title) values(current_date,'อื่นๆ','ทดสอบสิทธิ์')$$,'42501');
reset role;
update public.app_setting set value='{}' where key='perms';

select pg_temp.login('sales2'); set local role authenticated;
select pg_temp.assert_ok('ออกเลขใบเสนอราคาผ่าน RPC เมื่อหน้าเขียนได้',
  public.next_doc_no(pg_temp.fx('branch'),'QUOTE',2569) is not null);
insert into public.leave_request(id,employee_id,leave_type,date_from,date_to)
values(pg_temp.fx('leave2'),pg_temp.fx('employee2'),'ลากิจ',current_date,current_date);
select pg_temp.expect_error('ยื่นใบลาเองได้แต่อนุมัติตัวเองไม่ได้',
  $$update public.leave_request set status='อนุมัติแล้ว' where id=pg_temp.fx('leave2')$$,'42501','คนอื่นตรวจคำขอ');
select pg_temp.expect_error('พนักงาน PATCH เวลาเข้าเองไม่ได้',
  $$insert into public.attendance(employee_id,work_date,check_in) values(pg_temp.fx('employee2'),current_date,'2000-01-01')$$,'42501','จุดลงเวลาที่ตรวจหลักฐาน');
select public.punch_clock('in',0,0,10,'qa33-dummy.jpg','QA','QA-device',now(),now(),now(),now(),'ทดสอบนอกพื้นที่');
select pg_temp.assert_ok('ลงเวลาผ่าน RPC ยังทำงานและใช้เวลาจริง',
  (select check_in>now()-interval '1 minute' from public.attendance where employee_id=pg_temp.fx('employee2') and work_date=(now() at time zone 'Asia/Bangkok')::date));
reset role;
update public.app_setting set value='{"sales":{"page:hr":"read"}}' where key='perms';
set local role authenticated;
select pg_temp.expect_error('หน้าบุคลากรอ่านอย่างเดียวใช้ RPC ลงเวลาไม่ได้',
  $$select public.punch_clock('out',0,0,10,'qa33-dummy.jpg','QA','QA-device',now(),now(),now(),now(),'ทดสอบนอกพื้นที่')$$,'42501','หน้าบุคลากร');
reset role;
update public.app_setting set value='{}' where key='perms';
select pg_temp.login('manager'); set local role authenticated;
update public.leave_request set status='อนุมัติแล้ว',approved_by=pg_temp.fx('sales2'),approved_at='2000-01-01' where id=pg_temp.fx('leave2');
select pg_temp.assert_ok('ผู้ตรวจที่มีสิทธิ์อนุมัติคำขอด้วยชื่อและเวลาเซิร์ฟเวอร์',
  (select approved_by=auth.uid() and approved_at>now()-interval '1 minute' from public.leave_request where id=pg_temp.fx('leave2')));
insert into storage.objects(bucket_id,name) values('model-photo','QA33/allowed.jpg');
select pg_temp.assert_ok('หน้าตั้งค่าเขียนได้อัปโหลดรูปรุ่นได้',
  (select count(*)=1 from storage.objects where bucket_id='model-photo' and name='QA33/allowed.jpg'));
select pg_temp.expect_error('ผู้บริหารแก้ตัวนับเลขเอกสารตรงไม่ได้',
  $$update public.doc_counter set last_no=0 where branch_id=pg_temp.fx('branch') and doc_type='QUOTE'$$,'42501','ตัวนับกลาง');
reset role;
update public.app_setting set value='{"sales":{"page:quote":"read"},"acct":{"page:ar":"read"}}' where key='perms';
select pg_temp.login('sales2'); set local role authenticated;
select pg_temp.expect_error('หน้าใบเสนออ่านอย่างเดียวเรียก RPC ออกเลขไม่ได้',
  $$select public.next_doc_no(pg_temp.fx('branch'),'QUOTE',2569)$$,'42501','ออกเลขเอกสาร');
reset role;
select pg_temp.login('acct'); set local role authenticated;
with u as(update public.receivable set amount_paid=1 where sale_id=pg_temp.fx('sale1') returning id)
select pg_temp.assert_ok('ลูกหนี้อ่านอย่างเดียวรับเงินไม่ได้แม้ดีลเขียนได้',(select count(*)=0 from u));
select pg_temp.expect_error('ลูกหนี้อ่านอย่างเดียวเพิ่มรายการรับเงินไม่ได้',
  $$insert into public.receipt_payment(receivable_id,paid_at,amount) select id,current_date,1 from public.receivable where sale_id=pg_temp.fx('sale1') limit 1$$,'42501');
reset role;
update public.app_setting set value='{}' where key='perms';
update public.app_setting set value='{"acct":{"page:deal":"read","page:invoice":"write"}}' where key='perms';
select pg_temp.login('acct'); set local role authenticated;
select pg_temp.expect_error('หน้าเอกสารเขียนได้ไม่ให้อนุมัติขายเมื่อดีลอ่านอย่างเดียว',
  $$update public.sale set fin_approval='{"status":"ผ่าน"}' where id=pg_temp.fx('sale3')$$,'42501','เขียนหน้าดีล');
reset role;
update public.app_setting set value='{}' where key='perms';
select count(*)::int as assertions_passed,bool_and(passed) as all_passed from brief32_results;
