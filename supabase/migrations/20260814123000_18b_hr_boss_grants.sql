-- v1.19 เก็บงาน — is_hr_boss() (จาก migration 18) ได้ grant default ที่เปิดให้ anon เรียกผ่าน REST ได้
-- ขัดกฎของโปรเจกต์: schema public ห้าม anon แตะ (migration 14 ถอนไว้เฉพาะฟังก์ชันที่มีอยู่ตอนนั้น)
-- authenticated ต้องเรียกได้ต่อ เพราะ RLS policy ฝั่ง offsite/storage เรียกใช้ฟังก์ชันนี้
revoke execute on function is_hr_boss() from anon, public;
