# ฐานข้อมูลจริงบน Supabase

สร้างและใช้งานได้แล้ว — ไม่ใช่แผน เอกสารนี้บอกว่าของอยู่ที่ไหน ต่ออย่างไร และต้องทำอะไรต่อ

---

## 1. โปรเจกต์

| อะไร | ค่า |
|---|---|
| ชื่อโปรเจกต์ | `famai-motor` |
| Project ref | `hpsmjavfvrdctclmlmhp` |
| URL | `https://hpsmjavfvrdctclmlmhp.supabase.co` |
| ภูมิภาค | `ap-southeast-1` (สิงคโปร์ — ใกล้ไทยที่สุด หน่วงประมาณ 20–30 ms) |
| องค์กร | **Famai-motor** (`oegdbwjcondykbtrsorc`) — ย้ายมาจาก Kooruk เมื่อ 10 ส.ค. 2569 |
| แพ็ก | **Free — ฿0/เดือน** |
| Postgres | 17 |

**ที่มีอยู่ตอนนี้** 68 นโยบาย RLS · รุ่นรถ 14 รุ่น · รถ 50 คัน · บัญชีผู้ใช้ 9 ราย · สาขา 3 · ฐานข้อมูล 13 MB

13 MB จาก 500 MB — ที่เหลือรองรับได้อีกหลายปี ตัวที่โตเร็วที่สุดคือ `audit_log`
กับไฟล์แนบ (ไฟล์แนบไปอยู่ Storage 1 GB ไม่กินโควตาฐานข้อมูล)

### ย้าย organization แล้วอะไรไม่เปลี่ยนบ้าง

ย้ายจาก `Kooruk` มา `Famai-motor` เพื่อให้โควตา Egress/Storage ของแพ็กฟรีเป็นก้อนของตัวเอง
(โควตาการใช้งานคิด**ต่อ organization** ส่วนโควตา "2 โปรเจกต์ฟรี" คิด**ต่อคน** ข้าม org — ย้ายแล้วยอดรวมเท่าเดิมจึงผ่าน)

การย้าย org ไม่ได้สร้างเครื่องใหม่และไม่มี dump/restore ทุกอย่างข้างล่างผูกกับ **project ref** ไม่ใช่กับ org
ตรวจซ้ำหลังย้ายจริงแล้วทั้งหมด — **ไม่ต้องแก้ `index.html` และไม่ต้อง deploy ใหม่**

| ตรวจอะไร | ผลหลังย้าย |
|---|---|
| `ref` · URL · publishable key (`sb_publishable_WVL0ff…`) | เหมือนเดิมทุกตัวอักษร (key id `d2bc46b7…` ตัวเดิม) |
| JWT ของ anon key | `ref` ในโทเคนยังเป็น `hpsmjavfvrdctclmlmhp` |
| migration | ครบ 15 ตัว |
| ข้อมูล | 14 รุ่น · 50 คัน · 9 ผู้ใช้ · 3 สาขา |
| นโยบาย RLS | 68 ข้อ |
| `pgrst.db_schemas` บน role `authenticator` | ยังเป็น `public, graphql_public, pub` |
| bucket `model-photo` | ยัง public · อ่านได้ · อัปโดยไม่ล็อกอินไม่ได้ (RLS ปฏิเสธ) |
| `anon` อ่านตารางจริง 14 ตัว | 401 ทุกตัว |
| `pub.model` | 200 · 14 รุ่น · ฟิลเตอร์ด้วย `cost` `vat` `gross_profit` `engine_no` `frame_no` → 42703 ไม่มีคอลัมน์ |
| `pub.order_status` | ยัง `volatile` · เพดาน 20 ครั้ง/ชม. ทำงาน · เคสไฟแนนซ์ไม่ผ่านคืน `กรุณาติดต่อร้าน` |
| บริการ Auth | ตอบปกติ (`invalid_credentials` เมื่อใส่รหัสผิด) |
| advisor | ชุดเดิมเป๊ะ ไม่มีคำเตือนใหม่ |

