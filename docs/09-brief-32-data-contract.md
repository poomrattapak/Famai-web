# สัญญาข้อมูลบรีฟ 6 ก.ย. 2569 · migration 32–33

ใช้ร่วมกับ migration `20260906094608_32_brief_workflows.sql`, `20260906102311_33_permission_guards.sql` และหน้าเว็บรอบบรีฟเดียวกัน ต้องผ่าน QA ร่วมก่อน apply จริง ห้ามนำไฟล์ SQL ทดสอบไป apply เป็น migration

## ข้อมูลที่หน้าเว็บอ่านและเขียน

| ตาราง | คอลัมน์/พฤติกรรมใหม่ |
|---|---|
| `customer` | ใช้ `owner_id` UUID เดิม เพิ่ม `note`, `finance_history` JSON array, `updated_at`, `created_by`, `updated_by`, `archived_at`, `archived_by`, `archived_reason` |
| `finance_case` | ก่อนขายให้ `sale_id=null`; เพิ่ม `variant_id`, `variant_code`, `model_name`, `color_code`, `color_name`, `list_price`, `discount`, `down_payment`, `term_months`, `rate_pct`, `monthly_installment`, `loan_total`, `pay_now`, `note`, `reject_with`, `reject_note` และเวลา/ผู้สร้าง/ผู้แก้ |
| `sale` | `finance_case_id`, `allocated_by`, `updated_at`; `fin_approval.at/by_id` ประทับโดยเซิร์ฟเวอร์ |
| `registration` | `delivered_by`, `delivered_recorded_at`, `updated_at`; `delivered_at` เป็นวันส่งมอบจริง ใช้บวกเดือนปฏิทิน |
| `quotation` | `seller_id`, `seller_name`, `seller_phone`, `pay_method` (`cash`/`finance`), `snapshot` JSON; เงินสดให้ `quotation_option.finance_id=null` |
| `service_job` | `model_name` พิมพ์เองสำหรับรถนอกร้าน, `next_appointment_at` timestamptz; ใช้ `customer_id`, `engine_no`, `frame_no` เดิม และ `unit_id=null` ได้ |
| `follow_up_task` | `title`, `amount` nullable, `task_source`, `parent_task_id`, `service_job_id`, `appointment_at` timestamptz และเวลา/ผู้สร้าง; `due_at` จากนัดหมายคิดวันตาม Asia/Bangkok |
| `notification_seen` | คีย์ร่วม `(user_id, notification_id)`; `seen_at` เป็นเวลาเซิร์ฟเวอร์; อ่าน/เขียนเฉพาะผู้ใช้ตัวเอง |

`task_source` มี `legacy`, `delivery_month`, `manual`, `service_next` งานเดิมยังอยู่ครบ งานอัตโนมัติใหม่สร้างจากการมี `registration.delivered_at` ครั้งแรกเท่านั้น โดยกำหนดหนึ่งงานต่อใบขายและบวกหนึ่งเดือนปฏิทิน (31 ม.ค. → 28 ก.พ.) UI เตือนก่อนครบกำหนด 7 วัน หลังบันทึกส่งมอบต้องอ่านงานจาก DB เพื่อรับ UUID จริงก่อนทำเครื่องหมายเสร็จ

อย่าส่ง timestamp ย้อนหลังเพื่อจัดลำดับดีล เซิร์ฟเวอร์คง `created_at` เดิมและประทับ `updated_at` รวมถึงแตะลูกค้าเมื่อข้อมูลขาย/ไฟแนนซ์/จอง/ทะเบียน/บริการ/ติดตามเปลี่ยน

## RPC ที่ต้องรอการตอบรับก่อนเปลี่ยนสถานะในหน้าเว็บ

`create_sale_bundle(p_customer jsonb, p_sale jsonb, p_registration jsonb, p_receivable jsonb, p_booking uuid, p_gifts jsonb)` คืน `{sale, registration, receivable, finance_case}`

