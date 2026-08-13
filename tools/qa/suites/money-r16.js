/* กลุ่ม ② เงินและเอกสาร (บรีฟแก้ไขครั้งที่ 1) — ยิงที่ฟังก์ชันจริงตามกฎ §9b
   1) ดอกเบี้ยช่วงงวด: finRate เลือก tier ถูกช่วง · งวดนอกช่วงถอยเรตฐาน · งวดต่อเจ้า (finTerms)
   2) ยอดกู้ = เงินต้น+ดอกเบี้ยทั้งสัญญา และ "เปลี่ยนตามไฟแนนซ์/งวด" (B2+B3) — มูลค่าจริง ไม่ใช่แค่ wiring
   3) ยอดชำระ ณ วันออกรถ = เงินดาวน์ − ส่วนลด (B1)
   4) saveSale เปิด popup ยืนยันที่โชว์ตัวเลขจริงก่อน แล้วบันทึกเมื่อยืนยันเท่านั้น (L1+L2)
   5) การเงินตรวจ: เซลล์อนุมัติเองไม่ได้ · ใบกำกับภาษีพิมพ์ไม่ได้จนกว่าจะผ่าน · ใบเสร็จพิมพ์ได้ (G1-G3)
   6) ของแถม: หลายชิ้น + นอกคลัง + มูลค่าขึ้นใบเสร็จ · ตัด/คืนสต๊อกตามจำนวน (B7+B8)
   7) เอกสารเคสผ่อน: ใบเสร็จ = ดาวน์−ส่วนลด · FINTX = ยอดจัด (B1/D1)
   8) dropdown เลือกคันไม่มีราคา (K12) · ตารางสต๊อกไม่มีปุ่มขายคันนี้ (K11) */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errs.push(e.message));
  const login = async id => {
    await page.goto(BASE + '/index.html');
    await page.click(`#lgUsers [data-id="${id}"]`);
    await page.click('#lgGo');
    await page.waitForTimeout(350);
  };

  /* ---- 1) finRate / finTerms ---- */
  await login('ST1');
  const t1 = await page.evaluate(() => {
    const f = { rate: 2.0, tiers: [{from:12,to:18,rate:1.05},{from:24,to:30,rate:1.07}] };
    return { in12: finRate(f,12), in18: finRate(f,18), in24: finRate(f,24),
             gap20: finRate(f,20), out48: finRate(f,48),
             t2: finTerms(FIN_CO.find(x=>x.id==='F2')).join(','),
             t3: finTerms(FIN_CO.find(x=>x.id==='F3')).join(',') };
  });
  if (t1.in12!==1.05 || t1.in18!==1.05) fails.push('tier 12-18 ไม่คืน 1.05: '+t1.in12+'/'+t1.in18);
  if (t1.in24!==1.07) fails.push('tier 24-30 ไม่คืน 1.07');
  if (t1.gap20!==2.0 || t1.out48!==2.0) fails.push('งวดนอกช่วงไม่ถอยไปเรตฐาน: '+t1.gap20+'/'+t1.out48);
  if (t1.t2!=='12,24,36,48') fails.push('finTerms ของเจ้าที่ตั้งงวดเองไม่ตรง: '+t1.t2);
  if (t1.t3!==FIN_TERMS_STR()) fails.push('เจ้าที่ไม่ตั้งงวดต้องได้ชุดเริ่มต้น: '+t1.t3);
  function FIN_TERMS_STR(){ return '12,18,24,30,36,42,48,60'; }

  /* ---- 2+3) ยอดกู้เปลี่ยนตามไฟแนนซ์/งวด · ยอดชำระ = ดาวน์−ส่วนลด ---- */
  await page.evaluate(() => { go('sell'); });
  await page.waitForTimeout(250);
  const t2 = await page.evaluate(() => {
    $('#sPay').value='finance'; $('#sPay').onchange();
    $('#sDisc').value=2000; $('#sDown').value=10000;
    $('#sFinCo').value='F1'; calcSell();
    $('#sTerm').value='12'; calcSell();
    const u=curUnit(), net=u.retail-2000;
    const loan1=$('#sLoan').value, pay1=$('#sPayNow').value, per1=$('#sPerMo').value;
    $('#sTerm').value='42'; calcSell();
    const loan2=$('#sLoan').value;
    $('#sFinCo').value='F3'; calcSell();               /* เจ้าอื่น เรตอื่น */
    $('#sTerm').value='42'; calcSell();
    const loan3=$('#sLoan').value;
    /* ค่าที่ถูกต้องของ F1 งวด 12 (tier 1.05): per=round(prin*(1+1.05/100*12)/12), loan=per*12 */
    const prin=Math.max(0,net-10000);
    const per=Math.round(prin*(1+1.05/100*12)/12);
    return { loan1, pay1, per1, loan2, loan3,
             wantLoan: (per*12).toLocaleString('en-US'), wantPer: per.toLocaleString('en-US'),
             wantPay: (10000-2000).toLocaleString('en-US') };
  });
  if (t2.loan1!==t2.wantLoan) fails.push('ยอดกู้ F1/12งวด ไม่ตรงสูตร ต้น+ดอกทั้งสัญญา: ได้ '+t2.loan1+' ต้องได้ '+t2.wantLoan);
  if (t2.per1!==t2.wantPer) fails.push('ค่างวดไม่ตรง: '+t2.per1+' ≠ '+t2.wantPer);
  if (t2.pay1!==t2.wantPay) fails.push('ยอดชำระ ณ วันออกรถ ≠ ดาวน์−ส่วนลด: '+t2.pay1+' ≠ '+t2.wantPay);
  if (t2.loan1===t2.loan2) fails.push('เปลี่ยนงวดแล้วยอดกู้ไม่เปลี่ยน (B3 หลุด)');
  if (t2.loan2===t2.loan3) fails.push('เปลี่ยนไฟแนนซ์แล้วยอดกู้ไม่เปลี่ยน (B3 หลุด)');

  /* ---- 8) K11+K12 ---- */
  const t8 = await page.evaluate(() => {
    const opt=$('#sUnit').options[0] ? $('#sUnit').options[0].textContent : '';
    go('stock');
    const tabBtn=[...document.querySelectorAll('#stTabs button')].find(b=>b.dataset.t==='table');
    if(tabBtn) tabBtn.click();
    return { opt, sellBtns: document.querySelectorAll('#stTable [data-sell]').length };
  });
  if (/฿|,\d{3}/.test(t8.opt)) fails.push('dropdown เลือกคันยังโชว์ราคา (K12): "'+t8.opt+'"');
  if (t8.sellBtns>0) fails.push('ตารางสต๊อกยังมีปุ่มขายคันนี้ '+t8.sellBtns+' ปุ่ม (K11)');

  /* ---- 4+6) saveSale: confirm ก่อน · ของแถมหลายชิ้น+นอกคลัง · ตัดสต๊อกตามจำนวน ---- */
  await page.evaluate(() => go('sell'));
  await page.waitForTimeout(200);
  const t4 = await page.evaluate(() => {
    $('#sCust').value='คุณทดสอบ ระบบดี'; $('#sPhone').value='089-000-1234';
    $('#sIdNo').value='1-2345-67890-12-3'; $('#sAddr').value='99 หมู่ 1 ต.ทดสอบ';
    $('#sPay').value='cash'; $('#sPay').onchange();
    $('#sDisc').value=1000; calcSell();
    const g=GIFTS.find(x=>inScope(x.branch) && x.qty>=3);
    sFree={}; sFree[g.id]=2; sFreeX=[{name:'เสื้อกันฝนพิเศษ', price:350}];
    const before={ sales:SALES.length, gq:g.qty };
    saveSale(false);
    const confirmShown=$('#modal').classList.contains('on') && $('#mdB').innerHTML.indexOf('คุณทดสอบ')>=0;
    const notSavedYet=SALES.length===before.sales;
    $('#cfmGo').onclick();                              /* กดยืนยัน */
    const s=SALES[SALES.length-1];
    const after={ sales:SALES.length, gq:GIFTS.find(x=>x.id===g.id).qty };
    return { confirmShown, notSavedYet, before, after, gid:g.id,
      saved: after.sales===before.sales+1,
      gifts: s.gifts.map(x=>({name:x.name,qty:x.qty,price:x.price})),
      custIdNo: (CUSTOMERS.find(c=>c.id===s.custId)||{}).idNo||'',
      custAddr: (CUSTOMERS.find(c=>c.id===s.custId)||{}).addr||'',
      sid: s.id, apSt: finApStatus(s) };
  });
  if (!t4.confirmShown) fails.push('saveSale ไม่เปิด popup ยืนยันที่โชว์ข้อมูลจริง (L1+L2)');
  if (!t4.notSavedYet) fails.push('บันทึกก่อนกดยืนยัน — popup เป็นแค่พิธี');
  if (!t4.saved) fails.push('กดยืนยันแล้วไม่บันทึก');
  if (t4.after.gq !== t4.before.gq-2) fails.push('ของแถม 2 ชิ้นตัดสต๊อกไม่ตรง: '+t4.before.gq+'→'+t4.after.gq);
  if (!t4.gifts.some(g=>g.name==='เสื้อกันฝนพิเศษ' && g.price===350)) fails.push('ของแถมนอกคลังไม่ถูกบันทึก (B7)');
  if (!t4.gifts.some(g=>g.qty===2)) fails.push('จำนวนของแถมไม่ถูกเก็บ');
  if (t4.custIdNo!=='1-2345-67890-12-3') fails.push('เลขบัตรจากฟอร์มขายไม่ถูกเก็บที่ลูกค้า (B9)');
  if (t4.apSt!=='รอตรวจ') fails.push('การขายใหม่ไม่ได้เริ่มที่ "รอตรวจ": '+t4.apSt);

  /* ---- 5) การเงินตรวจ + ด่านพิมพ์ใบกำกับ ---- */
  const sid = t4.sid;
  await login('ST3');                                    /* เซลล์ */
  const t5a = await page.evaluate(id => {
    const s=SALES.find(x=>x.id===id) || SALES.find(x=>finApStatus(x)==='รอตรวจ');
    if(!s) return { skip:true };
    const ok=finApprove(s.id, true);
    return { skip:false, ok, st:finApStatus(s) };
  }, sid);
  if (!t5a.skip && (t5a.ok || t5a.st==='ผ่าน')) fails.push('เซลล์กด finApprove ตรง ๆ แล้วผ่านได้ — ด่าน §9b หลุด');
  await login('ST7');                                    /* การเงิน */
  const t5b = await page.evaluate(async () => {
    /* printHTML ยิง window.print ใน setTimeout 60ms — ต้องรอทุกครั้งก่อนอ่านตัวนับ */
    const tick=()=>new Promise(r=>setTimeout(r,400));
    const s=SALES.find(x=>finApStatus(x)==='รอตรวจ' && !x.void);
    if(!s) return { skip:true };
    DOC_SALE=s.id; DOC_SEL = s.pay==='finance' ? 'DOWNTX' : 'TAXINV';
    let printed=0; const orig=window.print; window.print=()=>printed++;
    printCurrentDoc(); await tick();                     /* ยังไม่ผ่าน → ต้องไม่พิมพ์ */
    const blockedBefore = printed===0;
    DOC_SEL='RECEIPT'; printCurrentDoc(); await tick();  /* ใบเสร็จต้องพิมพ์ได้ */
    const receiptOk = printed===1;
    finApprove(s.id, true);
    DOC_SEL = s.pay==='finance' ? 'DOWNTX' : 'TAXINV';
    printCurrentDoc(); await tick();                     /* ผ่านแล้ว → พิมพ์ได้ */
    const allowedAfter = printed===2;
    window.print=orig;
    return { skip:false, blockedBefore, receiptOk, allowedAfter, st:finApStatus(s), by:s.finApproval.by };
  });
  if (!t5b.skip){
    if (!t5b.blockedBefore) fails.push('ใบกำกับภาษีพิมพ์ได้ทั้งที่การเงินยังไม่ตรวจ (G3 หลุด)');
    if (!t5b.receiptOk) fails.push('ใบเสร็จรับเงินโดนบล็อกไปด้วย — เกินคำสั่ง');
    if (!t5b.allowedAfter) fails.push('ผ่านแล้วยังพิมพ์ใบกำกับไม่ได้');
    if (t5b.st!=='ผ่าน' || !t5b.by) fails.push('บันทึกผู้ตรวจ/สถานะไม่ครบ');
  }

  /* ---- 7) ยอดเอกสารเคสผ่อน ---- */
  const t7 = await page.evaluate(() => {
    const s=SALES.find(x=>x.pay==='finance' && !x.void);
    if(!s) return { skip:true };
    DOC_SALE=s.id;
    const d=docData();
    const rec=docHTML('RECEIPT', d), fin=docHTML('FINTX', d);
    const payNow=(s.payNow!=null? s.payNow : Math.max(0,(s.down||0)-s.disc));
    const f=x=>x.toLocaleString('en-US');
    return { skip:false,
      recHasPayNow: rec.indexOf('รวมทั้งสิ้น</span><span>'+f(payNow))>=0,
      finHasAmt: fin.indexOf('รวมทั้งสิ้น</span><span>'+f(s.net-s.down))>=0 };
  });
  if (!t7.skip){
    if (!t7.recHasPayNow) fails.push('ใบเสร็จเคสผ่อนไม่ได้ใช้ เงินดาวน์−ส่วนลด (B1)');
    if (!t7.finHasAmt) fails.push('ใบกำกับให้ไฟแนนซ์ไม่ใช่ยอดจัด');
  }

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