---

## 2. คีย์

```
NEXT_PUBLIC_SUPABASE_URL=https://hpsmjavfvrdctclmlmhp.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_WVL0ff-x2L0EwngZH8RZiw_4vNISVa_
```

คีย์ `publishable` **เปิดเผยได้ตามการออกแบบของ Supabase** — มันอยู่ในหน้าเว็บอยู่แล้ว
ใครก็เห็นได้ ความปลอดภัยไม่ได้มาจากการซ่อนคีย์ แต่มาจาก **RLS ที่ตัวฐานข้อมูล**
คนที่ไม่ล็อกอินยิง API ตรงจะได้ `[]` เปล่า เซลล์สาขาหนึ่งเห็นเฉพาะรถสาขาตัวเอง

**คีย์ที่ห้ามหลุด** คือ `service_role` (ขึ้นต้น `sb_secret_`) — ข้ามผ่าน RLS ทั้งหมด
ห้าม commit ห้ามใส่ในหน้าเว็บ ใช้เฉพาะฝั่งเซิร์ฟเวอร์ ดู `.env.example`

---

## 3. ทดลองใช้ตอนนี้

เปิดต้นแบบ → กด **"ใช้ข้อมูลจริงจากฐานข้อมูล"** ใต้ปุ่มเข้าสู่ระบบ → กรอกอีเมล + รหัสผ่าน

| อีเมล | บทบาท | เห็นอะไร |
|---|---|---|
| `admin@famai.local` | ผู้ดูแลระบบ | รถทั้ง 50 คัน ทั้ง 3 สาขา |
| `manager@famai.local` | ผู้บริหาร | ทั้ง 3 สาขา |
| `sales1@famai.local` | เซลล์ FMG01 | 29 คัน สาขาเดียว |
| `sales2@famai.local` | เซลล์ FMM01 | 14 คัน สาขาเดียว |
| `sales3@famai.local` | เซลล์ FCG01 | 7 คัน สาขาเดียว |
| `stock@famai.local` | สต๊อก | สาขาตัวเอง |
| `acct@famai.local` | บัญชี | ทั้ง 3 สาขา |
| `hr@famai.local` | บุคคล | ทั้ง 3 สาขา |
| `tech@famai.local` | ช่าง | สาขาตัวเอง |

**รหัสผ่านส่งให้ในแชต ไม่เก็บในรีโป**

ถ้าเชื่อมไม่ได้ (เน็ตหลุด/โปรเจกต์หยุดพัก) ต้นแบบจะเด้งข้อความแล้ว**กลับไปโหมดสาธิตเอง**
ไม่ค้างไม่พัง โหมดสาธิตเดิมยังใช้ได้ทุกอย่างเหมือนเดิม

---

## 4. ข้อมูลที่ลงไว้ — จริงกับสมมุติ

**ของจริงจากไฟล์ยามาฮ่า**

- รถ 50 คัน (FMG01 29 · FMM01 14 · FCG01 7) เลขเครื่อง เลขตัวถัง ต้นทุน วันรับ ครบทุกคัน
- 8 คันไม่มีราคาขายเพราะไม่อยู่ในตารางราคา 5 มี.ค. 2569 — ทุนจม 423,300 บาท
- แบบรถ 14 แบบ · สี 35 สี · ราคา 11 รายการ · สาขา 3 · บทบาท 7 · ค่าตั้งค่า 15

**ที่จงใจเว้นว่างไว้ เพราะยังไม่มีของจริง**

