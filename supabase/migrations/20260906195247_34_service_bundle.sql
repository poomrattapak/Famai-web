-- บันทึกบริการและนัดหมายเป็นธุรกรรมเดียว รอผลจริงก่อนแสดงสำเร็จ
-- ใช้สิทธิ์ผู้เรียกและ RLS เดิม ไม่ยกระดับการมองเห็นข้อมูล
create or replace function public.create_care_service(p_request jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  j public.service_job; c public.customer; previous public.service_job;
  task_id uuid:=gen_random_uuid(); next_id uuid:=gen_random_uuid();
  req_id uuid:=(p_request->>'id')::uuid;
  cid uuid:=(p_request->>'customer_id')::uuid;
  bid uuid:=(p_request->>'branch_id')::uuid;
  uid uuid:=nullif(p_request->>'unit_id','')::uuid;
  sid uuid:=nullif(p_request->>'sale_id','')::uuid;
  detail text:=btrim(p_request->>'detail');
  model text:=btrim(p_request->>'model');
  engine text:=nullif(btrim(p_request->>'engine'),'');
  frame text:=nullif(btrim(p_request->>'frame'),'');
  v_amount numeric:=nullif(p_request->>'amount','')::numeric;
  appointment timestamptz:=nullif(p_request->>'appointment_at','')::timestamptz;
  at_time timestamptz:=clock_timestamp();
  task_rows jsonb;
begin
  if auth.uid() is null or not famai_private.allowed('act:care',true)
    or not famai_private.any_page(array['aftercare','service'],true)
    or not famai_private.branch_ok(bid) then
    raise exception 'ไม่มีสิทธิ์บันทึกบริการในสาขานี้' using errcode='42501';
  end if;
  if req_id is null or cid is null or bid is null or coalesce(detail,'')='' or coalesce(model,'')=''
    or (engine is null and frame is null) or v_amount<0 or v_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'ข้อมูลบริการไม่ครบหรือจำนวนเงินไม่ถูกต้อง' using errcode='23514';
  end if;
  -- ล็อก request เดิม ทำให้การกดซ้ำพร้อมกันสร้างเอกสารเพียงครั้งเดียว
  perform pg_advisory_xact_lock(hashtextextended(req_id::text,34));
  select * into previous from public.service_job where id=req_id;
  if found then
    if previous.customer_id<>cid or previous.branch_id<>bid
      or previous.model_name is distinct from model or previous.engine_no is distinct from engine
      or previous.frame_no is distinct from frame or previous.symptom is distinct from detail
      or previous.unit_id is distinct from uid or previous.total<>coalesce(v_amount,0)
      or previous.next_appointment_at is distinct from appointment
      or not exists(select 1 from public.follow_up_task t where service_job_id=req_id
        and task_source='manual' and t.created_by=auth.uid() and t.amount is not distinct from v_amount
        and sale_id is not distinct from sid) then
      raise exception 'คำขอบันทึกซ้ำมีข้อมูลต่างจากรายการเดิม' using errcode='23514';
    end if;
    j:=previous;
  else
    if appointment is not null and appointment<=at_time then
      raise exception 'วันเวลานัดต้องเป็นอนาคต' using errcode='23514';
    end if;
    select * into c from public.customer where id=cid for update;
    if not found then
      if coalesce(btrim(p_request->>'customer_name'),'')='' or coalesce(btrim(p_request->>'customer_phone'),'')='' then
        raise exception 'ระบุชื่อและเบอร์โทรลูกค้า' using errcode='23514';
      end if;
      insert into public.customer(id,branch_id,full_name,phone,source,stage,owner_id)
      values(cid,bid,btrim(p_request->>'customer_name'),btrim(p_request->>'customer_phone'),
        'เข้าศูนย์บริการ','รับรถสำเร็จ',auth.uid()) returning * into c;
    end if;
    if not famai_private.customer_ok(cid,true) then
      raise exception 'ไม่มีสิทธิ์บันทึกบริการของลูกค้ารายนี้' using errcode='42501';
    end if;
    if uid is not null and not exists(select 1 from public.motorcycle_unit u
      where u.id=uid and u.branch_id=bid and u.engine_no is not distinct from engine and u.frame_no is not distinct from frame) then
      raise exception 'เลขรถไม่ตรงกับรถที่เลือก' using errcode='23514';
    end if;
    if exists(select 1 from public.service_job x where x.branch_id=bid and x.customer_id<>cid
      and ((engine is not null and lower(x.engine_no)=lower(engine)) or (frame is not null and lower(x.frame_no)=lower(frame))))
      or exists(select 1 from public.sale s join public.motorcycle_unit u on u.id=s.unit_id
        where s.branch_id=bid and s.customer_id<>cid and s.voided_at is null
        and ((engine is not null and lower(u.engine_no)=lower(engine)) or (frame is not null and lower(u.frame_no)=lower(frame)))) then
      raise exception 'เลขรถตรงกับลูกค้ารายอื่น กรุณาค้นประวัติใหม่' using errcode='23514';
    end if;
    insert into public.service_job(id,branch_id,job_no,customer_id,unit_id,engine_no,frame_no,model_name,
      service_type,symptom,checked_in_at,finished_at,status,labor_cost,parts_cost,total,next_appointment_at)
    values(req_id,bid,public.next_doc_no(bid,'SERVICE',extract(year from at_time at time zone 'Asia/Bangkok')::int+543),
      cid,uid,engine,frame,model,'บันทึกบริการ',detail,at_time,at_time,'ส่งมอบแล้ว',coalesce(v_amount,0),0,coalesce(v_amount,0),appointment)
    returning * into j;
    insert into public.follow_up_task(id,branch_id,customer_id,sale_id,kind,task_source,title,amount,due_at,done_at,service_job_id)
    values(task_id,bid,cid,sid,'care manual','manual',detail,v_amount,(at_time at time zone 'Asia/Bangkok')::date,at_time,j.id);
    if appointment is not null then
      insert into public.follow_up_task(id,branch_id,customer_id,sale_id,kind,task_source,title,due_at,appointment_at,parent_task_id,service_job_id)
      values(next_id,bid,cid,sid,'care service_next','service_next','นัดบริการครั้งถัดไป · '||detail,
        (appointment at time zone 'Asia/Bangkok')::date,appointment,task_id,j.id);
    end if;
  end if;
  select * into c from public.customer where id=cid;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.task_source),'[]'::jsonb) into task_rows
    from public.follow_up_task t where t.service_job_id=j.id;
  return jsonb_build_object('customer',to_jsonb(c),'job',to_jsonb(j),'tasks',task_rows);
end $$;
revoke all on function public.create_care_service(jsonb) from public,anon;
grant execute on function public.create_care_service(jsonb) to authenticated;
