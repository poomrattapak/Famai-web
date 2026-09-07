/* เจ้าของ: “อยากให้ flow เป็นแบบนี้ครับ ถ้าเราจะออกใบเสนอราคาให้ลูกค้า จะต้องเพิ่มข้อมูลลูกค้าในหน้าลูกค้าและดีลก่อน ส่วนในหน้าใบเสนอราคา จะสามารถเลือกลูกค้าที่เราเพิ่มไว้แล้วได้ ถ้าไม่เจอลูกค้า ก็จะมีปุ่มให้เพิ่มลูกค้า และจะเป็น popup เด้งขึ้นมาให้กรอกข้อมูลลูกค้าเหมือนการเพิ่มลูกค้าในหน้าลูกค้าและดีล จะไม่เปลี่ยนหน้าเพราะ ux ไม่ดี ให้ popup เด้งขึ้นมาเท่านั้น และหลังกรอกเสร็จ ข้อมูลก็จะถูกกรอกใน field ของใบเสนอราคาเลย และข้อมูลลูกค้าก็จะถูกเพิ่มไว้ในระบบเช่นกัน”
 [1] บังคับลูกค้าในระบบ [2] ค้นหา/เลือกเจ้าของถูกคน [3] ป๊อปอัปเดิม/คงหน้า/เติมทันที
 [4] รอฐาน/ล้มเหลว/กดซ้ำ [5] สิทธิ์ [6] ร่าง/ยกเลิก/หมุนจอ [7] อ้าง UUID ต่อไปขาย/ใบเก่า */