| ช่อง | ทำไม |
|---|---|
| `branch.tax_id` | เลขในไฟล์ยามาฮ่าเป็น**เลขผู้เสียภาษีของไทยยามาฮ่า** ไม่ใช่ของร้าน |
| ชื่อบริษัท / ที่อยู่ / โทร | ในต้นแบบเป็นค่าตัวอย่าง (`ต.ตัวอย่าง` · `02-000-0000`) |
| `finance_company.flat_rate_pct` | ชื่อบริษัทไฟแนนซ์จริง แต่เรตยังไม่ยืนยัน |
| `employee.ssn_no` / `bank_account` / `base_salary` | ข้อมูลพนักงานจริง ยังไม่ได้รับ |

**ที่ไม่ลงเลย** — ยอดขาย ลูกค้า อะไหล่ ของแถม โปรโมชั่น ค่าใช้จ่าย ทั้งหมดเป็นข้อมูลสมมุติในต้นแบบ
ลงไปจะปนกับของจริงจนแยกไม่ออก

---

## 5. โครงสร้าง

SQL ที่รันจริงอยู่ที่ `supabase/migrations/` เรียงตามลำดับที่รันได้ทันที

| ไฟล์ | เนื้อหา |
|---|---|
| `01_core_branch_user_vehicle` | สาขา ผู้ใช้ บทบาท แบบรถ สี ราคา คันรถ ลูกค้า |
| `02_sales_registration_finance` | ขาย จดทะเบียน ไฟแนนซ์ ลูกหนี้ รับเงิน โอนย้าย |
| `03_service_parts_expense_hr` | ซ่อม อะไหล่ ค่าใช้จ่าย พนักงาน ลงเวลา ลา |
| `04_payroll_tasks_audit_documents` | เงินเดือน งาน แจ้งเตือน เอกสาร ตัวนับเลข ไฟล์แนบ |
| `05_functions_and_audit` | `my_branches` `is_all_branch` `is_admin` `next_doc_no` + trigger เก็บประวัติแก้ไข |
| `06_rls_enable_and_policies` | เปิด RLS ครบทุกตาราง + นโยบาย 59 ข้อ |
| `07_tighten_grants_and_attachment` | ปิดสิทธิ์ที่ไม่จำเป็น |
| `08_seed_reference_data` | สาขา บทบาท หมวดค่าใช้จ่าย ค่าตั้งค่า ไฟแนนซ์ |
| `09_seed_price_and_units` | แบบรถ สี ราคา และรถ 50 คัน |
| `10_v1_features` | **ยังไม่ apply** — คอลัมน์หลักฐานลงเวลา · `company_event` · เรตรายช่วงงวด · ฯลฯ รอ Phase 1 เริ่มเขียนลงฐานจริง |
| `11_attendance_review` | **ยังไม่ apply** — พิกัด/อุปกรณ์ฝั่งลงเวลาออก · สถานะการตรวจของผู้จัดการ (`review_status/by/at/note`) · `edit_log` หลายรอบ · `photo_tier` ตามอายุรูป · `late_grace_min` |

**สร้างฐานข้อมูลใหม่จากศูนย์** — สร้างโปรเจกต์ Supabase ใหม่ แล้วรันไฟล์ทั้ง 9 เรียงตามชื่อ
ในหน้า SQL Editor หรือ `supabase db push` ถ้าใช้ CLI
(ไฟล์ `10` กับ `11` รันได้เมื่อเริ่มเขียนข้อมูลจริงลงฐาน — ทั้งคู่ใช้ `add column if not exists`
จึงรันซ้ำได้ไม่พัง)

### สิ่งที่ต้องทำเพิ่มตอนย้ายการลงเวลาไปโหมดข้อมูลจริง

1. **โหลด `STAFF` จาก `app_user`** — ตอนนี้ `liveLogin` ไม่โหลด ปุ่มลงเวลาจึงไม่โผล่ในโหมดข้อมูลจริง
2. **Storage bucket `attendance`** — เก็บที่ `attendance/<employee>/<date>/<in|out>.jpg`
   แล้วเก็บ URL ลง `check_in_photo_url` / `check_out_photo_url`
   `sbFetch` ส่งได้แต่ JSON การอัปโหลดไฟล์ต้องเพิ่มทางแยกที่ไม่ตั้ง `Content-Type` เป็น json
