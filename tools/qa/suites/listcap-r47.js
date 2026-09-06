/* ด่าน v1.47 — แก้ "หลายส่วนที่ยาวเกินไป"
   คำสั่งเจ้าของ 28 ส.ค. 2569: "ตอนนี้จะมีหลายส่วนที่ยาวเกินไป เช่นช่องข้อมูลที่ให้เลื่อนเลือกลูกค้า
   หรือส่วนเลื่อนเลือกรถ ยาวจนผมเลื่อนไม่ไหว หรือแม้แต่ส่วนการ์ดในแต่ละหน้าที่มีหลายการ์ดจนทำให้
   หน้ายาวขึ้นเยอะก็ตาม ... คิด solution ที่จะแก้ไขได้ เพื่อเพิ่ม ux"
   v1.55 เจ้าของเปลี่ยนเป็น **แผงค้นหา + แบ่งหน้า 1 2 3**
   ล็อก:
   [1] แปลงคำบ่นเป็นตัวเลข — ที่ 390 หน้าที่เคยยาวสุดต้องสูงไม่เกิน 3.5 เท่าของจอ
   [2] ตารางวาดไม่เกินจำนวนต่อหน้า และบอกจำนวนทั้งหมดพร้อมเลขหน้า
   [3] เดินครบทุกหน้าได้ครบทุกแถว · ย้อนหน้าแรกได้ข้อมูลเดิม
   [4] หน้ากากเลือกคันรถบอก "คันที่เลือกอยู่" + "กี่คันให้เลือก" เป็นข้อความ ไม่ใช่สีล้วน
   [5] **<select> ตัวจริงยังมี option ครบทุกตัว และ .value ยังเป็นค่าที่ฟังก์ชันบันทึกอ่านได้**
       (สัญญาที่ picker-r33 / modelsug-r40 / booking-r37 / money-r16 พึ่งอยู่)
   [6] เปิดแผงเลือกคัน → พิมพ์กรอง → เลือก → select เปลี่ยนค่าจริง และ onchange ของแอปทำงาน
   [7] markReq ยังแปะดอกจันให้ #tUnit ได้ ทั้งที่ถูกห่อด้วย .upick แล้ว
   [8] ไฟล์ส่งออกยังครบทุกแถว แม้จอจะถูก cap อยู่ (ตัดที่การวาด ไม่ได้ตัดข้อมูล)
   [9] ที่ 390 ไม่ล้นข้าง และปุ่มหน้ากากสูงพอให้นิ้วแตะ (≥44px) */
const { chromium, EXE, BASE } = require('./env');
const {installPages}=require('../helpers/pages');

/* หน้าที่วัดความสูง — ตัวเลขคือเพดาน "กี่เท่าของความสูงจอ" */
const TALL = [['stock', 3.5], ['deal', 3.5], ['hr', 3.5], ['payroll', 3.5], ['attend', 3.5]];
/* ช่องเลือกคันรถทั้งสี่จุด: [หน้า, id ของ select, ตัวเปิดหน้า, นิพจน์ที่คืน "รายการที่หน้านั้นเสนอได้จริง"]
   นิพจน์สุดท้ายคือหัวใจของข้อ [5] — ถ้าใครเผลอตัด option ให้สั้นลงเพื่อให้ดรอปดาวน์สั้น
   ค่าที่ฟังก์ชันบันทึกอ่านจะหายไปเงียบ ๆ ทั้งที่หน้าตาดูดี */
const PICKS = [
  ['sell', 'sUnit', null, 'vehCascadeFill(SELL_CAS, sellPool).length'],
  ['booking', 'bkUnit', null, 'vehCascadeFill(BK_CAS, bookPool).length'],
  ['transfer', 'tUnit', null, "UNITS.filter(u=>u.status==='available'&&inScope(u.branch)).length"],
  ['invoice', 'wsUnit', '#ivTabs [data-p="iv2"]',
    "UNITS.filter(u=>u.status==='available' && u.branch===document.getElementById('wsBranch').value && !WS_CART.some(x=>x.unitId===u.id)).length"]
];

/* ข้อมูลในด่านแบ่งหน้าต้องมากกว่าหนึ่งหน้าในช่วงเวลาปัจจุบันเสมอ
   ไม่พึ่งอายุ seed หรือขยายสิทธิ์/ช่วงเพื่อทำให้ผ่าน และยังตรวจไฟล์ครบเทียบกับหน้าที่สั้น */
