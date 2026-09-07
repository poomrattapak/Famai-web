-- v1.61: ชื่อและเบอร์เซลล์จากบัญชีพนักงาน ไม่มีการเลือก/กรอกซ้ำในใบเสนอ
reset role;
update public.app_setting set value='{}' where key='perms';
insert into brief32_fixture(k) values('quote35'),('badquote35'),('customer35'),('unit35'),('sale35');
select pg_temp.login('manager');
insert into public.customer(id,branch_id,full_name,owner_id) values(pg_temp.fx('customer35'),pg_temp.fx('branch'),'ลูกค้าใบเสนอใหม่',pg_temp.fx('sales1'));
insert into public.motorcycle_unit(id,branch_id,variant_id,color_code,sku,engine_no,frame_no,received_at,cost,cost_vat,retail)
values(pg_temp.fx('unit35'),pg_temp.fx('branch'),pg_temp.fx('variant'),'QA','QA35','QA35-E','QA35-F',current_date,60000,4200,100000);
set local role authenticated;
insert into public.sale(id,branch_id,unit_id,customer_id,salesperson_id,sold_at,list_price,net_price,cost,gross_profit,pay_method)
values(pg_temp.fx('sale35'),pg_temp.fx('branch'),pg_temp.fx('unit35'),pg_temp.fx('customer35'),pg_temp.fx('manager'),current_date,100000,100000,60000,40000,'cash');
select pg_temp.assert_ok('ผู้บริหารเปิดขายคงรหัสเซลล์เจ้าของลูกค้า',(select salesperson_id=pg_temp.fx('sales1') from public.sale where id=pg_temp.fx('sale35')));
select pg_temp.login('sales1');
select public.staff_set_contact(pg_temp.fx('sales1'),'0810000035');
select pg_temp.assert_ok('บันทึกเบอร์ตนเองในประวัติพนักงาน',(select phone='0810000035' from public.app_user where id=auth.uid()));
select pg_temp.expect_error('เซลล์แก้เบอร์พนักงานคนอื่นไม่ได้',
 $$select public.staff_set_contact(pg_temp.fx('sales2'),'0810000036')$$,'42501');
select pg_temp.expect_error('โปรไฟล์ไม่รับเบอร์ไม่ครบ',
 $$select public.staff_set_contact(pg_temp.fx('sales1'),'123')$$,'23514');
select pg_temp.expect_error('โปรไฟล์ไม่รับเลขโทรศัพท์เกินความยาว',
 $$select public.staff_set_contact(pg_temp.fx('sales1'),'1234567890123456')$$,'23514');
select pg_temp.login('manager');
select public.quote_save(jsonb_build_object('id',pg_temp.fx('quote35'),'branch_id',pg_temp.fx('branch'),
 'customer_id',pg_temp.fx('customer35'),'customer_name','ลูกค้ารายเดิม','doc_no','QA35','quote_date',current_date,
 'seller_id',pg_temp.fx('manager'),'seller_name','ปลอมชื่อ','seller_phone','ปลอมเบอร์','pay_method','cash','snapshot','{"slots":[]}'::jsonb),
 jsonb_build_array(jsonb_build_object('slot',1,'variant_id',pg_temp.fx('variant'),'price',100000,'down_payment',0)));
select pg_temp.assert_ok('ใบเสนอดึงเซลล์เจ้าของดีลและเบอร์จากประวัติ',
 (select seller_id=pg_temp.fx('sales1') and seller_name=(select full_name from public.app_user where id=pg_temp.fx('sales1'))
 and seller_phone='0810000035' and created_by=auth.uid() from public.quotation where id=pg_temp.fx('quote35')));
select pg_temp.login('sales1');
select public.staff_set_contact(pg_temp.fx('sales1'),'0810000099');
select pg_temp.assert_ok('เปลี่ยนเบอร์พนักงานไม่ทับสำเนาใบเสนอเก่า',
 (select seller_phone='0810000035' from public.quotation where id=pg_temp.fx('quote35')));
select pg_temp.expect_error('แก้ผู้ขายบนใบเก่าตรงไม่ได้',
 $$update public.quotation set seller_phone='0810000001' where id=pg_temp.fx('quote35')$$,'42501');
select pg_temp.expect_error('ทำใบเสนอให้ลูกค้าเซลล์คนอื่นไม่ได้',
 $$select public.quote_save(jsonb_build_object('branch_id',pg_temp.fx('branch'),'customer_id',pg_temp.fx('customer2'),
 'customer_name','ข้ามคน','doc_no','BAD35','quote_date',current_date,'pay_method','cash'),
 '[{"slot":1,"price":100}]'::jsonb)$$,'42501');
select pg_temp.expect_error('ตัวเลือกผิดต้องย้อนคืนหัวใบเสนอด้วย',
 $$select public.quote_save(jsonb_build_object('id',pg_temp.fx('badquote35'),'branch_id',pg_temp.fx('branch'),
 'customer_name','ทดสอบย้อนคืน','doc_no','ROLLBACK35','quote_date',current_date,'pay_method','cash'),
 jsonb_build_array(jsonb_build_object('slot',1,'variant_id',gen_random_uuid(),'price',100)))$$,'23503');
select pg_temp.assert_ok('ไม่เหลือหัวใบเสนอที่ตัวเลือกบันทึกไม่สำเร็จ',
 not exists(select 1 from public.quotation where id=pg_temp.fx('badquote35')));
with changed as (update public.app_user set all_branch=true where id=pg_temp.fx('sales1') returning id)
select pg_temp.assert_ok('บุคคลไม่มีสิทธิ์เปลี่ยนบทบาทผ่านโปรไฟล์',(select count(*)=0 from changed));
reset role;
update public.app_setting set value='{"sales":{"page:quote":"read"}}' where key='perms';
select pg_temp.login('sales1');set local role authenticated;
select pg_temp.expect_error('ใบเสนออ่านอย่างเดียวเรียกบันทึกไม่ได้',
 $$select public.quote_save('{}'::jsonb,'[]'::jsonb)$$,'42501');
reset role;
update public.app_setting set value='{}' where key='perms';
set local role anon;
select pg_temp.expect_error('คนไม่ล็อกอินบันทึกโปรไฟล์ไม่ได้',
 $$select public.staff_set_contact('35000000-0000-4000-8000-000000000001','0810000035')$$,'42501');
reset role;
select count(*)::int as assertions_passed,bool_and(passed) as all_passed from brief32_results;