3. **งานย่อรูปตามอายุ** ควรทำที่หลังบ้าน (pg_cron หรือ Edge Function) ไม่ใช่ที่เครื่องพนักงาน —
   `photo_tier` มีไว้ให้งานนั้นรู้ว่ารูปไหนย่อไปแล้ว
4. **RLS ของคิวตรวจ** — พนักงานเห็นของตัวเอง ผู้จัดการ/HR เห็นของสาขาตัวเอง แอดมินเห็นทุกสาขา
   ใช้ `my_branches()` / `is_all_branch()` ที่มีอยู่แล้วใน migration 05

### สิ่งที่แก้จากในเอกสารออกแบบ

`docs/03-data-model.md` เป็นเอกสารอธิบาย ก๊อปไปรันตรง ๆ ไม่ผ่าน 5 จุด — แก้แล้วทั้งในไฟล์ migration
และในเอกสาร

1. มีข้อความ markdown หลุดอยู่ในบล็อก ```` ```sql ````
2. `attendance.late_minutes` เขียนเป็น generated column ที่มีวงเล็บว่าง และ**แก้ไม่ได้ด้วยการเติมสูตร**
   เพราะต้องอ่านเวลาเข้างานจาก `app_setting` ซึ่ง generated column ห้ามใช้ subquery → เปลี่ยนเป็น `int` ธรรมดา
3. `document.service_job_id` และ `service_job_line.part_id` อ้างตารางที่ถูกสร้างทีหลัง → สลับลำดับ
4. `sale` ขาดคอลัมน์ `finance_id` → เพิ่ม พร้อมย้าย `finance_company` ขึ้นก่อน
5. `app_user.id` เป็นแค่คอมเมนต์ว่า "= auth.users.id" → ผูก FK จริง `references auth.users(id)`
   และ `role` ขาด `code` ซึ่งเป็นคีย์ที่โค้ดใช้เทียบสิทธิ์ → เพิ่ม

---

## 6. RLS — พิสูจน์แล้วว่าทำงาน

ไม่ใช่แค่เขียนนโยบายไว้ ทดสอบด้วยการล็อกอินจริงผ่าน REST แล้วนับแถวที่ได้

```
แอดมิน       50 คัน · 3 สาขา
เซลล์ FMG01  29 คัน · 1 สาขา
เซลล์ FMM01  14 คัน · 1 สาขา
เซลล์ FCG01   7 คัน · 1 สาขา
บัญชี        50 คัน · 3 สาขา
ไม่ล็อกอิน   []
```

การกรองเกิดที่**ฐานข้อมูล** ไม่ใช่ที่หน้าจอ — ต่อให้แก้ JavaScript ในเบราว์เซอร์
หรือยิง API ตรงด้วย curl ก็ไม่ได้ข้อมูลสาขาอื่น

เลขเอกสารทดสอบเรียก `next_doc_no` ซ้ำ ๆ ได้ `FMG-TAXINV-2569-00001` → `00002` → `00003`
และ `FMM-TAXINV-2569-00001` แยกตัวนับคนละสาขา ไม่ซ้ำไม่ข้าม (รีเซ็ตกลับแล้วหลังทดสอบ)

### คำเตือนสำหรับคนที่มาแก้ต่อ

**ห้ามถอน `execute` ของ `my_branches()` / `is_all_branch()` ออกจาก role `authenticated`**
นโยบาย RLS ถูกประเมินในสิทธิ์ของผู้เรียก ถอนแล้วทุก query จะพังด้วย
`permission denied for function my_branches` — เรื่องนี้เขียนกำกับไว้ใน `comment on function` แล้ว

---

## 7. ที่ต้องทำก่อนใช้งานจริง

### 7.1 เปลี่ยนบัญชีทดสอบเป็นพนักงานจริง

บัญชี `@famai.local` มีไว้พิสูจน์ว่า RLS ทำงาน ไม่ใช่บัญชีใช้งาน

1. Dashboard → Authentication → Add user (อีเมลจริงของพนักงาน)
2. ผูกเข้าตาราง:

```sql
insert into app_user (id, username, full_name, nickname, all_branch)
values ('<uuid ที่ได้จากข้อ 1>', 'somchai', 'สมชาย ใจดี', 'ชาย', false);

