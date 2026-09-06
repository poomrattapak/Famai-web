/* บรีฟ 6 ก.ย. 2569 ข้อ 15-16: รถนอก + หนึ่งเดือนหลังส่งมอบ + นัดถัดไปพร้อมเวลา
   [1] ไม่สร้างก่อนส่งมอบ / หนึ่ง calendar month ปลายเดือน / ไม่ซ้ำ
   [2] เตือนแดงล่วงหน้า 7 วัน / deep-link IDs / ปิดแล้วหาย
   [3] รถนอกค้นเลขเครื่องและถัง exact / ใช้ลูกค้าเดิม / รุ่นพิมพ์เอง
   [4] บริการไม่มีราคาไม่มีนัดได้ / ไม่สร้างรอบ 90 วัน / เก็บฐานข้อมูลครบ
   [5] นัดพร้อมเวลาเป็น task ถัดไป / checkbox ปิด-เปิดและฐานตรงกัน
   [6] เรียก handler ตรง sales/read-only/ข้ามสาขาถูกบล็อก
   [7] ต้องค้นก่อน / validation ก่อนเปลี่ยนข้อมูลและเลขเอกสาร
   [8] งานและประวัติแบ่งหน้า / เปิดแจ้งเตือนไปหน้าของงาน
   [9] หน้าและ modal 390px ไม่ล้น */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const browser=await chromium.launch({executablePath:EXE});
 const p=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Bangkok'});
 const fails=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');await p.waitForTimeout(250);
 await p.evaluate(async()=>{
   window.__imp=id=>{ME=STAFF.find(x=>x.id===id);};window.__writes=[];
   window.__up=dbUp;window.__patch=dbPatch;
   dbUp=(table,body)=>__writes.push({table,body});dbPatch=(table,id,body)=>__writes.push({table,id,body});
   window.__form=(engine='OUT-56-ENGINE')=>{
     careServiceModal();$('#csQuery').value=engine;$('#csFind').onclick();
     $('#csName').value='ลูกค้ารถนอกรอบ 56';$('#csPhone').value='0891234456';$('#csModel').value='Honda Wave รุ่นพิมพ์เอง';
     $('#csEngine').value='OUT-56-ENGINE';$('#csFrame').value='OUT-56-FRAME';$('#csDetail').value='เช็กระยะ เปลี่ยนน้ำมันเครื่อง';
   };
 });
 const a=await p.evaluate(async()=>{
   const s={...SALES[0],id:'QA-S56',custId:CUSTOMERS[0].id,branch:ME.branch},r={id:'QA-R56',saleId:s.id,stage:'รอทะเบียน',log:[{to:'ได้ทะเบียนแล้ว',at:'2028-01-01'}]};SALES.push(s);REGS.push(r);
   const before=CARE.length,blocked=careCreate(s)===null&&CARE.length===before;
   r.deliveredAt='2028-01-31';const rec=careCreate(s),again=careCreate(s);
   return {blocked,one:rec&&rec.tasks.length===1&&rec.tasks[0].due==='2028-02-29'&&rec.createdAt==='2028-01-31',
     clamp:careMonthDate('2026-01-31')==='2026-02-28'&&careMonthDate('2026-12-31')==='2027-01-31',dedupe:!again&&CARE.length===before+1};
 });
 if(!a.blocked||!a.one||!a.clamp||!a.dedupe)fails.push('[1] ส่งมอบ/เดือนปฏิทิน/กันซ้ำผิด '+JSON.stringify(a));
 const b=await p.evaluate(async()=>{
   const r=CARE.find(x=>x.saleId==='QA-S56'),t=r.tasks[0];t.due=addDays(TODAY,7);
   const n=carePendingNotifications().find(x=>x.taskId===t.id);const red=careTaskStatus(t).includes('bad');
   t.due=addDays(TODAY,8);const no8=!carePendingNotifications().some(x=>x.taskId===t.id);
   t.due=addDays(TODAY,-1);const late=carePendingNotifications().some(x=>x.taskId===t.id);
   t.done=true;const noDone=!carePendingNotifications().some(x=>x.taskId===t.id);t.done=false;t.source='legacy';const noLegacy=!carePendingNotifications().some(x=>x.taskId===t.id);t.source='delivery_month';
   return {noLegacy,route:!!n&&n.go==='aftercare'&&n.careId===r.id&&n.custId===r.custId,red,no8,late,noDone};
 });
 if(Object.values(b).some(x=>!x))fails.push('[2] เตือน7วัน/แดง/ปลายทางผิด '+JSON.stringify(b));
 const d=await p.evaluate(async()=>{
   const n=SERVICE.length,nr=REMIND.length,nc=CUSTOMERS.length;__form();const ok=await careServiceSave();
   const j=SERVICE[SERVICE.length-1],r=CARE.find(x=>x.custId===j.custId),t=r.tasks[r.tasks.length-1];window.__care56=r.id;
   const w=__writes.find(x=>x.table==='service_job'&&x.body.id===j.id),tw=__writes.find(x=>x.table==='follow_up_task'&&x.body.id===t.id);
   return {ok,count:SERVICE.length===n+1&&CUSTOMERS.length===nc+1,noAuto:REMIND.length===nr,manual:r.tasks.length===1&&t.source==='manual'&&t.done&&t.amount===null,
     saved:!!w&&w.body.model_name==='Honda Wave รุ่นพิมพ์เอง'&&w.body.frame_no==='OUT-56-FRAME'&&!!tw&&tw.body.amount===null&&tw.body.task_source==='manual'};
 });
 if(Object.values(d).some(x=>!x))fails.push('[4] บริการไม่มีราคา/ไม่มีนัดหรือ writebackผิด '+JSON.stringify(d));
 const c=await p.evaluate(async()=>{
   const e=serviceVehicleLookup('OUT-56-ENGINE'),f=serviceVehicleLookup('OUT-56-FRAME'),partial=serviceVehicleLookup('OUT-56');
   const nc=CUSTOMERS.length;careServiceModal();$('#csQuery').value='OUT-56-FRAME';$('#csFind').onclick();
   const autofill=$('#csName').value==='ลูกค้ารถนอกรอบ 56'&&$('#csModel').value==='Honda Wave รุ่นพิมพ์เอง';
   $('#csDetail').value='บริการครั้งที่สอง';const ok=await careServiceSave();const bundles=CARE.length;
   __form('SECOND-ENGINE');$('#csEngine').value='SECOND-ENGINE';$('#csFrame').value='SECOND-FRAME';$('#csModel').value='รถคันที่สอง';const second=await careServiceSave();
   const sj=SERVICE[SERVICE.length-1],sr=CARE.find(x=>x.tasks.some(t=>t.serviceJobId===sj.id));
   const separate=second&&CARE.length===bundles+1&&sr&&careVehicle(sr).model==='รถคันที่สอง'&&CUSTOMERS.length===nc;
   const distinct=!!document.querySelector('#s-service #svModelName')&&document.querySelectorAll('#svModel').length===1;let serviceModel=false;
   if(distinct){go('service');$('#svSearch').value='OUT-56-ENGINE';svLookup();serviceModel=$('#svModelName').value==='Honda Wave รุ่นพิมพ์เอง';}
   return {distinct,serviceModel,separate,match:!!e&&!!f&&e.cust.id===f.cust.id&&f.frame==='OUT-56-FRAME'&&!partial,autofill,reuse:ok&&CUSTOMERS.length===nc};
 });
 if(Object.values(c).some(x=>!x))fails.push('[3] ค้นรถนอกหรือใช้ลูกค้าเดิมผิด '+JSON.stringify(c));
 const e=await p.evaluate(async()=>{
   careServiceModal(__care56);$('#csDetail').value='เช็กระยะ 2000 บาท';$('#csAmount').value='2000';$('#csAppointment').onclick();
   const next=addDays(TODAY,5)+'T10:30';$('#csAt').value=next;const ok=await careServiceSave();
   const r=CARE.find(x=>x.id===__care56),t=r.tasks[r.tasks.length-1],parent=r.tasks[r.tasks.length-2];
   const w=__writes.find(x=>x.table==='follow_up_task'&&x.body.id===t.id);
   careDrawer(r.id);let ck=document.querySelector('#drwB [data-care-done="'+r.id+'|'+t.id+'"]');
   const checkbox=!!ck;if(ck){ck.checked=true;ck.onchange();}const done=t.done;const savedDone=__writes.some(x=>x.table==='follow_up_task'&&x.id===t.id&&x.body.done_at);
   const reopen=careTask(r.id,t.id,null,false)&&!t.done;closeDrawer();
   return {ok,appointment:t.source==='service_next'&&t.appointmentAt===next+':00+07:00'&&t.parentTaskId===parent.id&&parent.amount===2000,
     persisted:!!w&&w.body.appointment_at===next+':00+07:00'&&w.body.parent_task_id===parent.id,checkbox,done,savedDone,reopen};
 });
 if(Object.values(e).some(x=>!x))fails.push('[5] วันเวลา/นัดถัดไป/checkboxผิด '+JSON.stringify(e));
 const f=await p.evaluate(async()=>{
   __form('OUT-56-ENGINE');const r=CARE.find(x=>x.id===__care56),t=r.tasks.find(x=>!x.done),before=JSON.stringify([CARE,SERVICE,DOC_COUNTER]);
   __imp('ST3');const sales=!(await careServiceSave())&&!careTask(r.id,t.id)&&before===JSON.stringify([CARE,SERVICE,DOC_COUNTER]);
   __imp('ST1');const saved=JSON.stringify(PERMS);PERMS.care=Object.assign({},PERMS.care,{'page:aftercare':'read','act:care':'write'});__imp('ST10');
   const read=!careTask(r.id,t.id);PERMS.care['page:aftercare']='write';PERMS.care['act:care']='none';const action=!careTask(r.id,t.id);__imp('ST1');PERMS=JSON.parse(saved);
   const old=r.branch;r.branch='QA-NO-SCOPE';__imp('ST10');const other=!careTask(r.id,t.id);r.branch=old;__imp('ST1');t.pendingSync=true;const pending=!careTask(r.id,t.id);delete t.pendingSync;closeModal();
   const customer=CUSTOMERS.find(x=>x.id===r.custId),owner=customer.ownerId,legacy={id:nid('LEGACY'),custId:customer.id,saleId:r.saleId,branch:r.branch,kind:'งานเก่า',due:TODAY,done:false};TASKS.push(legacy);
   const customerBranch=customer.branch;__imp('ST3');customer.branch=ME.branch;legacy.branch=ME.branch;customer.ownerId='คนอื่น';const legacyOwner=!dealTaskDone(legacy.id)&&!legacy.done;customer.ownerId=ME.id;
   const page=PERMS.sales['page:deal'];PERMS.sales['page:deal']='read';const legacyRead=!dealTaskDone(legacy.id)&&!legacy.done;PERMS.sales['page:deal']=page;const legacyOwnWrite=dealTaskDone(legacy.id)&&legacy.done;legacy.done=false;
   __imp('ST1');customer.ownerId=owner;customer.branch=customerBranch;const legacyWrite=dealTaskDone(legacy.id)&&legacy.done;
   return {sales,read,action,other,pending,legacyOwner,legacyRead,legacyOwnWrite,legacyWrite};
 });
 if(Object.values(f).some(x=>!x))fails.push('[6] guardสิทธิ์/สาขาหลุด '+JSON.stringify(f));
 const g=await p.evaluate(async()=>{
   const before=JSON.stringify([CARE,SERVICE,CUSTOMERS,DOC_COUNTER]);__form();careLookupState=null;const findFirst=!(await careServiceSave());
   __form();$('#csDetail').value='';const detail=!(await careServiceSave());$('#csDetail').value='ทดสอบ';$('#csAmount').value='-1';const negative=!(await careServiceSave());
   $('#csAmount').value='';$('#csAppointment').onclick();$('#csAt').value=addDays(TODAY,-1)+'T10:00';const past=!(await careServiceSave());
   const clean=before===JSON.stringify([CARE,SERVICE,CUSTOMERS,DOC_COUNTER]);closeModal();return {findFirst,detail,negative,past,clean};
 });
 if(Object.values(g).some(x=>!x))fails.push('[7] validationมีผลข้างเคียง '+JSON.stringify(g));
 const pages=await p.evaluate(async()=>{
   const r=CARE.find(x=>x.id===__care56);
   for(let i=0;i<15;i++)r.tasks.push({id:'QA-PAGE56-'+i,source:'service_next',title:'นัดเพิ่มเติม '+i,kind:'นัดบริการ',due:TODAY,done:false});
   go('aftercare');const paged=!!LIST_PAGES.acToday&&LIST_PAGES.acToday.pages>1&&$('#acToday').querySelectorAll('tbody tr').length===10;
   pageGo('acToday',2);const page2=!!LIST_PAGES.acToday&&LIST_PAGES.acToday.page===2&&!!document.querySelector('[data-list="acToday"] [aria-current="page"][data-page="2"]');
   careDrawer(r.id,'QA-PAGE56-14');const focused=!!document.getElementById('care-task-QA-PAGE56-14');
   const history=LIST_PAGES.careTaskHistory.pages>1&&$('#careTaskHistory').querySelectorAll('.frow').length<=6;
   closeDrawer();return {paged,page2,focused,history};
 });
 if(Object.values(pages).some(x=>!x))fails.push('[8] แบ่งหน้าหรือเปิดงานจากแจ้งเตือนผิด '+JSON.stringify(pages));
 await p.setViewportSize({width:390,height:844});
 const h=await p.evaluate(async()=>{go('aftercare');const screen=document.documentElement.scrollWidth<=innerWidth+1;careServiceModal();$('#csQuery').value='OUT-56-ENGINE';$('#csFind').onclick();const modal=$('#modal').scrollWidth<=innerWidth+1;closeModal();return {screen,modal};});
 if(!h.screen||!h.modal)fails.push('[9] มือถือมีส่วนล้น '+JSON.stringify(h));
 console.log(fails.length?'FAILS:\n'+fails.join('\n'):'ALL_CHECKS_PASS');console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'NO_PAGE_ERRORS');
 await browser.close();process.exit(fails.length||errors.length?1:0);
})();
