/* ด่าน v1.50 — โหลดข้อมูลกลับจากฐานตอน liveLogin (ครึ่งหลังของ "โหลดข้อมูลกลับ" ทาง ก.)
   คำสั่งเจ้าของ 31 ส.ค. 2569: ผสานจุดแข็ง grape ทาง ก. **รวมโหลดข้อมูลกลับด้วย**
   นิยามเสร็จของรอบนี้: รีเฟรชแล้วข้อมูลอยู่ครบ — ทุกตารางธุรกรรมที่ v1.49 เริ่มเขียน
   ต้องถูกโหลดกลับเป็นรูป in-memory เดิมเป๊ะ (mapper ทิศกลับของ dbUp ต่อตาราง)
   + รถโหมดจริงอ่านผ่านวิว unit_v ที่ตัดคอลัมน์เงินตั้งแต่ฐานข้อมูล (server-side money)

   วิธีทดสอบ: stub sbFetch ให้คืน fixture ต่อตาราง แล้วเรียก liveLogin() จริง
   ล็อก:
   [1] การขายกลับมาครบ: branch/finId (map จาก uuid ไฟแนนซ์กลับเป็น id แอป)/docNo/pubToken/
       gifts jsonb/finApproval/ค่างวดที่แช่ไว้ + deliveredAt มาจาก registration.delivered_at
   [2] ลูกค้ากลับมาครบ (full_name→name · source→src · tax_id→idNo)
   [3] การขายที่ยกเลิกแล้ว (voided_at) โหลดเป็น void และระเบียนลูก (REGS/TASKS/AR/FINCASES)
       ของมันต้องไม่ฟื้นขึ้นมา — voidSaleCore ลบในเครื่องแต่แถวในฐานยังอยู่
   [4] งานทะเบียน: stage/plate/stage_log/due/ข้อมูลส่งมอบ
   [5] เคสไฟแนนซ์: สถานะ + log + map บริษัทกลับเป็น id แอป
   [6] เงินค้างรับ: ยอด + ประวัติรับเงินจาก receipt_payment (a.pays)
   [7] งานติดตาม (kind ปกติ → TASKS · kind 'care …' → CARE ต่อการขาย) + careCreate ต้อง
       ไม่สร้างซ้ำหลังโหลด (กันงานเบิ้ลลงฐานทุกครั้งที่เปิดดีล) + เตือนเช็กระยะ
   [8] ใบงานซ่อม (checked_in_at → วันที่+เวลาไทย · parts_cost) + อะไหล่/การเคลื่อนไหว/ของแถม
   [9] ค่าใช้จ่าย (category/approval/has_receipt→files/ชื่อผู้เบิกจาก created_by)
   [10] ใบเสนอ (option กลับเป็น v1/v2/f1/f2/down) · จอง (สถานะไทยตรง) · ใบกำกับอื่น ·
        โอนย้าย (in_transit→'กำลังโอนย้าย') · บิลขายส่ง (+items)
   [11] รถอ่านจากวิว unit_v (ไม่ใช่ motorcycle_unit) · cost ที่ถูกวิวตัด (null) ต้องไม่ทำจอพัง
        (ห้ามมี NaN บนหน้าสต๊อก) · ตัวนับเลขเอกสารโหลดจาก doc_counter — เลขต่อจากของกลาง
   [12] ใบลา/คำขอออกนอกสถานที่ของตัวเองกลับมา (employee_id ของตัวเอง → staffId = ME.id)

   mutation ที่ต้องแดง: ถอด mapper ทีละตาราง → ข้อของตารางนั้นแดง */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });

  /* ---------- fixture + stub ก่อน login ---------- */
  await p.evaluate(() => {
    const U = {};
    ['me','sp','emp','co1','co2','co3','br1','br2','br3','fin1','wp1','v1','v2',
     'c1','s1','s2','s3','u1','u2','u3','rg1','rg2','fc1','ar1','pay1','tk1','tk2','tk3','tk4',
     'rm1','j1','pt1','gf1','e1','q1','o1','o2','w1','wi1','od1','tr1','lv1','of1','bk1']
      .forEach(k => { U[k] = uuid4(); });
    window.FXU = U;
    const T = TODAY, YBE = NOW.getFullYear() + 543;
    const VS = Object.keys(PRICE), V1 = VS[0], V2 = VS[1];
    window.FXV = { V1, V2 };
    const coIds = {}; COMPANIES.forEach((c, i) => { coIds[c.id] = [U.co1, U.co2, U.co3][i] || uuid4(); });
    const brIds = {}; BRANCHES.forEach((br, i) => { brIds[br.code] = [U.br1, U.br2, U.br3][i] || uuid4(); });
    window.FXBR = brIds;
    const B1 = brIds.FMG01 || U.br1;
    const ap = { status: 'รอตรวจ', by: '', at: '', note: '' };
    window.FX = {
      company: COMPANIES.map(c => ({ id: coIds[c.id], name: c.name, tax_id: c.taxId || '',
        address: c.addr || '', phone: c.phone || '', is_active: true })),
      branch: BRANCHES.map(br => ({ id: brIds[br.code], code: br.code, name: br.name,
        doc_prefix: br.prefix, branch_no: br.branchNo || '00000', address: '', is_active: true,
        company_id: coIds[br.co] })),
      wholesale_partner: [{ id: U.wp1, name: 'คู่ค้าคิวเอ', tax_id: '', address: '', phone: '',
        own_company_id: '', is_active: true }],
      model_variant: VS.map((v, i) => ({ id: i === 0 ? U.v1 : (i === 1 ? U.v2 : uuid4()), code: v })),
      wholesale_price: [],
      employee: [{ id: U.emp }],
      attendance: [],
      company_holiday: [], company_event: [],
      finance_company: [{ id: U.fin1, name: FIN_CO[0].name,
        flat_rate_pct: null, min_down_pct: null, tiers: null, terms: null }],
      app_setting: [],
      me_rows: [{ id: U.me, full_name: 'คิวเอ ทดสอบ', nickname: 'คิวเอ', all_branch: true,
        app_user_role: [{ role: { code: 'admin', name: 'ผู้ดูแลระบบ' } }],
        app_user_branch: [{ branch: { code: 'FMG01', name: 'สาขาหลัก' } }] }],
      app_user: [{ id: U.me, full_name: 'คิวเอ ทดสอบ', nickname: 'คิวเอ' },
                 { id: U.sp, full_name: 'เซลล์ เอ', nickname: 'เซลล์เอ' }],
      unit_v: [
        { id: U.u1, branch_code: 'FMG01', variant_code: V1, model_name: 'QA รุ่นเอ', model_th: '',
          category: 'ครอบครัว', cc: 125, model_year: 2026, color_code: 'BK', sku: 'SKU1',
          engine_no: 'QAE1', frame_no: 'QAF1', status: 'sold', received_at: addDays(T, -30),
          cost: 50000, cost_vat: 3500, retail: 60000, is_clearance: false, price_note: '',
          src_file: '', recv_no: '', po_no: '', po_date: '', supplier_inv_no: '' },
        { id: U.u2, branch_code: 'FMG01', variant_code: V1, model_name: 'QA รุ่นเอ', model_th: '',
          category: 'ครอบครัว', cc: 125, model_year: 2026, color_code: 'BK', sku: 'SKU2',
          engine_no: 'QAE2', frame_no: 'QAF2', status: 'available', received_at: addDays(T, -20),
          cost: null, cost_vat: null, retail: 61000, is_clearance: false, price_note: '',
          src_file: '', recv_no: '', po_no: '', po_date: '', supplier_inv_no: '' },
        { id: U.u3, branch_code: 'FMG01', variant_code: V2 || V1, model_name: 'QA รุ่นบี', model_th: '',
          category: 'ออโตเมติก', cc: 155, model_year: 2026, color_code: 'BK', sku: 'SKU3',
          engine_no: 'QAE3', frame_no: 'QAF3', status: 'reserved', received_at: addDays(T, -10),
          cost: 48000, cost_vat: 3360, retail: 65000, is_clearance: false, price_note: '',
          src_file: '', recv_no: '', po_no: '', po_date: '', supplier_inv_no: '' }],
      model_color: [{ color_code: 'BK', color_name: 'ดำเงา', model_variant: { code: V1 } }],
      model_photo: [],
      customer: [{ id: U.c1, branch_id: B1, full_name: 'ลูกค้า โหลดกลับ', nickname: null,
        phone: '0810004950', address: null, tax_id: null, source: 'เดินเข้าร้าน', stage: 'รับรถสำเร็จ',
        created_at: T + 'T01:00:00+00:00', note: null, birth_date: null }],
      sale: [
        { id: U.s1, branch_id: B1, unit_id: U.u1, customer_id: U.c1, salesperson_id: U.sp,
          sold_at: T, list_price: 60000, discount: 1000, net_price: 59000, cost: 50000,
          freebie_cost: 200, gross_profit: 8800, pay_method: 'finance', down_payment: 15000,
          term_months: 36, note: null, finance_id: U.fin1, doc_no: 'FMG-SALE-' + YBE + '-00001',
          voided_at: null, voided_reason: null, created_at: T + 'T01:00:00+00:00',
          public_token: 'TK4X8B2M', rate_pct: 1.29, monthly_installment: 1800, loan_total: 64800,
          pay_now: 16000, gifts: [{ id: U.gf1, name: 'หมวกกันน็อค', qty: 1, cost: 200, price: 400 }],
          fin_approval: ap },
        { id: U.s2, branch_id: B1, unit_id: U.u2, customer_id: U.c1, salesperson_id: U.sp,
          sold_at: addDays(T, -5), list_price: 61000, discount: 0, net_price: 61000, cost: null,
          freebie_cost: 0, gross_profit: null, pay_method: 'cash', down_payment: 0,
          term_months: null, note: null, finance_id: null, doc_no: 'FMG-SALE-' + YBE + '-00002',
          voided_at: addDays(T, -2) + 'T01:00:00+00:00', voided_reason: 'ยกเลิกการขาย',
          created_at: addDays(T, -5) + 'T01:00:00+00:00', public_token: 'TKVOID11',
          rate_pct: null, monthly_installment: null, loan_total: null, pay_now: null,
          gifts: [], fin_approval: null },
        /* การขายที่อ้างรถนอกขอบเขต RLS (รถถูกย้ายสาขาหลังขาย) — ต้องถูกกรองทิ้ง ไม่ใช่ทำจอพัง */
        { id: U.s3, branch_id: B1, unit_id: uuid4(), customer_id: U.c1, salesperson_id: U.sp,
          sold_at: addDays(T, -10), list_price: 50000, discount: 0, net_price: 50000, cost: 40000,
          freebie_cost: 0, gross_profit: 10000, pay_method: 'cash', down_payment: 0,
          term_months: null, note: null, finance_id: null, doc_no: 'FMG-SALE-' + YBE + '-00003',
          voided_at: null, voided_reason: null, created_at: addDays(T, -10) + 'T01:00:00+00:00',
          public_token: 'TKGONE22', rate_pct: null, monthly_installment: null, loan_total: null,
          pay_now: null, gifts: [], fin_approval: null }],
      booking: [{ id: U.bk1, branch_id: B1, customer_id: U.c1, unit_id: U.u3,
        name: 'ลูกค้า จอง', phone: '0812223333', deposit: 500,
        deposit_no: 'FMG-RECEIPT-' + YBE + '-00001', status: 'จองอยู่', booked_at: T,
        sale_id: null, canceled_at: null, cancel_reason: null, refunded: null, note: null,
        updated_at: T + 'T02:00:00+00:00' }],
      registration: [
        { id: U.rg1, sale_id: U.s1, branch_id: B1, stage: 'ได้ทะเบียนแล้ว', plate_no: '1กข 1234',
          book_no: null, submitted_at: T, approved_at: null, plate_received_at: T,
          delivered_at: T, due_at: addDays(T, 30), note: null,
          dlv_place: 'หน้าบ้าน', dlv_by: 'คิวเอ', dlv_note: null,
          stage_log: [{ to: 'ขายแล้ว', at: T }, { to: 'ได้ทะเบียนแล้ว', at: T }] },
        { id: U.rg2, sale_id: U.s2, branch_id: B1, stage: 'ขายแล้ว', plate_no: null,
          book_no: null, submitted_at: null, approved_at: null, plate_received_at: null,
          delivered_at: null, due_at: addDays(T, 30), note: null, dlv_place: null, dlv_by: null,
          dlv_note: null, stage_log: [{ to: 'ขายแล้ว', at: addDays(T, -5) }] }],
      finance_case: [{ id: U.fc1, branch_id: B1, sale_id: U.s1, customer_id: U.c1,
        company_id: U.fin1, status: 'อนุมัติแล้ว', amount: 44000, submitted_at: T,
        decided_at: T, reject_reason: null,
        stage_log: [{ to: 'ส่งเรื่อง', at: T }, { to: 'อนุมัติแล้ว', at: T }] }],
      receivable: [{ id: U.ar1, branch_id: B1, sale_id: U.s1, kind: 'finance',
        payer_finance_id: U.fin1, amount_due: 44000, amount_paid: 1000,
        due_at: addDays(T, 15), settled_at: null }],
      receipt_payment: [{ id: U.pay1, receivable_id: U.ar1, paid_at: T, amount: 1000,
        method: 'เงินสด', ref_no: null, by_user: U.sp }],
      follow_up_task: [
        { id: U.tk1, branch_id: B1, customer_id: U.c1, sale_id: U.s1, kind: '7 วัน',
          due_at: addDays(T, 7), done_at: null, done_by: null, assigned_to: null, note: null },
        { id: U.tk2, branch_id: B1, customer_id: U.c1, sale_id: U.s1, kind: '30 วัน',
          due_at: addDays(T, 30), done_at: T + 'T02:00:00+00:00', done_by: U.sp,
          assigned_to: null, note: null },
        { id: U.tk3, branch_id: B1, customer_id: U.c1, sale_id: U.s1, kind: 'care 7 วัน',
          due_at: addDays(T, 7), done_at: null, done_by: null, assigned_to: null, note: null },
        { id: U.tk4, branch_id: B1, customer_id: U.c1, sale_id: U.s2, kind: '7 วัน',
          due_at: addDays(T, 2), done_at: null, done_by: null, assigned_to: null, note: null }],
      service_reminder: [{ id: U.rm1, customer_id: U.c1, unit_id: U.u1, target_km: 1000,
        due_date: addDays(T, 20), status: 'รอถึงกำหนด', notified_at: null }],
      service_job: [{ id: U.j1, branch_id: B1, job_no: 'FMG-SERVICE-' + YBE + '-00001',
        customer_id: U.c1, unit_id: null, engine_no: 'ENG123', frame_no: '', customer_kind: null,
        odometer_km: 450, service_type: 'เช็กระยะ', symptom: 'เสียงดัง',
        checked_in_at: T + 'T03:30:00+00:00', started_at: null, finished_at: null,
        status: 'รับเข้า', labor_cost: 100, parts_cost: 120, total: 220, technician_id: null }],
      part: [{ id: U.pt1, branch_id: B1, code: 'QA-50', name: 'อะไหล่โหลดกลับ', cost: 10,
        price: 20, qty_on_hand: 7, min_qty: 2 }],
      part_movement: [{ id: 987, part_id: U.pt1, branch_id: B1, kind: 'job', qty: -1,
        job_id: U.j1, sale_id: null, unit_price: null, at: T + 'T04:00:00+00:00',
        by_user: null, note: null }],
      freebie: [{ id: U.gf1, branch_id: B1, name: 'หมวกกันน็อค', cost: 200, price: 400,
        qty_on_hand: 9, min_qty: 1 }],
      expense: [{ id: U.e1, branch_id: B1, category_id: null, category: 'ออกบูธ', spent_at: T,
        amount: 777, vendor: 'ร้านป้าย', tax_invoice_no: 'INV1', has_receipt: true, note: null,
        created_by: U.sp, approval: ap }],
      quotation: [{ id: U.q1, branch_id: B1, doc_no: 'FMG-QUOTE-' + YBE + '-00001',
        quote_date: T, valid_until: addDays(T, 7), customer_name: 'ผู้ขอใบเสนอ',
        customer_phone: '0817778888', customer_address: null, created_by: null }],
      quotation_option: [
        { id: U.o1, quotation_id: U.q1, slot: 1, variant_id: U.v1, price: 60000,
          finance_id: U.fin1, down_payment: 6000, terms: null },
        { id: U.o2, quotation_id: U.q1, slot: 2, variant_id: U.v2, price: 65000,
          finance_id: null, down_payment: 6000, terms: null }],
      wholesale_sale: [{ id: U.w1, branch_id: B1, partner_id: U.wp1, sold_at: T,
        doc_no: 'FMG-WSALE-' + YBE + '-00001', total: 100000, note: null, due_at: null,
        fin_approval: ap, voided_at: null, voided_reason: null, voided_by: null,
        tax_no: null, bill_no: null, dest_branch_id: null,
        created_at: T + 'T01:00:00+00:00' }],
      wholesale_sale_item: [{ id: U.wi1, ws_id: U.w1, unit_id: U.u3, price: 100000 }],
      other_doc: [{ id: U.od1, branch_id: B1, doc_no: 'FMG-TAX-' + YBE + '-00001',
        buyer_name: 'ผู้ซื้อรายย่อย', buyer_tax_id: null, buyer_addr: null,
        item: 'น้ำมันเครื่อง', amount: 500, issued_at: T, note: null }],
      unit_transfer: [{ id: U.tr1, unit_id: U.u1, from_branch: B1, to_branch: brIds.FMM01 || U.br2,
        requested_at: T + 'T02:00:00+00:00', received_at: null, status: 'in_transit', note: null }],
      leave_request: [{ id: U.lv1, employee_id: U.emp, leave_type: 'ลากิจ',
        date_from: addDays(T, 5), date_to: addDays(T, 5), status: 'รออนุมัติ', reason: 'ธุระ',
        evidence: [], approved_by: null, approved_at: null, decide_note: null }],
      offsite_request: [{ id: U.of1, employee_id: U.emp, on_date: addDays(T, 2),
        time_range: 'บ่าย', place: 'ขนส่งจังหวัด', reason: null, status: 'รออนุมัติ',
        approved_by: null, approved_at: null, decide_note: null }],
      doc_counter: [{ branch_id: B1, doc_type: 'SALE', year_be: YBE, last_no: 41 }]
    };
    window.REQ = [];
    sbFetch = async (path, opt) => {
      const method = (opt && opt.method) || 'GET';
      REQ.push({ path, method, body: opt && opt.body ? JSON.parse(opt.body) : null });
      if (path.startsWith('/auth/')) return { access_token: 'tok', user: { id: FXU.me } };
      if (method !== 'GET') return {};
      const m = path.match(/^\/rest\/v1\/([a-z_]+)\?/); const t = m && m[1];
      if (t === 'app_user') return path.includes('id=eq.') ? FX.me_rows : FX.app_user;
      if (t === 'motorcycle_unit') return FX.unit_v;   /* กันโหลดผิดทาง — ด่าน [11] จับเอง */
      return FX[t] || [];
    };
    sbUpload = async () => 'x';
    /* เข้าฟอร์มโหมดจริง */
    $('#lgSwap').onclick(); $('#lgEmail').value = 'qa@famai.local'; $('#lgPw2').value = 'x';
  });

  await p.evaluate(() => liveLogin());
  await p.waitForTimeout(300);

  const live = await p.evaluate(() => LIVE);
  if (!live) {
    bad('liveLogin ล้มเหลวทั้งกระบวน — ' + await p.evaluate(() =>
      (document.querySelector('#toasts') || {}).textContent || ''));
  } else {

  /* ---------- [1] การขาย ---------- */
  const g1 = await p.evaluate(() => {
    const s = SALES.find(x => x.id === FXU.s1) || {};
    return { n: SALES.length, branch: s.branch, cust: s.custId === FXU.c1,
      fin: s.finId === FIN_CO[0].id, doc: s.docNo, tok: s.pubToken,
      gift: (s.gifts || [])[0] && s.gifts[0].qty === 1 && s.gifts[0].name === 'หมวกกันน็อค',
      apr: s.finApproval && s.finApproval.status === 'รอตรวจ',
      down: s.down === 15000, per: s.per === 1800, dlv: s.deliveredAt === TODAY,
      sales: s.sales === 'เซลล์เอ' };
  });
  if (g1.n !== 2) bad('[1] SALES โหลดได้ ' + g1.n + ' (ต้อง 2 รวมใบที่ยกเลิก)');
  if (g1.branch !== 'FMG01') bad('[1] sale.branch ไม่ map กลับเป็นรหัสสาขา: ' + g1.branch);
  if (!g1.cust) bad('[1] sale.custId ไม่ตรงลูกค้า');
  if (!g1.fin) bad('[1] sale.finId ไม่ map จาก uuid ไฟแนนซ์กลับเป็น id ฝั่งแอป');
  if (!/-00001$/.test(g1.doc || '')) bad('[1] sale.docNo หาย: ' + g1.doc);
  if (g1.tok !== 'TK4X8B2M') bad('[1] public_token ไม่กลับมา (ลิงก์ติดตามลูกค้าตาย)');
  if (!g1.gift) bad('[1] gifts jsonb ไม่กลับมาเป็น array เดิม');
  if (!g1.apr) bad('[1] fin_approval ไม่กลับมา (การเงินตรวจไม่ได้)');
  if (!g1.down || !g1.per) bad('[1] ตัวเลขเงินผ่อนที่แช่ไว้หาย (down/per)');
  if (!g1.dlv) bad('[1] sale.deliveredAt ไม่มาจาก registration.delivered_at');
  if (!g1.sales) bad('[1] ชื่อพนักงานขายไม่ map จาก salesperson_id');

  /* ---------- [2] ลูกค้า ---------- */
  const g2 = await p.evaluate(() => {
    const c = CUSTOMERS.find(x => x.id === FXU.c1) || {};
    return { n: CUSTOMERS.length, name: c.name, src: c.src, stage: c.stage,
      br: c.branch, ph: c.phone };
  });
  if (!g2.n) bad('[2] CUSTOMERS ว่าง — ลูกค้าหายทุกครั้งที่รีเฟรช');
  if (g2.name !== 'ลูกค้า โหลดกลับ') bad('[2] full_name ไม่ map เป็น name');
  if (g2.src !== 'เดินเข้าร้าน') bad('[2] source ไม่ map เป็น src');
  if (g2.stage !== 'รับรถสำเร็จ') bad('[2] stage หาย');
  if (g2.br !== 'FMG01') bad('[2] branch ไม่ map กลับ');

  /* ---------- [3] การขายที่ยกเลิก ---------- */
  const g3 = await p.evaluate(() => {
    const s = SALES.find(x => x.id === FXU.s2) || {};
    return { v: s.void === true && !!s.voidedAt,
      reg: REGS.some(r => r.saleId === FXU.s2),
      tk: TASKS.some(t => t.saleId === FXU.s2),
      ar: AR.some(a => a.saleId === FXU.s2),
      fc: FINCASES.some(f => f.saleId === FXU.s2),
      ghost: SALES.some(x => x.id === FXU.s3) };
  });
  if (!g3.v) bad('[3] voided_at ไม่กลายเป็น s.void — ใบยกเลิกฟื้นเป็นใบขายปกติ');
  if (g3.ghost) bad('[3] การขายที่อ้างรถนอกขอบเขต RLS ไม่ถูกกรอง — จอฝั่งวาดจะพังทั้งหน้า');
  if (g3.reg) bad('[3] registration ของใบยกเลิกฟื้นขึ้นมา');
  if (g3.tk) bad('[3] follow_up_task ของใบยกเลิกฟื้นขึ้นมา');
  if (g3.ar || g3.fc) bad('[3] AR/FINCASES ของใบยกเลิกฟื้นขึ้นมา');

  /* ---------- [4] งานทะเบียน ---------- */
  const g4 = await p.evaluate(() => {
    const r = REGS.find(x => x.id === FXU.rg1) || {};
    return { st: r.stage, pl: r.plate, lg: Array.isArray(r.log) && r.log.length === 2,
      due: !!r.due, place: r.dlvPlace };
  });
  if (g4.st !== 'ได้ทะเบียนแล้ว') bad('[4] registration.stage หาย: ' + g4.st);
  if (g4.pl !== '1กข 1234') bad('[4] plate_no ไม่ map เป็น plate');
  if (!g4.lg) bad('[4] stage_log ไม่กลับมาเป็น r.log (careCreate อ่านวันได้ป้ายจากนี่ §9i)');
  if (!g4.due) bad('[4] due_at หาย');
  if (g4.place !== 'หน้าบ้าน') bad('[4] ข้อมูลส่งมอบ (dlv_place) หาย');

  /* ---------- [5] เคสไฟแนนซ์ ---------- */
  const g5 = await p.evaluate(() => {
    const f = FINCASES.find(x => x.id === FXU.fc1) || {};
    return { st: f.status, fin: f.finId === FIN_CO[0].id, amt: f.amount === 44000,
      lg: Array.isArray(f.log) && f.log.length === 2, cust: f.custId === FXU.c1 };
  });
  if (g5.st !== 'อนุมัติแล้ว') bad('[5] finance_case.status หาย');
  if (!g5.fin) bad('[5] company_id ไม่ map กลับเป็น finId ฝั่งแอป');
  if (!g5.amt) bad('[5] ยอดจัดหาย');
  if (!g5.lg) bad('[5] stage_log ไม่กลับมา');

  /* ---------- [6] เงินค้างรับ + ประวัติรับเงิน ---------- */
  const g6 = await p.evaluate(() => {
    const a = AR.find(x => x.id === FXU.ar1) || {};
    return { due: a.due === 44000, paid: a.paid === 1000,
      pays: (a.pays || []).length === 1 && a.pays[0].amt === 1000 && a.pays[0].way === 'เงินสด',
      kind: a.kind === 'finance', fin: a.finId === FIN_CO[0].id, dueAt: !!a.dueAt };
  });
  if (!g6.due || !g6.paid) bad('[6] ยอด receivable ไม่กลับมา (due/paid)');
  if (!g6.pays) bad('[6] ประวัติรับเงิน (receipt_payment → a.pays) ไม่กลับมา');
  if (!g6.kind || !g6.fin || !g6.dueAt) bad('[6] kind/finId/dueAt ของ receivable หาย');

  /* ---------- [7] งานติดตาม + CARE + เตือนเช็กระยะ ---------- */
  const g7 = await p.evaluate(() => {
    const t1 = TASKS.find(x => x.id === FXU.tk1), t2 = TASKS.find(x => x.id === FXU.tk2);
    const careLeak = TASKS.some(x => String(x.kind).indexOf('care') === 0);
    const rec = CARE.find(x => x.saleId === FXU.s1);
    const n = REQ.length;
    const dup = careCreate(SALES.find(x => x.id === FXU.s1));
    const rm = REMIND.find(x => x.id === FXU.rm1) || {};
    return { t1: !!t1 && t1.done === false && t1.kind === '7 วัน',
      t2: !!t2 && t2.done === true, careLeak,
      rec: !!rec && rec.tasks.length === 1 && rec.tasks[0].kind === '7 วัน'
        && rec.tasks[0].done === false,
      dedupe: !dup && REQ.length === n,
      rm: rm.km === 1000 && rm.custId === FXU.c1 && rm.status === 'รอถึงกำหนด' };
  });
  if (!g7.t1 || !g7.t2) bad('[7] follow_up_task ไม่กลับมาเป็น TASKS (รวมสถานะปิดจาก done_at)');
  if (g7.careLeak) bad('[7] งาน care หลุดเข้า TASKS — จะโชว์ซ้ำสองที่');
  if (!g7.rec) bad('[7] งาน care ไม่ถูกประกอบกลับเป็น CARE ต่อการขาย');
  if (!g7.dedupe) bad('[7] careCreate หลังโหลดยังสร้างซ้ำ — งานดูแลจะเบิ้ลลงฐานทุกครั้งที่เปิดดีล');
  if (!g7.rm) bad('[7] service_reminder ไม่กลับมาเป็น REMIND');

  /* ---------- [8] ใบงานซ่อม + อะไหล่ ---------- */
  const g8 = await p.evaluate(() => {
    const j = SERVICE.find(x => x.id === FXU.j1) || {};
    const pt = PARTS.find(x => x.id === FXU.pt1) || {};
    const mv = PMOVES.find(x => x.partId === FXU.pt1) || {};
    const gf = GIFTS.find(x => x.id === FXU.gf1) || {};
    return { no: /-00001$/.test(j.no || ''), at: j.at === TODAY, time: j.time === '10:30',
      parts: j.parts === 120, labor: j.labor === 100, status: j.status === 'รับเข้า',
      pt: pt.qty === 7 && pt.code === 'QA-50',
      mv: mv.qty === -1 && mv.type === 'job' && mv.at === TODAY && mv.jobId === FXU.j1,
      gf: gf.qty === 9 && gf.name === 'หมวกกันน็อค' };
  });
  if (!g8.no || !g8.status) bad('[8] service_job ไม่กลับมา (job_no/status)');
  if (!g8.at || !g8.time) bad('[8] checked_in_at ไม่ถูกแปลงเป็นวันที่+เวลาเขตไทย (at/time)');
  if (!g8.parts || !g8.labor) bad('[8] ค่าแรง/ค่าอะไหล่ของใบงานหาย');
  if (!g8.pt) bad('[8] part ไม่กลับมาเป็น PARTS');
  if (!g8.mv) bad('[8] part_movement ไม่กลับมาเป็น PMOVES');
  if (!g8.gf) bad('[8] freebie ไม่กลับมาเป็น GIFTS');

  /* ---------- [9] ค่าใช้จ่าย ---------- */
  const g9 = await p.evaluate(() => {
    const e = EXPENSES.find(x => x.id === FXU.e1) || {};
    return { cat: e.cat === 'ออกบูธ', amt: e.amt === 777,
      files: (e.files || []).length === 1, byName: e.byName === 'เซลล์เอ',
      apr: e.approval && e.approval.status === 'รอตรวจ', vendor: e.vendor === 'ร้านป้าย' };
  });
  if (!g9.cat || !g9.amt) bad('[9] expense ไม่กลับมา (category/amount)');
  if (!g9.files) bad('[9] has_receipt ไม่กลายเป็นสถานะแนบใบเสร็จ — จอจะฟ้อง "ใบเสร็จหาย" ผิด');
  if (!g9.byName) bad('[9] ชื่อผู้เบิกไม่ map จาก created_by');
  if (!g9.apr) bad('[9] approval ไม่กลับมา');

  /* ---------- [10] ใบเสนอ / จอง / ใบกำกับอื่น / โอนย้าย / ขายส่ง ---------- */
  const g10 = await p.evaluate(() => {
    const q = QUOTES.find(x => x.id === FXU.q1) || {};
    const bk = BOOKINGS.find(x => x.id === FXU.bk1) || {};
    const od = ODOCS.find(x => x.id === FXU.od1) || {};
    const tr = TRANSFERS.find(x => x.id === FXU.tr1) || {};
    const w = WSALES.find(x => x.id === FXU.w1) || {};
    return { q: q.v1 === FXV.V1 && q.v2 === FXV.V2 && q.f1 === FIN_CO[0].id
        && q.down === 6000 && /-00001$/.test(q.no || ''),
      bk: bk.status === 'จองอยู่' && bk.deposit === 500 && bk.unitId === FXU.u3
        && /-00001$/.test(bk.depositNo || ''),
      od: od.name === 'ผู้ซื้อรายย่อย' && od.amt === 500 && /-00001$/.test(od.no || ''),
      tr: tr.status === 'กำลังโอนย้าย' && tr.from === 'FMG01' && tr.at === TODAY,
      w: w.total === 100000 && (w.items || []).length === 1 && w.items[0].unitId === FXU.u3
        && w.items[0].price === 100000 && w.partnerId === FXU.wp1 };
  });
  if (!g10.q) bad('[10] quotation+option ไม่ประกอบกลับเป็น QUOTES (v1/v2/f1/down/no)');
  if (!g10.bk) bad('[10] booking ไม่กลับมาครบ (status ไทย/deposit/depositNo)');
  if (!g10.od) bad('[10] other_doc ไม่กลับมาเป็น ODOCS');
  if (!g10.tr) bad('[10] unit_transfer ไม่ map สถานะกลับเป็นไทย (in_transit→กำลังโอนย้าย)');
  if (!g10.w) bad('[10] wholesale_sale(+item) ไม่ประกอบกลับเป็น WSALES');

  /* ---------- [11] unit_v + cost ที่ถูกตัด + ตัวนับเลขเอกสาร ---------- */
  const g11 = await p.evaluate(() => {
    const viaView = REQ.some(x => x.method === 'GET' && x.path.startsWith('/rest/v1/unit_v?'));
    const viaTable = REQ.some(x => x.method === 'GET' && x.path.startsWith('/rest/v1/motorcycle_unit?'));
    const u2 = UNITS.find(x => x.id === FXU.u2) || {};
    go('stock');
    const nan = ($('#s-stock').textContent || '').includes('NaN');
    const peek = peekDocNo('FMG01', 'SALE');
    return { viaView, viaTable, cost: u2.cost === null, br: u2.branch === 'FMG01',
      nan, peek };
  });
  if (!g11.viaView) bad('[11] รถโหมดจริงไม่ได้อ่านจากวิว unit_v');
  if (g11.viaTable) bad('[11] ยังอ่าน motorcycle_unit ตรง — cost รั่วถึง client ของคนไม่มีสิทธิ์เงิน');
  if (!g11.cost) bad('[11] cost ที่วิวตัด (null) ถูก map เพี้ยน (เช่น +null=0 กลายเป็นทุน 0 บาท)');
  if (g11.nan) bad('[11] หน้าสต๊อกมี NaN เมื่อ cost เป็น null');
  if (!/-00042$/.test(g11.peek)) bad('[11] doc_counter ไม่ถูกโหลด — เลขเอกสารไม่ต่อจากตัวนับกลาง: ' + g11.peek);

  /* ---------- [13] ขายคันที่ทุนถูกวิวตัด — ห้ามเขียนทุนศูนย์ลงฐาน ---------- */
  const g13 = await p.evaluate(async () => {
    window.__drain = () => new Promise(r => { const k = () => (DB_Q.length || DB_RUN) ? setTimeout(k, 30) : r(); k(); });
    go('sell');
    const u = UNITS.find(x => x.id === FXU.u2);
    $('#sUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#sUnit').value = u.id;
    $('#sBranch').innerHTML = '<option value="FMG01">x</option>'; $('#sBranch').value = 'FMG01';
    sCustSel = ''; $('#sCust').value = 'ผู้ซื้อทุนปิด'; $('#sPhone').value = '0800000050';
    $('#sPay').value = 'cash'; sFree = {}; sFreeX = [];
    const n = REQ.length;
    saveSale(); if ($('#cfmGo')) $('#cfmGo').onclick();
    await __drain();
    const r = REQ.slice(n).find(x => x.method === 'POST' && x.path.includes('/sale?'));
    return { sent: !!r, cost: r && r.body.cost === null, gp: r && r.body.gross_profit === null,
      net: r && r.body.net_price === 61000 };
  });
  if (!g13.sent) bad('[13] ขายคันทุนปิดแล้วไม่ยิง sale');
  if (!g13.cost || !g13.gp) bad('[13] ทุนที่วิวตัด (null) ถูกเขียนเป็นเลข (ทุนศูนย์/กำไรเต็มราคา) — '
    + 'ต้องส่ง null ให้ trigger sale_fill_cost เติมทุนจริงที่ฐาน (mig 30)');
  if (!g13.net) bad('[13] ราคาสุทธิเพี้ยน');

  /* ---------- [14] ใบงานซ่อม/ค่าใช้จ่ายแช่ครบ (parts_cost/total · created_by) ---------- */
  const g14 = await p.evaluate(async () => {
    go('service'); rService();
    const pt = PARTS.find(x => x.id === FXU.pt1);
    if (!pt) return { sj: false, sjWhy: 'PARTS ไม่มีอะไหล่จากฐาน (ดูข้อ [8])', ex: false };
    $('#svName').value = 'QA ทุนอะไหล่'; $('#svSearch').value = 'QA-R50-SV'; $('#svKm').value = '400';
    $('#svDate').value = curDate();
    $('#svPart').innerHTML = '<option value="' + pt.id + '">x</option>'; $('#svPart').value = pt.id;
    const lab = num($('#svLabor').value);
    let n = REQ.length;
    svSave();
    await __drain();
    const sj = REQ.slice(n).find(x => x.method === 'POST' && x.path.includes('/service_job?'));
    const sjWhy = sj ? '' : 'ไม่มี POST service_job — ' + ($('#toasts').textContent || '').slice(0, 80);
    go('expense'); rExpense();
    $('#eAmt').value = '99'; $('#eCat').value = 'QA-R50';
    const st = STAFF.find(s => s.branch === 'FMG01');
    $('#eStaff').innerHTML = '<option value="' + st.id + '">x</option>'; $('#eStaff').value = st.id;
    $('#eBranch').innerHTML = '<option value="FMG01">x</option>'; $('#eBranch').value = 'FMG01';
    n = REQ.length;
    expSave(); if ($('#cfmGo')) $('#cfmGo').onclick();
    await __drain();
    const ex = REQ.slice(n).find(x => x.method === 'POST' && x.path.includes('/expense?'));
    return { sj: !!sj && sj.body.parts_cost === pt.price && sj.body.total === lab + pt.price,
      sjWhy, ex: !!ex && ex.body.created_by === FXU.me };
  });
  if (!g14.sj) bad('[14] ใบงานซ่อมไม่แช่ parts_cost/total — โหลดกลับแล้วใบงานไม่มีตัวเลขอะไหล่ '
    + (g14.sjWhy || ''));
  if (!g14.ex) bad('[14] ค่าใช้จ่ายไม่แช่ created_by — โหลดกลับแล้วไม่รู้ใครบันทึก');

  /* ---------- [12] ใบลา/ออกนอกสถานที่ของตัวเอง ---------- */
  const g12 = await p.evaluate(() => {
    const l = LEAVES.find(x => x.id === FXU.lv1) || {};
    const o = OFFS.find(x => x.id === FXU.of1) || {};
    return { l: l.staffId === ME.id && l.type === 'ลากิจ' && l.status === 'รออนุมัติ',
      o: o.staffId === ME.id && o.place === 'ขนส่งจังหวัด' };
  });
  if (!g12.l) bad('[12] ใบลาของตัวเองไม่กลับมา (employee_id → staffId=ME.id)');
  if (!g12.o) bad('[12] คำขอออกนอกสถานที่ของตัวเองไม่กลับมา');

  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