insert into app_user_role (user_id, role_id)
select '<uuid>', id from role where code = 'sales';

insert into app_user_branch (user_id, branch_id)
select '<uuid>', id from branch where code = 'FMM01';
```

3. ลบบัญชีทดสอบเมื่อย้ายครบ (ลบใน `auth.users` แล้ว `app_user` ตามไปเองเพราะ `on delete cascade`)

### 7.2 เปิด Leaked Password Protection

Dashboard → Authentication → Policies → เปิด **Leaked password protection**
Supabase จะเทียบรหัสผ่านกับฐาน HaveIBeenPwned ตอนตั้งรหัส ปิดไม่ให้ใช้รหัสที่เคยรั่ว
เป็นสวิตช์ในหน้าเว็บ เปลี่ยนด้วย SQL ไม่ได้ ตอนนี้ยัง**ปิดอยู่** — ควรเปิดก่อนให้พนักงานตั้งรหัสเอง

### 7.3 เติมข้อมูลที่เว้นว่างไว้

```sql
update branch set tax_id = '<เลขผู้เสียภาษีของร้าน>', address = '<ที่อยู่จริง>', phone = '<เบอร์จริง>'
 where code = 'FMG01';

update app_setting set value = '<ชื่อบริษัทตามทะเบียน>' where key = 'company_name';

update finance_company set flat_rate_pct = 1.35, min_down_pct = 15 where name = 'กรุงศรี ออโต้';
```

**เลขผู้เสียภาษีสำคัญที่สุด** — ใบกำกับภาษีที่พิมพ์ด้วยเลขผิดใช้ไม่ได้ทางกฎหมาย

---

## 8. ข้อจำกัดของแพ็ก Free และตอนไหนต้องอัปเป็น Pro

| | Free (ตอนนี้) | Pro ($25 ≈ ฿850/เดือน) |
|---|---|---|
| ฐานข้อมูล | 500 MB | 8 GB |
| Storage | 1 GB | 100 GB |
| สำรองข้อมูล | **ไม่มี** | ย้อนหลัง 7 วัน อัตโนมัติ |
| หยุดพักเอง | **หลังไม่มีการใช้งาน 7 วัน** | ไม่หยุด |
| จำนวนโปรเจกต์ | 2 (ใช้ครบแล้ว) | ไม่จำกัด |

**สองข้อที่ต้องรู้**

*หยุดพักเอง* — ถ้าไม่มีใครแตะฐานข้อมูลติดกัน 7 วัน โปรเจกต์จะถูก pause
เข้า Dashboard กด Restore ก็กลับมา ข้อมูลไม่หาย ตอนทดลองไม่มีปัญหา ตอนใช้จริงมีคนเข้าทุกวันอยู่แล้ว

*ไม่มีสำรองข้อมูล* — ข้อนี้คือเส้นตาย **ก่อนออกใบกำกับภาษีใบแรกต้องอัปเป็น Pro**
เพราะเอกสารภาษีหายแล้วไม่มีอะไรกู้คืน

การอัปเป็น Pro เป็นแค่การเปลี่ยนแพ็กในหน้าเว็บ **ไม่ต้องย้ายข้อมูล ไม่ต้องแก้โค้ด URL เดิม คีย์เดิม**
Dashboard → Settings → Billing → Upgrade

---

## 9. ต้นแบบเชื่อมอย่างไร

`index.html` เรียก REST ของ Supabase ตรง ๆ ด้วย `fetch` — **ไม่โหลดไลบรารีจาก CDN**
เปิดไฟล์แบบ `file://` ออฟไลน์ก็ยังใช้โหมดสาธิตได้เหมือนเดิม

