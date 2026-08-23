-- 24 · บทบาทใหม่ "ฝ่ายทะเบียน" (reg — คำตอบเจ้าของข้อ 6: เป็นตำแหน่งใหม่ ดูแลงานป้ายรวมศูนย์ทุกสาขา)
--      + เก็บตก "ฝ่ายบริการ" (care) ที่มีในแอปตั้งแต่ v1.28 แต่ยังไม่เคยมีแถวในตาราง role
-- RLS เดิมกรองตามสาขา (is_all_branch / my_branches) ไม่ได้ผูกกับชื่อ role —
-- ทั้งสองเป็น allBranch ตาม ROLES ในแอป จึงไม่ต้องแก้ policy ใด เพิ่มแถวอ้างอิงพอ

insert into role (code,name,perms) values
 ('care','ฝ่ายบริการ','{"money":false,"allBranch":true,"approve":false,"admin":false}'),
 ('reg','ฝ่ายทะเบียน','{"money":false,"allBranch":true,"approve":false,"admin":false}')
on conflict (code) do nothing;
