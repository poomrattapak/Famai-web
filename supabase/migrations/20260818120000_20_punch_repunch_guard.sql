-- ═══════════════════════════════════════════════════════════════════════
-- 20 · ด่านกันลงเวลาซ้ำใน punch_clock (v1.26 ข้อ 5)
--
-- ของเดิม (migration 12): insert … on conflict do nothing แล้วตามด้วย
-- update set check_in = v_now แบบไม่มีเงื่อนไข — กดเข้าซ้ำเมื่อไหร่เวลาเข้า
-- จริงถูกทับเงียบ ๆ (คนมาเช้าแล้ว refresh ตอนสาย กลายเป็นมาสายทั้งวัน)
-- และ p_side='out' ยิงได้ทั้งที่ไม่เคยมี check_in
--
-- ฉบับนี้คัดลอกฟังก์ชันเดิมทุกบรรทัด (ลายเซ็นเดิมเป๊ะ) แล้วแทรกด่าน 3 ตัว
-- ระหว่าง insert กับ update พร้อม select … for update ล็อกแถวกันสองเครื่อง
-- กดพร้อมกัน — การแก้เวลาย้อนหลังยังเป็นงานของผู้จัดการผ่านช่องทางตรวจเหมือนเดิม
-- ═══════════════════════════════════════════════════════════════════════

create or replace function punch_clock(
  p_side       text,
  p_lat        numeric,
  p_lng        numeric,
  p_acc        integer,
  p_photo_url  text,
  p_device     text,
  p_device_id  text,
  p_client_at  timestamptz,
  p_photo_at   timestamptz,
  p_geo_at     timestamptz,
  p_opened_at  timestamptz,
  p_reason     text default null)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  v_emp   employee%rowtype;
  v_row   attendance%rowtype;
  v_now   timestamptz := now();
  v_date  date;
  v_site  uuid; v_name text; v_dist integer; v_out boolean := false;
  v_n     integer;
  v_flags jsonb := '[]'::jsonb;
