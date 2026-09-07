-- v1.62: ต้องเลือกลูกค้าที่บันทึกในระบบก่อนออกใบเสนอ
reset role;
update public.app_setting set value='{}' where key='perms';
insert into brief32_fixture(k) values('customer36'),('quote36');
select pg_temp.login('manager');
insert into public.customer(id,branch_id,full_name,phone,owner_id)
values(pg_temp.fx('customer36'),pg_temp.fx('branch'),'ลูกค้าที่เลือกจริง','0810000036',pg_temp.fx('sales1'));
select pg_temp.login('sales1');set local role authenticated;
select pg_temp.expect_error('ใบเสนอใหม่ไม่มีลูกค้าอ้างอิงบันทึกตรงไม่ได้',
 $$insert into public.quotation(branch_id,doc_no,quote_date,customer_name,pay_method)
 values(pg_temp.fx('branch'),'NO-CUSTOMER36',current_date,'พิมพ์ชื่อเอง','cash')$$,'23514','เลือกลูกค้าในระบบ');
select pg_temp.expect_error('RPC ใบเสนอใหม่ต้องมีลูกค้าอ้างอิง',
 $$select public.quote_save(jsonb_build_object('branch_id',pg_temp.fx('branch'),'customer_name','กรอกลอยๆ',
 'doc_no','RPC-NO-CUSTOMER36','quote_date',current_date,'pay_method','cash'),
 '[{"slot":1,"price":100}]'::jsonb)$$,'23514','เลือกลูกค้าในระบบ');
select public.quote_save(jsonb_build_object('id',pg_temp.fx('quote36'),'customer_id',pg_temp.fx('customer36'),
 'branch_id',pg_temp.fx('branch'),'customer_name','ปลอมชื่อในคำขอ','customer_phone','ปลอมเบอร์ในคำขอ',
 'doc_no','QA36','quote_date',current_date,'pay_method','cash'),
 jsonb_build_array(jsonb_build_object('slot',1,'variant_id',pg_temp.fx('variant'),'price',100000)));
select pg_temp.assert_ok('ใบเสนอยืนยันรหัสและข้อมูลลูกค้าจากฐาน',
 (select customer_id=pg_temp.fx('customer36') and customer_name='ลูกค้าที่เลือกจริง' and customer_phone='0810000036'
 and seller_id=pg_temp.fx('sales1') from public.quotation where id=pg_temp.fx('quote36')));
update public.customer set full_name='ชื่อที่แก้ภายหลัง',phone='0819990036' where id=pg_temp.fx('customer36');
select pg_temp.assert_ok('แก้ลูกค้าภายหลังไม่ทับชื่อเบอร์ในใบเก่า',
 (select customer_name='ลูกค้าที่เลือกจริง' and customer_phone='0810000036' from public.quotation where id=pg_temp.fx('quote36')));
update public.customer set archived_at=now(),archived_reason='ทดสอบคลัง' where id=pg_temp.fx('customer36');
select pg_temp.expect_error('ลูกค้าในคลังใช้สร้างใบเสนอใหม่ไม่ได้',
 $$select public.quote_save(jsonb_build_object('customer_id',pg_temp.fx('customer36'),'branch_id',pg_temp.fx('branch'),
 'customer_name','ในคลัง','doc_no','ARCHIVE36','quote_date',current_date,'pay_method','cash'),
 '[{"slot":1,"price":100}]'::jsonb)$$,'23514');
select pg_temp.assert_ok('ใบเก่าของลูกค้าเข้าคลังยังอ่านสำเนาได้',
 (select count(*)=1 from public.quotation where id=pg_temp.fx('quote36')));
reset role;
select count(*)::int as assertions_passed,bool_and(passed) as all_passed from brief32_results;
