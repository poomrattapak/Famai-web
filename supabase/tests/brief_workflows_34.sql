-- ใช้ fixture เดียวกับ 32–33 ภายในธุรกรรมทดสอบที่ rollback ทั้งหมด
insert into brief32_fixture(k) select unnest(array['care_customer34','care_job34','care_rollback_customer34','care_rollback_job34']);
update brief32_fixture set payload=jsonb_build_object('id',pg_temp.fx('care_job34'),
 'customer_id',pg_temp.fx('care_customer34'),'branch_id',pg_temp.fx('branch'),
 'customer_name','ทดสอบบริการธุรกรรมเดียว','customer_phone','0000000034',
 'engine','QA34-E','frame','QA34-F','model','รุ่นนอกร้าน','detail','เช็กระยะทดสอบ',
 'amount',null,'appointment_at',clock_timestamp()+interval '14 days') where k='care_job34';
select pg_temp.login('sales1');set local role authenticated;
select pg_temp.expect_error('เซลล์เรียกบันทึกบริการโดยตรงไม่ได้',
 $$select public.create_care_service((select payload from pg_temp.brief32_fixture where k='care_job34'))$$,'42501');
reset role;
select pg_temp.login('care');set local role authenticated;
select public.create_care_service((select payload from pg_temp.brief32_fixture where k='care_job34'));
select pg_temp.assert_ok('บริการบันทึกลูกค้าและงานพร้อมนัดครบ',
 (select count(*)=1 from public.customer where id=pg_temp.fx('care_customer34'))
 and (select count(*)=1 from public.service_job where id=pg_temp.fx('care_job34'))
 and (select count(*)=2 from public.follow_up_task where service_job_id=pg_temp.fx('care_job34')));
select pg_temp.assert_ok('ราคาไม่ระบุคงเป็น null และปิดบันทึกบริการด้วยเวลาเซิร์ฟเวอร์',
 (select amount is null and done_at is not null and done_by=auth.uid() from public.follow_up_task
 where service_job_id=pg_temp.fx('care_job34') and task_source='manual'));
select pg_temp.assert_ok('นัดถัดไปเชื่อม parent และวันไทย',
 (select t.parent_task_id=m.id and t.due_at=(t.appointment_at at time zone 'Asia/Bangkok')::date and t.done_at is null
 from public.follow_up_task t join public.follow_up_task m on m.id=t.parent_task_id
 where t.service_job_id=pg_temp.fx('care_job34') and t.task_source='service_next'));
select public.create_care_service((select payload from pg_temp.brief32_fixture where k='care_job34'));
select pg_temp.assert_ok('ส่งคำขอบริการซ้ำไม่เพิ่มงานหรือนัด',
 (select count(*)=1 from public.service_job where id=pg_temp.fx('care_job34'))
 and (select count(*)=2 from public.follow_up_task where service_job_id=pg_temp.fx('care_job34')));
select pg_temp.expect_error('คำขอซ้ำเปลี่ยนข้อมูลไม่ได้',
 $$select public.create_care_service((select payload||'{"detail":"เปลี่ยนคำขอ"}'::jsonb from pg_temp.brief32_fixture where k='care_job34'))$$,'23514','คำขอบันทึกซ้ำ');
-- ล้มเหลวตอนเพิ่ม follow_up หลังสร้างลูกค้า/ใบงานและออกเลขแล้ว ต้องคืนทั้งหมด
select pg_temp.expect_error('นัดล้มเหลวไม่เหลือลูกค้าหรือใบงานครึ่งชุด',
 $$select public.create_care_service((select payload||jsonb_build_object('id',pg_temp.fx('care_rollback_job34'),
 'customer_id',pg_temp.fx('care_rollback_customer34'),'sale_id',pg_temp.fx('sale2'),
 'engine','QA34-ROLLBACK-E','frame','QA34-ROLLBACK-F') from pg_temp.brief32_fixture where k='care_job34'))$$,'23514','งานติดตามไม่ตรง');
select pg_temp.assert_ok('rollback บริการล้มเหลวเก็บข้อมูลครบหรือไม่เก็บเลย',
 not exists(select 1 from public.customer where id=pg_temp.fx('care_rollback_customer34'))
 and not exists(select 1 from public.service_job where id=pg_temp.fx('care_rollback_job34')));
select pg_temp.expect_error('บริการห้ามจำนวนเงินติดลบ',
 $$select public.create_care_service((select payload||jsonb_build_object('id',gen_random_uuid(),'amount',-1) from pg_temp.brief32_fixture where k='care_job34'))$$,'23514','จำนวนเงิน');
select pg_temp.expect_error('บริการห้ามนัดย้อนหลัง',
 $$select public.create_care_service((select payload||jsonb_build_object('id',gen_random_uuid(),'appointment_at',clock_timestamp()-interval '1 day') from pg_temp.brief32_fixture where k='care_job34'))$$,'23514','นัดต้องเป็นอนาคต');
reset role;
update public.app_setting set value='{"care":{"page:aftercare":"read","page:service":"read","act:care":"write"}}' where key='perms';
select pg_temp.login('care');set local role authenticated;
select pg_temp.expect_error('บริการอ่านอย่างเดียวเรียก RPC เขียนไม่ได้',
 $$select public.create_care_service((select payload from pg_temp.brief32_fixture where k='care_job34'))$$,'42501');
reset role;
update public.app_setting set value='{}' where key='perms';
set local role anon;
select pg_temp.expect_error('คนไม่ล็อกอินเรียก RPC บริการไม่ได้',
 $$select public.create_care_service('{}'::jsonb)$$,'42501');
reset role;
select count(*)::int as assertions_passed,bool_and(passed) as all_passed from brief32_results;
