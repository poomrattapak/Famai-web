const { chromium, EXE, BASE } = require('./env');
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const fails = []; p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);

  // ตารางค่างวดมือถือ: ชิปงวด + รายการเรียงถูกไปแพง + ส่งเงื่อนไขเข้าคำขอไฟแนนซ์ก่อนจัดคัน
  await p.evaluate(() => { go('sell'); sellTab('p2'); finCompare(); });
  await p.waitForTimeout(250);
  // เลือกรุ่น/รหัส/สีก่อนเลือกงวด 36 — ผู้บริหารก็ต้องยื่นเป็นคำขอก่อนเปิดขาย
  const expected = await p.evaluate(() => {
    const variant=Object.keys(PRICE).find(v=>!PRICE[v].disabled&&Object.keys(PRICE[v].c||{}).length);
    const color=Object.keys(PRICE[variant].c).slice(-1)[0];
    const c={id:'QA_PICK_R3',name:'ลูกค้าทดสอบค่างวด',phone:'0800000003',addr:'เชียงใหม่',idNo:'1234567890123',
      branch:ME.branch,owner:ME.nick,ownerId:ME.id,intent:'เงินผ่อน',variant,stage:'สนใจ',createdAt:TODAY};
    CUSTOMERS.push(c);
    return {variant,color,model:PRICE[variant].m,cid:c.id,sales:SALES.length,
      sold:UNITS.filter(u=>u.status==='sold').length,reserved:UNITS.filter(u=>u.status==='reserved').length};
  });
  await p.selectOption('#fVehicleModel',expected.model);
  await p.selectOption('#fModel',expected.variant);
  await p.selectOption('#fColor',expected.color);
  await p.fill('#fNet','60000'); await p.fill('#fDown','9000');
  await p.waitForTimeout(150);
  const chips = await p.$$eval('#fTermChips .chip', e => e.map(x => x.dataset.term));
  if (!chips.length) fails.push('fTermChips: no term chips at 390');
  const cards = await p.$$eval('#finCmp .crow', e => e.length);
  if (!cards) fails.push('finCmp: no cards at 390');
  // เรียงจากถูกไปแพงจริงไหม
  const order = await p.$$eval('#finCmp .crow[data-pick] .crr', e => e.map(x => parseFloat(x.textContent.replace(/[^\d.]/g, ''))));
  if (order.length < 2) fails.push('finCmp: ต้องมีอย่างน้อยสองบริษัทที่ผ่านเกณฑ์เพื่อพิสูจน์การเรียงค่างวด');
  if (order.some((v, i) => i && v < order[i - 1])) fails.push('finCmp cards not sorted cheapest-first: ' + order);
  // เปลี่ยนเป็น 36 งวดแล้วส่งเงื่อนไขไปคำขอ
  await p.click('#fTermChips [data-term="36"]'); await p.waitForTimeout(200);
  const pick = await p.$eval('#finCmp .crow[data-pick]', e => e.dataset.pick);
  await p.click('#finCmp .crow[data-pick]'); await p.waitForTimeout(250);
  const choose=await p.$('#fApplyCust');
  if(!choose) fails.push('pick: ต้องเลือกลูกค้าสำหรับคำขอไฟแนนซ์ก่อนเปิดขาย');
  else {
    if(await p.evaluate(()=>$('#p1').classList.contains('on'))) fails.push('pick: ห้ามกระโดดไปเปิดการขายจากตารางค่างวด');
    await p.selectOption('#fApplyCust',expected.cid);await p.click('#fApplyGo');
    const form=await p.evaluate(()=>({model:$('#faModel')?.value,variant:$('#faVariant')?.value,color:$('#faColor')?.value,
      term:$('#faTerm')?.value,fin:$('#faFin')?.value,list:$('#faList')?num($('#faList').value):null,
      down:$('#faDown')?num($('#faDown').value):null,page:CUR,p1:$('#p1').classList.contains('on'),unit:!!$('#faUnit'),
      sales:SALES.length,sold:UNITS.filter(u=>u.status==='sold').length,reserved:UNITS.filter(u=>u.status==='reserved').length}));
    if(form.model!==expected.model||form.variant!==expected.variant||form.color!==expected.color) fails.push('pick: คำขอต้องรับรุ่น รหัสรุ่น และสีที่เลือกครบ');
    if(form.term!==pick.split('|')[1]) fails.push(`pick: term ${form.term} != ${pick.split('|')[1]}`);
    if(form.fin!==pick.split('|')[0]) fails.push(`pick: finance ${form.fin} != ${pick.split('|')[0]}`);
    if(form.down!==9000||form.list!==60000) fails.push('pick: ราคาและเงินดาวน์ต้องตามค่าที่กรอก');
    if(form.page!=='deal'||form.p1||form.unit) fails.push('pick: คำขอต้องอยู่ในดีลและยังไม่เลือกคันรถ');
    if(form.sales!==expected.sales||form.sold!==expected.sold||form.reserved!==expected.reserved) fails.push('pick: เลือกค่างวดต้องไม่เปิดขายหรือเปลี่ยนสถานะรถ');
  }

  /* v1.11: กระดานคัมบังของทะเบียน/ไฟแนนซ์ถูกลบไปพร้อมหน้าเก่า
     ความคืบหน้าย้ายไปเป็นแถบไอคอนบนหน้าดีล ตรวจที่ steps-r10 / deal-r10 แทน */
  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