const pageFixtures = async p => p.evaluate(() => {
  const at=TODAY+'T09:00:00+07:00';
  for(let i=1;i<=16;i++){
    const id='QA-R47-CU-'+i;
    CUSTOMERS.push({id,name:'ทดสอบแบ่งหน้า '+i,phone:'08947000'+String(i).padStart(2,'0'),
      branch:ME.branch,ownerId:ME.id,owner:ME.nick,createdAt:at,upAt:at,src:'ทดสอบแบ่งหน้า',
      stage:'สนใจ',intent:'เงินสด',variant:Object.keys(PRICE)[0]});
    TASKS.push({id:'QA-R47-TK-'+i,custId:id,branch:ME.branch,kind:'ติดตามรายการ '+i,due:addDays(TODAY,-1),done:false});
  }
});

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  /* ---------- จอคอม: cap · หน้ากาก · option ครบ ---------- */
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await installPages(p);
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
  await pageFixtures(p);
  await p.evaluate(() => { window.__F = []; csv = (n, h, r) => window.__F.push({ n: n, h: h, rows: r }); });

  const api = await p.evaluate(() => {
    const m = [];
    if (typeof pageFoot !== 'function') m.push('pageFoot');
    if (typeof pageSlice !== 'function') m.push('pageSlice');
    if (typeof upickOpen !== 'function') m.push('upickOpen');
    if (typeof upickSync !== 'function') m.push('upickSync');
    if (typeof LIST_PAGES !== 'object') m.push('LIST_PAGES');
    return m;
  });
  if (api.length) {
    bad('ยังไม่มี: ' + api.join(' · '));
    await b.close(); console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1);
  }

  /* [2][3] v1.55: จำนวนต่อหน้าคงเดิม แต่เดินผ่านทุกหน้าแทนการกางทั้งหมด */
  const pageChecks=await p.evaluate(()=>{
    const bad=[];
    for(const [screen,id,sub] of [['stock','stTable','table'],['stock','stGrp','grp'],['deal','dlTable'],['deal','dlTasks'],['hr','attTable'],['payroll','prTable']]){
      go(screen,sub);const selector='#'+id+' tbody tr';
      const first=[...document.querySelectorAll(selector)].map(e=>e.textContent);
      const all=qaPageRows(id,selector),state=LIST_PAGES[id];
      if(!state||state.pages<2)bad.push(id+' ไม่มีเลขหน้าทั้งที่ข้อมูลหลายหน้า');
      if(all.length!==state.total||new Set(all.map(e=>e.outerHTML)).size!==all.length)bad.push(id+' ข้อมูลซ้ำ/ขาด');
      if(first.join('|')!==[...document.querySelectorAll(selector)].map(e=>e.textContent).join('|'))bad.push(id+' ย้อนหน้าแรกไม่ตรง');
      const text=document.querySelector('[data-list="'+id+'"]')?.textContent||'';
      if(!text.includes('จาก '+all.length+' รายการ'))bad.push(id+' ไม่บอกจำนวนทั้งหมด');
    }
    go('stock','gal');const cards=qaPageRows('stGal','#stGal .gcard');
    if(cards.reduce((n,c)=>n+(+c.querySelector('.gqty').textContent),0)!==stList().length)bad.push('รถรวมทุกหน้าไม่ตรง');
    if(document.querySelectorAll('#stGal .gcard').length!==6)bad.push('แกลเลอรีไม่ได้กลับหน้าแรก');
    return bad;
  });
  pageChecks.forEach(bad);

  /* ---------- [4][5] หน้ากาก + option ยังครบ ---------- */
  const g4 = await p.evaluate(PICKS_ => {
    return PICKS_.map(([page, id, sub, poolExpr]) => {
      go(page, sub || undefined);
      const sel = document.getElementById(id);
      if (!sel) return { id, missing: 1 };
      const wrap = sel.closest('.upick');
      const btn = wrap && wrap.querySelector('.upbtn');
      const opts = [...sel.options].filter(o => o.value);
      const cs = getComputedStyle(sel);
      return { id, missing: 0,
        wrapped: !!wrap, btn: !!btn,
        txt: btn ? btn.textContent.trim() : '',
        saysCount: btn ? btn.textContent.indexOf(String(opts.length)) >= 0 : false,
        saysPick: btn && opts.length ? btn.textContent.indexOf(
          ([...sel.options].find(o => o.value === sel.value) || {}).text || ' ') >= 0 : true,
        opts: opts.length, pool: eval(poolExpr), value: sel.value,
        /* ห้ามซ่อนด้วย display:none — วัดขนาดไม่ได้ และ sUnitSet ต้องยังตั้งค่าได้ */
        display: cs.display, opacity: cs.opacity, events: cs.pointerEvents };
    });
  }, PICKS);
  g4.forEach(r => {
    if (r.missing) { bad('[4] ไม่มี #' + r.id); return; }
    if (!r.wrapped) { bad('[4] #' + r.id + ' ไม่ได้ถูกห่อด้วย .upick'); return; }
    if (!r.btn) { bad('[4] #' + r.id + ' ไม่มีปุ่มหน้ากาก .upbtn'); return; }
    if (!r.opts) bad('[5] #' + r.id + ' ไม่มี option ให้เลือกเลย — ทดสอบไม่ได้');
    else {
      if (!r.saysCount) bad('[4] #' + r.id + ' ปุ่มไม่บอกจำนวนคันที่เลือกได้ (' + r.opts + ') — "' + r.txt + '"');
      if (!r.saysPick) bad('[4] #' + r.id + ' ปุ่มไม่บอกคันที่เลือกอยู่ — "' + r.txt + '"');
    }
    if (r.display === 'none') bad('[5] #' + r.id + ' ถูกซ่อนด้วย display:none — วัดขนาดไม่ได้และตั้งค่าจากภายนอกพัง');
    /* หัวใจของรอบนี้: หน้ากากทำให้ดรอปดาวน์ "ดูสั้น" ได้ แต่ห้ามทำให้ option "หายจริง" */
    if (r.opts !== r.pool)
      bad('[5] #' + r.id + ' มี option ' + r.opts + ' ตัว แต่หน้านี้เสนอรถได้ ' + r.pool
        + ' คัน — option ถูกตัดหาย ค่าที่ฟังก์ชันบันทึกอ่านจะหายตาม');
  });

  /* ---------- [6] เปิดแผง → พิมพ์กรอง → เลือก แล้วแอปรู้เรื่อง ---------- */
  const g6 = await p.evaluate(() => {
    go('sell');
    const sel = document.getElementById('sUnit');
    const opts = [...sel.options].filter(o => o.value);
    if (opts.length < 2) return { skip: 1 };
    const want = opts[opts.length - 1];
    sel.value = opts[0].value; if (sel.onchange) sel.onchange();
    document.querySelector('#sUnit').closest('.upick').querySelector('.upbtn').click();
    const q = document.getElementById('upQ');
    if (!q) return { noq: 1 };
    const nAll = document.querySelectorAll('#upList [data-uv]').length;
    q.value = want.text.split(' ')[0]; q.oninput();
    const nHit = document.querySelectorAll('#upList [data-uv]').length;
    const row = document.querySelector('#upList [data-uv="' + want.value + '"]');
    if (!row) return { norow: 1, nAll, nHit };
    let fired = 0; const keep = sel.onchange; sel.onchange = () => { fired++; if (keep) keep(); };
    row.click();
    sel.onchange = keep;
    const closed = !document.getElementById('drw').classList.contains('on');
    const face = sel.closest('.upick').querySelector('.upbtn').textContent;
    return { skip: 0, nAll, nHit, value: sel.value, want: want.value, fired, closed,
      faceOk: face.indexOf(want.text) >= 0 };
  });
  if (g6.skip) bad('[6] รถว่างน้อยเกินไป ทดสอบไม่ได้');
  else if (g6.noq) bad('[6] เปิดแผงแล้วไม่มีช่องพิมพ์ค้นหา #upQ');
  else if (g6.norow) bad('[6] แผงไม่มีแถวของคันที่ต้องการ (ทั้งหมด ' + g6.nAll + ' · หลังกรอง ' + g6.nHit + ')');
  else {
    if (g6.nAll < 2) bad('[6] แผงแสดงรถแค่ ' + g6.nAll + ' คัน');
    if (g6.nHit >= g6.nAll) bad('[6] พิมพ์กรองแล้วรายการไม่ลดลง (' + g6.nAll + ' → ' + g6.nHit + ')');
    if (g6.value !== g6.want) bad('[6] เลือกจากแผงแล้ว select ไม่เปลี่ยนค่า');
    if (!g6.fired) bad('[6] เลือกจากแผงแล้ว onchange ของแอปไม่ทำงาน — ราคา/สรุปดีลจะไม่อัปเดต');
    if (!g6.closed) bad('[6] เลือกแล้วแผงไม่ปิด');
    if (!g6.faceOk) bad('[6] เลือกแล้วปุ่มหน้ากากไม่อัปเดตเป็นคันใหม่');
  }

  /* ---------- [7] ดอกจันของ #tUnit ---------- */
  const g7 = await p.evaluate(() => {
    go('transfer'); markReq();
    const sel = document.getElementById('tUnit');
    const host = sel.closest('.upick') || sel;
    let lab = null;
    for (let s = host.previousElementSibling; s; s = s.previousElementSibling)
      if (s.matches && s.matches('label.fl')) { lab = s; break; }
    return { inReq: REQ.indexOf('tUnit') >= 0, lab: !!lab, rq: !!(lab && lab.querySelector('.rq')) };
  });
  if (!g7.inReq) bad('[7] tUnit หลุดออกจาก REQ');
  else if (!g7.lab) bad('[7] หา label ของ #tUnit ไม่เจอหลังห่อ .upick');
  else if (!g7.rq) bad('[7] #tUnit อยู่ใน REQ แต่ป้ายไม่มีดอกจัน — markReq ไต่ไม่ถึงหลังห่อ .upick');

  /* ---------- [8] ไฟล์ส่งออกยังครบ ---------- */
  const g8 = await p.evaluate(() => {
    go('deal'); DEAL_SEL = ''; rDeal();
    const shown = [...document.querySelectorAll('#dlTable tbody tr[data-deal]')].length;
    const n0 = window.__F.length;
    document.querySelector('#expDeal').click();
    const f = window.__F[n0];
    return { shown, file: f ? f.rows.length : -1, want: dealRows().length };
  });
  if (g8.file !== g8.want) bad('[8] ไฟล์ส่งออกได้ ' + g8.file + ' แถว ควรครบ ' + g8.want);
  if (g8.shown >= g8.want) bad('[8] จอไม่ได้ถูก cap เลย (' + g8.shown + '/' + g8.want + ') — พิสูจน์ไม่ได้ว่าไฟล์ครบทั้งที่จอสั้น');
  await ctx.close();

  /* ---------- [1][9] มือถือ ---------- */
  const m = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 }, hasTouch: true });
  const q = await m.newPage();
  q.on('pageerror', e => errors.push('390 PAGEERROR ' + e.message));
  await q.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await q.click('#lgUsers [data-id="ST1"]'); await q.click('#lgGo'); await q.waitForTimeout(450);
  await pageFixtures(q);
  const tallOut = [];
  for (const [page, cap] of TALL) {
    await q.evaluate(x => go(x), page); await q.waitForTimeout(350);
    const r = await q.evaluate(() => ({ h: document.body.scrollHeight, vh: innerHeight,
      over: document.body.scrollWidth - innerWidth }));
    const n = Math.round(r.h / r.vh * 10) / 10;
    tallOut.push(page + ' ' + n);
    if (n > cap) bad('[1] หน้า ' + page + ' สูง ' + n + ' เท่าของจอ เกินเพดาน ' + cap);
    if (r.over > 1) bad('[9] หน้า ' + page + ' ล้นข้าง ' + r.over + 'px');
  }
  /* หน้าที่มีหน้ากากต้องไม่ล้นข้างด้วย — ปุ่มที่มีข้อความยาวแบบ nowrap ดันช่องกริดของฟอร์ม
     ให้กว้างเกินจอได้ง่ายมาก (เจอจริงตอนทำรอบนี้: หน้าขายรถ 420px · โอนย้าย 503px) */
  const g9 = await q.evaluate(PICKS_ => {
    const over = [];
    PICKS_.forEach(([page, id, sub]) => {
      go(page, sub || undefined);
      const d = document.body.scrollWidth - innerWidth;
      if (d > 1) over.push(page + ' ' + d + 'px');
    });
    go('sell');
    const btn = document.querySelector('#sUnit').closest('.upick').querySelector('.upbtn');
    return { h: btn.offsetHeight, w: btn.offsetWidth, over };
  }, PICKS);
  if (g9.h < 44) bad('[9] ปุ่มหน้ากากสูงแค่ ' + g9.h + 'px — นิ้วแตะพลาด (ต้อง ≥44)');
  if (g9.over.length) bad('[9] หน้าที่มีหน้ากากเลือกรถล้นข้างที่ 390: ' + g9.over.join(' · '));
  await m.close();

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (listcap-r47: 9 ข้อ) · ความสูงที่ 390: ' + tallOut.join(' · '));
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
