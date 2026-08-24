#!/usr/bin/env node
/* สร้างคู่มือการใช้งาน 8 เล่ม (7 บทบาท + 1 เล่ม flow) เป็น PDF ขนาด A4
 *
 *   node tools/manual/build.js [--out docs/manual] [--port 8123] [--no-mask] [--keep-html]
 *
 * โครงสร้างคู่มือ "หน้าจอที่คุณเห็น" และ "สิ่งที่คุณทำไม่ได้" ดึงจาก MENU/ROLES ในแอปตรง ๆ
 * เพิ่มเมนูใหม่ในแอป คู่มือรอบหน้าจะมีให้เอง ไม่มีวันหลุดจากระบบ
 * ส่วนลำดับงานประจำวันกับจุดที่มักพลาดอยู่ใน content.js แก้ถ้อยคำได้โดยไม่ต้องแตะโค้ด
 *
 * ภาพหน้าจอถ่ายจากแอปจริงที่ 390px (มือถือคือจอหลักของร้าน)
 * ค่าเริ่มต้นจะปิดบังข้อมูลที่ระบุตัวได้ก่อนถ่าย — เลขเครื่อง เลขถัง เลขที่ใบสั่งซื้อ
 * เบอร์โทร เลขบัญชี เลขประกันสังคม เลขผู้เสียภาษี  ปิดการปิดบังด้วย --no-mask
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { ROLE_DOC, FLOW_DOC } = require('./content.js');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('--out', 'docs/manual'));
const PORT = +arg('--port', 8123);
const MASK = !argv.includes('--no-mask');
const KEEP = argv.includes('--keep-html');
const CHROME = '/opt/pw-browsers/chromium';

const ROLE_STAFF = { admin: 'ST1', manager: 'ST2', sales: 'ST3', stock: 'ST6', acct: 'ST7', hr: 'ST8', tech: 'ST9', care: 'ST10', reg: 'ST11' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- เสิร์ฟไฟล์คงที่เอง จะได้ไม่ต้องพึ่งเซิร์ฟเวอร์ที่เปิดค้างไว้ ---------- */
function serve(port) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

/* ---------- ปิดบังข้อมูลที่ระบุตัวได้ ก่อนถ่ายภาพ ---------- */
const MASK_FN = () => {
  const RULES = [
    [/\b[A-Z0-9]{3,6}E-\d{5,7}\b/g, 'E•••••-••••••'],            // เลขเครื่อง
    [/\b(?:MLE|MH3|RLC)[A-Z0-9]{12,16}\b/g, '•••••••••••••••••'],  // เลขถัง
    [/\b[A-Z]{3}\d{2}\/(?:REC_P|RMC)\d{6,12}\b/g, '•••/•••••••'],  // เลขที่รับ/ใบสั่งซื้อ
    [/\b0\d{1,2}-\d{3}-\d{4}\b/g, '0••-•••-••••'],                 // เบอร์โทร
    [/\b\d{3}-\d-\d{5}-\d\b/g, '•••-•-•••••-•'],                   // เลขบัญชีธนาคาร
    [/\b\d{13}\b/g, '•••••••••••••'],                              // เลขบัตร/ประกันสังคม
    [/\b\d\s\d{4}\s\d{5}\s\d{2}\s\d\b/g, '• •••• ••••• •• •']      // เลขผู้เสียภาษี
  ];
  const hit = s => RULES.reduce((t, [re, to]) => t.replace(re, to), s);
  const walk = n => {
    if (n.nodeType === 3) { const v = hit(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== 1) return;
    if (n.hasAttribute && n.hasAttribute('title')) n.setAttribute('title', hit(n.getAttribute('title')));
    if (n.tagName === 'INPUT' && n.value) n.value = hit(n.value);
    n.childNodes.forEach(walk);
  };
  walk(document.body);
};

/* ---------- ถ่ายภาพหน้าจอตามบทบาท ---------- */
async function shoot(page, screens) {
  const out = {};
  for (const s of screens) {
    const key = typeof s === 'string' ? s : s.k;
    const ok = await page.evaluate(k => { if (!canSee(k)) return false; go(k); return true; }, key);
    if (!ok) continue;
    if (typeof s === 'object' && s.prep) { await page.evaluate(s.prep); }
    await page.waitForTimeout(450);
    if (MASK) await page.evaluate(MASK_FN);
    await page.waitForTimeout(60);
    /* jpeg ไม่ใช่ png — คู่มือเล็กลง ~4 เท่าโดยที่ตัวหนังสือบนภาพยังอ่านออกสบาย */
    const buf = await page.screenshot({ type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 390, height: 900 } });
    out[key] = 'data:image/jpeg;base64,' + buf.toString('base64');
  }
  return out;
}

