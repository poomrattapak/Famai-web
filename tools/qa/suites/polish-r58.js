/* เจ้าของขอ: ปุ่มย้ายลูกค้าไม่ติดตามตอนเลื่อน · task แสดงผู้ติ๊ก · ช่องไฟใช้ระบบเดียวกัน
   ตรวจชื่อหลัง ACK/โหลดใหม่/เปิดงานคืน และวัดองค์ประกอบจริงทั้งคอม มือถือ สว่าง มืด */
const {chromium,EXE,BASE}=require('./env');
(async()=>{const b=await chromium.launch({executablePath:EXE});try{
 const p=await b.newPage({timezoneId:'Asia/Bangkok'}),errors=[],fails=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');
 await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
 for(const width of [1440,390])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:900});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const checks=await p.evaluate(()=>{
   const out=[],check=(v,m)=>{if(!v)out.push(m);};
   go('deal');const c=CUSTOMERS.find(c=>customerArchiveAllowed(c)&&!c.archivedAt);dealGo(c.id);
   const button=$('#dlArchiveGo'),parent=button?.parentElement;
   check(!!button&&getComputedStyle(parent).position==='static'&&!parent.classList.contains('savebar'),'[1] ปุ่มย้ายลูกค้าต้องอยู่ท้ายรายละเอียดแบบไม่ติดจอ');
   const card=parent?.closest('.card');check(card&&card.contains(button),'[1] ปุ่มต้องอยู่ในรายละเอียดเดิม');
   go('sell');const input=$('#sDown'),buttonSave=$('#sSave');
   check(getComputedStyle(input).height===getComputedStyle(buttonSave).height,'[2] ช่องกรอกกับปุ่มต้องสูงเท่ากันในฟอร์ม');
   const cards=[...document.querySelectorAll('.g2>.card,.g2e>.card,.g3>.card')];
   check(cards.length>0&&cards.every(c=>parseFloat(getComputedStyle(c).marginBottom)===0),'[2] การ์ดใน grid ต้องใช้ช่องไฟเดียวไม่บวกระยะซ้ำ');
   careServiceModal();const modal=$('#modal .mb');const mp=getComputedStyle(modal).paddingBottom;closeModal();
   careDrawer(CARE[0].id);const ds=getComputedStyle($('#drwB'));
   check(ds.paddingBottom===mp&&ds.paddingLeft===getComputedStyle(modal).paddingLeft,'[2] รายละเอียดและฟอร์มต้องใช้ระยะขอบเดียวกัน');closeDrawer();
   openModal('ตรวจช่องไฟ','<div class="f"><label class="fl" for="qaGap">รายละเอียด</label><textarea class="inp" id="qaGap"></textarea></div>');
   const label=document.querySelector('label[for="qaGap"]');
   check(Math.abs($('#qaGap').getBoundingClientRect().top-label.getBoundingClientRect().bottom-8)<1,'[2] หัวช่องกับช่องกรอกต้องห่าง 8px');closeModal();
   check(document.documentElement.scrollWidth<=innerWidth+1,'[2] หน้าไม่ล้นแนวนอน');return out;
  });fails.push(...checks.map(x=>`${width}/${theme} ${x}`));
 }
 const checks=await p.evaluate(async()=>{
  const out=[],check=(v,m)=>{if(!v)out.push(m);},admin=ME,actor=STAFF.find(s=>s.id==='ST10'),origFetch=sbFetch;
  const r={id:'QA-CREDIT',custId:CUSTOMERS[0].id,branch:admin.branch,tasks:[{id:'QA-TASK',source:'service_next',title:'ตรวจชื่อผู้ทำ',due:TODAY,done:false}],check:[]};CARE.push(r);const t=r.tasks[0];
  ME=actor;await careTask(r.id,t.id,null,true);ME=admin;careDrawer(r.id,t.id);
  check($('#care-task-'+t.id).textContent.includes(actor.name),'[3] ผู้เปิดประวัติต้องเห็นชื่อคนติ๊กจริง');
  await careTask(r.id,t.id,null,false);careDrawer(r.id,t.id);
  check(!$('#care-task-'+t.id).textContent.includes('ทำเสร็จโดย')&&!t.doneBy,'[4] เปิดงานคืนต้องล้างผู้ติ๊ก');
  LIVE=true;sbFetch=async()=>[{id:t.id,done_at:TODAY+'T02:30:00Z',done_by:actor.id,note:''}];
  await careTask(r.id,t.id,null,true);careDrawer(r.id,t.id);
  check(t.doneBy===actor.id&&$('#care-task-'+t.id).textContent.includes(actor.name),'[5] ชื่อหลังบันทึกต้องยึดผู้ทำจากคำตอบฐาน');
  sbFetch=async()=>{throw Error('จำลองคำขอถูกปฏิเสธ');};await careTask(r.id,t.id,null,false);
  check(t.done&&t.doneBy===actor.id,'[6] บันทึกไม่สำเร็จต้องไม่ล้างชื่อเดิม');
  r.saleId='qa-sync-sale';t.source='delivery_month';let syncPath='';
  sbFetch=async path=>{syncPath=path;return [{id:t.id,due_at:TODAY,done_at:TODAY+'T02:30:00Z',done_by:actor.id,title:t.title}];};
  t.doneBy=null;await careSyncSale(r.saleId);careDrawer(r.id,t.id);
  check(syncPath.includes('done_by')&&t.doneBy===actor.id&&$('#care-task-'+t.id).textContent.includes(actor.name),'[9] โหลดงานอัตโนมัติซ้ำต้องคงผู้ทำจากฐาน');LIVE=false;sbFetch=origFetch;closeDrawer();
  careServiceModal();$('#csQuery').value='QA-R58-SERVICE';$('#csFind').click();$('#csName').value='ลูกค้าประวัติบริการ';$('#csPhone').value='0800000058';$('#csModel').value='รุ่นภายนอก';$('#csDetail').value='งานใหม่พร้อมผู้ทำ';
  LIVE=true;sbFetch=async(path,opt)=>{const req=JSON.parse(opt.body).p_request;return {customer:{id:req.customer_id,full_name:req.customer_name,phone:req.customer_phone,owner_id:actor.id,updated_at:TODAY},job:{id:req.id,customer_id:req.customer_id,job_no:'QA-R58',engine_no:req.engine,model_name:req.model,checked_in_at:TODAY,status:'ส่งมอบแล้ว',labor_cost:0,parts_cost:0},tasks:[{id:'qa-service-credit',task_source:'manual',title:req.detail,due_at:TODAY,done_at:TODAY+'T02:30:00Z',done_by:actor.id,service_job_id:req.id}]};};
  const saved=await careServiceSave();LIVE=false;sbFetch=origFetch;
  const service=CARE.find(r=>r.tasks.some(t=>t.id==='qa-service-credit'));if(service)careDrawer(service.id,'qa-service-credit');
  check(saved&&service?.tasks[0].doneBy===actor.id&&$('#care-task-qa-service-credit')?.textContent.includes(actor.name),'[10] งานบริการที่บันทึกเป็นชุดต้องแสดงผู้ทำจากฐาน');closeDrawer();
  const select=sbSelect,me={id:admin.id,app_user_role:[{role:{code:'admin'}}],app_user_branch:[{branch:{code:admin.branch}}]},branch={id:'qa-branch',code:admin.branch};
  const data={app_user:[{id:actor.id,full_name:actor.name,nickname:actor.nick}],customer:[{id:'qa-customer',branch_id:branch.id,full_name:'ลูกค้าทดสอบ'}],
   follow_up_task:[{id:'qa-loaded-task',branch_id:branch.id,customer_id:'qa-customer',kind:'care service_next',task_source:'service_next',title:'งานหลังรีโหลด',due_at:TODAY,done_at:TODAY+'T02:30:00Z',done_by:actor.id}]};
  let selects='';sbSelect=async(table,params)=>{if(table==='follow_up_task')selects=params.select;return data[table]||[];};
  go('deal');DEAL_SEL='';closeModal();closeDrawer();LIVE=true;await liveHydrate(me,[branch],[],null);LIVE=false;sbSelect=select;
  const loaded=CARE.find(r=>r.tasks.some(t=>t.id==='qa-loaded-task'));if(loaded)careDrawer(loaded.id,'qa-loaded-task');
  check(selects.split(',').includes('done_by')&&loaded?.tasks[0].doneBy===actor.id&&$('#care-task-qa-loaded-task')?.textContent.includes(actor.name),'[7] รีโหลดต้องขอและแสดงชื่อผู้ทำรายการจากฐาน');
  if(loaded){loaded.tasks[0].doneBy=null;loaded.tasks[0].by='';careDrawer(loaded.id,'qa-loaded-task');check($('#care-task-qa-loaded-task').textContent.includes('ไม่ระบุผู้ทำรายการ'),'[8] งานเก่าไม่มีผู้ทำต้องไม่เดาว่าเป็นผู้ที่กำลังเปิด');}
  closeDrawer();return out;
 });fails.push(...checks,...errors.map(e=>'PAGEERROR '+e));
 console.log(fails.length?'FAILS:\n'+fails.join('\n'):'ALL_CHECKS_PASS · ปุ่มไม่ติดจอ ผู้ทำงานหลังโหลดใหม่ และช่องไฟทั้งสองขนาด/ธีม');
 process.exitCode=fails.length?1:0;
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
