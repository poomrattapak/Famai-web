-- 30 · ตัดเงินที่ต้นทาง (v1.50 — โหลดข้อมูลกลับ ครึ่งหลัง)
--      เจ้าของสั่ง 31 ส.ค. 2569: ผสานจุดแข็งอีกโปรเจกต์ทาง ก. — ข้อ "server-side money":
--      ต้นทุนรถต้องไม่เดินทางไปถึง client ของคนที่ไม่มีสิทธิ์เงินเลย ไม่ใช่แค่ซ่อนบนจอ
--      (ของเดิม: motorcycle_unit ส่ง cost ให้ทุก role ที่ RLS สาขาอนุญาต แล้วค่อยปิดที่จอ)

-- (ก) helper: ผู้ใช้คนนี้มีสิทธิ์เห็นเงินไหม — กติกาเดียวกับ permR('data:money') ฝั่งแอป:
--     ค่าที่แอดมินตั้งใน app_setting key 'perms' ชนะ (ต่อ role) · ไม่ได้ตั้ง = ตามบิต money
--     เดิมของ role (admin/manager/acct/hr) · แถว admin ไม่รับค่าทับเช่นเดียวกับฝั่งแอป
--     stable + security definer + search_path ตายตัว — แบบแผนเดียวกับ is_all_branch() (mig 05)
create or replace function app_can_money() returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(bool_or(
    r.code = 'admin'
    or case when s.val is null
            then r.code in ('manager','acct','hr')
            else s.val <> 'none' end), false)
  from app_user_role ur
  join role r on r.id = ur.role_id
  left join lateral (
    select value -> r.code ->> 'data:money' as val
    from app_setting where key = 'perms') s on true
  where ur.user_id = auth.uid()
$$;

-- (ข) วิวรถสำหรับอ่าน: คอลัมน์เงิน (cost/cost_vat) ออกจากวิวเป็น null เมื่อไม่มีสิทธิ์
--     security_invoker = RLS สาขาของ motorcycle_unit ยังคุมผู้เรียกตามเดิม
--     **รายชื่อคอลัมน์ของวิวคือเส้นแบ่งความปลอดภัย — ห้าม select *** (กฎโปรเจกต์)
--     แบนรายละเอียดรุ่น/สาขาเข้าวิวเลย ฝั่งแอปไม่ต้อง embed (ลดรูปแบบ query ที่ต้องดูแล)
create or replace view unit_v
with (security_invoker = true) as
select u.id, b.code as branch_code, v.code as variant_code,
       v.model_name, v.model_th, v.category, v.cc, v.model_year,
       u.color_code, u.sku, u.engine_no, u.frame_no, u.status, u.received_at,
       case when app_can_money() then u.cost end     as cost,
       case when app_can_money() then u.cost_vat end as cost_vat,
       u.retail, u.is_clearance, u.price_note,
       u.src_file, u.recv_no, u.po_no, u.po_date, u.supplier_inv_no
from motorcycle_unit u
join branch b        on b.id = u.branch_id
join model_variant v on v.id = u.variant_id;

revoke all on unit_v from anon;
grant select on unit_v to authenticated;
comment on view unit_v is
  'ทางอ่านรถของแอป — cost/cost_vat ถูกตัดเป็น null ตั้งแต่ฐานเมื่อผู้เรียกไม่มีสิทธิ์ data:money';

-- (ค) ผลพวงของการตัด cost: คนไม่มีสิทธิ์เงินขายรถ → แอปส่ง sale.cost/gross_profit เป็น null
--     ตามกฎ §9i ต้องแช่ต้นทุน ณ วันขายลงหลักฐาน — ให้ฐานเติมเองจากคันจริงตอน insert
--     (trigger จึงเขียนข้อมูล ต้องเป็น plpgsql ปกติ ไม่ใช่ stable — บทเรียน mig ก่อน)
create or replace function sale_fill_cost() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.cost is null and new.unit_id is not null then
    select cost into new.cost from motorcycle_unit where id = new.unit_id;
  end if;
  if new.gross_profit is null and new.net_price is not null and new.cost is not null then
    new.gross_profit := new.net_price - new.cost - coalesce(new.freebie_cost, 0);
  end if;
  return new;
end $$;

drop trigger if exists sale_fill_cost on sale;
create trigger sale_fill_cost before insert on sale
  for each row execute function sale_fill_cost();
