/* บรีฟ 6 ก.ย. 2569 — ยื่นโดยไม่เลือกคันจริง / จัดสรรโดยผู้บริหาร / การเงินก่อนส่งมอบ */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const browser=await chromium.launch({executablePath:EXE});const fails=[];const errors=[];
 const ctx=await browser.newContext({timezoneId:'Asia/Bangkok',viewport:{width:1440,height:1000}});const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');await p.waitForTimeout(300);
 const result=await p.evaluate(async()=>{
  const failures=[];const assert=(ok,label)=>{if(!ok)failures.push(label);};
  /* ใน worktree แยก นิยามสิทธิ์ใหม่อาจยังไม่รวม; ใช้สิทธิ์ตาม contract เดียวกับ migration */
  for(const r of ['admin','manager'])PERMS[r]['act:allocateUnit']='write';
  for(const r of ['admin','manager','sales'])PERMS[r]['act:deliver']='write';
  const admin=ME;const sales=Object.assign({},STAFF.find(x=>x.id==='ST3'),{roles:['sales']});ME=sales;
  const unit=UNITS.find(u=>u.branch===sales.branch&&u.status==='available');
  if(!unit)return ['fixture:ไม่มีรถพร้อมขายในสาขาเซลล์'];
  const c={id:'CU_R56_FIN',name:'ลูกค้าคำขอใหม่',phone:'0805551212',addr:'99 เชียงใหม่',idNo:'1234567890123',branch:sales.branch,owner:sales.nick,ownerId:sales.id,variant:unit.variant,intent:'เงินผ่อน',stage:'สนใจ',createdAt:TODAY};CUSTOMERS.push(c);DEAL_SEL=c.id;go('deal');
  const counts={s:SALES.length,u:UNITS.filter(u=>u.status==='sold').length,r:REGS.length,f:FINCASES.length};
  dealProceed(c.id);assert(!!$('#dpGo'),'[1] ข้อมูลลูกค้ายังอยู่ก่อนยื่น');
  assert(await dealProceedSave(c.id)===true && !!$('#faGo') && !$('#faUnit'),'[1] ไปต่อเงินผ่อนต้องเปิดคำขอรุ่น/สีโดยไม่มีคันรถ');
  assert(CUR==='deal','[1] ยื่นไฟแนนซ์ต้องอยู่ในดีล ไม่กระโดดหน้าขาย');
  $('#faVariant').value=unit.variant;$('#faVariant').onchange();$('#faColor').value=unit.colorCode;$('#faDown').value=10000;finApplyCalc();
  assert(await finApplySave(c.id)===true,'[2] เซลล์ยื่นคำขอของตัวเองได้');
  const f=FINCASES.find(x=>x.custId===c.id&&!x.saleId);
  assert(!!f&&f.variant===unit.variant&&f.colorCode===unit.colorCode&&f.down===10000,'[2] คำขอแช่รุ่น สี และเงื่อนไข');
  assert(SALES.length===counts.s&&REGS.length===counts.r&&UNITS.filter(u=>u.status==='sold').length===counts.u,'[2] ยื่นไฟแนนซ์ต้องไม่สร้างใบขาย/ทะเบียนหรือตัดรถ');
  assert(dealOf(c.id).k==='fin'&&dealOf(c.id).track.length===4,'[3] คำขอก่อนขายต้องชี้ขั้นไฟแนนซ์ในแถบสี่ขั้น');
  assert(FINCASES.length===counts.f+1,'[2] คำขอสร้างเพียงหนึ่งรายการ');
  rSell();sCustFill(c);sUnitSet(unit.id);setPay('finance');const before=SALES.length;
  saveSale(true,true);assert(SALES.length===before,'[4] เซลล์เรียก saveSale ตรงยังจัดสรรไม่ได้');
  ME=admin;rSell();sCustFill(c);sUnitSet(unit.id);setPay('finance');saveSale(true,true);
  assert(SALES.length===before,'[5] ผู้บริหารเปิดขายเงินผ่อนก่อนผลอนุมัติไม่ได้');
  finAdvance(f.id);finAdvance(f.id);assert(f.status==='อนุมัติแล้ว'&&dealOf(c.id).k==='sale'&&!dealOf(c.id).s,'[3] ไฟแนนซ์ผ่านต้องรอเปิดขายจริง ไม่สร้างใบขายปลอม');
  ME=sales;rSell();sCustFill(c);sUnitSet(unit.id);setPay('finance');calcSell();saveSale(true,true);assert(SALES.length===before,'[4] เซลล์จัดสรรไม่ได้แม้เคสอนุมัติและเงื่อนไขครบแล้ว');ME=admin;
  assert(dealSell(c.id)===true,'[6] ผู้บริหารเปิดแบบฟอร์มจัดสรรหลังอนุมัติได้');sUnitSet(unit.id);calcSell();
  const rate=f.rate;const company=finById(f.finId);company.rate+=9;calcSell();
  const wrong=UNITS.find(u=>u.status==='available'&&u.branch===unit.branch&&u.variant!==unit.variant);
  if(wrong){sUnitSet(wrong.id);saveSale(true,true);assert(SALES.length===before,'[6] คันรถผิดรุ่นหรือสีต้องบันทึกไม่ได้');sUnitSet(unit.id);}
  const oldDown=f.down;$('#sDown').value=oldDown+1;saveSale(true,true);assert(SALES.length===before,'[6] เงื่อนไขต่างจากคำขออนุมัติต้องบันทึกไม่ได้');$('#sDown').value=oldDown;
  saveSale(true,true);const s=SALES.find(x=>x.custId===c.id&&!x.void);const r=s&&REGS.find(x=>x.saleId===s.id);
  assert(!!s&&!!r&&f.saleId===s.id&&s.financeCaseId===f.id,'[7] เปิดขายแล้วผูกเคสเดิมกับคันจริง');
  assert(FINCASES.length===counts.f+1&&s&&s.rate===rate,'[7] เปิดขายไม่ยื่นซ้ำ และคงเรต ณ วันยื่นแม้ตั้งค่าเปลี่ยน');
  if(!s||!r)return failures;
  assert(dealOf(c.id).k==='sale'&&dealActions(dealOf(c.id)).includes('อนุมัติให้ส่งมอบ'),'[8] หลังขายต้องมีปุ่มให้การเงินอนุมัติชัดเจน');
  ME=sales;assert(await regDeliver(r.id,{date:TODAY})===false&&!r.deliveredAt,'[9] เซลล์ส่งมอบไม่ได้ถ้าการเงินยังไม่ผ่าน');
  assert(await finApprove(s.id,true)===false,'[8] เซลล์อนุมัติการเงินเองไม่ได้');
  ME=admin;r.stage='อนุมัติ';assert(await regAdvance(r.id)===false&&!r.deliveredAt,'[9] เส้นทางทะเบียนห้ามข้ามการเงินเช่นกัน');
  const readonly=PERMS.admin['page:deal'];PERMS.admin['page:deal']='read';assert(await finApprove(s.id,true)===false,'[10] อ่านดีลอย่างเดียวอนุมัติไม่ได้');PERMS.admin['page:deal']=readonly;
  assert(await finApprove(s.id,true)===true&&dealOf(c.id).k==='deliver','[8] การเงินผ่านจึงเข้าสู่ขั้นส่งมอบ');
  const write=PERMS.sales['act:deliver'];PERMS.sales['act:deliver']='none';ME=sales;assert(await regDeliver(r.id,{date:TODAY})===false,'[10] ถอดสิทธิ์ส่งมอบแล้วเรียกตรงยังต้องถูกกัน');PERMS.sales['act:deliver']=write;
  let careCalls=0;const careOriginal=careCreate;careCreate=()=>{careCalls++;return true;};
  const when=addDays(TODAY,-1);assert(await regDeliver(r.id,{date:when,place:'บ้านลูกค้า',by:'เซลล์บิว'})===true,'[11] ผ่านแล้วเซลล์ส่งมอบของตัวเองได้');
  assert(r.deliveredAt===when&&r.dlvPlace==='บ้านลูกค้า'&&careCalls===1&&dealOf(c.id).k==='done','[11] เก็บวันส่งมอบจริง ส่งต่องานบริการครั้งเดียว และปิดขั้นขาย');
  assert(await regDeliver(r.id,{date:TODAY})===false&&careCalls===1,'[11] ส่งมอบซ้ำไม่สร้างงานบริการซ้ำ');careCreate=careOriginal;
  ME=admin;assert(await finApprove(s.id,false,'ถอนภายหลัง')===false,'[12] ส่งมอบแล้วคงหลักฐานการอนุมัติ');
  /* เงินสดก็ต้องผ่านฝ่ายการเงิน */
  const cashSale=SALES.find(x=>x.pay==='cash'&&!x.void&&REGS.some(r=>r.saleId===x.id&&!regDone(r)));
  if(cashSale){const cashReg=REGS.find(r=>r.saleId===cashSale.id);cashSale.finApproval={status:'รอตรวจ'};assert(await regDeliver(cashReg.id,{date:TODAY})===false,'[13] เงินสดก็ต้องมีการเงินอนุมัติ');}
  /* เซิร์ฟเวอร์ไม่รับ = ห้ามขึ้นว่าสำเร็จในเครื่องนี้ ทั้งอนุมัติและส่งมอบ */
  const pendingSale=Object.assign({},s,{id:'SA_R56_PENDING',finApproval:{status:'รอตรวจ'}});
  const pendingReg={id:'RG_R56_PENDING',saleId:pendingSale.id,branch:s.branch,stage:'ขายแล้ว',due:TODAY,log:[]};SALES.push(pendingSale);REGS.push(pendingReg);
  FINCASES.push(Object.assign({},f,{id:'FC_R56_PENDING',saleId:pendingSale.id}));
  const fetchOriginal=sbFetch;let serverAttempts=0;sbFetch=async()=>{serverAttempts++;throw new Error('คำสั่งถูกฐานข้อมูลปฏิเสธ');};LIVE=true;
  assert(await finApprove(pendingSale.id,true)===false&&pendingSale.finApproval.status==='รอตรวจ','[14] ฐานไม่ยืนยัน ห้ามอนุมัติสำเร็จเฉพาะในเครื่อง');
  pendingSale.finApproval={status:'ผ่าน'};
  assert(await regDeliver(pendingReg.id,{date:TODAY})===false&&!pendingReg.deliveredAt&&pendingReg.stage==='ขายแล้ว','[14] ฐานปฏิเสธสิทธิ์หรืออนุมัติเก่า ห้ามขึ้นส่งมอบสำเร็จ');
  assert(serverAttempts===2,'[14] อนุมัติและส่งมอบต้องขอฐานยืนยันทั้งสองคำสั่ง');LIVE=false;sbFetch=fetchOriginal;
  return failures;
 });fails.push(...result,...errors.map(x=>'PAGEERROR '+x));
 await browser.close();if(fails.length){console.error('FAILS:\n'+fails.join('\n'));process.exit(1);}console.log('ALL_CHECKS_PASS ยื่นก่อนขาย / ผู้บริหารจัดสรร / การเงินก่อนส่งมอบ (14 ข้อ)');
})().catch(e=>{console.error(e);process.exit(1);});