/* ---------- แม่แบบ HTML ของคู่มือ ---------- */
const FONT = w => 'data:font/woff2;base64,' +
  fs.readFileSync(path.join(__dirname, 'fonts', `noto-thai-${w}.woff2`)).toString('base64');

const CSS = `
@font-face{font-family:'Noto Sans Thai';font-weight:400;src:url(${FONT(400)}) format('woff2')}
@font-face{font-family:'Noto Sans Thai';font-weight:600;src:url(${FONT(600)}) format('woff2')}
@font-face{font-family:'Noto Sans Thai';font-weight:700;src:url(${FONT(700)}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
body{font:400 10.5pt/1.75 'Noto Sans Thai','Loma',sans-serif;color:#15181B;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:24pt;font-weight:700;line-height:1.3;letter-spacing:-.01em}
h2{font-size:14pt;font-weight:700;margin:20pt 0 8pt;padding-bottom:5pt;border-bottom:1.5pt solid #15181B}
h3{font-size:11.5pt;font-weight:600;margin:13pt 0 4pt}
p{margin:0 0 7pt}
ol,ul{margin:0 0 8pt 16pt}
li{margin:0 0 3pt}
.cover{height:247mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.cover .eyebrow{font-size:10pt;letter-spacing:.16em;text-transform:uppercase;color:#6B7076;margin-bottom:10pt}
.cover h1{font-size:34pt}
.cover .role{font-size:19pt;font-weight:600;color:#C8102E;margin-top:4pt}
.cover .why{font-size:11.5pt;color:#40464C;margin-top:16pt;max-width:135mm}
.cover .meta{margin-top:auto;font-size:9pt;color:#6B7076;border-top:1pt solid #DDE1E5;padding-top:8pt}
.lead{font-size:11pt;color:#40464C;margin-bottom:12pt}
table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:0 0 10pt}
th{text-align:left;font-weight:600;background:#F4F6F8;padding:5pt 7pt;border-bottom:1pt solid #DDE1E5}
td{padding:5pt 7pt;border-bottom:.5pt solid #E8EBEE;vertical-align:top}
tr{page-break-inside:avoid}
.tag{display:inline-block;font-size:8pt;font-weight:600;padding:1.5pt 6pt;border-radius:9pt;
  background:#F4F6F8;color:#40464C;white-space:nowrap}
.tag.no{background:#FBE9EC;color:#9F0C24}
.tag.yes{background:#E7F5EC;color:#1B6B39}
.step{page-break-inside:avoid;margin:0 0 9pt;padding-left:20pt;position:relative}
.step .n{position:absolute;left:0;top:1pt;width:15pt;height:15pt;border-radius:50%;background:#15181B;
  color:#fff;font-size:8.5pt;font-weight:700;text-align:center;line-height:15pt}
.step .t{font-weight:600}
.step .w{font-size:9pt;color:#6B7076}
.warn{page-break-inside:avoid;border-left:2.5pt solid #C8102E;background:#FBE9EC;
  padding:7pt 10pt;margin:0 0 7pt;font-size:10pt}
.shots{page-break-before:always}
.shot{page-break-inside:avoid;margin:0 0 14pt;text-align:center}
.shot img{width:74mm;border:1pt solid #DDE1E5;border-radius:4pt}
.shot .cap{font-size:9pt;color:#6B7076;margin-top:4pt}
.grid2{display:flex;flex-wrap:wrap;gap:8mm;justify-content:center}
.foot{font-size:8.5pt;color:#6B7076;border-top:1pt solid #DDE1E5;padding-top:6pt;margin-top:14pt}
`;