```
POST /auth/v1/token?grant_type=password     → access_token
GET  /rest/v1/app_user?id=eq.<uid>&select=… → ตัวตนและสิทธิ์
GET  /rest/v1/motorcycle_unit?select=…      → รถตามสิทธิ์ (RLS คัดให้เอง)
```

ตอนนี้ต้นแบบ**อ่านอย่างเดียว** — ล็อกอิน ดูสต๊อก ดูรายงานจากข้อมูลจริง
ส่วนบันทึกขาย/ซ่อม/รับเงินยังเป็นโหมดสาธิตในหน่วยความจำ จะต่อของจริงใน Phase 1

---

## 10. migration 10–18 — รันลงฐานข้อมูลจริงแล้ว

รัน 10–15 เมื่อ **9 ส.ค. 2569** · รัน 16–17 เมื่อ **13 ส.ค. 2569** · รัน 18 เมื่อ **14 ส.ค. 2569** ฐานข้อมูลจริงตอนนี้อยู่ที่ **migration 18**

| # | ชื่อ | ได้อะไรมา |
|---|---|---|
| 10 | `10_v1_features` | ปฏิทินบริษัท · ตารางส่วนขยายของ v1.0 |
| 11 | `11_attendance_review` | คิวตรวจการลงเวลา · `late_grace_min` |
| 12 | `12_attendance_sites` | `branch_site` · คอลัมน์ snapshot 14 ช่อง · `punch_clock()` · `meters_between()` · `is_manager()` |
| 13 | `13_model_photo` | bucket `model-photo` (public) · ตาราง `model_photo` |
| 14 | `14_public_api` | สคีมา `pub` · ถอนสิทธิ์ `anon` จาก `public` · `pub.model` · `pub.order_status()` · `sale.public_token` |
| 15 | `15_order_status_volatile` | แก้ `pub.order_status` ให้เป็น `volatile` + เปิดสคีมา `pub` ให้ PostgREST |
| 16 | `16_money_docs` | บรีฟรอบ 1 กลุ่มเงิน: `customer.birth_date` · `sale` เพิ่ม snapshot เงินผ่อน 4 ช่อง + `gifts`/`fin_approval`/`doc_ov` (jsonb) · `finance_company.tiers/terms` · `freebie.price` · `expense.note/approval` — ตรวจแล้วคอลัมน์ครบ 13 ช่อง default ถูกต้อง |
| 17 | `17_company_wholesale` | บรีฟรอบ 1 กลุ่ม ④: ตาราง `company` เหนือ `branch` (ยก 3 แถวสาขาเดิมขึ้นเป็น 3 บริษัท · `branch.company_id`) + ชุดขายส่ง B2B `wholesale_partner/price/sale/sale_item` พร้อม RLS — ตรวจด้วยการสวมบทบาทจริง: เซลล์อ่าน company ได้ 3 แถว/เขียนโดนบล็อก · เปิดบิลขายส่งได้เฉพาะสาขาตัวเอง (ข้ามสาขาโดน 42501) · `anon` โดนปฏิเสธทั้งชุด · `app_setting` คีย์ `perms` (ตารางสิทธิ์ J3) เขียนได้เฉพาะแอดมิน |
| 18 | `18_hr_leave_offsite` | บรีฟรอบ 1 กลุ่ม ⑤: `leave_request` เพิ่ม `evidence/decide_note/created_at` (K10/H6) · ตาราง `offsite_request` (H4) + `company_holiday` (H5) พร้อม RLS · helper `is_hr_boss()` · bucket ส่วนตัว `hr-photo` (รูปลงเวลา `att/<uid>/…` + หลักฐานใบลา `leave/<uid>/…` — เขียนได้เฉพาะโฟลเดอร์ตัวเอง อ่านได้เจ้าตัว+admin/manager/hr) — ตรวจสวมบทบาท: เซลล์อ่านวันหยุดได้/เขียนโดนบล็อก · ยื่นคำขอแทนคนอื่นโดน 42501 · อนุมัติเองไม่ได้ (0 แถว) · HR อนุมัติได้ · `anon` โดนปฏิเสธ |
| 19-26 | — | ไม่ได้ลงรายละเอียดในตารางนี้ · ดูไฟล์จริงใน `supabase/migrations/` และบรรทัดเวอร์ชันใน `docs/08` |
| 27 | `27_wholesale_void` | ยกเลิกบิลขายส่ง (v1.45): `wholesale_sale` เพิ่ม `voided_reason` · `voided_by` · `dest_branch_id` (สาขาปลายทางของบิลในเครือ — เดิมไม่เคยเก็บ) · index บางส่วน `where voided_at is null` · ปิดรู `ws_sale_upd` ที่มีแต่ `using` ไม่มี `with check` (แก้บิลแล้วย้าย `branch_id` ออกนอกขอบเขตตัวเองได้) — **`voided_at` มีอยู่แล้วตั้งแต่ migration 17 แต่ไม่เคยมีโค้ดเขียน** และตารางไม่มี DELETE policy ⇒ soft void เป็นทางเดียว · ⚠️ ไฟล์นี้เขียนไว้ตอน v1.45 แต่**เพิ่งถูก apply จริง 31 ส.ค.** (พบตอนรีวิวว่าตกหล่น — ตรวจซ้ำแล้ว คอลัมน์ 3 ตัว + index + with check ครบ) |
| 28 | `28_double_sell_guard_audit` | v1.48 (ผสานจุดแข็งสาย Next.js): `sale_unit_active_uniq` unique บน `sale(unit_id) where voided_at is null` — กันสองเครื่องขายคันเดียวพร้อมกันที่โครงสร้าง DB · ผูก `audit_changes()` เข้า `wholesale_sale`/`other_doc`/`booking` (ตารางหลังแยกสายที่ mig 05 ยังไม่ครอบ) — **ยิงพิสูจน์แล้ว**: DO block แทรกขายซ้ำคันเดิม → `unique_violation` → rollback สะอาด (sale ยัง 0 แถว) |

