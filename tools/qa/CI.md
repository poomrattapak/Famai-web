# ตรวจเว็บอัตโนมัติบน GitHub Actions

ไฟล์ `.github/workflows/brief-qa.yml` ทำงานเมื่อ push เข้าสาขาทำงานหลัก
`claude/start-b18xi3` เมื่อ push เข้าสาขา `work/**` เมื่อเปิด pull request
หรือสั่งเองด้วย `workflow_dispatch` บนสาขาใดก็ได้ ไม่ได้ตั้งขั้นตอนเผยแพร่เว็บ

เดิมด่านนี้ผูกกับ `work/brief-r56-validation` สาขาเดียวทั้งที่ `on.push.branches`
และ `if:` ของ job ทำให้ commit ที่ push เข้าสาขาทำงานหลักไม่เคยถูกตรวจเลย
รอบ v1.57 ถึง v1.60 จึงมีแต่ผลรันมือบนเครื่อง ไม่มีผลจาก CI

ยังควรรวมโค้ดที่ต้องการตรวจทั้งหมดลง commit เดียวกันก่อน push
ผลด่านจึงอ้างอิง commit ที่แน่นอนได้ ดู `commit.txt` ใน artifact
สาขาทำงานหลักตั้ง `cancel-in-progress` ไว้ การ push ถี่ ๆ จะยกเลิกรอบก่อนหน้า
เหลือผลของ commit ล่าสุดเท่านั้น ถ้าต้องการผลของ commit กลางทางให้สั่ง
`workflow_dispatch` บน commit นั้นแยก

งานใช้สิทธิ์ `contents: read` และ checkout แบบ `persist-credentials: false`
ไม่รับ secrets ของฐานข้อมูลหรือ deployment แพ็กเกจติดตั้งในโฟลเดอร์ชั่วคราวของ runner
ไม่สร้าง `package.json` ให้แอป

หลังติดตั้ง Node.js 22, Playwright 1.63.0, Chromium และฟอนต์ไทยแล้ว
ตัวรันจะเข้า Linux network namespace ที่มีเฉพาะ loopback ก่อนเปิดเว็บจำลอง
ดังนั้น browser และ Node ภายในด่านยิง API ภายนอกไม่ได้ แต่ `page.route` และ fixture
ยังทำงานได้ตามปกติ ฐานข้อมูลจริงต้องตรวจแยกตามขั้นตอนส่งงาน

ด่าน `syntax.js` ต้องผ่านก่อน จากนั้นรัน `node tools/qa/run.js` ครบทุกชุด
โดยไม่กรองชื่อหรือข้าม assertion และเก็บรหัสออกเดิมไว้
commit ต้องมี `tools/qa/sql/brief32-pglite.mjs` เพื่อตรวจ migration, สิทธิ์ และ mutation ด้วย
Postgres WASM (`@electric-sql/pglite` 0.5.8) ก่อนด่าน browser และเก็บผลใน `sql.log`
รหัสออกที่ผิดพลาดหรือไม่มีตัวรัน SQL ทำให้งานแดงเช่นเดียวกับด่าน browser
ภาพจาก `ci-visual.js` ใช้ข้อมูลจำลอง 4 บทบาท ที่ 1440 และ 390 พิกเซล
ทั้งธีมสว่างและมืด รวม 68 ภาพ (รวมดีลที่เปิดรายละเอียดและแท็บสิทธิ์) เพื่อให้ผู้ตรวจเปิดดูจริง
ภาพผ่านไม่ได้เปลี่ยนด่านพฤติกรรมที่แดงให้เขียว

ภาพสำคัญ 8 ภาพจัดเป็น contact sheet 4 ใบ พร้อม SHA256
และแบ่ง base64 เป็นบรรทัด `QA_VISUAL_SHEET_CHUNK` ใน job log ของ GitHub เดิม
เพื่อให้ตรวจภาพได้เมื่อบริการส่งไฟล์ artifact ไม่พร้อม โดยไม่ส่งข้อมูลไปที่บริการอื่น
ต้นฉบับทั้งหมดและ sheet ยังอยู่ใน artifact ตามปกติ

ผลตรวจและภาพเก็บใน artifact ของ repository เดิม 14 วัน
`full-qa.log` มีรายละเอียดชุดที่ตก, `visual.log` มีรายชื่อภาพ,
`status.txt` มีรหัสออก และ `screenshots/manifest.json` มี JavaScript error
โฟลเดอร์ `tmp/qa-ci` ถูกละไว้ด้วย `.gitignore` เดิม

การตรวจครั้งแรกต้องดูว่า runner อนุญาต `sudo unshare --net` และติดตั้ง browser ได้
ถ้าสภาพแวดล้อมไม่ผ่าน ด่านต้องแดง ห้ามเอาการแยกเครือข่ายออกเพื่อให้ผ่านเงียบ ๆ
หาก GitHub App ที่ใช้บันทึก commit ไม่มีสิทธิ์แก้ `.github/workflows` ต้องรายงานข้อจำกัดนั้น
ไม่ย้าย source ไปบริการอื่นหรือแทรก token ลง repository

ตรวจ SHA ของ action จาก tag ใน repository ทางการเมื่อ 6 กันยายน 2569:

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [upload-artifact v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)
- [Playwright บน CI](https://playwright.dev/docs/ci-intro)

ตัวช่วย `github_fetch_commit_workflow_runs` กรองเฉพาะ event `pull_request`
จึงยังไม่ครอบรอบที่มาจาก push ให้เรียก API อ่าน
`/repos/poomrattapak/Famai-web/actions/runs?branch=claude%2Fstart-b18xi3&event=push`
(เปลี่ยน `branch` ตามสาขาที่ต้องการ) แล้วตรวจ `head_sha` ให้ตรง commit ที่ต้องการ
ก่อนอ่าน jobs และ artifacts

การแก้ไฟล์ใน `.github/workflows/` ต้องใช้ token ที่มีสิทธิ์ `workflow`
ถ้า push แล้วถูกปฏิเสธ ให้รายงานข้อจำกัดนั้น ไม่ต้องย้ายด่านออกไปไว้ที่อื่น