const page1 = (kicker, title, role, why, meta) => `
<div class="cover">
  <div class="eyebrow">${esc(kicker)}</div>
  <h1>${esc(title)}</h1>
  ${role ? `<div class="role">${esc(role)}</div>` : ''}
  <div class="why">${esc(why)}</div>
  <div class="meta">${meta.map(esc).join(' · ')}</div>
</div>`;

function roleHtml(role, doc, app, shots) {
  const mine = app.menu.filter(m => m.k && m.r.includes(role));
  const others = app.menu.filter(m => m.k && !m.r.includes(role));
  const perm = app.roles[role];
  const rights = [
    ['เห็นตัวเงิน (ต้นทุน กำไร เงินเดือน)', perm.money],
    ['เห็นข้อมูลทุกสาขา', perm.allBranch],
    ['อนุมัติได้ (ใบลา · การลงเวลา)', perm.approve],
    ['แก้บัญชีผู้ใช้และสิทธิ์', perm.admin]
  ];
  const groupOf = k => { let g = ''; for (const m of app.menu) { if (m.g) g = m.g; if (m.k === k) return g; } return ''; };
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คู่มือ ${esc(doc.title)}</title>
<style>${CSS}</style></head><body>
${page1('คู่มือการใช้งาน · ระบบจัดการร้านฟ้าใหม่', 'คู่มือสำหรับ', doc.title, doc.why, app.meta)}

<h2>1 · หน้าจอที่คุณเห็น (${mine.length} หน้า)</h2>
<p class="lead">เมนูขึ้นตามบทบาท หน้าที่ไม่เกี่ยวกับงานคุณจะไม่โผล่ให้รก
บนมือถือ หน้าที่ใช้บ่อยที่สุดอยู่บนแถบล่าง ที่เหลืออยู่ในปุ่ม “อื่น ๆ”</p>
<table><thead><tr><th style="width:24%">หน้า</th><th style="width:22%">หมวด</th><th>ใช้ทำอะไร</th></tr></thead><tbody>
${mine.map(m => `<tr><td><b>${esc(m.t)}</b></td><td>${esc(groupOf(m.k))}</td><td>${esc(m.s)}</td></tr>`).join('')}
</tbody></table>

<h2>2 · สิทธิ์ของคุณ</h2>
<table><thead><tr><th>สิทธิ์</th><th style="width:22%">ของบทบาทนี้</th></tr></thead><tbody>
${rights.map(([t, v]) => `<tr><td>${esc(t)}</td><td><span class="tag ${v ? 'yes' : 'no'}">${v ? 'ได้' : 'ไม่ได้'}</span></td></tr>`).join('')}
</tbody></table>
${perm.money ? '' : '<p class="lead">ช่องตัวเงินจะขึ้นขีด (—) แทนตัวเลข ทั้งบนจอ ในไฟล์ที่ส่งออก และตอนพิมพ์ — เป็นการปิดตามสิทธิ์ ไม่ใช่ข้อมูลหาย</p>'}
${perm.allBranch ? '' : '<p class="lead">คุณเห็นเฉพาะข้อมูลของสาขาตัวเอง รายการของสาขาอื่นจะไม่ปรากฏในทุกหน้าและทุกรายงาน</p>'}

<h2>3 · งานประจำวันทีละขั้น</h2>
${doc.daily.map((d, i) => `<h3>${i + 1}. ${esc(d.t)}</h3><ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`).join('')}

<h2>4 · สิ่งที่ทำไม่ได้ และทำไม</h2>
<p class="lead">อีก ${others.length} หน้าในระบบไม่ขึ้นให้บทบาทนี้ ถ้าต้องใช้ ให้ขอกับผู้ที่มีสิทธิ์</p>
<table><thead><tr><th style="width:30%">หน้าที่ไม่เห็น</th><th>ใครทำแทน</th></tr></thead><tbody>
${others.map(m => `<tr><td>${esc(m.t)}</td><td>${esc(m.r.map(r => app.roles[r].name).join(' · '))}</td></tr>`).join('')}
</tbody></table>

<h2>5 · จุดที่มักพลาด</h2>
${doc.gotcha.map(g => `<div class="warn">${esc(g)}</div>`).join('')}

<div class="shots"><h2>6 · หน้าจอจริง</h2>
<p class="lead">ภาพจากระบบจริงที่ความกว้างมือถือ${MASK ? ' — เลขเครื่อง เลขถัง และเลขที่เอกสาร ถูกปิดบังไว้ในคู่มือ' : ''}</p>
<div class="grid2">
${Object.keys(shots).map(k => `<div class="shot"><img src="${shots[k]}" alt="">
  <div class="cap">${esc((app.menu.find(m => m.k === k) || {}).t || k)}</div></div>`).join('')}
</div></div>

<div class="foot">${app.meta.map(esc).join(' · ')}</div>
</body></html>`;
}

function flowHtml(app, shots) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คู่มือ flow การใช้งาน</title>
<style>${CSS}</style></head><body>
${page1('คู่มือการใช้งาน · ระบบจัดการร้านฟ้าใหม่', 'flow การใช้งาน', 'ทุกบทบาท',
  'ห้าสายงานหลักของร้าน ตั้งแต่ต้นจนจบ พร้อมบอกว่าแต่ละขั้นใครทำ ทำที่หน้าไหน '
  + 'และระบบทำอะไรให้เองบ้าง', app.meta)}

${FLOW_DOC.map((f, i) => `
<h2>${i + 1} · ${esc(f.t)}</h2>
<p class="lead"><span class="tag">${esc(f.who)}</span><br>${esc(f.intro)}</p>
${f.steps.map((s, j) => `<div class="step"><div class="n">${j + 1}</div>
  <div class="t">${esc(s.t)}</div>
  <div class="w">${esc(s.who)}${s.where && s.where !== '—' ? ' · ที่หน้า ' + esc(s.where) : ''}</div>
  <div>${esc(s.d)}</div></div>`).join('')}
${(f.shots || []).filter(k => shots[k]).length ? `<div class="grid2" style="margin-top:8pt">
${(f.shots || []).filter(k => shots[k]).map(k => `<div class="shot"><img src="${shots[k]}" alt="">
  <div class="cap">${esc((app.menu.find(m => m.k === k) || {}).t || k)}</div></div>`).join('')}
</div>` : ''}
`).join('')}

<h2>${FLOW_DOC.length + 1} · ใครทำอะไร (ผังสายงาน)</h2>
<p class="lead">ดึงจากผังกระบวนการในระบบ — “ระบบทำให้” คือขั้นที่ไม่ต้องกรอกเอง
“จุดที่มักหลุด” คือขั้นที่หายบ่อยถ้าไม่มีคนตาม</p>
<table><thead><tr><th style="width:16%">สายงาน</th><th>ขั้นตอน</th></tr></thead><tbody>
${app.lanes.map(l => `<tr><td><b>${esc(l.n)}</b></td><td>${l.s.map(s => {
    const auto = s.includes('+'), risk = s.includes('!');
    const t = s.replace(/[+!]/g, '').trim();
    return esc(t) + (auto ? ' <span class="tag yes">ระบบทำให้</span>' : '') + (risk ? ' <span class="tag no">จุดที่มักหลุด</span>' : '');
  }).join('<br>')}</td></tr>`).join('')}
</tbody></table>

<div class="foot">${app.meta.map(esc).join(' · ')}</div>
</body></html>`;
}