สคีมา `pub` เปิดให้ PostgREST เห็นแล้วด้วย
`alter role authenticator set pgrst.db_schemas = 'public, graphql_public, pub'`
(อยู่ท้าย migration 15) **ค่าที่ตั้งกับ role ชนะค่าในหน้า Settings → API → Exposed schemas**
ถ้าวันหลังไปแก้ในหน้าเว็บแล้วไม่มีผล ให้กลับมาดูบรรทัดนั้น

### ตรวจว่ายังดีอยู่

```bash
SB=https://hpsmjavfvrdctclmlmhp.supabase.co
KEY=sb_publishable_WVL0ff-x2L0EwngZH8RZiw_4vNISVa_

# 200 พร้อมรายการรุ่นรถ — เว็บขายรถอ่านได้
curl -s "$SB/rest/v1/model?select=code,model,retail,availability&limit=3" \
  -H "apikey: $KEY" -H "Accept-Profile: pub"

# 401 permission denied — คนนอกอ่านตารางจริงไม่ได้
curl -s "$SB/rest/v1/sale?limit=1" -H "apikey: $KEY"

# 200 {"found": false} — โทเคนมั่วต้องตอบเหมือนโทเคนที่หมดอายุ ไม่บอกว่าอันไหนมีจริง
curl -s -X POST "$SB/rest/v1/rpc/order_status" -H "apikey: $KEY" \
  -H "Content-Profile: pub" -H "Content-Type: application/json" \
  -d '{"p_token":"ZZZZ-ZZZZ-ZZZZ"}'
```

