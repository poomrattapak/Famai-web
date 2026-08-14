/* ด่าน v1.23 — สีประจำกลุ่มเดินตามหน้า
   เจ้าของสั่ง: "อยากให้แต่ละกลุ่มมีสีเพื่อแยกกลุ่มแบบชัดกว่านี้" (เส้นใต้หนา + ตัวอักษรสีกลุ่ม)
   สามจุดที่ต้องเป็นสีกลุ่มของหน้าที่เปิดอยู่: แถบแท็บในหน้า · หัวกลุ่มเมนูซ้าย/แผ่น "อื่น ๆ" · แถบแท็บล่างมือถือ
   ทุกสีต้องมาจาก token --grp1..6 (ธีมสลับตามได้เอง) และคู่สีพื้น/ตัวอักษรต้องอ่านออกจริงทุกธีม */
const { chromium, EXE, BASE } = require('./env');

/* หน้าที่มีแถบแท็บ + เลขกลุ่มที่ควรเป็น (ลำดับกลุ่มใน MENU: ภาพรวม 1 · มอเตอร์ไซค์ 2 ·
   ลูกค้าและการเงิน 3 · บริการและอะไหล่ 4 · บัญชีและพนักงาน 5 · ข้อมูลและตั้งค่า 6) */
const TABBED = [['report', 1], ['stock', 2], ['parts', 4], ['hr', 5], ['settings', 6]];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(400); };
  await login(p, 'ST1');                                   /* ST1 = แอดมิน เห็นครบทั้ง 6 กลุ่ม */

  /* 1 · เปิดหน้าคนละกลุ่ม → --grp-cur ตามหน้า และเส้นใต้แท็บใช้ค่านั้นจริง (ไม่ใช่แค่ประกาศไว้เฉย ๆ) */
  const t1 = await p.evaluate(pairs => {
    /* วัดสีที่เรนเดอร์จริงเป็น rgb() ทุกตัว จะได้เทียบกับ token ตรง ๆ ได้โดยไม่ต้องแปลง hex เอง */
    const tok = n => { const d = document.createElement('div');
      d.style.color = 'var(--grp' + n + ')'; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove(); return c; };
    const out = [];
    for (const [k, gi] of pairs) {
      go(k);
      const on = document.querySelector('#s-' + k + ' .tabs button.on');
      const af = on ? getComputedStyle(on, '::after') : null;
      out.push({ k, gi, attr: document.documentElement.dataset.gcur || '',
        want: tok(gi), found: !!on,
        line: af ? af.backgroundColor : '', h: af ? af.height : '',
        txt: on ? getComputedStyle(on).color : '' });
    }
    return out;
  }, TABBED);
  for (const r of t1) {
    if (!r.found)                bad(r.k + ': ไม่เจอแท็บที่เลือกอยู่ (.tabs button.on)');
    if (r.attr !== String(r.gi)) bad(r.k + ': data-gcur = "' + r.attr + '" ควรเป็น "' + r.gi + '"');
    if (r.line !== r.want)       bad(r.k + ': เส้นใต้แท็บ ' + r.line + ' ไม่ใช่สีกลุ่ม ' + r.want);
    if (r.txt !== r.want)        bad(r.k + ': ตัวอักษรแท็บที่เลือก ' + r.txt + ' ไม่ใช่สีกลุ่ม ' + r.want);
    if (r.h !== '3px')           bad(r.k + ': เส้นใต้หนา ' + r.h + ' ควรเป็น 3px');
  }
  /* กันกรณีทุกหน้าได้สีเดียวกันแล้วเทสต์ข้างบนผ่านหมด — ต้องแยกกลุ่มได้จริงด้วยตา */
  const distinct = new Set(t1.map(r => r.line).filter(Boolean));
  if (distinct.size < TABBED.length) bad('เส้นใต้แท็บซ้ำกันข้ามกลุ่ม — ได้ ' + distinct.size + ' สี จาก ' + TABBED.length + ' กลุ่ม');

  /* 2 · คอนทราสต์: ชิปที่เลือกบนมือถือเป็นพื้นสีกลุ่มเต็ม ตัวอักษรเป็น --paper
         ต้องอ่านออกครบ 6 กลุ่ม × 4 ธีม (เกณฑ์ WCAG AA ตัวอักษรเล็ก 4.5:1) */
  const t2 = await p.evaluate(() => {
    const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, c) => { const L = [lum(a), lum(c)];
      return (Math.max(...L) + 0.05) / (Math.min(...L) + 0.05); };
    const probe = v => { const d = document.createElement('div');
      d.style.color = v; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove(); return c; };
    const de = document.documentElement, keep = de.dataset.theme || '', out = [];
    for (const th of ['', 'dark', 'warm', 'cool']) {
      if (th) de.dataset.theme = th; else delete de.dataset.theme;
      const paper = probe('var(--paper)');
      for (let n = 1; n <= 6; n++) out.push({ th: th || 'std', n, r: ratio(probe('var(--grp' + n + ')'), paper) });
    }
    if (keep) de.dataset.theme = keep; else delete de.dataset.theme;
    return out;
  });
  for (const c of t2) if (c.r < 4.5)
    bad('คอนทราสต์ชิปกลุ่ม ' + c.n + ' ธีม ' + c.th + ' = ' + c.r.toFixed(2) + ':1 ต่ำกว่า 4.5 (อ่านไม่ออก)');

  /* 3 · หัวกลุ่มเมนูซ้าย — เส้นใต้สีประจำกลุ่มครบทั้ง 6 (แยกกลุ่มด้วยเส้น ไม่ใช่แค่สีตัวอักษร) */
  const t3 = await p.evaluate(() => {
    const tok = n => { const d = document.createElement('div');
      d.style.color = 'var(--grp' + n + ')'; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove(); return c; };
    return [...document.querySelectorAll('#nav h6')].map(h => {
      const g = [...h.classList].find(c => /^mg[1-6]$/.test(c)) || '';
      const cs = getComputedStyle(h);
      return { t: h.textContent, g, w: cs.borderBottomWidth, c: cs.borderBottomColor,
        want: g ? tok(g.slice(2)) : '' };
    });
  });
  if (t3.length !== 6) bad('หัวกลุ่มในเมนูซ้ายมี ' + t3.length + ' กลุ่ม ควรเป็น 6 (แอดมินเห็นครบ)');
  for (const h of t3) {
    if (!h.g)                  bad('หัวกลุ่ม "' + h.t + '" ไม่มีคลาส mg1-mg6');
    else if (h.w === '0px')    bad('หัวกลุ่ม "' + h.t + '" ไม่มีเส้นใต้');
    else if (h.c !== h.want)   bad('หัวกลุ่ม "' + h.t + '" เส้นใต้ ' + h.c + ' ไม่ใช่สีกลุ่ม ' + h.want);
  }

  /* 4-5 · มือถือ 390px — แผ่น "อื่น ๆ" และแถบแท็บล่าง */
  const m = await ctx.newPage();
  m.on('pageerror', e => errors.push('M PAGEERROR ' + e.message));
  await m.setViewportSize({ width: 390, height: 844 });
  await login(m, 'ST1');

  const t4 = await m.evaluate(() => {
    const tok = n => { const d = document.createElement('div');
      d.style.color = 'var(--grp' + n + ')'; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove(); return c; };
    openMore();
    const hs = [...document.querySelectorAll('#moreB h6')].map(h => {
      const g = [...h.classList].find(c => /^mg[1-6]$/.test(c)) || '';
      const cs = getComputedStyle(h);
      return { t: h.textContent, g, c: cs.color, w: cs.borderBottomWidth, want: g ? tok(g.slice(2)) : '' };
    });
    closeMore();
    return hs;
  });
  const helpH = t4.filter(h => h.t === 'ช่วยเหลือ');        /* หัวข้อคู่มือไม่ใช่กลุ่มเมนู ไม่ต้องมีสี */
  for (const h of t4.filter(h => h.t !== 'ช่วยเหลือ')) {
    if (!h.g)                bad('แผ่นอื่น ๆ: หัวกลุ่ม "' + h.t + '" ไม่มีคลาส mg1-mg6');
    else if (h.c !== h.want) bad('แผ่นอื่น ๆ: หัวกลุ่ม "' + h.t + '" สี ' + h.c + ' ไม่ใช่สีกลุ่ม ' + h.want);
    else if (h.w === '0px')  bad('แผ่นอื่น ๆ: หัวกลุ่ม "' + h.t + '" ไม่มีเส้นใต้');
  }
  if (!helpH.length) bad('แผ่นอื่น ๆ: ไม่เจอหัวข้อ "ช่วยเหลือ" — โครงแผ่นเปลี่ยนไปจากที่ด่านนี้รู้จัก');

  const t5 = await m.evaluate(() => {
    if (typeof grpOf !== 'function') return { nofn: true };
    const tok = n => { const d = document.createElement('div');
      d.style.color = 'var(--grp' + n + ')'; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove(); return c; };
    const btns = [...document.querySelectorAll('#bnav .bnb[data-s]')].map(x => {
      const g = [...x.classList].find(c => /^mg[1-6]$/.test(c)) || '';
      return { k: x.dataset.s, g, want: 'mg' + grpOf(x.dataset.s),
        ic: getComputedStyle(x.querySelector('.i')).color, wantC: tok(grpOf(x.dataset.s)) };
    });
    /* แท็บที่เลือกอยู่: เส้น 3px ขอบบน (บาร์ติดขอบล่างจอ เส้นใต้จะไปชนแถบ home ของ iPhone)
       getComputedStyle คืนออบเจ็กต์ที่มีชีวิต — ต้องคัดค่าเป็นสตริงก่อนเปลี่ยนหน้า ไม่งั้นอ่านได้ค่าของหน้าถัดไป */
    go('stock');
    const onB = document.querySelector('#bnav .bnb.on');
    const l = onB ? getComputedStyle(onB, '::before') : null;
    const line = l ? l.backgroundColor : '', h = l ? l.height : '', on = onB ? onB.dataset.s : '';
    /* หน้าที่ไม่มีในบาร์ → ปุ่ม "อื่น ๆ" ติดสว่างแทน ต้องใช้สีของกลุ่มหน้าที่เปิดอยู่ */
    go('settings');
    const more = document.querySelector('#bnav .bnb[data-more]');
    const moreOn = !!more && more.classList.contains('on');
    const mline = moreOn ? getComputedStyle(more, '::before').backgroundColor : '';
    return { btns, on, line, h, want2: tok(2), moreOn, mline, want6: tok(6) };
  });
  if (t5.nofn) bad('ไม่มีฟังก์ชัน grpOf() — หาเลขกลุ่มของหน้าไม่ได้');
  else {
    for (const x of t5.btns) {
      if (x.g !== x.want)   bad('แถบล่าง ' + x.k + ': คลาส "' + x.g + '" ควรเป็น "' + x.want + '"');
      if (x.ic !== x.wantC) bad('แถบล่าง ' + x.k + ': ไอคอนสี ' + x.ic + ' ไม่ใช่สีกลุ่ม ' + x.wantC);
    }
    if (t5.on !== 'stock')     bad('แถบล่าง: เปิดหน้าสต๊อกแล้วแท็บที่ติดคือ "' + t5.on + '"');
    if (t5.line !== t5.want2)  bad('แถบล่าง: เส้นแท็บที่เลือก ' + t5.line + ' ไม่ใช่สีกลุ่ม ' + t5.want2);
    if (t5.h !== '3px')        bad('แถบล่าง: เส้นแท็บที่เลือกหนา ' + t5.h + ' ควรเป็น 3px');
    if (!t5.moreOn)            bad('แถบล่าง: เปิดหน้าตั้งค่าแล้วปุ่ม "อื่น ๆ" ไม่ติดสว่าง');
    else if (t5.mline !== t5.want6)
      bad('แถบล่าง: ปุ่ม "อื่น ๆ" เส้น ' + t5.mline + ' ไม่ใช่สีกลุ่มของหน้าที่เปิดอยู่ ' + t5.want6);
  }

  /* 6 · ธีมมืด — สีทุกจุดมาจาก token จริง ไม่ได้ hardcode ไว้ในกฎ CSS */
  const t6 = await p.evaluate(() => {
    const read = () => { go('stock');
      const on = document.querySelector('#s-stock .tabs button.on');
      return getComputedStyle(on, '::after').backgroundColor; };
    go('custom');
    document.querySelector('#cuTheme [data-cut="std"]').onclick();
    const std = read();
    go('custom');
    document.querySelector('#cuTheme [data-cut="dark"]').onclick();
    const dark = read();
    go('custom');
    document.querySelector('#cuTheme [data-cut="std"]').onclick();
    return { std, dark };
  });
  if (t6.std === t6.dark) bad('ธีมมืดแล้วสีกลุ่มไม่เปลี่ยน (' + t6.std + ') — น่าจะ hardcode ไม่ได้อ่าน token');

  /* 7 · คลาสกลุ่มต้องให้ "สี" อย่างเดียว ห้ามไปเปลี่ยนการจัดวาง
     (v1.20 ใช้ชื่อ g1-g6 ซึ่งชนกับคลาสจัดหน้า .g2/.g3 — กลุ่ม 2 กับ 3 กลายเป็น grid
      ไอคอนกับชื่อเมนูเลยคนละบรรทัด แถวสูงเป็นสองเท่า v1.23 เปลี่ยนเป็น mg1-mg6) */
  const t7 = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#nav .nb')].map(b => {
      const i = b.querySelector('.i').getBoundingClientRect(), s = b.querySelector('span').getBoundingClientRect();
      return { k: b.dataset.s, g: [...b.classList].find(c => /^mg[1-6]$/.test(c)) || '',
        d: getComputedStyle(b).display, sameLine: Math.abs(i.y - s.y) < i.height };
    });
    return rows;
  });
  for (const r of t7) {
    if (r.d !== 'flex')  bad('เมนู ' + r.k + ' (' + r.g + '): display = ' + r.d + ' ควรเป็น flex — คลาสกลุ่มไปชนคลาสจัดหน้า');
    if (!r.sameLine)     bad('เมนู ' + r.k + ' (' + r.g + '): ไอคอนกับชื่อคนละบรรทัด');
  }

  await m.close();
  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
