/* v1.14 — ย่อรูปก่อนอัป: คุณภาพดีแต่ประหยัดพื้นที่
   ตรวจของจริง: ขนาดที่ได้ · ชนิดไฟล์ · EXIF หายไหม · ลำดับการเลือกรูปใน bikeArt */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const p = await b.newPage({ viewport:{width:1440,height:900} });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgGo'); await p.waitForTimeout(450);

  /* สร้างรูป "ต้นฉบับ" ใหญ่ ๆ ที่มีรายละเอียดจริง (ไล่สี + ลายเส้น) ไม่ใช่สีทึบ
     ไม่งั้น JPEG/WebP บีบได้เกือบหมดจนวัดอะไรไม่ได้ */
  const big = await p.evaluate(async () => {
    const W = 3000, H = 2000;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#e60012'); grd.addColorStop(0.5, '#151e23'); grd.addColorStop(1, '#ffffff');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `hsl(${(i * 37) % 360} 80% ${30 + (i % 50)}%)`;
      g.fillRect((i * 137) % W, (i * 71) % H, 12, 12);
    }
    const dataUrl = cv.toDataURL('image/jpeg', 0.95);
    return { dataUrl, bytes: Math.round((dataUrl.split(',')[1] || '').length * 3 / 4) };
  });
  if (big.bytes < 300000) fails.push(`รูปทดสอบเล็กเกินไป (${big.bytes} bytes) วัดการย่อไม่ได้`);

  /* ---------- 1 · imgResize คืนขนาดและชนิดที่ถูกต้อง ---------- */
  const r = await p.evaluate(async src => {
    const card = await imgResize(src, 640, 0.82);
    const full = await imgResize(src, 1600, 0.82);
    const dim = bl => new Promise(res => { const im = new Image();
      im.onload = () => res({ w: im.width, h: im.height });
      im.src = URL.createObjectURL(bl); });
    return { card: { type: card.type, ext: card.ext, size: card.blob.size, ...(await dim(card.blob)) },
             full: { type: full.type, ext: full.ext, size: full.blob.size, ...(await dim(full.blob)) } };
  }, big.dataUrl);

  if (r.card.w !== 640 || r.card.h !== 640) fails.push(`ชั้น card ได้ ${r.card.w}x${r.card.h} ควรเป็น 640x640`);
  if (r.full.w !== 1600 || r.full.h !== 1600) fails.push(`ชั้น full ได้ ${r.full.w}x${r.full.h} ควรเป็น 1600x1600`);
  /* ต้องเป็น webp หรือถอยไป jpeg เท่านั้น ห้ามเป็น PNG (Safari เก่าคืน PNG เงียบ ๆ) */
  if (['image/webp','image/jpeg'].indexOf(r.card.type) < 0)
    fails.push(`ชั้น card เป็น ${r.card.type} — ต้องตรวจ blob.type แล้วถอยไป jpeg ไม่ใช่ปล่อยให้เป็น PNG`);
  if (r.card.ext !== (r.card.type === 'image/webp' ? 'webp' : 'jpg'))
    fails.push('นามสกุลไฟล์ไม่ตรงกับชนิดจริง');
  if (r.card.size > 200 * 1024) fails.push(`ชั้น card ${Math.round(r.card.size/1024)} KB ใหญ่เกินไป`);
  if (r.full.size > 900 * 1024) fails.push(`ชั้น full ${Math.round(r.full.size/1024)} KB ใหญ่เกินไป`);
  if (!(r.card.size < r.full.size)) fails.push('ชั้น card ต้องเล็กกว่าชั้น full');

  /* ---------- 2 · ประหยัดพื้นที่จริง ---------- */
  const total = r.card.size + r.full.size;
  if (!(total < big.bytes / 2))
    fails.push(`สองชั้นรวม ${Math.round(total/1024)} KB จากต้นฉบับ ${Math.round(big.bytes/1024)} KB — ประหยัดไม่พอ`);

  /* ---------- 3 · ครอปกลางเป็นจัตุรัส ไม่บีบภาพให้บิด ---------- */
  const notSquished = await p.evaluate(async () => {
    /* รูปกว้าง 1000 สูง 200 · แดงเฉพาะช่วงกลาง x 400-600 ที่เหลือน้ำเงิน
       ครอปกลางถูกต้อง → เห็นเฉพาะช่วง 400-600 คือ "แดงทั้งใบ" รวมถึงขอบซ้าย
       ถ้ายัดทั้งภาพลงจัตุรัส (บิด) → ขอบซ้ายจะกลายเป็นน้ำเงิน
       จึงต้องวัดที่ "ขอบซ้าย" ไม่ใช่จุดกึ่งกลาง เพราะกึ่งกลางเป็นแดงทั้งสองแบบ */
    const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 200;
    const g = cv.getContext('2d');
    g.fillStyle = '#0000ff'; g.fillRect(0, 0, 1000, 200);
    g.fillStyle = '#ff0000'; g.fillRect(400, 0, 200, 200);
    const out = await imgResize(cv.toDataURL('image/png'), 64, 0.9);
    const im = new Image(); im.src = URL.createObjectURL(out.blob);
    await new Promise(res => { im.onload = res; });
    const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64;
    const g2 = c2.getContext('2d'); g2.drawImage(im, 0, 0);
    const at = x => { const d = g2.getImageData(x, 32, 1, 1).data; return { r:d[0], g:d[1], b:d[2] }; };
    return { left: at(4), mid: at(32) };
  });
  if (!(notSquished.mid.r > 150 && notSquished.mid.b < 100))
    fails.push(`จุดกึ่งกลางได้ rgb(${notSquished.mid.r},${notSquished.mid.g},${notSquished.mid.b}) ควรเป็นแดง`);
  if (!(notSquished.left.r > 150 && notSquished.left.b < 100))
    fails.push(`ขอบซ้ายได้ rgb(${notSquished.left.r},${notSquished.left.g},${notSquished.left.b}) ควรเป็นแดง`
      + ' — แปลว่ายัดทั้งภาพลงจัตุรัสจนบิด แทนที่จะครอปกลางแบบ object-fit:cover');

  /* ---------- 3b · เบราว์เซอร์ที่เข้ารหัส webp ไม่ได้ ต้องถอยไป jpeg ----------
     Chromium เข้ารหัส webp ได้เสมอ เส้นทางถอยจึงไม่มีวันถูกเรียกในเทสต์ปกติ
     ต้องจำลอง Safari รุ่นต่ำกว่า 16.4 ที่คืน PNG กลับมาเงียบ ๆ */
  const fb = await p.evaluate(async src => {
    const real = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      /* ขอ webp → แกล้งคืน PNG เหมือน Safari เก่า · ขออย่างอื่น → ทำงานปกติ */
      if (type === 'image/webp') return real.call(this, cb, 'image/png');
      return real.call(this, cb, type, q);
    };
    let out = null, err = null;
    try { out = await imgResize(src, 320, 0.82); } catch (e) { err = String(e); }
    HTMLCanvasElement.prototype.toBlob = real;
    return out ? { type: out.type, ext: out.ext, size: out.blob.size } : { err };
  }, big.dataUrl);
  if (!fb.type) fails.push('เบราว์เซอร์ที่เข้ารหัส webp ไม่ได้ → imgResize พังไปเลย');
  else {
    if (fb.type !== 'image/jpeg')
      fails.push(`เบราว์เซอร์คืน PNG มาแทน webp แต่โค้ดรับไว้เป็น ${fb.type}`
        + ' — ต้องตรวจ blob.type แล้วถอยไป jpeg ไม่งั้นได้ PNG ที่ใหญ่กว่าหลายเท่า');
    if (fb.ext !== 'jpg') fails.push(`นามสกุลควรเป็น jpg ได้ ${fb.ext}`);
  }

  /* ---------- 4 · EXIF ต้องหายไปกับการเข้ารหัสใหม่ ---------- */
  const exif = await p.evaluate(async () => {
    const card = await imgResize(
      document.createElement('canvas').toDataURL('image/png'), 64, 0.8).catch(() => null);
    if (!card) return { skip: true };
    const buf = new Uint8Array(await card.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < Math.min(buf.length, 40000); i++) s += String.fromCharCode(buf[i]);
    return { hasExif: s.indexOf('Exif') >= 0, hasGps: /GPS/.test(s) };
  });
  if (exif.hasExif || exif.hasGps) fails.push('ไฟล์ที่ได้ยังมี EXIF/GPS ติดอยู่');

  /* ---------- 5 · imgPrepare คืนครบทั้งสองชั้น ---------- */
  const prep = await p.evaluate(async src => {
    const bl = await (await fetch(src)).blob();
    const f = new File([bl], 'bike.jpg', { type: 'image/jpeg' });
    const pk = await imgPrepare(f);
    return pk && { keys: Object.keys(pk.tiers).sort(), bytes: pk.bytes, orig: pk.orig,
      hasSrc: /^data:image\/(webp|jpeg)/.test(pk.src || '') };
  }, big.dataUrl);
  if (!prep) fails.push('imgPrepare คืน null');
  else {
    if (prep.keys.join(',') !== 'card,full') fails.push(`imgPrepare ได้ชั้น ${prep.keys}`);
    if (!prep.hasSrc)  fails.push('imgPrepare ไม่ได้คืน dataURL ไว้แสดงตัวอย่าง');
    if (!(prep.bytes < prep.orig)) fails.push('imgPrepare ไม่ได้ทำให้เล็กลง');
  }

  /* ---------- 6 · bikeArt เลือกตามลำดับ URL → dataURL → เงารถ ----------
     v1.31: รูปผูกกับ "สี" ไม่ใช่ "รุ่น" — ลำดับเดิมทั้งหมด แค่ย้ายที่เก็บลงไปอยู่ในสี */
  const art = await p.evaluate(() => {
    const v = Object.keys(PRICE)[0], p0 = PRICE[v];
    const cc = Object.keys(p0.c)[0], e = p0.c[cc], nm = e.name;
    const keepU = e.imgUrl, keepI = e.img;
    delete e.imgUrl; delete e.img;
    const svg = bikeArt(v, nm, cc);
    e.img = 'data:image/jpeg;base64,AAAA';
    const dataUrl = bikeArt(v, nm, cc);
    e.imgUrl = 'https://x.test/card.webp';
    const url = bikeArt(v, nm, cc);
    /* รูปของสีอื่นในรุ่นเดียวกันต้องไม่โดนรูปนี้กลบ — นี่คือทั้งหมดที่เจ้าของขอ */
    const other = Object.keys(p0.c)[1];
    const otherArt = other ? bikeArt(v, p0.c[other].name, other) : '<svg';
    if (keepU) e.imgUrl = keepU; else delete e.imgUrl;
    if (keepI) e.img = keepI; else delete e.img;
    return { svg, dataUrl, url, otherArt, nOther: other ? 1 : 0 };
  });
  if (!/<svg/.test(art.svg))                       fails.push('ไม่มีรูปเลยต้องวาดเงารถ');
  if (!/src="data:image/.test(art.dataUrl))        fails.push('มี dataURL ในเซสชันต้องใช้ก่อนเงารถ');
  if (!/src="https:\/\/x\.test\/card\.webp"/.test(art.url))
    fails.push('มี URL จาก Storage ต้องใช้ก่อน dataURL');
  if (!/loading="lazy"/.test(art.url))             fails.push('รูปจาก Storage ควรโหลดแบบ lazy');
  if (art.nOther && !/<svg/.test(art.otherArt))
    fails.push('ใส่รูปให้สีหนึ่ง แล้วสีอื่นในรุ่นเดียวกันหยิบรูปนั้นไปใช้ด้วย — รูปต้องผูกกับสี');

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(`card ${Math.round(r.card.size/1024)} KB · full ${Math.round(r.full.size/1024)} KB`
    + ` · ต้นฉบับ ${Math.round(big.bytes/1024)} KB · ${r.card.type}`);
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