begin
  if p_side not in ('in','out') then raise exception 'ด้านไม่ถูกต้อง'; end if;

  -- ลงเวลาแทนคนอื่นไม่ได้ แม้จะยิง API ตรง — พนักงานมาจาก auth.uid() เท่านั้น
  select * into v_emp from employee where user_id = auth.uid();
  if not found then raise exception 'ไม่พบพนักงานของบัญชีนี้'; end if;

  if p_photo_url is null or p_lat is null or p_lng is null then
    raise exception 'ต้องมีทั้งรูปและพิกัดก่อนลงเวลา'; end if;

  -- หลักฐานต้องสด และต้องไม่มาจากอนาคตด้วย — เวลาในอนาคตน่าสงสัยพอ ๆ กับเวลาที่เก่าเกินไป
  if p_photo_at is null or p_geo_at is null
     or v_now - p_photo_at > interval '120 seconds'
     or v_now - p_geo_at   > interval '120 seconds'
     or p_photo_at > v_now + interval '60 seconds'
     or p_geo_at   > v_now + interval '60 seconds'
  then raise exception 'หลักฐานเก่าเกินไป — ถ่ายใหม่แล้วกดยืนยันอีกครั้ง'; end if;

  -- วันของแถวต้องเป็นวันตามเวลาไทย ไม่ใช่ UTC
  -- (commit 0bd486b เคยแก้บั๊กเดียวกันนี้ฝั่งหน้า — ลงเวลาตอนค่ำจะไปลงผิดแถว)
  v_date := (v_now at time zone 'Asia/Bangkok')::date;

  select count(*) into v_n from branch_site
   where branch_id = v_emp.branch_id and is_active;

  if v_n = 0 then
    -- สาขายังไม่ได้ปักหมุด = ไม่มีอะไรให้เทียบ ต้องปล่อยผ่าน ไม่ใช่ปิดกั้น
    v_flags := v_flags || '["nosite"]'::jsonb;
  else
    select s.id, s.name, d.dist,
           d.dist > s.radius_m + least(coalesce(p_acc,0), 100)
      into v_site, v_name, v_dist, v_out
      from branch_site s
      cross join lateral (select meters_between(p_lat, p_lng, s.lat, s.lng) as dist) d
     where s.branch_id = v_emp.branch_id and s.is_active
     order by d.dist
     limit 1;

    if v_out and coalesce(p_reason,'') = '' then
      raise exception 'อยู่นอกพื้นที่ลงเวลา — ต้องระบุเหตุผลก่อน'; end if;
    if v_out then v_flags := v_flags || '["outside"]'::jsonb; end if;
  end if;

  if p_client_at is not null
     and abs(extract(epoch from (v_now - p_client_at))) > 120
    then v_flags := v_flags || '["clockskew"]'::jsonb; end if;

  insert into attendance (employee_id, work_date) values (v_emp.id, v_date)
    on conflict (employee_id, work_date) do nothing;

  -- ── ด่านใหม่ (v1.26): เวลาแรกที่กดคือเวลาจริง ห้ามเขียนทับ ──────────────
  -- for update ล็อกแถวไว้จนจบ transaction — สองเครื่องกดพร้อมกันตัวหลังต้องเห็นค่าที่ตัวแรกเขียน
  select * into v_row from attendance
   where employee_id = v_emp.id and work_date = v_date for update;
  if p_side = 'in' and v_row.check_in is not null then
    raise exception 'วันนี้ลงเวลาเข้าแล้ว % — ให้ผู้จัดการแก้ไขหากเวลาผิด',
      to_char(v_row.check_in at time zone 'Asia/Bangkok', 'HH24:MI'); end if;
  if p_side = 'out' and v_row.check_in is null then
    raise exception 'ยังไม่มีเวลาเข้าของวันนี้ — ลงเวลาเข้าก่อน'; end if;
  if p_side = 'out' and v_row.check_out is not null then
    raise exception 'วันนี้ลงเวลาออกแล้ว % — ให้ผู้จัดการแก้ไขหากเวลาผิด',
      to_char(v_row.check_out at time zone 'Asia/Bangkok', 'HH24:MI'); end if;

  if p_side = 'in' then
    update attendance set
      check_in = v_now, check_in_photo_url = p_photo_url,
      check_in_lat = p_lat, check_in_lng = p_lng, check_in_acc = p_acc,
      check_in_device = p_device, check_in_device_id = p_device_id,
      check_in_site_id = v_site, check_in_site_name = v_name, check_in_dist_m = v_dist,
      check_in_outside = coalesce(v_out,false), check_in_reason = nullif(p_reason,''),
      check_in_client_at = p_client_at, check_in_opened_at = p_opened_at,
      check_in_photo_at = p_photo_at, check_in_geo_at = p_geo_at,
      geo_flags = geo_flags || v_flags
    where employee_id = v_emp.id and work_date = v_date;
  else
    update attendance set
      check_out = v_now, check_out_photo_url = p_photo_url,
      check_out_lat = p_lat, check_out_lng = p_lng, check_out_acc = p_acc,
      check_out_device = p_device, check_out_device_id = p_device_id,
      check_out_site_id = v_site, check_out_site_name = v_name, check_out_dist_m = v_dist,
      check_out_outside = coalesce(v_out,false), check_out_reason = nullif(p_reason,''),
      check_out_client_at = p_client_at, check_out_opened_at = p_opened_at,
      check_out_photo_at = p_photo_at, check_out_geo_at = p_geo_at,
      geo_flags = geo_flags || v_flags
    where employee_id = v_emp.id and work_date = v_date;
  end if;

  return jsonb_build_object('at', v_now, 'date', v_date, 'site', v_name,
                            'dist', v_dist, 'outside', coalesce(v_out,false), 'flags', v_flags);
end $$;

-- create or replace คงสิทธิ์เดิมไว้ก็จริง แต่ระบุซ้ำให้เห็นชัดว่าเส้นแบ่งอยู่ตรงไหน
revoke all on function public.punch_clock(text,numeric,numeric,integer,text,text,text,
  timestamptz,timestamptz,timestamptz,timestamptz,text) from anon, public;
grant execute on function public.punch_clock(text,numeric,numeric,integer,text,text,text,
  timestamptz,timestamptz,timestamptz,timestamptz,text) to authenticated;