- หน้าเว็บบันทึกลูกค้าก่อน แล้วส่ง `p_customer=null` ได้ ส่วน `p_sale` ใช้ชื่อคอลัมน์ตารางและ UUID ของใบขายที่สร้างไว้สำหรับ retry
- ผู้เปิดขายต้องเป็น admin/manager มี `page:sell=write` และ `act:allocateUnit=write` ใบขายผ่อนต้องอ้างเคสอนุมัติซึ่งลูกค้า/สาขา/รุ่น/สี/ไฟแนนซ์/ตัวเลขเงื่อนไขตรงกับคันที่เลือก
- RPC สร้างใบขายและทะเบียน เชื่อมเคส ตัดสถานะรถ อัปเดตการจอง ตัดจำนวนของแถม และเพิ่มลูกหนี้เมื่อส่ง `p_receivable` ในธุรกรรมเดียว ห้ามหน้าเว็บ queue ผลข้างเคียงเหล่านี้ซ้ำ
- `p_gifts` เป็น array ที่มี `id` และ `qty`; ของแถมชื่ออิสระให้ `id=null` ได้ ความล้มเหลวท้ายธุรกรรมย้อนกลับทั้งชุด
- การ retry ด้วย sale ID เดิมและข้อมูลหลักเดิมคืนรายการเดิมโดยไม่ตัดสต๊อกซ้ำ

`catalog_save_variant(p_code text, p_data jsonb)` รับ `is_new`, `model_name`, `model_th`, `model_year`, `category`, `cc`, `retail`, `cost`, `vat`, `colors:[{code,name}]` คืน `{variant, colors, price}`

- ใช้ `page:settings=write`; normalize รหัสด้วย trim/uppercase และยอมรับ 1–40 ตัวตาม `^[A-Z0-9][A-Z0-9._-]{0,39}$`
- เก็บรุ่น สี และราคาพร้อมกัน เก็บสีเก่าที่ธุรกรรมเคยใช้; `colors` คืนทั้ง `code/name` และ `color_code/color_name`
- ผู้ไม่มี `data:money` ส่ง `cost/vat=null`; รุ่นเดิมรักษาต้นทุนล่าสุด และผล RPC ปิดค่าต้นทุน รุ่นใหม่ที่ยังไม่มีต้นทุนต้องให้ผู้มีสิทธิ์บันทึกก่อน ไม่เติมศูนย์แทน

## ขอบเขตสิทธิ์และข้อมูลเดิม

SQL อ่าน `app_setting.perms` แบบรวมสิทธิ์สูงสุดของทุกบทบาท และคงค่าเริ่มต้นตรงกับ UI หน้าอ่านอย่างเดียวไม่ผ่านด่านเขียนแม้ action เป็น write

- เซลล์เห็นและแก้เฉพาะลูกค้าของตัวเอง รวมถึงตารางลูกที่เชื่อมลูกค้า การมี stock/hr/tech เพิ่มไม่ยกเว้น ownership; admin/manager/acct/care/reg มีขอบเขตตามหน้าที่
- เจ้าของลูกค้าเก่าเติมจาก salesperson ของใบขายล่าสุดเฉพาะเมื่อมีหลักฐาน รายที่หาไม่ได้ยังไม่กำหนดเจ้าของ ให้ผู้บริหารจัดสรร
- การเงินอนุมัติใช้ `act:finApprove` ตามเดิม (admin/acct); ผู้จัดคันไม่รับสิทธิ์อนุมัติการเงินเพิ่มโดยอัตโนมัติ
- การส่งมอบทั้งเงินสดและผ่อนต้องผ่านการเงินภายใน และผ่อนต้องผ่านไฟแนนซ์ด้วย วันอนาคตหรือการข้ามชื่อขั้นตอนไม่ผ่าน ตรวจแถวใบขายด้วย `FOR UPDATE` ร่วมกับการเปลี่ยนเคสและการเงิน เพื่อให้คำสั่งพร้อมกันเห็นผลล่าสุด หลังส่งมอบห้ามเปลี่ยนผลการเงินหรือล้างวันส่งมอบ
- เคสที่จัดคันใหม่แล้วคงผลและ snapshot เดิม เคสเก่าที่ยังไม่มี snapshot เดินผลต่อได้ก่อนส่งมอบ แต่ผลใหม่ทำให้การเงินกลับรอตรวจ ห้ามถอดหรือเปลี่ยนใบขายที่เชื่อมแล้ว
- ห้ามเก็บลูกค้าเข้าคลังหากมีขายยังไม่ส่งมอบ จองอยู่ หรือเคสก่อนขายที่ยังไม่ปฏิเสธ/ยกเลิก การสร้างดีลใหม่ล็อกและตรวจสถานะลูกค้าเช่นกัน การเก็บเข้าคลังไม่ลบประวัติ
- งานบริการบันทึกได้เมื่อ `page:service=write` หรือ `page:aftercare=write` พร้อม `act:care=write` ฝ่าย care อ่านลูกค้าต่างเซลล์ได้ตามหน้าที่
- `famai_private` เป็น schema ภายใน ห้ามเพิ่มใน exposed schemas ของ Data API; RPC สาธารณะใหม่ไม่อนุญาต anon

