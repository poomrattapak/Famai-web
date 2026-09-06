/* บรีฟ 6 ก.ย. 2569: รหัสรุ่นไม่ fix 6 ตัว · รุ่นที่สนใจมีแค่ชื่อรุ่น · ใบเสนอเงินสด/ผ่อนพร้อมชื่อและเบอร์เซลล์ · เลือกรุ่น ราคา ดาวน์ ไฟแนนซ์แล้วได้ตารางงวด
   ล็อกการใช้งานจริง: รหัสยืดหยุ่นแต่ไม่ซ้ำ, แก้ลูกค้าไม่ทำ variant หาย, พิมพ์ซ้ำเก็บผู้ขาย/ราคา/เรตเดิม,
   เงินสดไม่ต้องพึ่งไฟแนนซ์, เฉพาะงวดที่บริษัทเปิดขาย, ราคาแก้เองไม่ถูกคืนเมื่อเปลี่ยนดาวน์ */
const {chromium,EXE,BASE}=require('./env');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:EXE});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
  const codes=await p.evaluate(()=>{
   const add=v=>{modelModal();$('#vmCode').value=v;$('#vmName').value='รุ่นทดสอบ';$('#vmRetail').value='70000';$('#vmGo').click();return !!PRICE[v.trim().toUpperCase()];};
   const short=add('qa7'),long=add('QA-MODEL-2026');
   const before=Object.keys(PRICE).length;add(' qa7 ');const duplicate=Object.keys(PRICE).length===before;
   closeModal();return {short,long,duplicate};
  });
  assert.ok(codes.short&&codes.long,'[รหัส] ต้องรับรหัสสั้น/ยาวและขีดได้');assert.ok(codes.duplicate,'[ซ้ำ] normalize ก่อนตรวจรหัสซ้ำ');
  const modelGuard=await p.evaluate(async()=>{
   modelModal();$('#vmCode').value='NO-WRITE';$('#vmName').value='ห้ามเขียน';$('#vmRetail').value=70000;
   const save=$('#vmGo').onclick,original=ME;ME={...STAFF.find(s=>s.role==='sales')};await save();
   const blocked=!PRICE['NO-WRITE'];ME=original;closeModal();return blocked;
  });
  assert.ok(modelGuard,'[สิทธิ์รุ่น] เปลี่ยนสิทธิ์หลังเปิดฟอร์มแล้วห้ามบันทึกตรง');
  const persist=await p.evaluate(async()=>{
   modelModal();$('#vmCode').value='LIVE-QA';$('#vmName').value='รุ่นฐานจริง';$('#vmRetail').value=79000;
   const prior=sbFetch;let payload=null;LIVE=true;
   sbFetch=async(path,opt)=>{payload={path,body:JSON.parse(opt.body)};return {variant:{id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'},colors:[]};};
   await $('#vmGo').onclick();LIVE=false;sbFetch=prior;
   const saved=VARIANT_IDS['LIVE-QA'];
   modelModal();$('#vmCode').value='FAIL-QA';$('#vmName').value='รุ่นล้มเหลว';$('#vmRetail').value=79000;
   LIVE=true;sbFetch=async()=>{throw Error('จำลองฐานข้อมูลปฏิเสธ');};await $('#vmGo').onclick();LIVE=false;sbFetch=prior;
   const failed=!PRICE['FAIL-QA']&&!$('#vmGo').disabled;closeModal();return {payload,saved,failed};
  });
  assert.equal(persist.payload?.path,'/rest/v1/rpc/catalog_save_variant','[ฐานรุ่น] ต้องบันทึกรุ่นผ่านฐานข้อมูล');
  assert.ok(persist.payload.body.p_data.is_new&&persist.payload.body.p_data.colors.length&&persist.saved,'[ครบรุ่น] ราคา สี และ uuid ต้องครบ');
  assert.ok(persist.failed,'[ย้อนคืนรุ่น] ฐานปฏิเสธต้องไม่แสดงว่าบันทึกสำเร็จ');
  const models=await p.evaluate(()=>{
   const vs=Object.keys(PRICE),v=vs[0];PRICE['QA-SAME']={...PRICE[v]};
   const c={id:'QA-CUST',name:'คนทดสอบ',phone:'0810000099',variant:'QA-SAME',branch:ME.branch,owner:ME.nick,ownerId:ME.id};CUSTOMERS.push(c);
   custModal(c.id);const options=$$('#cmModel option').filter(e=>e.value).map(e=>e.textContent),selected=$('#cmModel').value;
   closeModal();delete PRICE['QA-SAME'];CUSTOMERS.pop();return {options,selected,codes:vs};
  });
  assert.equal(new Set(models.options).size,models.options.length,'[รุ่น] ชื่อซ้ำต้องรวมเป็นหนึ่งตัวเลือก');
  assert.ok(models.options.every(x=>!models.codes.some(v=>x.includes(' · '+v))),'[ชื่อ] รุ่นที่สนใจต้องไม่แสดงรหัส');
  assert.equal(models.selected,'QA-SAME','[คงรุ่น] เปิดแก้ต้องรักษา variant เดิม');
  const cash=await p.evaluate(()=>{
   go('quote');$('#qPay').value='cash';$('#qPay').onchange();$('#qName').value='ลูกค้าเงินสด';$('#qPhone').value='0810000091';
   const seller=STAFF.find(s=>s.role==='sales');$('#qSeller').value=seller.id;$('#qSeller').onchange();
   const active=FIN_CO.map(f=>f.active);FIN_CO.forEach(f=>f.active=false);qDraw();
   const q=saveQuote(),html=$('#qDoc').innerHTML;
   FIN_CO.forEach((f,i)=>f.active=active[i]);
   return {q,html,seller:{id:seller.id,name:seller.name,phone:seller.phone}};
  });
  assert.ok(cash.q,'[เงินสด] ต้องบันทึกได้แม้ไม่มีบริษัทไฟแนนซ์');
  assert.equal(cash.q.pay,'cash','[เงินสด] ต้องบันทึกวิธีชำระเงินสด');
  assert.ok(!cash.html.includes('ยอดจัดไฟแนนซ์')&&cash.html.includes('ยอดชำระเงินสด'),'[ไม่พึ่งไฟแนนซ์] เงินสดพิมพ์ได้เมื่อไม่มีไฟแนนซ์');
  assert.equal(cash.q.sellerName,cash.seller.name,'[ผู้ขาย] ต้องเก็บผู้ขายที่เลือกแทนผู้ดูแลที่พิมพ์');
  assert.ok(cash.html.includes(cash.seller.phone),'[เบอร์เซลล์] ใบเสนอต้องมีเบอร์ผู้ขาย');
  const written=await p.evaluate(()=>{
   $('#qName').value='ทดสอบหัวใบเสนอ';qDraw();const writes=[],original=dbUp;
   dbUp=(table,body)=>writes.push({table,body});const q=saveQuote();dbUp=original;
   const body=writes.find(w=>w.table==='quotation')?.body;
   return {body,name:q.sellerName,phone:q.sellerPhone,snapshot:q.snapshot};
  });
  assert.equal(written.body.seller_name,written.name,'[หัวฐาน] ต้องส่งชื่อผู้ขายลงฐาน');
  assert.equal(written.body.seller_phone,written.phone,'[โทรฐาน] ต้องส่งเบอร์ผู้ขายลงฐาน');
  assert.deepEqual(written.body.snapshot,written.snapshot,'[แช่ฐาน] ต้องส่ง snapshot ลงฐาน');
  await p.evaluate(id=>quoteView(id),cash.q.id);
  const snap=await p.evaluate(no=>{
   const q=QUOTES.find(q=>q.no===no),before=$('#qDoc').innerHTML;
   const oldPrice=PRICE[q.v1].retail,oldName=ME.name;PRICE[q.v1].retail+=12345;ME.name='คนเปิดเอกสารทีหลัง';
   qDraw(no);const after=$('#qDoc').innerHTML;
   PRICE[q.v1].retail=oldPrice;ME.name=oldName;return {before,after,saved:qSavedNo};
  },cash.q.no);
  assert.equal(snap.after,snap.before,'[แช่ข้อมูล] พิมพ์ซ้ำต้องคงราคา/ผู้ขาย/วันที่เดิม');assert.equal(snap.saved,cash.q.no,'[ไม่ซ้ำ] เปิดใบเก่าต้องคงเลขบันทึก');
  const finance=await p.evaluate(()=>{
   const f=FIN_CO[0];f.terms=[12,18,36];f.tiers=[{from:12,to:18,rate:0.8},{from:36,to:36,rate:1.1}];
   $('#qPay').value='finance';$('#qF1').value=f.id;$('#qF2').value=f.id;$('#qDown').value=20000;qDraw();const q=saveQuote();
   const before=$('#qDoc').innerHTML;f.tiers[0].rate=9;qDraw(q.no);
   return {q,before,after:$('#qDoc').innerHTML};
  });
  assert.equal(finance.q.pay,'finance');
  assert.ok(finance.before.includes('18 งวด')&&!finance.before.includes('24 งวด'),'[งวด] ใบเสนอต้องใช้เฉพาะงวดที่บริษัทเปิดขาย');
  assert.equal(finance.after,finance.before,'[เรตเดิม] พิมพ์ซ้ำห้ามใช้เรตที่แก้ภายหลัง');
  const routes=await p.evaluate(async(ids)=>{
   const original={persist:custPersist,
     apply:typeof finApplyModal==='function'?finApplyModal:undefined,sell:dealSell,go:dealGo};
   const calls=[],count=SALES.length,stock=JSON.stringify(UNITS.map(u=>[u.id,u.status]));
   window.custPersist=async c=>{calls.push(['save',c.ownerId]);return true;};
   window.finApplyModal=(id,preset)=>calls.push(['finance',id,preset]);dealSell=id=>calls.push(['cash',id]);dealGo=id=>calls.push(['deal',id]);
   const cq=QUOTES.find(q=>q.id===ids.cash),fq=QUOTES.find(q=>q.id===ids.finance);cq.phone='0819990011';fq.phone='0819990022';
   await quoteToSale(cq.id);await quoteToSale(fq.id);
   const unchanged=SALES.length===count&&JSON.stringify(UNITS.map(u=>[u.id,u.status]))===stock;
   custPersist=original.persist;finApplyModal=original.apply;dealSell=original.sell;dealGo=original.go;
   return {calls,unchanged,variant:fq.v1,owner:cq.sellerId};
  },{cash:cash.q.id,finance:finance.q.id});
  assert.ok(routes.calls.some(x=>x[0]==='cash')&&routes.calls.some(x=>x[0]==='finance'&&x[2].variant===routes.variant),'[โฟลว] เงินสดไปเปิดขาย เงินผ่อนไปยื่นเรื่อง');
  assert.ok(routes.calls.some(x=>x[0]==='save'&&x[1]===routes.owner),'[เจ้าของ] ลูกค้าจากใบเสนอต้องเป็นของเซลล์ผู้ขาย');
  assert.ok(routes.unchanged,'[ไม่ตัดรถ] ใบเสนอห้ามเปิดขายหรือตัดสต๊อกก่อนยื่นไฟแนนซ์');
  const calc=await p.evaluate(()=>{
   go('sell');sellTab('p2');finCompare();$('#fModel').value=Object.keys(PRICE)[0];$('#fModel').onchange();
   $('#fNet').value=62000;$('#fNet').oninput();$('#fDown').value=20000;$('#fDown').oninput();$('#fFinance').value=FIN_CO[0].id;$('#fFinance').onchange();
   const f=FIN_CO[0],expected=installment(42000,finRate(f,18),18);
   return {net:num($('#fNet').value),text:$('#finCmp').textContent,expected:fmt(expected),other:FIN_CO[1].name};
  });
  assert.equal(calc.net,62000,'[ราคา] เปลี่ยนดาวน์/ไฟแนนซ์ห้ามเขียนทับราคาเซลล์');
  assert.ok(calc.text.includes(calc.expected)&&calc.text.includes('18 งวด')&&!calc.text.includes(calc.other),'[ตาราง] ต้องคำนวณตามบริษัทและเรตที่เลือก');
  const salesCalc=await p.evaluate(()=>{
   const keep={me:ME,apply:finApplyModal,go:dealGo};
   const self=STAFF.find(s=>s.role==='sales');ME={...self};
   const c={id:'QA-CALC-CUSTOMER',branch:ME.branch,name:'ลูกค้าค่างวด',phone:'0810000077',ownerId:ME.id};
   const other={...c,id:'QA-CALC-OTHER',name:'ลูกค้าของเซลล์คนอื่น',ownerId:STAFF.find(s=>s.role==='sales'&&s.id!==ME.id).id};CUSTOMERS.push(c,other);
   const allocationBlocked=!canOpenSale();let selected=null;
   finApplyModal=(id,preset)=>selected={id,preset};dealGo=()=>{};
   finCompare();$('#finCmp [data-pick]').click();
   const picker=!!$('#fApplyCust'),ids=picker?$$('#fApplyCust option').map(x=>x.value).filter(Boolean):[];
   const own=ids.includes(c.id)&&!ids.includes(other.id)&&ids.every(id=>customerVisible(CUSTOMERS.find(c=>c.id===id)));
   if(picker){$('#fApplyCust').value=c.id;$('#fApplyGo').click();}
   const p1=$('#p1').classList.contains('on');
   ME=keep.me;finApplyModal=keep.apply;dealGo=keep.go;CUSTOMERS.splice(-2);closeModal();
   return {picker,own,selected,p1,allocationBlocked};
  });
  assert.ok(salesCalc.picker&&salesCalc.own&&salesCalc.selected&&!salesCalc.p1&&salesCalc.allocationBlocked,'[เซลล์ค่างวด] เลือกงวดแล้วต้องยื่นไฟแนนซ์ให้ลูกค้าตนเองโดยไม่เปิดฟอร์มเลือกรถจริง');
  for(const width of [1440,390])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:1000});const fit=await p.evaluate(t=>{document.documentElement.dataset.theme=t;finCompare();return document.documentElement.scrollWidth<=innerWidth+1;},theme);
   assert.ok(fit,'[จอ] เครื่องคำนวณต้องไม่ล้น '+width+'/'+theme);
  }
  assert.deepEqual(errors,[]);console.log('ผ่าน · รหัสยืดหยุ่น/ชื่อรุ่น · ใบเสนอเงินสด+ผ่อน · ผู้ขายและ snapshot · ตารางตามไฟแนนซ์ · 1440/390');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
