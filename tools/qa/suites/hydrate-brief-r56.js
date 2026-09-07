/* บรีฟวันนี้: รีโหลดต้องคืนเจ้าของลูกค้า ประวัติ ค่างวด งานบริการ และอ่านแล้วครบ
   ข้อมูลมากกว่า1หน้าต้องไม่หาย และคำตอบเก่าห้ามทับงานที่เพิ่งบันทึก */
const {chromium,EXE,BASE}=require('./env');
(async()=>{const b=await chromium.launch({executablePath:EXE});const p=await b.newPage({timezoneId:'Asia/Bangkok'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
 const fails=await p.evaluate(async()=>{
  const failures=[],check=(ok,msg)=>{if(!ok)failures.push(msg);},origSelect=sbSelect;
  const me={id:ME.id,app_user_role:[{role:{code:'admin'}}],app_user_branch:[{branch:{code:'FMG01'}}]};
  const branch={id:'branch-qa',code:'FMG01'},variant={id:'variant-qa',code:'BTF200'};
  const customer={id:'customer-qa',branch_id:branch.id,full_name:'ลูกค้าฐานข้อมูล',phone:'0811111111',owner_id:me.id,
    purchase_intent:'เงินผ่อน',interested_variant_id:variant.id,created_at:TODAY+'T01:00:00Z',updated_at:TODAY+'T02:30:00Z',
    archived_at:TODAY+'T02:00:00Z',archived_reason:'พักการติดต่อ',finance_history:[{event:'เคยยื่นแล้ว'}],note:'หมายเหตุเดิม'};
  const job=(id,engine,frame)=>({id,branch_id:branch.id,customer_id:customer.id,engine_no:engine,frame_no:frame,model_name:'รถนอกชื่อพิมพ์เอง',job_no:id,checked_in_at:TODAY+'T01:00:00Z',status:'ส่งมอบแล้ว',next_appointment_at:TODAY+'T12:30:00Z'});
  const task=(id,source,jobId)=>({id,branch_id:branch.id,customer_id:customer.id,task_source:source,service_job_id:jobId,
    kind:'care '+source,title:'รายละเอียด '+id,due_at:TODAY,amount:null,appointment_at:source==='service_next'?TODAY+'T12:30:00Z':null});
  const data={app_user:[{phone:'0810000061',id:me.id,full_name:'ผู้บริหารจริง',app_user_role:me.app_user_role,app_user_branch:me.app_user_branch}],
    employee:[{id:'employee-qa',user_id:me.id,branch_id:branch.id,base_salary:28000}],
    customer:[customer,...Array.from({length:1000},(_,i)=>({...customer,id:'other-'+i,archived_at:null}))],
    finance_case:[{id:'case-qa',customer_id:customer.id,branch_id:branch.id,sale_id:null,company_id:null,status:'ปฏิเสธ',variant_id:variant.id,
      variant_code:'BTF200',model_name:'NMAX',color_code:'010D',color_name:'ดำ',list_price:98500,discount:500,down_payment:20000,
      term_months:36,rate_pct:1.15,monthly_installment:3128.22,loan_total:78000,pay_now:20000,reject_reason:'เอกสาร',reject_with:'บริษัทเดิม',reject_note:'รอเพิ่ม'}],
    service_job:[job('job-1','ENGINE-A','FRAME-A'),job('job-2','ENGINE-B','FRAME-B'),job('job-3','ENGINE-A','FRAME-A')],
    follow_up_task:[task('task-1','manual','job-1'),task('task-2','service_next','job-1'),task('task-3','manual','job-2'),task('task-4','manual','job-3')],
    quotation:[{id:'quote-qa',branch_id:branch.id,doc_no:'QT-001',quote_date:TODAY,customer_name:customer.full_name,seller_id:me.id,
      seller_name:'เซลล์คนเดิม',seller_phone:'0812345678',pay_method:'cash',snapshot:{keep:'ราคา ณ วันที่เสนอ'}}],
    notification_seen:[{user_id:me.id,notification_id:'care:task-2',seen_at:TODAY+'T02:00:00Z'}],
    unit_v:[{id:'new-unit',branch_code:'FMG01',variant_code:'BTF200',model_name:'NMAX',color_code:'010D',engine_no:'NEW-ENGINE',frame_no:'NEW-FRAME',status:'sold',cost:null,retail:98500}]};
  sbSelect=async(t,params={})=>(data[t]||[]).slice(+params.offset||0,(+params.offset||0)+(+params.limit||1000));
  try{
    go('deal');DEAL_SEL='';closeModal();closeDrawer();LIVE=true;
    check(await liveHydrate(me,[branch],[variant],'employee-qa'),'[1] โหลดธุรกรรมไม่สำเร็จ');
    check(CUSTOMERS.length===1001,'[2] ลูกค้ามากกว่า1000แถวถูกตัด');
    const c=CUSTOMERS.find(x=>x.id===customer.id);
    check(c?.ownerId===me.id&&c.intent==='เงินผ่อน'&&c.variant==='BTF200'&&c.upAt===customer.updated_at&&c.archiveReason==='พักการติดต่อ'&&c.finHist?.[0]?.event==='เคยยื่นแล้ว','[3] โปรไฟล์และประวัติลูกค้าคืนไม่ครบ');
    const f=FINCASES.find(x=>x.id==='case-qa');
    check(f&&!f.saleId&&f.variant==='BTF200'&&f.color==='ดำ'&&f.term===36&&f.per===3128.22&&f.rejectWith==='บริษัทเดิม'&&f.rejectNote==='รอเพิ่ม','[4] เคสก่อนขายหรือเงื่อนไขที่ยื่นหาย');
    check(UNITS.some(u=>u.id==='new-unit'&&u.status==='sold'&&u.cost===null),'[5] รถเข้าระบบใหม่หรือค่าที่ปิดไว้ถูกโหลดผิด');
    check(CARE.length===2&&CARE.find(r=>r.vehicle?.engine==='ENGINE-A')?.tasks.length===3&&TASKS.length===0,'[6] งานใหม่ปนงานเซลล์หรือรถหลายคันรวมกัน');
    check(CARE.flatMap(r=>r.tasks).find(t=>t.id==='task-2')?.appointmentAt===TODAY+'T12:30:00Z'&&CARE.flatMap(r=>r.tasks).every(t=>t.amount===null),'[6] เวลานัดหรือราคาoptionalหาย');
    check(QUOTES[0]?.sellerName==='เซลล์คนเดิม'&&QUOTES[0]?.sellerPhone==='0812345678'&&QUOTES[0]?.pay==='cash'&&QUOTES[0]?.snapshot?.keep==='ราคา ณ วันที่เสนอ','[7] ใบเสนอไม่คืนผู้ขายหรือsnapshot');
    check(!!LIVE_SEEN[me.id]?.['care:task-2']&&STAFF.find(s=>s.id===me.id)?.salary===28000&&STAFF.find(s=>s.id===me.id)?.phone==='0810000061','[8] อ่านแล้วหรือข้อมูลพนักงานจริงไม่คืน');
    const current=CUSTOMERS;let touched=false;
    sbSelect=async(t,params)=>{if(t==='customer'&&!touched){touched=true;DB_REV++;}return (data[t]||[]).slice(+params?.offset||0,(+params?.offset||0)+1000);};
    check(!await liveHydrate(me,[branch],[variant],'employee-qa')&&CUSTOMERS===current,'[9] คำตอบเก่าทับสถานะหลังเริ่มบันทึก');
  }finally{sbSelect=origSelect;LIVE=false;}
  return failures;
 });console.log(fails.length?'FAILS:\n'+fails.join('\n'):'ALL_CHECKS_PASS');console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'NO_PAGE_ERRORS');await b.close();process.exit(fails.length||errors.length?1:0);
})();
