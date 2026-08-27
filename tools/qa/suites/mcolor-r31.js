/* ด่านของ "1 สี = 1 การ์ด · รูปผูกกับสี" (v1.31)
   คำสั่งเจ้าของ 23 ส.ค. 2569: "แยก 1 สีในแต่ละรุ่นเป็น 1 card เพราะตอนใส่รูป ต้องใส่รูปรถให้ตรงสี
   พอเป็นให้เพิ่มรูปได้รูปเดียว แต่ใส่สีได้หลายบรรทัด จะทำให้สับสน"

   หัวใจของด่านนี้คือข้อ 3: **ใส่รูปให้สีหนึ่ง แล้วสีอื่นในรุ่นเดียวกันต้องไม่ได้รูปนั้นไปใช้**
   ถ้าข้อนี้เขียวโดยที่โค้ดยังผูกรูปกับรุ่น แปลว่าด่านอ่อน ไม่ใช่ว่าโค้ดถูก
   จึงตรวจทั้งฝั่งที่ "ควรมีรูป" และฝั่งที่ "ต้องไม่มีรูป" คู่กันทุกข้อ */
const { chromium, EXE, BASE } = require('./env');

/* PNG 1x1 — เล็กที่สุดที่ imgPrepare ยังทำงานได้จริง ไม่ต้องพึ่งไฟล์ในรีโป */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  for (const W of [1440, 390]) {
    const tag = W + 'px';
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: W, height: 1000 } });
    ctx.setDefaultTimeout(8000);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(tag + ' PAGEERROR ' + e.message));
    p.on('console', m => { const u = (m.location() || {}).url || '';
      if (m.type() === 'error' && !/favicon|fonts\.g|gstatic/.test(u) && !/ERR_CONNECTION/.test(m.text()))
        errors.push(tag + ' CONSOLE ' + m.text()); });
    await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.click('#lgGo'); await p.waitForTimeout(450);
    await p.evaluate(() => go('settings')); await p.waitForTimeout(250);

    /* ---------- 1 · หนึ่งสี = หนึ่งการ์ด ทุกรุ่นในตารางราคา ---------- */
    const per = await p.evaluate(async () => {
      const out = [];
      for (const v of Object.keys(PRICE)) {
        modelModal(v);
        out.push({ v, want: Object.keys(PRICE[v].c).length,
                   got: document.querySelectorAll('#vmColorList .vmrow').length,
                   codes: [...document.querySelectorAll('#vmColorList [data-vcc]')].map(e => e.value).join(','),
                   names: [...document.querySelectorAll('#vmColorList [data-vcn]')].map(e => e.value).join(','),
                   rm: document.querySelectorAll('#vmColorList [data-vcx]').length });
        closeModal();
      }
      return out;
    });
    per.forEach(r => {
      if (r.got !== r.want) bad(tag + ' ' + r.v + ': มีสี ' + r.want + ' สี แต่ได้การ์ด ' + r.got + ' ใบ');
      if (r.codes !== Object.keys({}).join(',') && r.codes.split(',').filter(Boolean).length !== r.want)
        bad(tag + ' ' + r.v + ': รหัสสีในการ์ดไม่ครบ [' + r.codes + ']');
      if (r.names.split(',').filter(Boolean).length !== r.want)
        bad(tag + ' ' + r.v + ': ชื่อสีในการ์ดไม่ครบ [' + r.names + ']');
      /* รุ่นที่มีสีเดียวต้องลบสีสุดท้ายทิ้งไม่ได้ — ไม่งั้นเหลือรุ่นที่ไม่มีสีเลย */
      const wantRm = r.want > 1 ? r.want : 0;
      if (r.rm !== wantRm) bad(tag + ' ' + r.v + ': ปุ่มเอาออกมี ' + r.rm + ' ปุ่ม ควรเป็น ' + wantRm);
    });

    /* ---------- 2 · เพิ่มการ์ดได้ และการ์ดใหม่ว่างเปล่า ---------- */
    await p.evaluate(() => modelModal('BTF200')); await p.waitForTimeout(250);
    const before = await p.evaluate(() => document.querySelectorAll('#vmColorList .vmrow').length);
    await p.click('#vmColorAdd'); await p.waitForTimeout(200);
    const added = await p.evaluate(() => ({
      n: document.querySelectorAll('#vmColorList .vmrow').length,
      lastCode: [...document.querySelectorAll('#vmColorList [data-vcc]')].pop().value,
      lastName: [...document.querySelectorAll('#vmColorList [data-vcn]')].pop().value }));
    if (added.n !== before + 1) bad(tag + ': กด "+ เพิ่มสี" แล้วการ์ดไม่เพิ่ม (' + before + '→' + added.n + ')');
    if (added.lastCode || added.lastName) bad(tag + ': การ์ดใหม่ควรว่าง แต่ได้ ' + added.lastCode + '/' + added.lastName);

    /* ---------- 3 · หัวใจ: ใส่รูปให้สีเดียว สีอื่นต้องไม่ได้รูปนั้น ---------- */
    await p.evaluate(() => { closeModal(); modelModal('BTF200'); }); await p.waitForTimeout(250);
    const [chooser] = await Promise.all([
      p.waitForEvent('filechooser'),
      p.click('#vmColorList [data-vcp="0"]')
    ]);
    await chooser.setFiles({ name: 'c0.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForTimeout(900);          /* imgPrepare ย่อสองชั้นบนแคนวาสก่อน */

    const inSheet = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#vmColorList .vmrow')];
      return rows.map(r => ({ img: !!r.querySelector('.bph img'), svg: !!r.querySelector('.bph svg'),
                              note: (r.querySelector('.vmst') || {}).textContent || '' }));
    });
    if (!inSheet[0] || !inSheet[0].img) bad(tag + ': ใส่รูปให้การ์ดแรกแล้วการ์ดแรกยังไม่โชว์รูป');
    inSheet.slice(1).forEach((r, i) => {
      if (r.img) bad(tag + ': ใส่รูปให้การ์ดแรก แต่การ์ดที่ ' + (i + 2) + ' ได้รูปนั้นไปด้วย — รูปไม่ได้ผูกกับสี');
      if (!/ยังไม่มีรูป/.test(r.note)) bad(tag + ': การ์ดที่ ' + (i + 2) + ' ไม่มีรูปแต่ไม่ได้เขียนบอก ("' + r.note.trim() + '")');
    });

    /* ---------- 4 · บันทึกแล้วรูปต้องอยู่กับสีนั้นสีเดียวใน PRICE ---------- */
    await p.click('#vmGo'); await p.waitForTimeout(400);
    const saved = await p.evaluate(() => {
      const c = PRICE['BTF200'].c, k = Object.keys(c).sort();
      return { k, withImg: k.filter(x => c[x].img || c[x].imgUrl), first: k[0] };
    });
    if (saved.withImg.length !== 1)
      bad(tag + ': บันทึกแล้วมีสีที่ถือรูป ' + saved.withImg.length + ' สี ควรมีสีเดียว [' + saved.withImg + ']');
    else if (saved.withImg[0] !== saved.first)
      bad(tag + ': รูปไปอยู่กับสี ' + saved.withImg[0] + ' ควรอยู่กับ ' + saved.first);

    /* ---------- 5 · bikeArt หยิบรูปตามรหัสสีที่ส่งเข้าไป ---------- */
    const art = await p.evaluate(() => {
      const c = PRICE['BTF200'].c, k = Object.keys(c).sort();
      return { withImg: bikeArt('BTF200', c[k[0]].name, k[0]),
               without: bikeArt('BTF200', c[k[1]].name, k[1]) };
    });
    if (!/<img/.test(art.withImg)) bad(tag + ': bikeArt ของสีที่มีรูป ไม่ได้คืนรูป');
    if (!/<svg/.test(art.without)) bad(tag + ': bikeArt ของสีที่ยังไม่มีรูป ไปหยิบรูปของสีอื่นมาใช้');

    /* ---------- 6 · หน้าสต๊อกหยิบรูปตามสีของรถคันนั้น ---------- */
    const stock = await p.evaluate(() => {
      /* หารุ่นที่มีรถจริงในสต๊อกอย่างน้อยสองสี — ไม่ล็อกรหัสรุ่นไว้ตายตัว
         เพราะข้อมูลสาธิตเปลี่ยนได้ และด่านที่ข้ามตัวเองเงียบ ๆ ก็เท่ากับไม่มีด่าน */
      const by = {};
      UNITS.forEach(u => { (by[u.variant] = by[u.variant] || {})[u.colorCode] = u; });
      const v = Object.keys(by).find(k => Object.keys(by[k]).length >= 2 && PRICE[k]);
      if (!v) return { skip: true };
      const [ca, cb] = Object.keys(by[v]).sort();
      const ea = PRICE[v].c[ca], eb = PRICE[v].c[cb];
      if (!ea || !eb) return { skip: true };
      const keep = ea.img;
      ea.img = 'data:image/jpeg;base64,AAAA';
      const a = bikeArt(by[v][ca].variant, by[v][ca].color, by[v][ca].colorCode);
      const b = bikeArt(by[v][cb].variant, by[v][cb].color, by[v][cb].colorCode);
      if (keep) ea.img = keep; else delete ea.img;
      return { skip: false, v, ca, cb, a, b, ebHasImg: !!(eb.img || eb.imgUrl) };
    });
    if (stock.skip) bad(tag + ': ข้อมูลสาธิตไม่มีรุ่นไหนที่มีรถสองสี — ด่านข้อ 6 พิสูจน์อะไรไม่ได้');
    else if (stock.ebHasImg) bad(tag + ': สีเทียบ (' + stock.cb + ') มีรูปอยู่แล้ว เทียบไม่ได้');
    else {
      if (!/<img/.test(stock.a)) bad(tag + ' ' + stock.v + '/' + stock.ca + ': คันที่สีมีรูป กลับได้เงารถ');
      if (!/<svg/.test(stock.b)) bad(tag + ' ' + stock.v + '/' + stock.cb + ': คันที่สียังไม่มีรูป กลับได้รูปของสีอื่น');
    }

    /* ---------- 7 · แถบสีในหน้ารายการรุ่น = สีละช่อง ---------- */
    await p.evaluate(() => { rModels(); }); await p.waitForTimeout(250);
    const strip = await p.evaluate(() => {
      const want = Object.keys(PRICE).reduce((n, v) => n + Object.keys(PRICE[v].c).length, 0);
      const got = document.querySelectorAll('#vmTable .vmc').length;
      const noPhoto = [...document.querySelectorAll('#vmTable .vmc')]
        .filter(e => !e.querySelector('img')).filter(e => !/ยังไม่มีรูป/.test(e.textContent)).length;
      return { want, got, noPhoto };
    });
    if (strip.got !== strip.want) bad(tag + ': แถบสีในรายการมี ' + strip.got + ' ช่อง ควรเป็น ' + strip.want);
    if (strip.noPhoto) bad(tag + ': มี ' + strip.noPhoto + ' ช่องที่ไม่มีรูปแต่ไม่ได้เขียนว่า "ยังไม่มีรูป"');

    /* ---------- 8 · ด่านของฟอร์ม — เรียกตัวบันทึกจริง ไม่ใช่ดูว่าปุ่มถูกซ่อน (§9b) ---------- */
    const guards = await p.evaluate(() => {
      const out = {};
      const last = () => { const t = [...document.querySelectorAll('#toasts .toast')].pop();
        return t ? { bad: t.classList.contains('bad'), head: t.querySelector('b').textContent } : null; };
      const clr = () => document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
      /* ด่านที่ล้มด้วย exception บอกอะไรไม่ได้ — ถ้าการ์ดหาย ให้รายงานว่าหาย ไม่ใช่ระเบิด */
      const setRow = (i, code, name) => {
        const cc = document.querySelectorAll('#vmColorList [data-vcc]')[i];
        const cn = document.querySelectorAll('#vmColorList [data-vcn]')[i];
        if (!cc || !cn) { out.missing = 'ไม่มีการ์ดใบที่ ' + (i + 1) + ' ให้กรอก'; return false; }
        cc.value = code; cc.dispatchEvent(new Event('input', { bubbles: true }));
        cn.value = name; cn.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      const fresh = () => { closeModal(); modelModal();
        document.getElementById('vmCode').value = 'ZZ0001';
        document.getElementById('vmName').value = 'ทดสอบ'; };

      fresh(); document.getElementById('vmColorAdd').click();
      setRow(0, '010A', 'ดำ'); setRow(1, '010A', 'แดง');
      clr(); document.getElementById('vmGo').click(); out.dup = last();

      fresh(); setRow(0, '010A', ''); clr(); document.getElementById('vmGo').click(); out.half = last();
      fresh(); setRow(0, '', 'ดำ');   clr(); document.getElementById('vmGo').click(); out.half2 = last();
      fresh(); setRow(0, '', '');     clr(); document.getElementById('vmGo').click(); out.none = last();
      closeModal();
      return out;
    });
    const wantToast = (k, txt) => { const t = guards[k];
      if (guards.missing) return;
      if (!t || !t.bad) bad(tag + ' ด่าน ' + k + ': ไม่มี toast แดง — บันทึกผ่านไปแล้ว');
      else if (t.head.indexOf(txt) < 0) bad(tag + ' ด่าน ' + k + ': ได้ "' + t.head + '" ควรมีคำว่า "' + txt + '"'); };
    if (guards.missing) bad(tag + ' ด่านฟอร์ม: ' + guards.missing);
    wantToast('dup',   'รหัสสีซ้ำ');
    wantToast('half',  'กรอกรหัสสีและชื่อสีให้ครบ');
    wantToast('half2', 'กรอกรหัสสีและชื่อสีให้ครบ');
    wantToast('none',  'ต้องมีอย่างน้อย 1 สี');
    if (await p.evaluate(() => !!PRICE['ZZ0001']))
      bad(tag + ': ด่านเด้งครบแต่รุ่น ZZ0001 ถูกบันทึกลง PRICE จริง — ด่านไม่ได้กัน');

    /* ---------- 9 · เพย์โหลดสาธารณะ: รูปเดินคู่กับสี ---------- */
    const pub = await p.evaluate(() => {
      const m = pubModel('BTF200');
      return { keys: Object.keys(m).sort(), colors: m.colors,
               photo: m.photo, colorKeys: Object.keys(m.colors[0] || {}).sort() };
    });
    if (pub.colorKeys.join(',') !== 'code,name,photo,photoFull')
      bad(tag + ': คีย์ของสีในเพย์โหลดสาธารณะเป็น [' + pub.colorKeys + '] ควรเป็น code,name,photo,photoFull');
    /* รูปในเซสชัน (dataURL) ต้องไม่หลุดออกเพย์โหลดสาธารณะ — สาธารณะใช้ได้เฉพาะ URL บน Storage */
    if (JSON.stringify(pub.colors).indexOf('data:image') >= 0)
      bad(tag + ': dataURL ของรูปหลุดออกไปกับเพย์โหลดสาธารณะ');

    /* ---------- 11 · แกลเลอรีสต๊อก: หนึ่งใบ = รุ่น + สี ---------- */
    await p.evaluate(() => { closeModal(); go('stock'); }); await p.waitForTimeout(300);
    await p.evaluate(() => stTab('gal')); await p.waitForTimeout(350);
    const gal = await p.evaluate(() => {
      const seen = new Set();
      stList().forEach(u => seen.add(u.variant + '|' + u.colorCode));
      const cards = [...document.querySelectorAll('#stGal .gcard')];
      /* v1.42 (คำสั่งเจ้าของ): แถบ+พิลล์บนการ์ดบอก "จำนวนของแต่ละสีของรุ่นนั้น" ไม่ใช่สาขา
         (สาขาเลือกจากขอบเขตบน navbar) — ผลรวมพิลล์จึงต้องเท่ากับจำนวนรถทั้งรุ่นใน stList
         และจุดสีของพิลล์ต้องเป็นสีจริงของสีนั้น (COLOR_HEX) ไม่ใช่สีประจำสาขา */
      const mTot = {}, mCol = {};
      stList().forEach(u => { mTot[u.model] = (mTot[u.model] || 0) + 1;
        (mCol[u.model] = mCol[u.model] || {})[u.color] = (mCol[u.model][u.color] || 0) + 1; });
      return { want: seen.size, got: cards.length,
        mismatch: cards.filter(c => {
          const m = c.dataset.gmodel;
          const sum = [...c.querySelectorAll('.cs .pill')]
            .reduce((t, x) => t + (+(x.textContent.trim().match(/(\d+)$/) || [0, 0])[1]), 0);
          return sum !== mTot[m];
        }).length,
        /* พิลล์ต้องเป็นรายสีของรุ่น: ชื่อสี+จำนวนตรง mCol และจุดสีเป็น COLOR_HEX ของสีนั้น */
        wrongColor: cards.filter(c => {
          const m = c.dataset.gmodel, want = mCol[m] || {};
          const pills = [...c.querySelectorAll('.cs .pill')];
          if (pills.length !== Object.keys(want).length) return true;
          return pills.some(x => {
            const mm = x.textContent.trim().match(/^(.+?)\s+(\d+)$/); if (!mm) return true;
            if (want[mm[1]] !== +mm[2]) return true;
            const dot = x.querySelector('.dot');
            /* เทียบผ่าน probe — เบราว์เซอร์ normalize hex เป็น rgb() ตอนอ่านกลับ */
            const probe = document.createElement('i');
            probe.style.background = COLOR_HEX[mm[1]] || '#ccc';
            return !dot || dot.style.background !== probe.style.background;
          });
        }).length,
        /* ท่อนแถบต้องเท่ากับจำนวนพิลล์ ไม่งั้นแถบเล่าเรื่องคนละเรื่องกับตัวเลข */
        barPill: cards.filter(c => c.querySelectorAll('.gbar i').length !== c.querySelectorAll('.cs .pill').length).length,
        /* พิลล์ต้องมีจุดสีเดียว — .pill มีจุดของตัวเองอยู่แล้ว ถ้าใส่ .dot เพิ่มโดยไม่ปิดจะได้สองจุด */
        twoDots: cards.filter(c => [...c.querySelectorAll('.cs .pill')]
          .some(x => !x.classList.contains('pdot'))).length,
        subs: cards.slice(0, 3).map(c => c.querySelector('.gb .c').textContent) };
    });
    if (gal.got !== gal.want) bad(tag + ': แกลเลอรีมี ' + gal.got + ' ใบ ควรเป็น ' + gal.want + ' (รุ่น+สีที่มีรถจริง)');
    if (gal.mismatch)  bad(tag + ': ' + gal.mismatch + ' ใบที่ผลรวมพิลล์ไม่เท่ากับจำนวนรถทั้งรุ่น');
    if (gal.wrongColor) bad(tag + ': ' + gal.wrongColor + ' ใบที่พิลล์ไม่ใช่รายสีของรุ่น (ชื่อ/จำนวน/จุดสีไม่ตรง)');
    if (gal.barPill)   bad(tag + ': ' + gal.barPill + ' ใบที่จำนวนท่อนแถบไม่เท่ากับจำนวนพิลล์');
    if (gal.twoDots)   bad(tag + ': พิลล์ไม่ได้ปิดจุดอัตโนมัติ (.pdot) จะได้จุดสองจุดซ้อนกัน');
    /* บรรทัดรองต้องบอก "รหัสรุ่น · ชื่อสี" — ถ้าไม่มีชื่อสี แปลว่ายังจัดกลุ่มด้วยรุ่นอย่างเดียว */
    gal.subs.forEach((t, i) => { if (t.indexOf('·') < 0)
      bad(tag + ': การ์ดที่ ' + (i + 1) + ' ไม่ได้บอกสีในบรรทัดรอง ("' + t.trim() + '")'); });

    /* ---------- 12 · รูปในแกลเลอรีเป็นรูปของสีนั้นใบเดียว ---------- */
    const galImg = await p.evaluate(() => {
      const u = stList()[0]; if (!u) return { skip: true };
      const e = PRICE[u.variant] && PRICE[u.variant].c[u.colorCode]; if (!e) return { skip: true };
      const keep = e.img;
      e.img = 'data:image/jpeg;base64,AAAA';
      rStock();
      const withImg = [...document.querySelectorAll('#stGal .gcard')].filter(c => c.querySelector('.ph img')).length;
      if (keep) e.img = keep; else delete e.img;
      rStock();
      return { skip: false, withImg };
    });
    if (!galImg.skip && galImg.withImg !== 1)
      bad(tag + ': ใส่รูปให้สีเดียว แต่การ์ดที่โชว์รูปมี ' + galImg.withImg + ' ใบ ควรมีใบเดียว');

    /* ---------- 13 · กดการ์ดแล้วต้องได้ตารางที่กรองรุ่น+สีนั้นพอดี ---------- */
    const jump = await p.evaluate(() => {
      const c = document.querySelector('#stGal .gcard');
      const n = +c.querySelector('.gqty').textContent;
      c.click();
      return { n, model: document.getElementById('stModel').value,
               color: document.getElementById('stColor').value, rows: stList().length };
    });
    await p.waitForTimeout(250);
    if (!jump.model || !jump.color)
      bad(tag + ': กดการ์ดแล้วตัวกรองไม่ได้ตั้งทั้งรุ่นและสี (' + jump.model + '/' + jump.color + ')');
    else if (jump.rows !== jump.n)
      bad(tag + ': การ์ดบอก ' + jump.n + ' คัน แต่กดเข้าไปเจอ ' + jump.rows + ' คัน');
    await p.evaluate(() => { document.getElementById('stModel').value = '';
      document.getElementById('stColor').value = ''; rStock(); });

    /* ---------- 10 · ไม่ล้นออกข้าง ---------- */
    await p.evaluate(() => { go('settings'); }); await p.waitForTimeout(250);
    await p.evaluate(() => modelModal('BJKD00')); await p.waitForTimeout(300);
    const over = await p.evaluate(() => {
      const mb = document.querySelector('#mdB');
      return { page: document.body.scrollWidth - innerWidth,
               sheet: mb ? mb.scrollWidth - mb.clientWidth : 0 };
    });
    if (over.page > 1)  bad(tag + ': หน้าตั้งค่าล้นออกข้าง ' + over.page + 'px');
    if (over.sheet > 1) bad(tag + ': การ์ดสีล้นออกนอกแผ่น ' + over.sheet + 'px');

    await ctx.close();
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