const {chromium,EXE,BASE}=require('./env');
(async()=>{const b=await chromium.launch({executablePath:EXE});try{
 const p=await b.newPage({viewport:{width:1180,height:820}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST3"]');await p.click('#lgGo');
 const failures=await p.evaluate(async()=>{
  const bad=[],ok=(v,m)=>{if(!v)bad.push(m);};go('quote');
  const n=QUOTES.length,counter=JSON.stringify(DOC_COUNTER);$('#qName').value='กรอกลอยๆ';$('#qPhone').value='0810006262';
  const empty=await saveQuote();ok(empty===null&&QUOTES.length===n&&JSON.stringify(DOC_COUNTER)===counter,'[1] ต้องเลือกลูกค้าในระบบก่อนออกใบเสนอและไม่เผาเลข');
  ok($('#qName').readOnly&&$('#qPhone').readOnly,'[1] ชื่อและเบอร์ต้องเติมจากลูกค้าที่เลือก');
  if(!$('#qCustomerSearch')||!$('#qCustomerAdd')||typeof quoteSelectCustomer!=='function'){bad.push('[2] ไม่มีตัวเลือกลูกค้าและปุ่มเพิ่ม');return bad;}
  const a={id:'QA62-A',name:'ชื่อซ้ำสำหรับทดสอบ',phone:'0810006262',branch:ME.branch,ownerId:ME.id,owner:ME.nick,upAt: new Date().toISOString(),intent:'เงินสด'},
    c={...a,id:'QA62-B'},foreign={...a,id:'QA62-FOREIGN',name:'ของเซลล์คนอื่น',ownerId:'ST4'},archived={...a,id:'QA62-ARCHIVE',archivedAt:TODAY};CUSTOMERS.push(a,c,foreign,archived);
  $('#qCustomerSearch').value='081-000-6262';$('#qCustomerSearch').oninput();$('#qCustomerSearch').onfocus();
  const ids=[...$('#qCustomerList').querySelectorAll('[data-qcustomer]')].map(e=>e.dataset.qcustomer);
  ok(ids.includes(a.id)&&ids.includes(c.id)&&!ids.includes(foreign.id)&&!ids.includes(archived.id),'[2] ค้นหาเบอร์ต้องมีเฉพาะลูกค้าที่ดูแลและแยกคนซ้ำได้');
  quoteSelectCustomer(c.id);$('#qName').value='ปลอมชื่อ';$('#qPhone').value='000';const q=await saveQuote();
  ok(q?.custId===c.id&&q.name===c.name&&q.phone===c.phone&&q.sellerId===ME.id,'[2] บันทึกต้องอ้างคนที่เลือก ไม่เดาจากชื่อหรือเบอร์');
  qSavedNo=null;$('#qPay').value='finance';$('#qDown').value='12000';$('#qUntil').value=addDays(TODAY,12);qDraw();
  const draft=[$('#qV1').value,$('#qV2').value,$('#qPay').value,$('#qDown').value,$('#qUntil').value],oldSelect=qCustomerId;
  let navigations=0;const nav=go;go=(...args)=>{navigations++;return nav(...args);};$('#qCustomerAdd').click();
  ok(CUR==='quote'&&!!$('#cmName')&&!!$('#cmIntent')&&!!$('#cmModel')&&!!$('#cmMoreBtn')&&!navigations,'[3] เพิ่มลูกค้าต้องเปิดฟอร์มเดียวกับดีลโดยไม่เปลี่ยนหน้า');
  closeModal();ok(qCustomerId===oldSelect&&JSON.stringify(draft)===JSON.stringify([$('#qV1').value,$('#qV2').value,$('#qPay').value,$('#qDown').value,$('#qUntil').value]),'[6] ยกเลิกเพิ่มลูกค้าต้องคงร่างและลูกค้าเดิม');
  $('#qCustomerAdd').click();$('#cmName').value='ลูกค้าจากป๊อปอัปใบเสนอ';$('#cmPhone').value='0810006203';await $('#cmGo').onclick();
  const fresh=CUSTOMERS.find(x=>x.name==='ลูกค้าจากป๊อปอัปใบเสนอ');
  ok(fresh&&fresh.ownerId===ME.id&&qCustomerId===fresh.id&&$('#qName').value===fresh.name&&$('#qPhone').value===fresh.phone&&CUR==='quote'&&!navigations,'[3] บันทึกแล้วต้องเพิ่มในระบบและเติมใบเสนอทันทีโดยไม่เปลี่ยนหน้า');
  ok(JSON.stringify(draft)===JSON.stringify([$('#qV1').value,$('#qV2').value,$('#qPay').value,$('#qDown').value,$('#qUntil').value]),'[6] เพิ่มลูกค้าต้องรักษารุ่น เงื่อนไข และวันที่ในร่าง');go=nav;
  const before=CUSTOMERS.length,sel=qCustomerId;$('#qCustomerAdd').click();$('#cmName').value='ลูกค้ารอฐาน';$('#cmPhone').value='0810006204';
  const fetch=sbFetch;let calls=0,payload;const acks=[];LIVE=true;sbFetch=(path,opt)=>{calls++;payload={path,body:JSON.parse(opt.body)};return new Promise(r=>acks.push(r));};
  const save=$('#cmGo').onclick,waiting=save();const repeated=save();
  ok(CUSTOMERS.length===before&&qCustomerId===sel&&$('#cmGo').disabled&&calls===1,'[4] ระหว่างรอห้ามเติมใบเสนอหรือส่งลูกค้าซ้ำ');
  acks.forEach(ack=>ack([]));await waiting;await repeated;
  ok(CUSTOMERS.length===before&&qCustomerId===sel&&!!$('#cmName')&&$('#cmName').value==='ลูกค้ารอฐาน'&&!$('#cmGo').disabled,'[4] ฐานปฏิเสธต้องคงฟอร์มและข้อมูลเดิม');
  const firstId=payload?.body.id;sbFetch=async(path,opt)=>{payload={path,body:JSON.parse(opt.body)};return [{...payload.body,owner_id:ME.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];};
  await $('#cmGo').onclick();LIVE=false;sbFetch=fetch;
  const saved=CUSTOMERS.find(c=>c.name==='ลูกค้ารอฐาน');ok(saved&&saved.id===firstId&&qCustomerId===saved.id&&payload?.path.startsWith('/rest/v1/customer')&&!Object.hasOwn(payload.body,'owner_id')&&saved.ownerId===ME.id&&CUR==='quote','[4] ลองใหม่ต้องใช้รหัสเดิมและเติมหลังฐานยืนยันเท่านั้น');
  const self=ME;ME={...self,id:'ST4'};ok(!quoteSelectCustomer(a.id),'[5] เลือกลูกค้าคนอื่นผ่านฟังก์ชันตรงไม่ได้');ME=self;
  const perms={...PERMS.sales};PERMS.sales['page:deal']='read';
  if(typeof quoteAddCustomer==='function'){quoteAddCustomer();ok(!$('#modal').classList.contains('on'),'[5] ดีลอ่านอย่างเดียวห้ามเปิดเพิ่มลูกค้าจากใบเสนอ');}else bad.push('[5] ไม่มีด่านเพิ่มลูกค้า');
  PERMS.sales={...perms,'page:quote':'read'};ok(!quoteSelectCustomer(a.id),'[5] ใบเสนออ่านอย่างเดียวห้ามเปลี่ยนลูกค้า');PERMS.sales=perms;
  quoteForCustomer(c.id);$('#qPay').value='cash';qDraw();const linked=await saveQuote();
  const old={persist:custPersist,sell:dealSell,go:dealGo},routed=[];custPersist=async()=>true;dealSell=id=>routed.push(id);dealGo=()=>{};
  const total=CUSTOMERS.length;await quoteToSale(linked.id);
  ok(routed[0]===c.id&&CUSTOMERS.length===total,'[7] ไปขายต้องใช้รหัสลูกค้าเดิมแม้ชื่อและเบอร์ซ้ำ');
  const legacy={...linked,id:'QA62-LEGACY',no:'QA62-OLD',custId:'',phone:'0810009999'};QUOTES.push(legacy);
  await quoteToSale(legacy.id);ok(CUSTOMERS.length===total,'[7] ใบเก่าไม่มีรหัสลูกค้าห้ามสร้างลูกค้าเงียบๆ');
  quoteView(legacy.id);ok($('#qDoc').textContent.includes(legacy.no)&&$('#qDoc').textContent.includes(legacy.name),'[7] ใบเก่าที่ยังไม่มีรหัสลูกค้าต้องเปิดพิมพ์สำเนาเดิมได้');
  custPersist=old.persist;dealSell=old.sell;dealGo=old.go;
  return bad;
 });
 if(failures.length)throw Error(failures.join('\n'));
 await p.evaluate(()=>{const picker=$('#qCustomerSearch');picker.focus();picker.blur();picker.focus();});
 await p.waitForTimeout(220);
 if(!await p.locator('#qCustomerList').isVisible())throw Error('[2] กลับโฟกัสทันทีต้องไม่ถูกซ่อนด้วยเวลา blur เดิม');
 await p.fill('#qCustomerSearch','ลูกค้าจากป๊อปอัปใบเสนอ');await p.press('#qCustomerSearch','ArrowDown');await p.press('#qCustomerSearch','Enter');
 if(await p.inputValue('#qName')!=='ลูกค้าจากป๊อปอัปใบเสนอ')throw Error('[2] ต้องเลือกลูกค้าด้วยแป้นพิมพ์ได้');
 await p.evaluate(()=>{qSavedNo=null;$('#qCustomerAdd').click();$('#cmName').value='ร่างตอนหมุนจอ';$('#cmPhone').value='0810006266';});
 for(const width of [820,1180]){await p.setViewportSize({width,height:width===820?1180:820});const kept=await p.evaluate(()=>CUR==='quote'&&$('#cmName')?.value==='ร่างตอนหมุนจอ'&&$('#cmPhone')?.value==='0810006266'&&document.documentElement.scrollWidth<=innerWidth+1);if(!kept)throw Error('[6] หมุนแท็บเล็ตต้องคงป๊อปอัปและร่างลูกค้า');}
 if(errors.length)throw Error(errors.join('\n'));console.log('ผ่าน 7 กลุ่ม · ลูกค้าในระบบ/ป๊อปอัปหน้าเดิม/บันทึกรอผล/สิทธิ์/ร่าง/รหัสลูกค้า/ใบเก่า');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