ผลที่ตรวจจริงหลังรันเสร็จ:

| ตรวจ | ผล |
|---|---|
| `anon` อ่าน `public.sale` `customer` `employee` `attendance` `app_user` `branch` `motorcycle_unit` `price_history` `finance_case` `public_lookup_log` | **401 permission denied ทุกตาราง** |
| `anon` อ่าน `pub.model` | 200 · 14 รุ่น · คืน 11 คอลัมน์ที่อนุญาตเท่านั้น |
| `anon` เขียน `pub.model` / เรียก `pub.gen_token()` | ถูกปฏิเสธ |
| `anon` embed จาก `pub.model` ไป `model_variant` `motorcycle_unit` `price_history` `sale` | PGRST200 — ไม่มีทางเดินไปตารางแม่ |
| `anon` อัปไฟล์เข้า bucket `model-photo` | 403 RLS · แต่ **อ่านสาธารณะได้** (404 ไม่ใช่ 401) |
| เพดาน 20 ครั้ง/ชม. ของ `pub.order_status` | เกิน 20 → ปฏิเสธ · ต่ำกว่า → ผ่าน |
| เคสไฟแนนซ์ไม่ผ่าน | คืน `กรุณาติดต่อร้าน` · ทั้ง payload ไม่มีคำว่า "ไม่ผ่าน"/"ปฏิเสธ" ไม่มีเหตุผล ไม่มีชื่อบริษัทไฟแนนซ์ · เบอร์เป็น `xxx-xxx-5678` · ชื่อเหลือชื่อต้น |

### สองบั๊กที่เจอตอนรันจริง — จดไว้กันพลาดซ้ำ

**1 · `app_setting.value` เป็น `jsonb` ไม่ใช่ `text`**

```sql
insert into app_setting (key,value) values ('geo_mode','watch');
-- 22P02  invalid input syntax for type json · Token "watch" is invalid
```

`watch` เปล่า ๆ ไม่ใช่ JSON ที่ถูกต้อง ตัวเลขอย่าง `'120'` ผ่านเพราะเป็น JSON number
ข้อความต้องเขียนเป็น `to_jsonb('watch'::text)` หรือ `'"watch"'`
migration 08 ทำถูกอยู่แล้ว (`('work_start','"08:30"')`) — 12 ต่างหากที่พลาด

**2 · ฟังก์ชันที่เขียนข้อมูลต้องเป็น `volatile`**

`pub.order_status` ประกาศเป็น `stable` แต่ตัวมันเอง `insert` ลง `public_lookup_log`
เพื่อจำกัดอัตรา Postgres จึงปฏิเสธ **ทุกครั้ง** ที่เรียก:

```
0A000  INSERT is not allowed in a non-volatile function
```

ที่อันตรายคือ **ใน SQL Editor ไม่มีทางเจอ** เพราะการรัน `create function` สำเร็จ
ต้องยิงเรียกจริงผ่าน PostgREST ถึงจะโผล่ — บทเรียนคือ *apply แล้วยังไม่จบ ต้องยิงจริงทุก endpoint*

### ยังต้องทำด้วยมือ

1. **เปลี่ยนรหัสผ่านฐานข้อมูล** — Settings → Database → Reset database password
   (รหัสเดิมถูกส่งผ่านแชตเพื่อใช้รันครั้งนี้ ถือว่าเปิดเผยแล้ว)
2. **เปิด Leaked Password Protection** — Authentication → Policies
   advisor เตือนอยู่ว่าปิดอยู่ ระบบจะเทียบรหัสกับฐาน HaveIBeenPwned ให้
3. **เติมเบอร์โทรของสาขา** — `branch.phone` ยังว่างทั้ง 3 สาขา
   หน้าติดตามของลูกค้าบอกว่า "กรุณาติดต่อร้าน" แต่ยังไม่มีเบอร์ให้โทร
