/* บรีฟงานบริการ: บันทึกและปิดงานต้องได้คำตอบจากฐานก่อน ห้ามหายเมื่อโหลดใหม่
   ตรวจ pending/failure/retry/success และรหัสงานเดิมเมื่อกดย้ำ */
const assert=require('node:assert/strict');
const {chromium,EXE,BASE}=require('./env');
(async()=>{const b=await chromium.launch({executablePath:EXE});try{
 const p=await b.newPage({timezoneId:'Asia/Bangkok'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
 const result=await p.evaluate(async()=>{
  const failures=[],check=(v,m)=>{if(!v)failures.push(m);};
  careServiceModal();$('#csQuery').value='QA-ACK-E';$('#csFind').click();
  $('#csName').value='ทดสอบการตอบรับ';$('#csPhone').value='0800000034';$('#csModel').value='รุ่นภายนอก';
  $('#csFrame').value='QA-ACK-F';$('#csDetail').value='เช็กระยะ';$('#csAmount').value='2000';
  $('#csAppointment').click();$('#csAt').value=addDays(TODAY,14)+'T09:30';
  const before=JSON.stringify([CUSTOMERS,SERVICE,CARE]),original=sbFetch;LIVE=true;
  const requests=[];let reject,resolve;
  sbFetch=(path,opt)=>{requests.push({path,body:JSON.parse(opt.body)});return new Promise((yes,no)=>{resolve=yes;reject=no;});};
  const first=careServiceSave();check(before===JSON.stringify([CUSTOMERS,SERVICE,CARE]),'ก่อน ACK ห้ามเพิ่มข้อมูลในเครื่อง');
  check($('#csSave').disabled,'ขณะบันทึกต้องกันกดซ้ำ');
  check(await careServiceSave()===false&&requests.length===1,'เรียก handler ซ้ำต้องมีคำขอเดียว');
  reject(Error('จำลองการเชื่อมต่อขาด'));check(await first===false,'ฐานปฏิเสธต้องแจ้งไม่สำเร็จ');
  check(before===JSON.stringify([CUSTOMERS,SERVICE,CARE])&&!$('#csSave').disabled,'ฐานปฏิเสธต้องคงฟอร์มและข้อมูลเดิม');
  const second=careServiceSave();check(requests[1].body.p_request.id===requests[0].body.p_request.id,'ลองใหม่ต้องใช้รหัสเดิม');
  const req=requests[1].body.p_request,now=punchNow().toISOString(),manualId=uuid4(),nextId=uuid4();
  resolve({customer:{id:req.customer_id,full_name:req.customer_name,phone:req.customer_phone,owner_id:ME.id,created_at:now,updated_at:now,source:'เข้าศูนย์บริการ',stage:'รับรถสำเร็จ'},
   job:{id:req.id,job_no:'SERVICE-34',customer_id:req.customer_id,unit_id:null,engine_no:req.engine,frame_no:req.frame,model_name:req.model,
    symptom:req.detail,service_type:'บันทึกบริการ',checked_in_at:now,status:'ส่งมอบแล้ว',labor_cost:2000,parts_cost:0,next_appointment_at:req.appointment_at},
   tasks:[{id:manualId,task_source:'manual',title:req.detail,amount:2000,due_at:TODAY,done_at:now,service_job_id:req.id},
    {id:nextId,task_source:'service_next',title:'นัดบริการ',due_at:addDays(TODAY,14),appointment_at:req.appointment_at,parent_task_id:manualId,service_job_id:req.id}]});
  check(await second===true,'ACK ครบแล้วจึงสำเร็จ');
  const r=CARE.find(x=>x.custId===req.customer_id),t=r?.tasks.find(x=>x.id===nextId);
  check(r?.tasks.length===2&&SERVICE.some(x=>x.id===req.id)&&CUSTOMERS.some(x=>x.id===req.customer_id),'ACK ต้องเพิ่มชุดข้อมูลครบ');
  const pending=careTask(r.id,t.id,null,true);check(!t.done,'ก่อน ACK checkbox ห้ามปิดงานจริง');
  reject(Error('จำลองฐานปฏิเสธปิดงาน'));check(await pending===false&&!t.done,'ปิดไม่สำเร็จต้องคงงานไว้');
  const closing=careTask(r.id,t.id,'ลูกค้ามาแล้ว',true);resolve([{id:t.id,done_at:now,note:'ลูกค้ามาแล้ว'}]);
  check(await closing===true&&t.done&&t.doneAt===now&&t.note==='ลูกค้ามาแล้ว','checkbox ใช้ผลและเวลาฐาน');
  LIVE=false;sbFetch=original;return failures;
 });
 assert.deepEqual(result,[]);assert.deepEqual(errors,[]);console.log('ALL_CHECKS_PASS · บริการรอ ACK ล้มเหลวไม่หาย ลองใหม่ไม่ซ้ำ ปิดงานตามฐาน');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
