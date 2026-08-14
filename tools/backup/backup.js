/* สำรองฐานข้อมูล famai-motor ทั้งชุดเป็นไฟล์ JSON (บรีฟรอบ 1 · A2)
   ใช้แทน backup อัตโนมัติของแพ็ก Pro ที่ยังไม่ได้สมัคร — รันเองได้ทุกวัน/ตั้ง cron ก็ได้

   วิธีใช้:
     SUPABASE_URL=https://hpsmjavfvrdctclmlmhp.supabase.co \
     SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx \
     node tools/backup/backup.js [โฟลเดอร์ปลายทาง]

   - ต้องใช้ service role key เพราะต้องอ่านข้ามทุกสาขาโดยไม่ติด RLS
   - **ห้ามเขียนคีย์ลงไฟล์ใด ๆ** ส่งผ่านตัวแปรสภาพแวดล้อมเท่านั้น (กฎความปลอดภัยของโปรเจกต์)
   - ผลลัพธ์: backups/2569-08-14/<table>.json + _manifest.json (นับแถว+เวลา)
   - กู้คืน: ใช้ไฟล์ JSON ยิงกลับผ่าน REST upsert ทีละตาราง (ดู README.md) */
const fs = require('fs');
const path = require('path');

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ก่อนรัน (ผ่าน env เท่านั้น ห้ามใส่ในไฟล์)');
  process.exit(2);
}

/* ตารางทั้งหมดที่มีข้อมูลของร้าน — เรียงตามลำดับ FK เพื่อให้ไฟล์กู้คืนได้ตามลำดับเดียวกัน */
/* QA รอบส่งมอบ: เทียบชื่อกับ create table ใน supabase/migrations ทุกไฟล์แล้ว —
   เดิม 'credit_case' สะกดผิด (ของจริงคือ finance_case) ทำให้เคสสินเชื่อไม่ถูกสำรองแบบเงียบสนิท
   และตกหล่นอีก 12 ตาราง (เอกสารภาษี/ของแถมรายใบ/ประวัติสถานะ/ใบเสร็จรับเงิน ฯลฯ) */
const TABLES = [
  'company', 'branch', 'role', 'app_user', 'app_user_role', 'app_user_branch',
  'app_setting', 'finance_company', 'model_variant', 'model_color', 'price_history',
  'model_photo', 'motorcycle_unit', 'customer', 'lead_stage_history', 'promotion',
  'sale', 'sale_freebie', 'freebie', 'registration', 'registration_event',
  'finance_case', 'finance_case_event', 'receivable', 'receipt_payment',
  'commission_rule', 'document', 'wholesale_partner', 'wholesale_price',
  'wholesale_sale', 'wholesale_sale_item', 'employee', 'attendance', 'branch_site',
  'leave_request', 'offsite_request', 'company_event', 'company_holiday',
  'service_job', 'service_job_line', 'service_reminder', 'part', 'part_movement',
  'expense', 'expense_category', 'payroll_period', 'payroll_line', 'follow_up_task',
  'doc_counter', 'quotation', 'quotation_option', 'unit_transfer', 'import_log',
  'public_lookup_log', 'attachment', 'audit_log',
];

const thaiDate = d => {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);          /* เวลาไทยจาก UTC ตรง ๆ ไม่พึ่ง TZ ของเครื่อง */
  return (t.getUTCFullYear() + 543) + '-' + String(t.getUTCMonth() + 1).padStart(2, '0')
    + '-' + String(t.getUTCDate()).padStart(2, '0');
};

async function pull(table) {
  /* ดึงเป็นหน้า ๆ ละ 1000 กันตารางโต — Range header ของ PostgREST */
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(URL_ + '/rest/v1/' + table + '?select=*', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: from + '-' + (from + 999) },
    });
    if (r.status === 404) return null;                        /* ตารางยังไม่มีในบางรุ่น schema — ข้าม */
    if (!r.ok) throw new Error(table + ' HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

(async () => {
  const out = path.join(process.argv[2] || path.join(__dirname, '..', '..', 'backups'), thaiDate(new Date()));
  fs.mkdirSync(out, { recursive: true });
  const manifest = { at: new Date().toISOString(), tables: {} };
  let total = 0;
  for (const t of TABLES) {
    try {
      const rows = await pull(t);
      if (rows == null) { console.log('  - ' + t + ' (ไม่มีตารางนี้ ข้าม)'); continue; }
      fs.writeFileSync(path.join(out, t + '.json'), JSON.stringify(rows, null, 1));
      manifest.tables[t] = rows.length; total += rows.length;
      console.log('  ✓ ' + t + ' ' + rows.length + ' แถว');
    } catch (e) {
      manifest.tables[t] = 'ERROR: ' + e.message;
      console.error('  ✗ ' + t + ' — ' + e.message);
      process.exitCode = 1;
    }
  }
  fs.writeFileSync(path.join(out, '_manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('เสร็จ — ' + total + ' แถว → ' + out);
  console.log('อย่าลืม: โฟลเดอร์ backups/ อยู่ใน .gitignore ห้าม commit ข้อมูลลูกค้าขึ้น GitHub');
})();