ขอบเขตนี้ไม่ปิด issue 004 ทั้งหมด: การอ่านรถของแอปต้องใช้ `unit_v` ต่อไป การ revoke ต้นทุนตาราง `motorcycle_unit` จะทำให้ upsert เดิมเสีย จึงยังต้องมีงานแยกย้ายผู้เขียนรถทุกจุดเข้า RPC ก่อนปิดสิทธิ์คอลัมน์ Migration นี้จำกัด ownership ของข้อมูลลูกค้าและป้องกันการเปลี่ยนต้นทุนผ่าน catalog ใหม่ แต่ไม่อ้างว่าปิดทางอ่านเงินทุกตารางฐานแล้ว

## ด่านตารางร่วมใน migration 33

ด่านเขียนตรวจที่ PostgreSQL แม้ REST caller จะข้ามปุ่มในหน้าเว็บ โดยคง RLS ขอบเขตสาขาเดิมไว้ สิทธิ์สำหรับตารางร่วมแบ่งตามคอลัมน์ที่เปลี่ยน:

| งาน | ด่านที่บังคับ |
|---|---|
| รับ/นำเข้าคันรถ | หน้า recv/imp เขียนได้; การเปลี่ยนราคาสต๊อกต้อง stock + settings เขียนได้และ act:editFin |
| สถานะ/สาขารถ | ต้องมีรายการจอง ขาย หรือโอนต้นทาง พร้อม page/action ของงานนั้น; งานหนึ่งไม่ใช้สิทธิ์นี้เปลี่ยนต้นทุนหรือข้อมูลรับรถ |
| อะไหล่/ของแถม | ตรวจ role ของแท็บ parts ตามเดิม; service ตัดจำนวนอะไหล่ได้ แต่แก้ชื่อ/ราคา/ต้นทุนไม่ได้; เปิดขายตัดของแถมได้แม้ parts เป็น read |
| การตรวจเงิน | ขายปลีกใช้ deal, ขายส่งใช้ invoice, ค่าใช้จ่ายใช้ expense, รับชำระใช้ ar โดยต้องมีหน้าต้นทางเป็น write พร้อม act:finApprove; การสร้างลูกหนี้ใน sale bundle ใช้สิทธิ์จัดคันได้ |
| ตั้งค่า/ปฏิทิน | branch/company/partner/ราคา wholesale, site, event/holiday, model_photo ตรวจ page/action ตรงกับ UI; app_setting และการจัดผู้ใช้คง admin |
| บุคลากร | คำขอยื่นเองและเริ่มรออนุมัติ; ผู้ตรวจต้องเป็นคนอื่น มี hr write + act:hrApprove และแก้เนื้อหาเดิมแฝงไม่ได้; เวลาผู้ตรวจประทับที่เซิร์ฟเวอร์ |
| งานติดตาม | UPDATE เปลี่ยน customer/sale/branch/source/service/parent ของงานเดิมไม่ได้ ป้องกันย้าย legacy ไปใช้สิทธิ์งาน care |
| เลขเอกสาร/ลงเวลา | ตรวจสิทธิ์จาก trigger แม้คำสั่งมาจาก SECURITY DEFINER RPC; PATCH ตัวนับตรงไม่ได้; self attendance ต้องผ่าน punch_clock ซึ่งตรวจหลักฐานเดิม |
| รูป | Storage model-photo ต้อง settings write; hr-photo ต้อง hr write และคงด่านเจ้าของ path เดิม |

คำสั่งที่แก้คันรถบางคอลัมน์ต้องใช้ PATCH (`dbPatch`) ส่วนรับรถใหม่ใช้ INSERT ข้อมูลครบ การใช้ upsert `{id,status}` จะไม่ผ่าน NOT NULL ก่อนถึงขั้น conflict จึงไม่ใช่เส้นทางอัปเดตที่รองรับ

## การตรวจและข้อจำกัดของสภาพแวดล้อม

```sh
npm install --prefix /tmp/famai-qa --ignore-scripts @electric-sql/pglite@0.5.8
PGLITE_PACKAGE=/tmp/famai-qa/node_modules/@electric-sql/pglite node tools/qa/sql/brief32-pglite.mjs --mutations
```

