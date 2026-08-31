-- 31 · ซ่อม default ของ sale.public_token (พบตอนยิงพิสูจน์ v1.50)
--      default ของคอลัมน์เรียก pub.gen_token() แต่ role authenticated ไม่มีสิทธิ์ execute —
--      insert การขายที่ "ไม่ส่ง public_token มาเอง" จึงพัง 42501 ทั้งแถว
--      แอปรอดมาตลอดเพราะ saveSale ส่ง token เองทุกครั้ง แต่ invariant ที่ตั้งใจไว้
--      ("ทุกทางที่สร้างการขายได้รหัสติดตามครบ" — คอมเมนต์ใน saveSale) ไม่เคยเป็นจริง
grant execute on function pub.gen_token() to authenticated;
