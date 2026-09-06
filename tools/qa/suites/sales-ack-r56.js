/* บรีฟ 6 ก.ย. — ผลไฟแนนซ์จากฐาน / ทางลัดใบจอง / เลขทะเบียนตรง schema */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const browser=await chromium.launch({executablePath:EXE}),ctx=await browser.newContext({timezoneId:'Asia/Bangkok',viewport:{width:1440,height:1000}}),p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');await p.waitForTimeout(300);
 const failures=await p.evaluate(async()=>{
  const failures=[],assert=(ok,label)=>{if(!ok)failures.push(label);},admin=ME,originalFetch=sbFetch;
  const unit=UNITS.find(u=>u.status==='available'),customer={id:uuid4(),name:'ทดสอบผลยืนยัน',phone:'0801234567',addr:'11 เชียงใหม่',idNo:'1234567890123',branch:unit.branch,owner:ME.nick,ownerId:ME.id,intent:'เงินผ่อน',variant:unit.variant,stage:'จอง',createdAt:TODAY};CUSTOMERS.push(customer);
  const sale=Object.assign({},SALES.find(s=>s.pay==='finance'),{id:uuid4(),custId:customer.id,unitId:unit.id,branch:unit.branch,void:false,finApproval:{status:'ผ่าน'}});
  const fc={id:uuid4(),custId:customer.id,saleId:sale.id,branch:unit.branch,finId:finActive()[0].id,status:'อนุมัติแล้ว',at:TODAY,amount:50000,log:[]};
  const reg={id:uuid4(),saleId:sale.id,branch:unit.branch,stage:'อนุมัติ',due:TODAY,log:[]};SALES.push(sale);FINCASES.push(fc);REGS.push(reg);
  /* เปลี่ยนผลไฟแนนซ์เดิมต้องรีเซ็ตการเงินเหมือน trigger แม้เป็นเดโม */
  assert(finBack(fc.id)===true&&sale.finApproval.status==='รอตรวจ','[1] เดโมผลไฟแนนซ์เปลี่ยนต้องให้การเงินตรวจใหม่');
  fc.status='อนุมัติแล้ว';sale.finApproval={status:'ผ่าน'};let release,releaseApproval,reads=0;LIVE=true;
  sbFetch=async(path,opt)=>{
   if(path.includes('/finance_case?'))return new Promise(resolve=>{release=()=>resolve([{id:fc.id,status:'รอผลพิจารณา',sale_id:sale.id}]);});
   if(path.includes('/sale?')&&(!opt||!opt.method||opt.method==='GET')){reads++;return new Promise(resolve=>{releaseApproval=()=>resolve([{id:sale.id,fin_approval:{status:'รอตรวจ',note:'ผลจริงจากฐาน'}}]);});}
   return [];
  };
  const pending=finBack(fc.id);assert(fc.status==='อนุมัติแล้ว'&&sale.finApproval.status==='ผ่าน','[2] ก่อนฐานยืนยันห้ามเปลี่ยนผลในเครื่อง');release();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert(sale.finApproval.status==='รอตรวจ','[2] ระหว่างโหลดผลตรวจล่าสุดห้ามใช้อนุมัติเก่า');
  if(releaseApproval)releaseApproval();
  assert(await pending===true&&reads===1&&sale.finApproval.note==='ผลจริงจากฐาน'&&sale.finApproval.status==='รอตรวจ','[2] หลัง ACK ต้องอ่านคำตัดสินการเงินจากใบขายจริง');
  /* PATCH สำเร็จแต่โหลดใบขายไม่ได้: ผลไฟแนนซ์ยังบันทึกแล้ว แต่ห้ามใช้อนุมัติเก่าส่งมอบ */
  sale.finApproval={status:'ผ่าน'};fc.status='รอผลพิจารณา';
  sbFetch=async(path,opt)=>{if(path.includes('/finance_case?'))return [{id:fc.id,status:'อนุมัติแล้ว',sale_id:sale.id}];if(path.includes('/sale?')&&(!opt||!opt.method))throw Error('โหลดผลใหม่ไม่ได้');return [];};
  assert(await finAdvance(fc.id)===true&&fc.status==='อนุมัติแล้ว'&&sale.finApproval.status==='รอตรวจ','[3] โหลดอนุมัติใหม่ไม่ได้ต้องคงรอตรวจ แต่เก็บผลไฟแนนซ์ที่ฐานรับแล้ว');
  assert(deliveryReady(reg)===false,'[3] โหลดอนุมัติไม่ได้ห้ามผ่านด่านส่งมอบ');
  sale.finApproval={status:'ผ่าน'};const keep=fc.status;
  sbFetch=async(path)=>{if(path.includes('/finance_case?'))throw Error('ฐานปฏิเสธ');return [];};
  assert(await finBack(fc.id)===false&&fc.status===keep&&sale.finApproval.status==='ผ่าน','[4] PATCH ถูกปฏิเสธต้องไม่ล้างหลักฐานหรือเปลี่ยนสถานะเดิม');
  LIVE=false;sbFetch=originalFetch;
  fc.status='ปฏิเสธ';closeModal();assert(finResubmit(fc.id)===false&&!$('#rsFin'),'[5] เคสมีใบขายห้ามเปิดฟอร์มเปลี่ยนบริษัทที่ฐานไม่ยอมรับ');
  assert(!dealActions(dealOf(customer.id)).includes('data-dlresub')&&dealActions(dealOf(customer.id)).includes('ใบขายเดิม'),'[5] ดีลต้องแนะนำให้ตรวจใบขายเดิมก่อนยื่นบริษัทใหม่');
  const log=fc.log.length;reg.deliveredAt=TODAY;fc.status='อนุมัติแล้ว';assert(finBack(fc.id)===false&&fc.log.length===log,'[5] ส่งมอบแล้วห้ามแก้ผลไฟแนนซ์แม้เป็นเคสเก่า');
  /* ทางลัดใบจองต้องคงเจตนาซื้อและไม่ข้ามคำขอไฟแนนซ์ */
  const sales=Object.assign({},STAFF.find(x=>x.role==='sales'),{roles:['sales']}),u=UNITS.find(x=>x.branch===sales.branch&&x.status==='available');
  const c={id:uuid4(),name:'ทดสอบทางลัดใบจอง',phone:'0811112222',branch:sales.branch,owner:sales.nick,ownerId:sales.id,stage:'จอง',variant:u.variant,createdAt:TODAY};CUSTOMERS.push(c);
  const bk={id:uuid4(),custId:c.id,unitId:u.id,branch:u.branch,name:c.name,phone:c.phone,status:'จองอยู่',at:TODAY,deposit:0};BOOKINGS.push(bk);u.status='reserved';
  ME=sales;go('booking');bookOpenSale(bk.id);assert(CUR==='deal'&&!!$('#dpGo'),'[6] ใบจองข้อมูลไม่ครบต้องกรอกเจตนาซื้อก่อน');closeModal();
  Object.assign(c,{intent:'เงินผ่อน',addr:'22 เชียงใหม่',idNo:'1234567890123'});bookOpenSale(bk.id);
  assert(CUR==='deal'&&!!$('#faGo'),'[6] เซลล์จากใบจองเงินผ่อนต้องไปคำขอโดยไม่จัดสรรคัน');closeModal();
  ME=admin;bookOpenSale(bk.id);assert(CUR!=='sell'&&!!$('#faGo'),'[6] ผู้บริหารก็ห้ามใช้ใบจองข้ามการยื่นไฟแนนซ์');closeModal();
  const f=finActive()[0],term=finTerms(f)[0];FINCASES.push({id:uuid4(),custId:c.id,saleId:null,branch:c.branch,status:'อนุมัติแล้ว',variant:u.variant,model:u.model,colorCode:u.colorCode,color:u.color,list:PRICE[u.variant].retail,disc:0,down:10000,finId:f.id,term,rate:finRate(f,term),at:TODAY,log:[]});
  assert(bookOpenSale(bk.id)===true&&CUR==='sell'&&$('#sPay').value==='finance'&&$('#sUnit').value===u.id,'[7] ผู้บริหารจากใบจองอนุมัติแล้วต้องเปิดเงินผ่อนพร้อมคันที่จอง');
  const n=SALES.length;ME=sales;bookOpenSale(bk.id);assert(CUR==='deal'&&SALES.length===n&&u.status==='reserved','[7] เซลล์รอผู้บริหารหลังอนุมัติ ไม่แสดงว่าจัดสรรแล้ว');
  ME=admin;const req=[];LIVE=true;sbFetch=async(path,opt)=>{req.push({path,method:opt&&opt.method,body:opt&&opt.body?JSON.parse(opt.body):null});return [];};
  reg.stage='ส่งมอบแล้ว';reg.deliveredAt=TODAY;assert(regPlateClose(reg.id,'1กข 5678')===true,'[8] ปิดงานทะเบียนจากรถส่งมอบแล้วได้');
  await dbFlush();while(DB_RUN)await new Promise(r=>setTimeout(r,10));
  const patches=req.filter(x=>x.path.includes('/registration?')&&x.method==='PATCH');
  assert(patches.length>=2&&patches.every(x=>!('plate' in x.body))&&patches.some(x=>x.body.stage==='ได้ทะเบียนแล้ว'&&x.body.plate_no==='1กข 5678'),'[8] คำสั่งทะเบียนจริงต้องใช้ plate_no เท่านั้น ไม่ส่งคอลัมน์ plate เข้าคิว');
  LIVE=false;sbFetch=originalFetch;ME=admin;return failures;
 });
 failures.push(...errors.map(e=>'PAGEERROR '+e));await browser.close();if(failures.length){console.error('FAILS:\n'+failures.join('\n'));process.exit(1);}console.log('ALL_CHECKS_PASS ผลไฟแนนซ์ยืนยัน / ใบจองตามเจตนา / เลขทะเบียน (8 ข้อ)');
})().catch(e=>{console.error(e);process.exit(1);});
