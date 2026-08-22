/* ============================================================================
   gallery-check.js — ตัวตรวจแกลเลอรีตัวอย่างดีไซน์ใน docs/login/

   ทำไมอยู่ "นอก" tools/qa/suites/
     run.js รันทุกไฟล์ใน suites/ อัตโนมัติ แต่ตัวนี้ต้องใช้แคชฟอนต์ที่ดึงจากเน็ตมาก่อน
     ถ้าเอาไปวางในนั้น การรันเต็มจะแดงบนเครื่องที่ยังไม่ได้สร้างแคช — จึงเรียกมือแทน

   วิธีใช้
     node tools/qa/gallery-check.js --cache        สร้าง/อัปเดตแคชฟอนต์ (ต้องมีเน็ตทาง curl)
     node tools/qa/gallery-check.js                ตรวจทุกหน้าใน docs/login/
     node tools/qa/gallery-check.js 3 7            ตรวจเฉพาะแบบ 3 กับ 7
     node tools/qa/gallery-check.js --shots        ตรวจ + ถ่ายภาพ + ทำแผ่นรวมให้ดูด้วยตา

   หมายเหตุสภาพแวดล้อม: เบราว์เซอร์ในกล่องทดสอบออกเน็ตไม่ได้ แต่ curl ออกได้
   จึงดึง CSS+woff2 ด้วย curl เก็บไว้ แล้ว page.route ยัดกลับเข้าเบราว์เซอร์
   URL ที่ไม่อยู่ในแคช = fail (ไม่ใช่เงียบ) เพราะ miss แปลว่าชื่อฟอนต์พิมพ์ผิด
   ============================================================================ */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium, EXE } = require('./suites/env');

const ROOT  = path.join(__dirname, '..', '..');
const DIR   = path.join(ROOT, 'docs', 'login');
const CACHE = path.join(__dirname, '.fontcache');
const SHOTS = path.join(CACHE, '..', '.shots');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const key = u => crypto.createHash('md5').update(u).digest('hex').slice(0, 16);
const args = process.argv.slice(2);
const only = args.filter(a => /^\d+$/.test(a));

function pages(){
  const f = fs.readdirSync(DIR).filter(x => x.endsWith('.html'));
  const n = f.filter(x => /^\d+\.html$/.test(x)).sort((a,b)=>parseInt(a)-parseInt(b));
  const list = only.length ? n.filter(x => only.includes(String(parseInt(x)))) : n;
  return (only.length ? list : list.concat(f.includes('index.html') ? ['index.html'] : []));
}

/* ---------------------------------------------------------------- แคชฟอนต์ */
function curl(url, out){
  try { execFileSync('curl', ['-sfL', '-A', UA, '--max-time', '25', '-o', out, url], { stdio:'pipe' }); return true; }
  catch(e){ return false; }
}
function buildCache(){
  fs.mkdirSync(CACHE, { recursive:true });
  const css = new Set();
  for (const f of fs.readdirSync(DIR).filter(x=>x.endsWith('.html')))
    for (const m of fs.readFileSync(path.join(DIR,f),'utf8').matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"')\s]+/g))
      css.add(m[0].replace(/&amp;/g,'&'));
  let nf = 0, bad = [];
  for (const u of css){
    const c = path.join(CACHE, key(u)+'.css');
    if (!curl(u, c)) { bad.push(u); continue; }
    const body = fs.readFileSync(c,'utf8');
    if (!/font-family/.test(body)) { bad.push(u+' (ตอบกลับไม่ใช่ CSS ฟอนต์)'); continue; }
    for (const m of body.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)){
      const w = path.join(CACHE, key(m[1])+'.woff2');
      if (fs.existsSync(w)) continue;
      if (curl(m[1], w)) nf++; else bad.push(m[1]);
    }
  }
  console.log('แคชฟอนต์: CSS '+css.size+' ก้อน · ไฟล์ฟอนต์ใหม่ '+nf+' ไฟล์ · เก็บที่ '+CACHE);
  if (bad.length){ console.error('ดึงไม่สำเร็จ:\n  '+bad.join('\n  ')); process.exit(1); }
}