Runner ใช้ PostgreSQL WASM จริง สร้าง auth/storage ขั้นต่ำและ pgcrypto ในฐานชั่วคราว แล้ว replay migration เดิมทุกไฟล์โดยไม่แก้ SQL (01–34 รวม 35 ไฟล์) ทดสอบด้วย `SET ROLE authenticated/anon` และ JWT สมมติภายในธุรกรรม rollback ตรวจคอลัมน์จาก `q2000` ใน `index.html` ด้วย สามารถระบุ `--source /absolute/path/index.html` เพื่อตรวจ worktree ที่รวม UI แล้ว

ผล ณ เวลาส่งงาน: 98 assertions ผ่าน, 36 mutations ถูกจับทั้งหมด, หน้าเว็บรวมผ่าน 27 query/302 คอลัมน์ ไม่มีผู้ใช้ทดสอบเหลือหลัง rollback

PGlite ไม่แทนการทดสอบ HTTP/PostgREST, embedded relations, Storage หรือการชนกันของหลาย connection จริง กลไก concurrency ตรวจจากการล็อกใบขายจน transaction สิ้นสุด; PostgreSQL อาจยกเลิกหนึ่งคำสั่งเมื่อพบ deadlock ซึ่งปลอดภัยกว่าการรับผลอนุมัติเก่า UI ต้องแสดงข้อผิดพลาดและให้ลองใหม่

## สถานะฐานข้อมูลจริง · รอบ v1.57

วันที่ 6 ก.ย. 2569 UTC ใช้เครื่องมือ Supabase apply_migration ลงฐาน famai-motor สำเร็จทั้ง 32, 33 และ 34 ตามลำดับ ประวัติ production คือ `20260906200933`, `20260906200937`, `20260906200941` ส่วนไฟล์ใน repo คง timestamp ตอนสร้างเดิมไว้ migration 34 สร้างด้วย Supabase CLI 2.116.0 ไม่แก้ต้นฉบับ 32–33

ตรวจ read-only หลังอัปเดตพบ schema `famai_private`, `notification_seen`, `customer.archived_at` ครบ ตารางลูกค้า/ขาย/ไฟแนนซ์/ทะเบียน/ใบเสนอ/บริการ/งานติดตาม/สถานะอ่านเปิด RLS พร้อม policy และ RPC ทั้งสามเป็น SECURITY INVOKER, authenticated เรียกได้, anon เรียกไม่ได้ จำนวนลูกค้า ใบขาย และงานบริการก่อน–หลังยังเป็น 0 จึงไม่มีข้อมูลทดสอบหลงเหลือบนระบบจริง

ปัญหา auto-review ที่เคยบล็อกในแชทก่อนสิ้นสุดแล้ว ไม่ต้องรันไฟล์ manual 32–33 ซ้ำ รายละเอียดตรวจหน้าเว็บและข้อจำกัดที่ยังคงอยู่ดู [สถานะส่งมอบ](08-state-and-handoff.md) และ [บันทึกเผยแพร่](10-release-manual.md)

## เพิ่มเติมรอบส่งมอบ: migration 34

`public.create_care_service(p_request jsonb)` ใช้สิทธิ์ผู้เรียกและ RLS รับ UUID คำขอ/ลูกค้า/สาขา, ชื่อและเบอร์ลูกค้าใหม่, เลขรถ, รุ่นที่พิมพ์เอง, รายละเอียด, amount nullable และ appointment_at nullable บันทึกลูกค้า ใบงาน งานประวัติ และนัดถัดไปพร้อมกัน คืน `{customer,job,tasks}` ก่อนหน้าเว็บเพิ่มรายการจริง การลองใหม่จากฟอร์มเดิมส่ง UUID เดิมเพื่อคืนรายการเดิมโดยไม่ออกเลขซ้ำ

สิทธิ์ต้องมี act:care พร้อมสิทธิ์เขียนหน้า service หรือ aftercare และสิทธิ์สาขา ข้อมูลที่อยู่ในรถของลูกค้าคนอื่นใช้เปิดบริการให้คนใหม่ไม่ได้ การปิดงานใช้ PATCH ที่รอผลและอ่านเวลา done_at จากฐาน ไม่มีการเข้าคิวแล้วแสดงสำเร็จล่วงหน้าในโฟลวใหม่นี้

เอกสารสรุปบรีฟสองกลุ่มผู้อ่านอยู่ [docs/brief](brief/README.md) และสร้างซ้ำด้วย tools/brief/build.js
