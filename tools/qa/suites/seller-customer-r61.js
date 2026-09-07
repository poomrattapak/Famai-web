/* คำสั่งเจ้าของ: “ผมไม่อยากให้ต้องกดเลือกเซลล์และใส่เบอร์โทรเองตอนสร้างใบเสนอราคา เพื่อลดขั้นตอนการกด แต่อยากให้บันทึกข้อมูลของเซลล์ตั้งแต่ขั้นตอนที่เซลล์ขายรถได้ครับ ส่วนเบอร์ก็เอามาจากฐานข้อมูลของพนักงานครับ เพราะตอนสร้างรหัสพนักงาน จะให้ใส่ข้อมูลของพนักงานตัวเองอยู่แล้ว”
   “อีกเรื่องคือตอนนี้ในหน้าลูกค้าและดีล เซลล์ไม่เห็นลูกค้าของตัวเอง ลองตรวจสอบหน่อยครับ”
   [1] เจ้าของ/สาขาข้อมูลสาธิต [2] ลูกค้าเก่าและหลายสาขา [3] ใบเสนออัตโนมัติและเจ้าของดีล
   [4] สำเนาผู้ขายบนใบเก่าคงเดิม [5] โปรไฟล์รอฐานตอบ/สิทธิ์ [6] โหลดเบอร์และสาขาจากบัญชีจริง
   [7] บันทึกใบเสนอรอฐานตอบก่อนขึ้นสำเร็จ [8] เปิดขายคงเจ้าของเดิม */
