# Famai Motor Group — ระบบหลังบ้านร้านมอเตอร์ไซค์ยามาฮ่า

ทุกอย่างสื่อสารเป็น**ภาษาไทย** — โค้ดคอมเมนต์ ข้อความในแอป commit message เอกสาร และคำตอบต่อเจ้าของ

## โครงสร้าง

- **แอปทั้งตัวคือ `index.html` ไฟล์เดียว** (~6,600 บรรทัด) — vanilla JS, ไม่มี build step, ไม่มี `package.json`, ไม่มีไลบรารีนอก, deploy ตรงขึ้น Vercel
- CSS อยู่ใน `<style>` เดียว (บรรทัด ~14-870) token ทั้งหมดรวมที่ `:root` — **ห้ามเขียนสี hardcode ใหม่ ให้ใช้ token**
- ฐานข้อมูลจริง: Supabase project `famai-motor` (`hpsmjavfvrdctclmlmhp`) org `Famai-motor` แพ็ก free
- SQL ทั้งหมดอยู่ `supabase/migrations/` — แก้ schema = เพิ่มไฟล์ migration ใหม่เสมอ ห้ามแก้ไฟล์เก่า
- เอกสาร: `docs/00`–`08` · ถ้าเริ่มงานใหม่อ่าน `docs/08-state-and-handoff.md` ก่อน
- branch ทำงาน: `claude/start-b18xi3` · push ทุก commit · ห้ามเปิด PR เว้นแต่เจ้าของสั่ง
- งานค้าง/ticket เก็บเป็นไฟล์ใน `.claude/issues/` (ไม่ส่งให้ลูกค้าตอน deliver)

## ทดสอบ

```bash
node tools/qa/suites/syntax.js    # 0 วินาที — รันก่อนเสมอ ถ้าตัวนี้แดง ที่เหลือไม่มีความหมาย
node tools/qa/run.js              # ทั้ง 33+ ชุด ~10-15 นาที (3 งานพร้อมกัน)
node tools/qa/run.js geo clock    # เฉพาะชุดที่ชื่อมีคำนี้
```

- เส้นฐาน: เขียวครบทุกชุด — ชุดไหนแดงโดยไม่ได้แก้อะไร ให้สงสัยสภาพแวดล้อมก่อนโค้ด
- ด่านตรวจใหม่ทุกตัวต้องพิสูจน์แบบ mutation: **ถอด guard ออกแล้วเทสต์ต้องแดง** ถ้ายังเขียว = เทสต์อ่อนหรือโค้ดนั้นไม่มีเหตุผลจะอยู่
- ทดสอบสิทธิ์ = เรียกฟังก์ชันบันทึกตรง ๆ ไม่ใช่ดูว่าปุ่มถูกซ่อน
- Playwright อยู่ที่ `/opt/node22/lib/node_modules/playwright` + Chromium `/opt/pw-browsers/chromium` — path อยู่ใน `tools/qa/suites/env.js` ที่เดียว

## กับดักสภาพแวดล้อม (เสียเวลามาแล้วจริง — อย่าเหยียบซ้ำ)

- `pgrep -f`/`pkill -f` ที่แพตเทิร์นตรงกับ command line ของตัวเอง จะเจอ/ฆ่าตัวเอง — รอด้วย `kill -0 <pid>` · ปิดพอร์ตด้วย `fuser -k 8123/tcp`
- พอร์ต 8123 ใช้ร่วมกันระหว่าง `tools/qa/run.js` กับ `tools/manual/build.js` — ชนกัน ต้องปิดตัวหนึ่งก่อน
- เบราว์เซอร์ในกล่องทดสอบ**ออกอินเทอร์เน็ตไม่ได้** — ยิง API จริงใช้ `curl` · ในหน้าเว็บใช้ `page.route` + fixture ใน `tools/qa/suites/fixtures/`
- Node พาร์ส ISO string เป็น UTC แต่แอปตั้ง `Asia/Bangkok` — เทียบเวลาให้คำนวณ**ในหน้าเว็บ** ไม่ใช่ใน Node
- proxy หมุน ~10 IP ขาออก — เทสต์ rate-limit ทาง HTTP ไม่มีวันติด ต้องพิสูจน์ใน SQL
- `app_setting.value` เป็น `jsonb` — string ต้อง `to_jsonb('x'::text)` ไม่งั้น `22P02`
- ฟังก์ชัน SQL ที่เขียนข้อมูลต้องเป็น `volatile` — `stable` จะ apply ผ่าน advisor เงียบ แต่**พังทุกครั้งที่เรียกจริง**
- `pgcrypto` อยู่ schema `extensions` → เขียน `extensions.gen_random_bytes`
- migration ที่ apply ผ่าน**ไม่ได้แปลว่าใช้ได้** — ต้องยิงจริงทุก endpoint ด้วยสิทธิ์ของคนที่จะใช้จริง (anon/authenticated)

## ความปลอดภัย

- ห้าม commit / เขียนลงไฟล์: รหัสผ่านฐานข้อมูล, `SUPABASE_SERVICE_ROLE_KEY`, Personal Access Token
- publishable key (`sb_publishable_...`) ปลอดภัยโดยดีไซน์ commit ได้ — เส้นแบ่งความปลอดภัยจริงคือ RLS
- วิว Postgres รันด้วยสิทธิ์เจ้าของ — **รายชื่อคอลัมน์ของวิวคือเส้นแบ่งความปลอดภัย** ห้าม `select *`
- schema `pub` = สาธารณะ · `public` = ห้าม anon แตะ — กฎเดียวจบ