/* ---------------------------------------------------------------- คอนทราสต์ */
const CONTRAST_FN = `(() => {
  const lum = c => { const [r,g,b] = c.map(v => { v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); });
    return .2126*r + .7152*g + .0722*b; };
  const parse = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    const p = m[1].split(/[,\\s\\/]+/).filter(x=>x!=='').map(x=>parseFloat(x));
    return { rgb:[p[0],p[1],p[2]], a: p.length>3? p[3] : 1 }; };
  const over = (fg, a, bg) => fg.map((v,i) => v*a + bg[i]*(1-a));
  /* ไล่เก็บพื้นหลังขึ้นไปจนเจอตัวทึบ แล้วซ้อนกลับลงมา — พื้นโปร่งซ้อนกันหลายชั้นจึงคิดถูก
     และสีตัวอักษรที่เป็น rgba ต้องซ้อนบนพื้นก่อนคำนวณด้วย ไม่งั้นจะประเมินสูงเกินจริง */
  const bgOf = el => { const stack = []; let n = el, base = null;
    while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { if (c.a >= .995) { base = c.rgb; break; } stack.push(c); } n = n.parentElement; }
    if (!base) { const b = parse(getComputedStyle(document.documentElement).backgroundColor);
      base = (b && b.a >= .995) ? b.rgb : [255,255,255]; }
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i].rgb, stack[i].a, base);
    return base; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('#sw,#ct,#lgNote')) continue;
    if (el.hasAttribute('data-nocontrast') || el.closest('[data-nocontrast]')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const txt = [...el.childNodes].filter(n => n.nodeType===3 && n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
    if (!txt) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.opacity === '0') continue;
    const fg = parse(st.color); if (!fg) continue;
    const bg = bgOf(el);
    const op = parseFloat(st.opacity); const a = fg.a * (isNaN(op) ? 1 : op);
    const L1 = lum(over(fg.rgb, a, bg)), L2 = lum(bg);
    const ratio = (Math.max(L1,L2)+.05) / (Math.min(L1,L2)+.05);
    const size = parseFloat(st.fontSize), w = parseInt(st.fontWeight)||400;
    const big = size >= 24 || (size >= 18.66 && w >= 700);
    const need = big ? 3 : 4.5;
    if (ratio + .02 < need) out.push({ sel: el.tagName.toLowerCase()+(el.className? '.'+String(el.className).split(' ')[0] : ''),
      txt: txt.slice(0,26), ratio: Math.round(ratio*100)/100, need, size });
  }
  return out;
})()`;