const {chromium,EXE,BASE}=require('./env');
(async()=>{const b=await chromium.launch({executablePath:EXE});try{
 const p=await b.newPage({viewport:{width:1180,height:820}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST3"]');await p.click('#lgGo');
 const fails=await p.evaluate(async()=>{
  const bad=[],ok=(v,m)=>{if(!v)bad.push(m);},admin=STAFF.find(s=>s.id==='ST1'),self=STAFF.find(s=>s.id==='ST3');
  for(const s of STAFF.filter(s=>s.role==='sales')){ME=s;go('deal');
   const own=CUSTOMERS.filter(c=>c.ownerId===s.id);ok(own.length>0&&own.every(customerVisible)&&dealRows().length===own.length,'[1] ลูกค้าของ '+s.id+' ต้องแสดงครบตามเจ้าของและสาขา');
   ok(dealAll().every(d=>d.c.ownerId===s.id),'[1] ห้ามเห็นลูกค้าคนอื่น');}
  ME={...self,branches:[self.branch,'FMG01']};
  const c={id:'QA61-OLD',name:'ลูกค้าเก่าของเซลล์',phone:'0810000061',branch:'FMG01',ownerId:self.id,owner:self.nick,upAt:addDays(TODAY,-90)+'T09:00:00+07:00',variant:Object.keys(PRICE)[0],intent:'เงินสด'};
  const other={...c,id:'QA61-OTHER',ownerId:'ST4'};CUSTOMERS.push(c,other);go('deal');
  ok(customerVisible(c)&&!customerVisible(other)&&dealRows().some(d=>d.c.id===c.id),'[2] ลูกค้าเก่าในสาขาที่ได้รับสิทธิ์ต้องไม่หาย');
  PERIOD.deal={r:30,from:'',to:''};rDeal();ok(!dealRows().some(d=>d.c.id===c.id),'[2] เลือก 30 วันแล้วต้องกรองตามจริง');delete PERIOD.deal;
  ME=self;go('quote');quoteAddCustomer();$('#cmName').value='ลูกค้าใหม่ไม่ซ้ำ';$('#cmPhone').value='0810006161';await $('#cmGo').onclick();
  const standalone=await saveQuote();ok(standalone?.sellerId===self.id&&standalone.sellerPhone===self.phone,'[3] เซลล์สร้างใบเสนอใหม่ต้องใช้บัญชีตนเองทันที');
  const oldPhone=self.phone;self.phone='';qDraw();ok(saveQuote()===null&&!!$('#qContact'),'[3] ไม่มีเบอร์ในประวัติต้องมีทางแก้โปรไฟล์และไม่พิมพ์เบอร์ปลอม');self.phone=oldPhone;
  ME=admin;go('quote');ok(!$('#qSeller')&&!$('#qSellerPhone'),'[3] ใบเสนอไม่ต้องเลือกเซลล์หรือกรอกเบอร์ซ้ำ');
  if(typeof quoteForCustomer!=='function')bad.push('[3] ไม่มีทางสร้างใบเสนอจากดีล');
  else{quoteForCustomer(c.id);ok($('#qName').value===c.name&&$('#qPhone').value===c.phone,'[3] จากดีลต้องเติมลูกค้าอัตโนมัติ');}
  $('#qPay').value='cash';qDraw();const q=await saveQuote();
  ok(q&&q.sellerId===self.id&&q.sellerName===self.name&&q.sellerPhone===self.phone&&q.custId===c.id,'[3] ผู้บริหารทำใบเสนอแทนต้องใช้เซลล์เจ้าของดีล');
  if(q){const before=$('#qDoc').innerHTML,phone=self.phone;self.phone='0899990061';quoteView(q.id);
   ok($('#qDoc').innerHTML===before&&$('#qSellerInfo')?.textContent.includes(phone),'[4] เบอร์พนักงานเปลี่ยนต้องไม่ทับใบเก่า');self.phone=phone;}
  if(typeof staffContactSave!=='function')bad.push('[5] ไม่มีที่บันทึกเบอร์พนักงาน');
  else{ME=self;const old=self.phone,sb=sbFetch;LIVE=true;let done,payload;
   sbFetch=(path,opt)=>{payload={path,body:JSON.parse(opt.body)};return new Promise(r=>done=r);};
   const pending=staffContactSave(self.id,'0890000061');ok(self.phone===old,'[5] ยังไม่ตอบต้องไม่เปลี่ยนเบอร์');
   done({id:self.id,phone:'0890000061'});ok(await pending&&self.phone==='0890000061'&&payload.path==='/rest/v1/rpc/staff_set_contact','[5] ต้องบันทึกเบอร์จากประวัติลงฐาน');
   const calls=payload;sbFetch=async(path,opt)=>{payload={path,body:JSON.parse(opt.body)};return {id:'ST4',phone:'0890000062'};};ok(!await staffContactSave('ST4','0890000062')&&payload===calls,'[5] เซลล์ห้ามแก้เบอร์คนอื่นผ่านฟังก์ชันตรง');
   sbFetch=async()=>{throw Error('QA reject');};ok(!await staffContactSave(self.id,'0890000063')&&self.phone==='0890000061','[5] ฐานปฏิเสธต้องคงเบอร์เดิม');
   LIVE=false;sbFetch=sb;self.phone=old;ME=admin;}
  if(typeof staffFromRow!=='function')bad.push('[6] ต้องใช้ข้อมูลติดต่อและทุกสาขาจากบัญชีพนักงาน');
  else{const s=staffFromRow({id:'qa',full_name:'พนักงาน',phone:'0810000006',all_branch:false,app_user_role:[{role:{code:'sales'}}],app_user_branch:[{branch:{code:'FMG02'}},{branch:{code:'FMG01'}}]},[],'FMG02');
   ok(s.phone==='0810000006'&&s.branches.includes('FMG01'),'[6] โหลดเบอร์และหลายสาขาไม่ได้');}
  if(typeof quoteForCustomer==='function')quoteForCustomer(c.id);else{go('quote');qSavedNo=null;}
  const keep={sb:sbFetch,id:dbId,br:BR_IDS['FMG01'],up:dbUp,rpc:dbRpc,vid:VARIANT_IDS[c.variant],selfId:self.id,cid:c.id};
  self.id='61000000-0000-4000-8000-000000000001';c.ownerId=self.id;c.id='61000000-0000-4000-8000-000000000002';
  if(typeof quoteForCustomer==='function')quoteForCustomer(c.id);qSavedNo=null;
  LIVE=true;BR_IDS.FMG01='61000000-0000-4000-8000-000000000003';VARIANT_IDS[c.variant]='61000000-0000-4000-8000-000000000004';dbUp=()=>{};dbRpc=()=>{};
  let ack,write;sbFetch=(path,opt)=>{write={path,body:JSON.parse(opt.body)};return new Promise(r=>ack=r);};
  const n=QUOTES.length,pending=saveQuote();const repeat=saveQuote();ok(repeat===pending,'[7] กดซ้ำระหว่างบันทึกต้องใช้คำขอเดิม');ok(QUOTES.length===n&&!qSavedNo,'[7] ใบเสนอต้องรอฐานตอบก่อนแสดงสำเร็จ');
  if(ack){ack({...write.body.p_quote,seller_id:self.id,seller_name:self.name,seller_phone:'0890000099'});const saved=await pending;
   ok(write.path==='/rest/v1/rpc/quote_save'&&saved?.sellerPhone==='0890000099'&&QUOTES.length===n+1,'[7] ต้องใช้ชื่อเบอร์ที่ฐานยืนยันและบันทึกหัวกับตัวเลือกพร้อมกัน');}
  else bad.push('[7] ไม่มีการบันทึกใบเสนอที่รอผล');
  qSavedNo=null;const beforeFailure=QUOTES.length;sbFetch=async()=>{throw Error('QA quote reject');};
  ok(await saveQuote()===null&&QUOTES.length===beforeFailure&&!qSavedNo&&!$('#qSave').disabled,'[7] ฐานปฏิเสธต้องไม่เพิ่มใบเสนอและให้ลองใหม่ได้');
  LIVE=false;sbFetch=keep.sb;dbUp=keep.up;dbRpc=keep.rpc;BR_IDS.FMG01=keep.br;VARIANT_IDS[c.variant]=keep.vid;self.id=keep.selfId;c.ownerId=self.id;c.id=keep.cid;
  ME=admin;const added={id:'QA61-STAFF',nick:'พนักงานใหม่จากฐาน',name:'พนักงานใหม่',role:'sales',branch:ME.branch,phone:'0810000011'};STAFF.push(added);go('sell');sellTab('p1');
  ok([...$('#sSales').options].some(o=>o.value===added.nick),'[8] รายชื่อเซลล์เปิดขายต้องมาจากพนักงานปัจจุบัน');STAFF.pop();rSell();$('#sSales').value='เซลล์สนุ๊กเกอร์';sCustFill(c);
  ok($('#sSales').value===self.nick,'[8] เปิดขายต้องเติมเซลล์เจ้าของลูกค้าเดิม');
  const managerCustomer={...c,id:'QA61-MANAGER-CUSTOMER',ownerId:admin.id,owner:admin.nick};CUSTOMERS.push(managerCustomer);sCustFill(managerCustomer);rSell();
  ok($('#sSales').selectedOptions[0]?.dataset.staffId===admin.id,'[8] วาดฟอร์มซ้ำต้องไม่ทำผู้รับผิดชอบที่เป็นผู้บริหารหาย');CUSTOMERS.pop();sCustFill(c);
  const unit=UNITS.find(u=>u.branch===c.branch&&u.status==='available'&&u.retail!=null&&!u.clearance);
  if(unit){sUnitSet(unit.id);sCustFill(c);setPay('cash');$('#sSales').value='เซลล์สนุ๊กเกอร์';$('#sDisc').value=0;await saveSale(false,true);
    const sale=SALES.find(s=>s.custId===c.id);ok(sale?.salesId===self.id&&sale.sales===self.nick,'[8] บันทึกขายต้องเก็บรหัสเซลล์เจ้าของดีลไม่ใช่ผู้บริหารหรือค่าที่ค้างในช่อง · '+$('#toasts').lastElementChild?.textContent);}
  else bad.push('[8] ไม่มีรถในข้อมูลทดสอบสำหรับบันทึกขาย');
  return bad;
 });
 if(errors.length)fails.push('pageerror: '+errors.join('; '));if(fails.length)throw Error(fails.join('\n'));
 console.log('ผ่าน 8 ข้อ · เซลล์อัตโนมัติ/โปรไฟล์/ฐานตอบ/เจ้าของลูกค้า/หลายสาขา/ช่วงเวลา');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
