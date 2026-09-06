/* v1.60 คำสั่งเจ้าของ:
   - ในหน้าขายรถ ช่องเลือกคันรถ (เลขตัวถัง) ไม่ต้องมีครับ เพราะเซลล์จะไม่สามารถเลือกตัวรถที่จะขายได้ เลือกได้เฉพาะรุ่น รหัสรุ่นและสี เมื่อกดยื่นไฟแนนซ์ และคนที่จะเลือกรถมาใส่ได้จะต้องเป็นระดับผู้บริหารหรือตำแหน่งสูงในขั้นตอนเปิดการขาย
   [1] ทุกบทบาทที่เข้าหน้าขายได้เริ่มที่คำนวณ [2] รุ่น/รหัส/สีแยกและไม่ขึ้นกับสต๊อก
   [3] ทุกบทบาทเลือกงวดแล้วไปยื่นพร้อมเงื่อนไขครบ [4] ยื่นไม่ตัดรถหรือเปิดขาย
   [5] แท็บซ่อน/ฟังก์ชันตรง/ผลค้นหาไม่ข้ามสิทธิ์และไม่ไปแท็บที่ไม่มี [6] ตัวเลือกคันตรงไม่ให้เซลล์จัดสรร
   [7] ผู้บริหารเปิดเงินผ่อนหลังอนุมัติและเลือกรถตรงคำขอ [8] เงินสดเปิดได้จากดีล
   [9] ปุ่มขายจากสต๊อกเตรียมรุ่นและสี ไม่เลือกคันจริง */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const b=await chromium.launch({executablePath:EXE});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Bangkok'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
  await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  const fails=await p.evaluate(async()=>{
   const out=[],check=(v,m)=>{if(!v)out.push(m);},visible=e=>!!e&&e.getClientRects().length>0;
   const actor=id=>{closeModal();closeDrawer();ME=STAFF.find(s=>s.id===id);buildNav();};
   const writes=[],oldUp=dbUp,oldPatch=dbPatch;dbUp=(table,body)=>writes.push({table,body});dbPatch=(table,id,body)=>writes.push({table,id,body});
   const base=PRICE[Object.keys(PRICE)[0]],family='รุ่นทดสอบไม่มีรถในสต๊อก';
   PRICE.QA60A={...base,m:family,retail:68000,disabled:false,c:{BK:{name:'ดำ'},WH:{name:'ขาว'}}};
   PRICE.QA60B={...base,m:family,retail:75000,disabled:false,c:{RD:{name:'แดง'},WH:{name:'ขาวพิเศษ'}}};
   PRICE.QA60C={...base,m:'อีกรุ่นทดสอบ',retail:80000,disabled:false,c:{GN:{name:'เขียว'}}};
   const customer=(id,branch=ME.branch,intent='เงินผ่อน')=>{
    const c={...CUSTOMERS[0],id,name:'ลูกค้ารอบ60 '+id,phone:'0890000060',idNo:'1101700203451',addr:'1 ถนนทดสอบ',branch,intent,variant:'QA60A',ownerId:ME.id,owner:ME.nick,archivedAt:null,createdAt:TODAY,upAt:TODAY};CUSTOMERS.push(c);return c;
   };
   for(const id of ['ST1','ST2','ST3']){
    actor(id);go('sell');const role=ME.role;
    check(CUR==='sell'&&$('#p2').classList.contains('on')&&!visible($('#sUnit')),'[1] '+role+' เข้าขายรถทั่วไปต้องเริ่มคำนวณและไม่เห็นเลขถัง');
    const searchTabs=gsIndex().filter(x=>x.kind==='tab'&&x.s==='แท็บในหน้า ขายรถ');
    check(searchTabs.length>0&&(role==='sales'?!searchTabs.some(x=>x.t.includes('เปิดการขาย')):searchTabs.some(x=>x.t.includes('เปิดการขาย'))),'[5] ผลค้นหาแท็บขายต้องแสดงขั้นเปิดขายตามสิทธิ์ '+role);
    for(const link of searchTabs){link.go();check(CUR==='sell'&&visible($('#s-sell>.pane.on')),'[5] ผลค้นหาแท็บขายต้องไปหน้าที่มีอยู่จริง '+role+' '+link.t);}go('sell');
    const vm=$('#fVehicleModel'),variant=$('#fModel'),color=$('#fColor');
    check(visible(vm)&&visible(variant)&&visible(color),'[2] '+role+' ต้องมีรุ่น รหัสรุ่น และสีคนละช่อง');
    if(!vm||!color)continue;
    const names=[...vm.options].filter(o=>o.value).map(o=>o.textContent.trim());
    check(names.includes(family)&&names.every(n=>!n.includes('QA60')),'[2] ช่องรุ่นแสดงชื่อ ไม่รวมรหัสรุ่น');
    vm.value=family;vm.dispatchEvent(new Event('change'));variant.value='QA60A';variant.dispatchEvent(new Event('change'));color.value='WH';color.dispatchEvent(new Event('change'));
    check([...variant.options].some(o=>o.value==='QA60A')&&[...variant.options].some(o=>o.value==='QA60B')&&![...variant.options].some(o=>o.value==='QA60C')&&!UNITS.some(u=>u.variant==='QA60A'),'[2] กรองรหัสตามรุ่นและเลือกรหัสที่ไม่มีรถได้');
    $('#fNet').value='71234';finCompare();check(num($('#fNet').value)===71234,'[2] คำนวณซ้ำต้องรักษาราคาที่กรอกเอง');
    variant.value='QA60B';variant.dispatchEvent(new Event('change'));
    check(color.value==='RD'&&[...color.options].some(o=>o.value==='WH'&&o.textContent==='ขาวพิเศษ')&&num($('#fNet').value)===75000,'[2] เปลี่ยนรหัสต้องใช้สีและราคาใหม่ ไม่ค้างสีเดิม');
    variant.value='QA60A';variant.dispatchEvent(new Event('change'));color.value='WH';color.dispatchEvent(new Event('change'));
    const fin=finActive().slice().reverse().find(f=>finTerms(f).length>1)||finActive().at(-1),term=finTerms(fin).at(-1),list=72000,down=30000,c=customer('QA60-CALC-'+id);
    $('#fNet').value=list;$('#fDown').value=down;$('#fFinance').value=fin.id;finCompare();
    const before={sales:SALES.length,cases:FINCASES.length,units:JSON.stringify(UNITS)};
    const row=$('#finCmp [data-pick="'+fin.id+'|'+term+'"]');check(!!row,'[3] ต้องมีค่างวดที่เลือกได้จากบริษัทจริง');if(!row)continue;row.click();
    check(visible($('#fApplyCust'))&&!visible($('#sUnit')),'[3] '+role+' เลือกงวดต้องเลือกลูกค้าเพื่อยื่น ไม่เปิดขายทันที');
    if(!$('#fApplyCust'))continue;
    $('#fApplyCust').value=c.id;$('#fApplyGo').click();
    check(visible($('#faModel'))&&$('#faModel').value===family&&$('#faVariant').value==='QA60A'&&$('#faColor').value==='WH'&&num($('#faList').value)===list&&num($('#faDown').value)===down&&$('#faFin').value===fin.id&&+$('#faTerm').value===term,'[3] '+role+' คำขอต้องรักษารุ่น รหัส สี ราคา ดาวน์ บริษัท และงวด');
    check(before.sales===SALES.length&&before.cases===FINCASES.length&&before.units===JSON.stringify(UNITS),'[3] เลือกเงื่อนไขยังไม่สร้างคำขอ ใบขาย หรือเปลี่ยนรถ');
    if(!$('#faGo'))continue;
    const saved=await finApplySave(c.id),fc=FINCASES.find(f=>f.custId===c.id);
    check(saved&&fc&&fc.variant==='QA60A'&&fc.colorCode==='WH'&&fc.list===list&&fc.down===down&&fc.finId===fin.id&&fc.term===term&&fc.saleId==null&&!fc.unitId&&!fc.unit_id&&CUR==='deal'&&!visible($('#sUnit'))&&SALES.length===before.sales&&JSON.stringify(UNITS)===before.units,'[4] '+role+' ยื่นแล้วต้องอยู่ดีล คำขอไม่มีคันรถและยังไม่เปิดขาย');
   }
   actor('ST3');go('sell');const unit=UNITS.find(u=>u.status==='available'&&inScope(u.branch));
   $('#sellTabs [data-p="p1"]').click();check(!$('#p1').classList.contains('on')&&!visible($('#sUnit')),'[5] คลิกแท็บที่ซ่อนตรง ๆ ต้องไม่เปิดจัดสรรรถให้เซลล์');
   sellTab('p1');check(!$('#p1').classList.contains('on')&&!visible($('#sUnit')),'[5] เรียก sellTab ตรงต้องไม่ข้ามสิทธิ์');
   // จำลองตัวเลือกค้างและการวาดหน้าที่ยังไม่เสร็จ: ฟังก์ชันเลือกคันต้องตรวจสิทธิ์เอง ไม่พึ่ง rSell ล้างรายการ
   $('#sUnit').innerHTML='<option value="">ยังไม่เลือก</option><option value="'+unit.id+'">'+unit.frame+'</option>';$('#sUnit').value='';
   const renderSell=rSell;let rerenders=0;rSell=()=>rerenders++;let result;try{result=sUnitSet(unit.id);}finally{rSell=renderSell;}
   check(result===false&&rerenders===0&&$('#sUnit').value===''&&!visible($('#sUnit')),'[6] เซลล์เรียก sUnitSet ตรงต้องเลือกคันไม่ได้');
   $('#sUnit').value='';closeDrawer();upickOpen($('#sUnit'));
   check(!visible($('#upList'))&&$('#sUnit').value==='','[6] เซลล์เปิดตัวเลือกคันตรง ๆ ต้องไม่ได้ แม้มี option ค้าง');closeDrawer();
   for(const id of ['ST1','ST2']){
    actor(id);go('sell');const role=ME.role,u=sellPool().find(u=>u.status==='available'),c=customer('QA60-OPEN-'+id,u.branch),f=finActive()[0],term=finTerms(f)[0];
    c.variant=u.variant;
    const fc={id:'QA60-FC-'+id,custId:c.id,saleId:null,branch:u.branch,status:'ส่งเรื่อง',variant:u.variant,model:u.model,colorCode:u.colorCode,color:u.color,list:PRICE[u.variant].retail,disc:0,down:10000,finId:f.id,term,rate:finRate(f,term),amount:PRICE[u.variant].retail-10000,per:3000,loan:36000,payNow:10000,at:TODAY,log:[]};FINCASES.push(fc);
    const denied=dealSell(c.id);check(denied===false&&!visible($('#sUnit')),'[7] '+role+' ต้องรอไฟแนนซ์อนุมัติก่อนเปิดขาย');fc.status='อนุมัติแล้ว';
    const opened=dealSell(c.id);check(opened===true&&CUR==='sell'&&$('#p1').classList.contains('on')&&visible($('#sUnit'))&&sCustSel===c.id,'[7] '+role+' เปิดจากดีลที่อนุมัติแล้วต้องเลือกคันได้');
    const options=[...$('#sUnit').options].filter(o=>o.value).map(o=>UNITS.find(u=>u.id===o.value));
    check(options.length>0&&options.every(x=>x&&x.variant===fc.variant&&x.color===fc.color&&x.branch===fc.branch),'[7] รายการคันจริงต้องตรงรุ่น สี และสาขาของคำขอ');
    sUnitSet(u.id);check($('#sUnit').value===u.id&&visible($('#sUnit')),'[7] ผู้บริหารเลือกคันจริงในขั้นเปิดขายได้');
    const cash=customer('QA60-CASH-'+id,u.branch,'เงินสด');cash.variant=u.variant;const cashOpened=dealSell(cash.id);
    check(cashOpened===true&&$('#p1').classList.contains('on')&&visible($('#sUnit'))&&sCustSel===cash.id&&$('#sPay').value==='cash'&&!FINCASES.some(f=>f.custId===cash.id),'[8] '+role+' เปิดขายเงินสดจากดีลได้โดยไม่สร้างคำขอไฟแนนซ์');
    go('sell');check($('#p2').classList.contains('on')&&!visible($('#sUnit')),'[1] กลับเข้าขายรถทั่วไปต้องออกจากขั้นจัดสรรคันเดิม');
   }
   actor('ST1');go('sell');const previous=$('#sUnit').value;go('stock');stTab('grp');
   [...document.querySelectorAll('#stGrp [data-grp]')].forEach(e=>stOpen[e.dataset.grp]=true);rStock();
   const quick=[...document.querySelectorAll('#stGrp [data-sell]')].find(e=>e.dataset.sell!==previous&&e.dataset.sell!==sellPool()[0]?.id),target=quick&&UNITS.find(u=>u.id===quick.dataset.sell);
   check(!!quick,'[9] ต้องมีปุ่มขายจากสต๊อกให้ทดสอบ');
   if(quick){quick.click();await new Promise(r=>setTimeout(r,80));check(CUR==='sell'&&$('#p2').classList.contains('on')&&!visible($('#sUnit'))&&$('#fVehicleModel')?.value===target.model&&$('#fModel').value===target.variant&&$('#fColor')?.value===target.colorCode&&$('#sUnit').value!==target.id,'[9] ปุ่มขายจากสต๊อกต้องเตรียมรุ่น รหัส สี ในตัวคำนวณ โดยไม่เลือกเลขถัง');}
   if(target){
    if(typeof sellPrepare==='function')sellPrepare('QA60C','GN');unitDrawer(target.id);const action=$('#drwB [data-usell="'+target.id+'"]');
    check(visible(action),'[9] รายละเอียดรถต้องมีทางลัดคำนวณรุ่นนี้');if(action){action.click();await new Promise(r=>setTimeout(r,80));check(CUR==='sell'&&$('#p2').classList.contains('on')&&!visible($('#sUnit'))&&$('#fModel').value===target.variant&&$('#fColor')?.value===target.colorCode&&$('#sUnit').value!==target.id,'[9] ทางลัดจากรายละเอียดรถต้องส่งรุ่นและสี ไม่จัดคัน');}
   }
   check(!writes.some(w=>['sale','sale_item','unit','finance_case'].includes(w.table)),'[4] การเตรียมและเลือกคันในชุดทดสอบต้องไม่มีคำสั่งเขียนฐานขาย/รถ');
   dbUp=oldUp;dbPatch=oldPatch;return out;
  });
  fails.push(...errors.map(e=>'PAGEERROR '+e));console.log(fails.length?'FAILS:\n'+fails.join('\n'):'ALL_CHECKS_PASS · เตรียมไฟแนนซ์ด้วยรุ่น/รหัส/สี · จัดสรรคันเฉพาะผู้บริหารตอนเปิดขาย');process.exitCode=fails.length?1:0;
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
