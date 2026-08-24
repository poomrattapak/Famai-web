-- 21: รูปรถผูกกับ "สี" ไม่ใช่ "รุ่น"
-- เจ้าของสั่ง 23 ส.ค. 2569: "แยก 1 สีในแต่ละรุ่นเป็น 1 card เพราะตอนใส่รูป ต้องใส่รูปรถให้ตรงสี
-- พอเป็นให้เพิ่มรูปได้รูปเดียว แต่ใส่สีได้หลายบรรทัด จะทำให้สับสน"
--
-- ของเดิม model_photo ผูกกับ variant อย่างเดียว (unique variant_id, sort)
-- รุ่นหนึ่งมีได้ถึง 4 สี แต่มีรูปได้ชุดเดียว — ลูกค้าเปิดเว็บขายรถแล้วเห็นรถผิดสี
--
-- ตารางนี้ยัง "ว่างเปล่า" เพราะแอปไม่เคยเขียนลงเลย (อัปขึ้น Storage แล้วจบ
-- รูปจึงหายทุกครั้งที่รีเฟรชหน้า — เจอตอนรอบ v1.31 แก้ไปพร้อมกัน)
-- จึงบังคับ not null ได้ทันทีโดยไม่ต้องเติมค่าให้แถวเดิม แต่ยืนยันก่อนเสมอ ไม่เดา

do $$
begin
  if exists (select 1 from public.model_photo limit 1) then
    raise exception 'model_photo ไม่ว่าง — ต้องเติม color_code ให้แถวเดิมก่อนถึงจะบังคับ not null ได้';
  end if;
end $$;

-- ── color_code + ข้อจำกัดใหม่ ─────────────────────────────────────────
alter table public.model_photo add column if not exists color_code text;

-- ทำเป็นสองจังหวะ (add แล้วค่อย set not null) เพื่อให้รันซ้ำได้ไม่พัง
alter table public.model_photo alter column color_code set not null;

-- unique เดิมคือ (variant_id, sort) ซึ่งแปลว่า "หนึ่งรุ่นมีรูปปกได้ใบเดียว" — ไม่ใช่แล้ว
alter table public.model_photo drop constraint if exists model_photo_variant_id_sort_key;
alter table public.model_photo drop constraint if exists model_photo_variant_color_sort_key;
alter table public.model_photo add  constraint model_photo_variant_color_sort_key
  unique (variant_id, color_code, sort);

-- สีต้องมีจริงในตารางสีของรุ่นนั้น — กันรูปกำพร้าที่ชี้ไปยังสีที่ไม่มีอยู่
-- ลบสีออกจากรุ่น = รูปของสีนั้นหายตามไปด้วย (ไฟล์ใน bucket ต้องเก็บกวาดต่างหาก)
alter table public.model_photo drop constraint if exists model_photo_color_fk;
alter table public.model_photo add  constraint model_photo_color_fk
  foreign key (variant_id, color_code) references public.model_color (variant_id, color_code)
  on delete cascade;

drop index if exists model_photo_variant_idx;
create index if not exists model_photo_color_idx
  on public.model_photo (variant_id, color_code, sort);

comment on table public.model_photo is
  'รูปรถต่อ "สีของรุ่น" สูงสุด 4 มุมต่อสี · sort 0 = รูปปกของสีนั้น
   เก็บ path ใน bucket model-photo ไม่ได้เก็บไฟล์ในฐานข้อมูล
   เส้นทางไฟล์: model/<รหัสรุ่น>/<รหัสสี>/<card|full>-<hash>.<ext>';
comment on column public.model_photo.color_code is
  'รหัสสีของยามาฮ่า ตรงกับ model_color.color_code — รูปหนึ่งใบเป็นของสีเดียวเสมอ';

comment on column public.model_variant.photo_url is
  'URL รูปปกของรุ่น = รูป sort 0 ของสีที่รหัสน้อยที่สุดที่มีรูป — สำเนาไว้ให้ query ง่าย';

-- ── วิวสาธารณะ: รูปต้องเดินคู่กับสี ───────────────────────────────────
-- คอลัมน์ที่ประกาศไว้คือเส้นแบ่งความปลอดภัย จึงไล่ชื่อทีละคอลัมน์เหมือนเดิม ห้าม select *
-- ชุดคอลัมน์บนสุด "ไม่เปลี่ยน" (เว็บขายรถที่เขียนไปแล้วยังอ่านได้)
-- ที่เปลี่ยนคือข้างใน colors[] มี card/full ของสีนั้น และ photos[] บอกด้วยว่าเป็นของสีไหน
create or replace view pub.model
with (security_barrier = true) as
select
  v.code,
  v.model_name                        as model,
  coalesce(v.model_th,'')             as model_th,
  coalesce(v.category,'')             as cat,
  v.cc,
  v.model_year                        as year,
  ph.retail,
  v.photo_url                         as photo,
  (select jsonb_agg(jsonb_build_object(
             'code', c.color_code,
             'name', c.color_name,
             'card', mc.path_card,
             'full', mc.path_full)
            order by c.color_code)
     from public.model_color c
     left join lateral (select p2.path_card, p2.path_full
                          from public.model_photo p2
                         where p2.variant_id = c.variant_id
                           and p2.color_code = c.color_code
                           and p2.sort = 0
                         limit 1) mc on true
    where c.variant_id = v.id)                                               as colors,
  (select jsonb_agg(jsonb_build_object('color', mp.color_code,
                                       'card', mp.path_card, 'full', mp.path_full)
            order by mp.color_code, mp.sort)
     from public.model_photo mp where mp.variant_id = v.id)                  as photos,
  -- จำนวนคันไม่เคยออกจากเซิร์ฟเวอร์ ยุบเป็นถังตั้งแต่ในวิว
  case when av.n = 0 then 'order'
       when av.n <= ls.low then 'low'
       else 'ready' end                                                      as availability
from public.model_variant v
cross join lateral (select coalesce((select value::int from public.app_setting
                                      where key = 'low_stock'), 2) as low) ls
left join lateral (select p.retail from public.price_history p
                    where p.variant_id = v.id and p.effective_from <= current_date
                    order by p.effective_from desc limit 1) ph on true
left join lateral (select count(*) as n from public.motorcycle_unit u
                    where u.variant_id = v.id and u.status = 'available') av on true;

grant select on pub.model to anon, authenticated;
