/* ด่านของ steps() — แถบความคืบหน้าแบบไอคอน (v1.11)
   ตรวจตัวคอมโพเนนต์เอง: จำนวนขั้น · ไอคอนที่ถูกต้องต่อสถานะ · วงแหวนของขั้นปัจจุบัน ·
   เส้นไล่สีที่วิ่งเข้าขั้นปัจจุบัน · สถานะตกราง · และเส้นทาง 4 ขั้นของดีลเงินสด
   (พฤติกรรมของหน้าดีลอยู่ที่ deal-r10 — ไฟล์นี้ดูแค่ว่าแถบวาดถูกไหม) */
const { chromium, EXE, BASE } = require('./env');
/* v1.28 — ลำดับตามงานจริง: ไฟแนนซ์ผ่านก่อนถึงเปิดการขาย · ส่งมอบก่อนได้ทะเบียนจริง */
const TRACK = ['คุยกับลูกค้า', 'ไฟแนนซ์', 'เปิดการขาย', 'ส่งมอบ', 'ทะเบียนรถ'];
const ICONS = ['user', 'bank', 'tag', 'bike', 'clipboard'];

const SHAPE = `el => {
  const pns = Array.from(el.querySelectorAll('.pn'));
  const iconOf = n => { const u = n.querySelector('use'); return u ? (u.getAttribute('href')||'').replace('#i-','') : null; };
  return {
    n: pns.length,
    icons: pns.map(iconOf),
    done: pns.map((n,i)=>n.classList.contains('done')?i:-1).filter(i=>i>=0),
    now:  pns.findIndex(n=>n.classList.contains('now')),
    nowN: el.querySelectorAll('.pn.now').length,
    ring: (() => { const n = el.querySelector('.pn.now'); return n ? getComputedStyle(n).boxShadow : 'none'; })(),
    size: (() => { const n = el.querySelector('.pn'); return n ? Math.round(n.getBoundingClientRect().height) : 0; })(),
    lines:   el.querySelectorAll('.pl').length,
    linesOn: el.querySelectorAll('.pl.on').length,
    curLine: Array.from(el.querySelectorAll('.pl')).findIndex(l=>l.classList.contains('cur')),
    curBg: (() => { const l = el.querySelector('.pl.cur'); return l ? getComputedStyle(l).backgroundImage : 'none'; })(),
    labels: Array.from(el.querySelectorAll('em')).map(e=>e.textContent.trim()),
    off:  el.classList.contains('off')
  };
}`;

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  for (const W of [1440, 390]) {
    const tag = W + 'px';
    /* v1.30: บนจอคอม (≥901px) วงไอคอนโต 28→40 ให้อ่านจากระยะที่นั่งได้ · มือถือคงเดิม
       ผูกค่ากับความกว้างจอตรงนี้ที่เดียว ถ้าใครลบ media query ออก 1440 จะแดงทันที */
    const PN = W >= 901 ? 40 : 28;
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: W, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(tag + ' PAGEERROR ' + e.message));
    p.on('console', m => { const u = (m.location() || {}).url || '';
      if (m.type() === 'error' && !/favicon|fonts\.g|gstatic/.test(u) && !/ERR_CONNECTION/.test(m.text()))
        errors.push(tag + ' CONSOLE ' + m.text()); });
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.evaluate(() => go('deal')); await p.waitForTimeout(350);

    /* 1 · ทุกแถบในรายการต้องสอดคล้องกันเองทุกจุด */
    const bars = await p.$$('#dlTable .pstep');
    if (!bars.length) bad(tag + ': ไม่มีแถบความคืบหน้าใน #dlTable เลย');
    for (let k = 0; k < bars.length; k++) {
      const s = await bars[k].evaluate(eval(SHAPE));
      const at = tag + ' แถบที่ ' + (k + 1);
      /* ดีลผ่อน 5 ขั้น · ดีลเงินสด 4 ขั้น (ตัดขั้นไฟแนนซ์ออกไปเลย) */
      if (s.n !== 5 && s.n !== 4) bad(at + ': มี ' + s.n + ' ขั้น ควรเป็น 5 (ผ่อน) หรือ 4 (เงินสด)');
      if (s.lines !== s.n - 1)    bad(at + ': เส้นเชื่อม ' + s.lines + ' เส้น ควรเป็น ' + (s.n - 1));
      /* v1.28: ดีลที่จบครบ (ได้ทะเบียนจริงแล้ว) ไม่มีขั้นปัจจุบัน — ทุกขั้นติ๊กหมด ไม่มีวงแหวน */
      const doneAll = s.nowN === 0 && s.done.length === s.n;
      const cur = doneAll ? s.n : s.now;
      if (s.nowN !== 1 && !doneAll) bad(at + ': ขั้นปัจจุบันมี ' + s.nowN + ' จุด ควรมีจุดเดียว (หรือจบครบแล้วไม่มีเลย)');
      if (s.size !== PN)          bad(at + ': วงไอคอนสูง ' + s.size + 'px ควรเป็น ' + PN);
      if (s.done.join(',') !== [...Array(cur).keys()].join(','))
        bad(at + ': ขั้นที่ผ่านแล้วเป็น [' + s.done + '] แต่ขั้นปัจจุบันคือ ' + cur);
      if (s.linesOn !== Math.min(cur, s.n - 1))
        bad(at + ': เส้นทึบ ' + s.linesOn + ' เส้น แต่เดินมาถึงขั้นที่ ' + cur);
      /* ไอคอน: ขั้นที่ผ่านแล้ว = เครื่องหมายถูก · ที่เหลือ = ไอคอนประจำขั้น */
      const want = (s.n === 5 ? ICONS : ICONS.filter(x => x !== 'bank')).map((n, ix) => ix < cur ? 'check' : n);
      if (s.icons.join(',') !== want.join(','))
        bad(at + ': ไอคอนเป็น [' + s.icons + '] ควรเป็น [' + want + ']');
      /* ขั้นปัจจุบันต้องมีวงแหวน และเส้นที่วิ่งเข้าต้องไล่สี — สองอย่างที่ทำให้ดีกว่าภาพอ้างอิง */
      if (!doneAll && (!s.ring || s.ring === 'none')) bad(at + ': ขั้นปัจจุบันไม่มีวงแหวน (box-shadow)');
      if (!doneAll && s.now > 0) {
        if (s.curLine !== s.now - 1) bad(at + ': เส้นไล่สีอยู่ที่ ' + s.curLine + ' ควรอยู่ก่อนขั้นปัจจุบัน');
        if (!/gradient/.test(s.curBg)) bad(at + ': เส้นเข้าขั้นปัจจุบันไม่ได้ไล่สี (' + s.curBg + ')');
      }
      /* แถบเป็นตัวบอกสถานะอย่างเดียว ไม่ใช่ปุ่ม — การเลื่อนขั้นใช้ปุ่มที่มีข้อความบอกชัด */
      if (await bars[k].evaluate(e => !!e.querySelector('button'))) bad(at + ': แถบมีปุ่มกดได้ ทั้งที่ควรเป็นตัวบอกสถานะอย่างเดียว');
    }

    /* 2 · แถบแบบมีชื่อขั้นในมุมมองรายละเอียด */
    await p.click('#dlTable [data-deal]'); await p.waitForTimeout(300);
    const one = await p.$eval('#dlOne .pstep', eval(SHAPE));
    if (!await p.$('#dlOne .pstep.lab')) bad(tag + ': แถบในรายละเอียดไม่ได้เป็นแบบมีชื่อขั้น');
    if (one.labels.length !== one.n) bad(tag + ': มี ' + one.n + ' ขั้น แต่มีชื่อขั้น ' + one.labels.length + ' อัน');
    if (one.size !== PN) bad(tag + ': วงไอคอนในหน้ารายละเอียดสูง ' + one.size + 'px ควรเป็น ' + PN);
    if (one.n === 5 && one.labels.join('|') !== TRACK.join('|'))
      bad(tag + ': ชื่อขั้นเป็น [' + one.labels + '] ควรเป็น [' + TRACK + ']');

    /* 3 · ตกราง — วงแดงกลวง ไม่มีวงแหวนทึบ และขั้นถัดไปยังไม่ติดว่าผ่าน */
    const offId = await p.evaluate(() => { const d = dealAll().find(x => x.off); return d ? d.c.id : null; });
    if (!offId) bad(tag + ': ไม่มีดีลที่ตกรางใน seed');
    else {
      await p.evaluate(id => { DEAL_SEL = id; rDeal(); }, offId);
      await p.waitForTimeout(250);
      const o = await p.$eval('#dlOne .pstep', eval(SHAPE));
      if (!o.off)          bad(tag + ': ดีลที่ตกรางไม่ได้ติดคลาส off');
      /* v1.28: ไฟแนนซ์เป็นขั้นที่ 2 แล้ว — ตกรางต้องหยุดตรงนั้น ไม่เดินต่อไปเปิดการขาย */
      if (o.now !== 1)     bad(tag + ': ตกรางชี้ขั้นที่ ' + (o.now + 1) + ' ควรหยุดที่ขั้น 2 (ไฟแนนซ์)');
      if (o.linesOn !== 1) bad(tag + ': ตกรางทำเส้นทึบ ' + o.linesOn + ' เส้น ควรเป็น 1');
      const hollow = await p.$eval('#dlOne .pstep.off .pn.now', e => getComputedStyle(e).backgroundColor);
      if (!/255,\s*255,\s*255|rgb\(255/.test(hollow)) bad(tag + ': วงตกรางควรเป็นวงกลวง (พื้นขาว) ได้ ' + hollow);
    }

    /* 4 · เส้นทาง 4 ขั้นของดีลเงินสด */
    const cashId = await p.evaluate(() => { const d = dealAll().find(x => x.cash); return d ? d.c.id : null; });
    if (!cashId) bad(tag + ': ไม่มีดีลเงินสดใน seed');
    else {
      await p.evaluate(id => { DEAL_SEL = id; rDeal(); }, cashId);
      await p.waitForTimeout(250);
      const c = await p.$eval('#dlOne .pstep', eval(SHAPE));
      if (c.n !== 4) bad(tag + ': ดีลเงินสดมี ' + c.n + ' ขั้น ควรเป็น 4');
      if (c.labels.indexOf('ไฟแนนซ์') >= 0) bad(tag + ': ดีลเงินสดยังโชว์ขั้นไฟแนนซ์');
    }

    /* 5 · ไม่ล้นออกข้างทั้งหน้าและตัวแถบเอง */
    const over = await p.evaluate(() => document.body.scrollWidth - window.innerWidth);
    if (over > 1) bad(tag + ': หน้าดีลล้นออกข้าง ' + over + 'px');
    const barOver = await p.evaluate(() => Math.max(0, ...Array.from(document.querySelectorAll('.pstep'))
      .map(e => e.scrollWidth - e.clientWidth)));
    if (barOver > 1) bad(tag + ': แถบล้นกรอบตัวเอง ' + barOver + 'px');

    await ctx.close();
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