/* ---------- main ---------- */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(PORT);
  const browser = await chromium.launch({ executablePath: CHROME });
  const built = [];
  try {
    /* ตรึงเขตเวลาไทย — วันที่ในภาพต้องตรงกับที่ผู้ใช้จริงเห็น ไม่ใช่วันที่ของเครื่องที่สร้างคู่มือ */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2,
      timezoneId: 'Asia/Bangkok' });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.click('#lgGo');
    await page.waitForTimeout(400);

    /* ข้อมูลโครงสร้างดึงจากแอปเอง — คู่มือจึงตามระบบเสมอ */
    const app = await page.evaluate(() => ({
      menu: MENU.map(m => ({ g: m.g || null, k: m.k || null, t: m.t || null, s: m.s || null, r: m.r || null })),
      roles: ROLES, lanes: LANES, cfg: { company: CFG.company }
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    app.meta = [app.cfg.company, 'ระบบจัดการร้าน v1.12', 'สร้างเมื่อ ' + stamp,
      MASK ? 'ปิดบังเลขตัวรถและเลขเอกสารแล้ว' : 'แสดงข้อมูลจริงทั้งหมด'];
    await page.close();

    /* เล่มบทบาท */
    for (const role of Object.keys(ROLE_DOC)) {
      const p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:${PORT}/index.html`);
      await p.click(`#lgUsers [data-id="${ROLE_STAFF[role]}"]`);
      await p.click('#lgGo');
      await p.waitForTimeout(500);
      const want = app.menu.filter(m => m.k && m.r.includes(role)).map(m => m.k)
        .filter(k => ['dash', 'stock', 'sell', 'quote', 'deal', 'invoice', 'booking', 'plate',
          'aftercare', 'ar', 'service', 'parts',
          'recv', 'transfer', 'attend', 'hr', 'payroll', 'report', 'expense', 'settings', 'users'].includes(k))
        .slice(0, 6);
      const shots = await shoot(p, want);
      await p.close();

      const html = roleHtml(role, ROLE_DOC[role], app, shots);
      const file = path.join(OUT, `famai-${role}.pdf`);
      await renderPdf(browser, html, file, KEEP);
      built.push([`famai-${role}.pdf`, ROLE_DOC[role].title, fs.statSync(file).size]);
      console.log(`✓ ${path.basename(file)}  (${ROLE_DOC[role].title}, ${Object.keys(shots).length} ภาพ)`);
    }

    /* เล่ม flow — ถ่ายด้วยสิทธิ์แอดมินเพื่อให้เห็นทุกหน้า */
    {
      const p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:${PORT}/index.html`);
      await p.click('#lgGo');
      await p.waitForTimeout(500);
      const keys = [...new Set(FLOW_DOC.flatMap(f => f.shots || []))];
      const shots = await shoot(p, keys.map(k => k === 'hr'
        ? { k, prep: `(()=>{ const b=document.querySelector('#hrTabRv'); if(b&&b.style.display!=='none') b.click(); })()` }
        : k === 'report'
        ? { k, prep: `(()=>{ RP_SEL='daily'; rReport(); })()` } : k));
      await p.close();
      const file = path.join(OUT, 'famai-flow.pdf');
      await renderPdf(browser, flowHtml(app, shots), file, KEEP);
      built.push(['famai-flow.pdf', 'flow การใช้งาน', fs.statSync(file).size]);
      console.log(`✓ famai-flow.pdf  (flow การใช้งาน, ${Object.keys(shots).length} ภาพ)`);
    }

    /* สารบัญไว้เปิดจากในแอป */
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
      built: new Date().toISOString(), masked: MASK,
      files: built.map(([f, t, b]) => ({ file: f, title: t, bytes: b }))
    }, null, 2));

    const total = built.reduce((s, b) => s + b[2], 0);
    console.log(`\nได้ ${built.length} ไฟล์ รวม ${(total / 1048576).toFixed(2)} MB ที่ ${path.relative(ROOT, OUT)}/`);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });

async function renderPdf(browser, html, file, keep) {
  const p = await browser.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: file, format: 'A4', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '17mm', right: '17mm' } });
  if (keep) fs.writeFileSync(file.replace(/\.pdf$/, '.html'), html);
  await p.close();
}