/* ---------------------------------------------------------------- ตรวจหนึ่งหน้า */
async function checkPage(ctx, file, w, theme, misses){
  const p = await ctx.newPage();
  const errs = [], bytes = { n:0 };
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0,120)); });
  p.on('response', async r => { const h = r.headers()['content-length']; if (h) bytes.n += parseInt(h)||0; });
  await p.addInitScript(t => { try{ localStorage.setItem('famai_login_dark', t==='dark'?'1':'0'); }catch(e){} }, theme);
  await p.goto('file://' + path.join(DIR, file));
  await p.evaluate(() => document.fonts.ready).catch(()=>{});
  await p.waitForTimeout(500);

  /* 8 · โหมดมืดต้องเปลี่ยนพื้นจริง และจำได้หลังรีโหลด */
  const bg0 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const isDark = await p.evaluate(() => document.documentElement.dataset.theme === 'dark');
  if ((theme==='dark') !== isDark) errs.push('ธีมไม่ตรง: ขอ '+theme+' แต่ data-theme='+(isDark?'dark':'(ไม่มี)'));
  const F = [];
  const push = (t, m) => F.push('['+t+'] ' + m);

  if (errs.length) push('1·error', errs.slice(0,3).join(' | '));

  /* 2 · ไม่เลื่อนข้าง — ต้องวัดขอบขวาจริงด้วย เพราะพ่อแม่ที่ overflow:hidden กลืนของล้นไว้เงียบ ๆ */
  const ov = await p.evaluate(() => {
    /* ของที่อยู่ใน "แถวเลื่อนแนวนอน" ที่ตั้งใจ (overflow-x:auto/scroll) ไม่นับว่าล้น
       เพราะผู้ใช้เลื่อนถึงได้จริงและมันไม่ดันหน้า — แต่ overflow:hidden ยัง**นับว่าล้น**
       เพราะนั่นคือเคสที่ login-r27 เจอ: พ่อแม่กลืนของล้นไว้เงียบ ๆ จน scrollWidth มองไม่เห็น */
    const inScroller = el => { let n = el.parentElement;
      while (n && n !== document.body) { const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll') return n; n = n.parentElement; }
      return null; };
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('#sw,#ct,#lgNote')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const sc = inScroller(el);
      if (sc && sc.getBoundingClientRect().right <= innerWidth + 1) continue;
      if (r.right > innerWidth + 1) bad.push(el.tagName.toLowerCase()+'.'+String(el.className||'').split(' ')[0]+' right='+Math.round(r.right));
    }
    return { bad: bad.slice(0,4), sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) };
  });
  if (ov.bad.length) push('2·ล้นขวา', ov.bad.join(' | '));
  if (ov.sw > w) push('2·scrollWidth', ov.sw + ' > ' + w);

  /* 3 · ฟอนต์โหลดจริง ไม่ใช่ fallback */
  const fo = await p.evaluate(() => {
    /* เก็บทั้งชื่อและ**น้ำหนักแรกที่ประกาศ** — ต้องวาดด้วยน้ำหนักที่โหลดมาจริง
       ถ้าวาดด้วยน้ำหนักที่ไม่ได้โหลด (เช่น 600 กับ Sarabun ที่โหลดแค่ 400;500)
       เบราว์เซอร์บางรุ่นจะข้ามไป fallback แล้วให้ผลลวงว่า "ไม่ได้ใช้ฟอนต์นี้" */
    const decl = [...document.querySelectorAll('link[href*="fonts.googleapis"]')]
      .flatMap(l => [...new URL(l.href).searchParams.getAll('family')])
      .map(f => { const [name, spec] = f.split(':');
        const m = String(spec||'').match(/(\d{3})/); return { name, w: m ? m[1] : '400' }; });
    const want = decl.map(d => d.name);
    const loaded = [...document.fonts].filter(f => f.status === 'loaded');
    const fams = [...new Set(loaded.map(f => f.family.replace(/['"]/g,'')))];
    /* น้ำหนักที่โหลดสำเร็จจริงต่อตระกูล — เบราว์เซอร์โหลดเฉพาะน้ำหนักที่หน้านี้ "ใช้จริง"
       น้ำหนักที่ประกาศใน <link> แต่ไม่มีใครใช้ จะค้างที่ unloaded ตลอด = ประกาศเกินเปล่า ๆ */
    const wOf = {}; loaded.forEach(f => { const n = f.family.replace(/['"]/g,'');
      (wOf[n] = wOf[n] || new Set()).add(String(f.weight)); });
    /* พิสูจน์ว่าเบราว์เซอร์ใช้ฟอนต์นั้นจริง ด้วยการ **วาดลงผ้าใบแล้วเทียบพิกเซล**
       เคยใช้วิธีวัดความกว้าง แต่ให้ผลลวงสองทาง:
         · ฟอนต์ที่ตั้งใจใช้เฉพาะตัวเลข (IBM Plex Mono ไม่มีกลิฟไทย) กว้างเท่า monospace พอดี
         · Anuphan บังเอิญกว้างต่างจาก serif แค่ 0.4% ทั้งที่โหลดสำเร็จ
       ภาพที่วาดออกมาเหมือน fallback เป๊ะทุกพิกเซล = ไม่ได้ใช้ฟอนต์นั้นจริง — ตัดสินได้เด็ดขาด */
    const paint = (f, w) => { const c = document.createElement('canvas'); c.width = 560; c.height = 60;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,560,60);
      x.fillStyle = '#000'; x.textBaseline = 'middle'; x.font = w + ' 30px ' + f;
      x.fillText('ระบบมอเตอร์ Ag1,354', 4, 30); return c.toDataURL(); };
    const seen = {}, unused = [];
    const same = decl.filter(d => {
      const got = wOf[d.name];
      if (got && !got.has(d.w)) unused.push(d.name + ' ' + d.w);   /* ประกาศแต่ไม่มีใครใช้ */
      if (seen[d.name]) return false; seen[d.name] = 1;
      /* วาดด้วยน้ำหนักที่โหลดจริง ไม่ใช่น้ำหนักแรกที่ประกาศ */
      const w = got && got.size ? [...got][0] : d.w;
      return paint('"'+d.name+'",serif', w) === paint('serif', w);
    }).map(d => d.name);
    return { want:[...new Set(want)], fams, nLoaded: loaded.length, same, unused };
  });
  for (const f of fo.want) if (!fo.fams.includes(f)) push('3·ฟอนต์', 'ประกาศ "'+f+'" แต่ไม่มีหน้าไหนโหลดสำเร็จ');
  for (const f of fo.same) push('3·ฟอนต์', '"'+f+'" วาดออกมาเหมือน serif ทุกพิกเซล — เบราว์เซอร์ไม่ได้ใช้ฟอนต์นี้จริง');
  if (fo.unused.length) push('3·ฟอนต์', 'ประกาศน้ำหนักที่ไม่ได้ใช้ที่ไหนเลย: ' + fo.unused.join(', ') + ' — ถอดออกจาก <link>');

  /* 4 · คอนทราสต์ */
  const con = await p.evaluate(CONTRAST_FN);
  if (con.length) push('4·คอนทราสต์', con.slice(0,4).map(c => c.sel+' "'+c.txt+'" '+c.ratio+'<'+c.need).join(' | ')
    + (con.length>4 ? ' (+'+(con.length-4)+')' : ''));

  /* 5 · เป้ากด ≥44px เฉพาะที่ 390 */
  if (w <= 400){
    const small = await p.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('button,a,input,[role=button]')) {
        if (el.closest('#sw,#ct,#lgNote')) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (r.height < 43.5 || r.width < 43.5) bad.push((el.id||el.className||el.tagName)+' '+Math.round(r.width)+'×'+Math.round(r.height));
      }
      return bad.slice(0,5);
    });
    if (small.length) push('5·เป้ากด', small.join(' | '));
  }

  /* 11 · ไม่มีอิโมจิ */
  const emo = await p.evaluate(() => (document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)||[]).slice(0,4));
  if (emo.length) push('11·อิโมจิ', emo.join(' '));

  /* หน้าแบบ (ไม่ใช่สารบัญ) ตรวจสัญญา + กดเล่นได้ + ตัวเลขไม่กระตุก */
  let tabular = null;
  if (file !== 'index.html'){
    const ct = await p.evaluate(() => window.__contract || ['ไม่ได้เรียก contract()']);
    if (ct.length) push('6·สัญญา', ct.join(' · '));

    /* 12 · tabular figures */
    tabular = await p.evaluate(() => {
      const mk = t => { const s=document.createElement('span');
        s.style.cssText='position:absolute;left:-9999px;font-variant-numeric:tabular-nums;font-size:40px;font-family:var(--f-num)';
        s.textContent=t; document.body.appendChild(s); const w=s.offsetWidth; s.remove(); return w; };
      return { a: mk('1111111'), b: mk('1888888') };
    });

    /* 7 · กดเล่นได้จริง */
    const flow = await p.evaluate(async () => {
      const q = s => document.querySelector(s);
      q('#lgUsers [data-id="ST7"]').click(); q('#lgGo').click();
      await new Promise(r => setTimeout(r, 260));
      const inDash = q('#login').classList.contains('off') && !q('#app').classList.contains('off');
      const hasName = document.body.innerText.includes('นุช บัญชี');
      q('#btnOut') && q('#btnOut').click();
      await new Promise(r => setTimeout(r, 260));
      const back = !q('#login').classList.contains('off') && q('#app').classList.contains('off');
      const reset = q('#lgUsers .lg-u.on') && q('#lgUsers .lg-u.on').dataset.id === 'ST1';
      /* 6b · สลับโหมดต้องทำให้ offsetParent เป็น null จริง */
      q('#lgSwap').click();
      const liveOK = q('#lgDemo').offsetParent === null && q('#lgEmail').offsetParent !== null
        && q('#lgPw2').offsetParent !== null && q('#lgGo2').offsetParent !== null;
      q('#lgSwap').click();
      const demoBack = q('#lgUsers').offsetParent !== null;
      return { inDash, hasName, back, reset, liveOK, demoBack };
    });
    for (const [k, v] of Object.entries({ 'เข้าหน้าแรกไม่ได้':flow.inDash, 'หน้าแรกไม่มีชื่อคนที่เลือก':flow.hasName,
      'ออกแล้วไม่กลับหน้าล็อกอิน':flow.back, 'ออกแล้วไม่รีเซ็ตเป็น ST1':flow.reset,
      'สลับโหมดจริงแล้วช่องกรอกไม่โผล่/โหมดสาธิตไม่ซ่อนจริง':flow.liveOK, 'สลับกลับแล้วรายชื่อไม่คืน':flow.demoBack }))
      if (!v) push('7·กดเล่น', k);
  }

  /* 9 · สารบัญ: ลิงก์ครบและชื่อตรงกับ <title> ปลายทาง */
  let links = null;
  if (file === 'index.html')
    links = await p.evaluate(() => [...document.querySelectorAll('a[href$=".html"]')]
      .map(a => ({ href:a.getAttribute('href'), name:(a.querySelector('h2')||a).textContent.trim() })));

  await p.close();
  return { F, bytes: bytes.n, tabular, links, nFonts: fo.want.length, bg: bg0 };
}

/* ---------------------------------------------------------------- main */
(async () => {
  if (args.includes('--cache')) { buildCache(); if (args.length === 1) return; }
  if (!fs.existsSync(CACHE)) { console.error('ยังไม่มีแคชฟอนต์ — สั่ง node tools/qa/gallery-check.js --cache ก่อน'); process.exit(1); }

  const list = pages();
  const misses = new Set();
  const b = await chromium.launch({ executablePath: EXE });
  const out = [], tabs = {}, weights = {}, bgs = {};

  for (const w of [1440, 390]) {
    const ctx = await b.newContext({ viewport:{ width:w, height:w<600?844:900 },
      timezoneId:'Asia/Bangkok', deviceScaleFactor:1 });
    await ctx.route('**://fonts.googleapis.com/**', r => {
      const f = path.join(CACHE, key(r.request().url())+'.css');
      if (fs.existsSync(f)) r.fulfill({ contentType:'text/css', body: fs.readFileSync(f,'utf8') });
      else { misses.add(r.request().url()); r.abort(); }
    });
    await ctx.route('**://fonts.gstatic.com/**', r => {
      const f = path.join(CACHE, key(r.request().url())+'.woff2');
      if (fs.existsSync(f)) r.fulfill({ contentType:'font/woff2', body: fs.readFileSync(f) });
      else { misses.add(r.request().url()); r.abort(); }
    });
    for (const th of ['light', 'dark']) for (const f of list) {
      const r = await checkPage(ctx, f, w, th, misses);
      out.push({ f, w, th, ...r });
      if (r.tabular && th === 'light') tabs[f] = r.tabular;
      if (w === 1440 && th === 'light') weights[f] = { bytes: r.bytes, nFonts: r.nFonts, links: r.links };
      (bgs[f] = bgs[f] || {})[th] = r.bg;
    }
    await ctx.close();
  }

  /* 10 · น้ำหนักหน้า + จำนวนตระกูลฟอนต์ */
  const extra = [];
  for (const [f, v] of Object.entries(weights)) {
    const cap = f === 'index.html' ? 400 : 250;
    if (v.bytes / 1024 > cap) extra.push('['+f+' 10·น้ำหนัก] ' + Math.round(v.bytes/1024) + 'KB > ' + cap + 'KB');
    /* หน้าแบบใช้ได้ไม่เกิน 2 ตระกูล · สารบัญยกเว้นเพราะต้องโชว์ตัวอย่างฟอนต์ของทั้ง 10 แบบ */
    const fcap = f === 'index.html' ? 12 : 2;
    if (v.nFonts > fcap) extra.push('['+f+' 10·ฟอนต์] ' + v.nFonts + ' ตระกูล > ' + fcap);
  }
  /* 8 · โหมดมืดต้องเปลี่ยนพื้นจริง */
  for (const [f, v] of Object.entries(bgs))
    if (v.light && v.light === v.dark) extra.push('['+f+' 8·โหมดมืด] สีพื้นเหมือนกันทั้งสองธีม ('+v.light+')');

  /* 9 · ชื่อบนการ์ดสารบัญต้องตรงกับ <title> ปลายทาง */
  if (weights['index.html'] && weights['index.html'].links) {
    for (const l of weights['index.html'].links) {
      const t = path.join(DIR, l.href);
      if (!fs.existsSync(t)) { extra.push('[index 9·ลิงก์] ไม่มีไฟล์ ' + l.href); continue; }
      const title = (fs.readFileSync(t,'utf8').match(/<title>([^<]*)<\/title>/)||[])[1] || '';
      if (l.name && !title.includes(l.name)) extra.push('[index 9·ชื่อ] การ์ด "'+l.name+'" ไม่ตรงกับ <title> ของ '+l.href+' ("'+title+'")');
    }
  }

  console.log('\n──────── ตัวเลขที่ต้องรู้ ────────');
  for (const [f, v] of Object.entries(weights)) console.log('  '+f.padEnd(11)+' '+String(Math.round(v.bytes/1024)).padStart(4)+' KB · '+v.nFonts+' ตระกูล');
  console.log('\n──────── ตัวเลขในตาราง (12) ────────');
  for (const [f, t] of Object.entries(tabs))
    console.log('  '+f.padEnd(11)+(t.a===t.b ? 'นิ่ง ✓' : 'ขยับ '+(t.b-t.a)+'px — ฟอนต์นี้ไม่มี tabular figures ต้องหมายเหตุในสารบัญ'));

  const fails = out.filter(o => o.F.length);
  console.log('\n──────── ผลตรวจ ────────');
  for (const o of fails) { console.log('\n### '+o.f+' @ '+o.w+' · '+o.th); o.F.forEach(x => console.log('   '+x)); }
  extra.forEach(x => console.log('\n   '+x));
  if (misses.size) { console.log('\n### แคชฟอนต์ไม่ครบ (ชื่อฟอนต์พิมพ์ผิด?)'); [...misses].slice(0,6).forEach(u => console.log('   '+u)); }

  /* 13 · แผ่นสกรีนช็อตรวม */
  if (args.includes('--shots')) {
    fs.mkdirSync(SHOTS, { recursive:true });
    const shots = [];
    for (const w of [1440, 390]) {
      const ctx = await b.newContext({ viewport:{ width:w, height:w<600?844:920 },
        timezoneId:'Asia/Bangkok', deviceScaleFactor:2 });
      await ctx.route('**://fonts.googleapis.com/**', r => { const f=path.join(CACHE,key(r.request().url())+'.css');
        fs.existsSync(f) ? r.fulfill({contentType:'text/css',body:fs.readFileSync(f,'utf8')}) : r.abort(); });
      await ctx.route('**://fonts.gstatic.com/**', r => { const f=path.join(CACHE,key(r.request().url())+'.woff2');
        fs.existsSync(f) ? r.fulfill({contentType:'font/woff2',body:fs.readFileSync(f)}) : r.abort(); });
      for (const th of ['light', 'dark']) for (const f of list.filter(x => x !== 'index.html')) {
        const p = await ctx.newPage();
        await p.goto('file://' + path.join(DIR, f) + '?bare=1');
        await p.evaluate(t => { try{ localStorage.setItem('famai_login_dark', t==='dark'?'1':'0'); }catch(e){}
          if (t==='dark') document.documentElement.dataset.theme='dark'; else document.documentElement.removeAttribute('data-theme'); }, th);
        await p.evaluate(() => document.fonts.ready).catch(()=>{});
        await p.waitForTimeout(350);
        const tag = parseInt(f)+'-'+(w===390?'m':'d')+'-'+th;
        await p.screenshot({ path: path.join(SHOTS, tag+'-login.png') });
        await p.evaluate(() => login(picked()));
        await p.waitForTimeout(350);
        await p.screenshot({ path: path.join(SHOTS, tag+'-dash.png') });
        shots.push(tag);
        await p.close();
      }
      await ctx.close();
    }
    const cells = shots.flatMap(t => ['login','dash'].map(v =>
      '<figure><img src="'+t+'-'+v+'.png" loading="lazy"><figcaption>'+t+' · '+v+'</figcaption></figure>'));
    fs.writeFileSync(path.join(SHOTS,'index.html'),
      '<!doctype html><meta charset="utf-8"><title>แผ่นรวม</title>'
      + '<style>body{background:#222;color:#eee;font:13px system-ui;margin:0;padding:16px}'
      + 'main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}'
      + 'figure{margin:0}img{width:100%;border:1px solid #444;background:#fff}'
      + 'figcaption{padding:4px 2px;color:#aaa}</style><main>' + cells.join('') + '</main>');
    console.log('\nแผ่นรวม: ' + path.join(SHOTS,'index.html') + ' (' + cells.length + ' ใบ)');
  }

  await b.close();
  const nBad = fails.reduce((a,o)=>a+o.F.length,0) + extra.length + misses.size;
  console.log('\n' + (nBad ? '✗ มีปัญหา ' + nBad + ' รายการ' : '✓ ผ่านหมด ' + list.length + ' หน้า × 2 ความกว้าง'));
  process.exit(nBad ? 1 : 0);
})();
