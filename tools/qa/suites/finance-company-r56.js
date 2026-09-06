/* บรีฟ B07: ตารางค่างวดต้องใช้ข้อมูลไฟแนนซ์จริง รวมบริษัทที่เพิ่มใหม่
   ล็อกทุกบริษัท/uuid/สถานะ, null ไม่กลับไป seed หรือกลายเป็น 0%, คืนรายการครบเมื่อ login พัง,
   เพิ่ม/แก้/เปิดปิด/ลบลงฐานก่อนเปลี่ยนจอ และผู้ไม่มีสิทธิ์เงินไม่โหลดหรือทับค่าคอม */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const b=await chromium.launch({executablePath:EXE});const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
 const fails=await p.evaluate(async()=>{
  const bad=[],check=(ok,message)=>{if(!ok)bad.push(message);},tick=()=>new Promise(r=>setTimeout(r,20));
  const id={};['me','co','br','variant','customer','case','a','b','c','d','e'].forEach(k=>id[k]=uuid4());
  const code=Object.keys(PRICE)[0],model=PRICE[code],originalFetch=sbFetch;
  const companies=[
   {id:id.a,name:FIN_CO[0].name,flat_rate_pct:2.25,min_down_pct:10,commission:1234,tiers:null,terms:null,rate_tiers:null,is_active:true,note:'ฐานจริง'},
   {id:id.b,name:'ไฟแนนซ์เพิ่มใหม่',flat_rate_pct:1.75,min_down_pct:15,commission:2345,tiers:[{from:12,to:18,rate:1.2}],terms:[12,18,36],rate_tiers:null,is_active:true,note:'บริษัทนอก seed'},
   {id:id.c,name:'บริษัทปิดใช้งาน',flat_rate_pct:1.5,min_down_pct:0,commission:0,tiers:null,terms:[12],is_active:false},
   {id:id.d,name:'บริษัทยังไม่ตั้งเรต',flat_rate_pct:null,min_down_pct:null,commission:null,tiers:null,terms:null,is_active:true},
   {id:id.e,name:'บริษัทเรตรายงวดเดิม',flat_rate_pct:null,min_down_pct:0,commission:0,tiers:null,terms:[12,24,36],rate_tiers:{12:0.5,24:0.9},is_active:true}
  ];
  let role='admin',failUnit=false,failWrite=false;const requests=[];
  const fixture={company:[{id:id.co,name:'บริษัททดสอบ',is_active:true}],branch:[{id:id.br,company_id:id.co,code:'FMG01',name:'สาขาทดสอบ',doc_prefix:'FMG',is_active:true}],
   model_variant:[{id:id.variant,code,model_name:model.m,model_th:model.th,category:model.cat,cc:model.cc,model_year:model.yr}],
   model_color:[{variant_id:id.variant,color_code:'BK',color_name:'ดำ',model_variant:{code}}],
   price_history:[{variant_id:id.variant,effective_from:TODAY,retail:60000,cost:50000,cost_vat:3500}],
   customer:[{id:id.customer,branch_id:id.br,owner_id:id.me,full_name:'ลูกค้าฐานจริง',phone:'0810005656',source:'เดินเข้าร้าน',created_at:TODAY+'T00:00:00Z'}],
   finance_case:[{id:id.case,branch_id:id.br,customer_id:id.customer,sale_id:null,company_id:id.b,status:'ส่งเรื่อง',amount:48000,submitted_at:TODAY,variant_id:id.variant,variant_code:code,model_name:model.m,color_code:'BK',color_name:'ดำ',list_price:60000,discount:0,down_payment:12000,term_months:12,rate_pct:1.2,monthly_installment:4576,loan_total:54912,pay_now:12000,stage_log:[]}]};
  const user=()=>({id:id.me,full_name:'ผู้ดูแลทดสอบ',nickname:'ทดสอบ',all_branch:true,app_user_role:[{role:{code:role,name:role}}],app_user_branch:[{branch:{code:'FMG01',name:'สาขาทดสอบ'}}]});
  sbFetch=async(path,opt={})=>{
   const url=new URL(path,'http://localhost'),table=url.pathname.split('/').pop(),method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
   requests.push({table,method,body,select:url.searchParams.get('select')||''});
   if(path.startsWith('/auth/'))return {access_token:'qa',user:{id:id.me}};
   if(table==='unit_v'&&failUnit)throw Error('จำลองโหลดรถล้มเหลวหลังโหลดบริษัท');
   if(table==='app_user')return [user()];
   if(table==='app_setting')return role==='manager'?[{key:'perms',value:{manager:{'data:money':'none','page:settings':'write','act:editFin':'write'}}}]:[];
   if(table==='finance_company'){
    if(method!=='GET'&&failWrite)throw Error('จำลองฐานข้อมูลปฏิเสธบริษัท');
    let rows=companies;
    if(method==='POST'){companies.push({...body});rows=[companies[companies.length-1]];}
    if(method==='PATCH'){const r=companies.find(f=>f.id===body.id);Object.assign(r,body);rows=[r];}
    if(method==='DELETE'){const target=(url.searchParams.get('id')||'').slice(3),index=companies.findIndex(f=>f.id===target);rows=index<0?[]:companies.splice(index,1);}
    const selected=(url.searchParams.get('select')||'').split(',');
    return rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>selected.includes(k))));
   }
   return fixture[table]||[];
  };
  $('#lgEmail').value='qa@example.test';$('#lgPw2').value='fixture';
  const before=JSON.stringify(FIN_CO);failUnit=true;await liveLogin();
  check(!LIVE&&JSON.stringify(FIN_CO)===before,'[คืนรายการ] login พังต้องคืนชื่อ เรต ช่วงงวด และสถานะครบ');
  failUnit=false;await liveLogin();
  check(LIVE,'[ล็อกอิน] ต้องโหลดบริษัทจริงสำเร็จ');
  check(FIN_CO.length===5&&FIN_CO.every(f=>f.id===f.dbId&&companies.some(c=>c.id===f.id)),'[ครบ] โหลดทุกบริษัทโดยใช้ uuid จริง');
  check(finRate(finById(id.a),12)===2.25&&finById(id.a).tiers===null,'[ไม่ใช้ seed] tiers null ต้องใช้อัตราฐานจริง 2.25');
  check(finById(id.b)?.note==='บริษัทนอก seed'&&finRate(finById(id.b),18)===1.2,'[บริษัทใหม่] ชื่อที่ไม่อยู่ใน mock ต้องมีเรตและหมายเหตุจริง');
  check(FINCASES.find(f=>f.id===id.case)?.finId===id.b,'[เชื่อม] คำขอต้องอ้างบริษัทใหม่ได้');
  check(!finActive().some(f=>f.id===id.c)&&FIN_CO.some(f=>f.id===id.c),'[ปิด] บริษัทปิดยังอยู่ในตั้งค่าแต่ห้ามนำไปเสนอ');
  check(finRate(finById(id.d),12)===null&&!finActive().some(f=>f.id===id.d),'[ไม่เดา] ไม่ตั้งเรตต้องไม่กลายเป็น 0% หรือใช้เรต mock');
  check(finTerms(finById(id.e)).join(',')==='12,24'&&finRate(finById(id.e),24)===0.9,'[เรตเดิม] rate_tiers ใช้ได้เฉพาะงวดที่กำหนดเรตจริง');
  go('settings');rFinCo();$('#fcName').value='เพิ่มบริษัทจากฟอร์ม';$('#fcRate').value='2.5';$('#fcDown').value=10;$('#fcComm').value=3456;$('#fcTerms').value='12,24';$('#fcSave').onclick();await tick();
  const added=FIN_CO.find(f=>f.name==='เพิ่มบริษัทจากฟอร์ม');
  check(!!added&&added.id===added.dbId&&companies.some(f=>f.id===added.id&&f.commission===3456),'[เพิ่มฐาน] เพิ่มในฟอร์มต้องได้ uuid และค่าที่ฐานยืนยัน');
  rFinCo();document.querySelector('[data-fce="'+id.b+'"]').click();$('#feRate').value=2.75;$('#feTerms').value='';TIER_ED.feT=[];$('#feGo').onclick();await tick();
  check(finById(id.b).rate===2.75&&finById(id.b).tiers===null&&companies.find(f=>f.id===id.b).tiers===null,'[แก้ฐาน] ล้างช่วงงวดต้องเขียน null ลงฐานจริง');
  rFinCo();document.querySelector('[data-fct="'+id.b+'"]').click();await tick();
  check(!finById(id.b).active&&!companies.find(f=>f.id===id.b).is_active,'[สถานะฐาน] ปิดบริษัทต้องเก็บสถานะจริง');
  const unchanged=JSON.stringify(finById(id.a));failWrite=true;const failed=await finCompanySave({...finById(id.a),rate:8});failWrite=false;
  check(!failed&&JSON.stringify(finById(id.a))===unchanged,'[ไม่หลอกสำเร็จ] ฐานปฏิเสธต้องคงข้อมูลเดิม');
  if(added){const removed=await finCompanyDelete(added.id);check(removed&&!finById(added.id)&&!companies.some(f=>f.id===added.id),'[ลบฐาน] ลบบริษัทที่ไม่มีประวัติต้องลบฐานก่อนจอ');}
  role='manager';await liveLogin();const lastRead=requests.filter(r=>r.table==='finance_company'&&r.method==='GET').pop();
  check(!lastRead.select.split(',').includes('commission')&&finById(id.a).commission===null,'[ปิดค่าคอม] สิทธิ์เงิน none ต้องไม่ขอค่าคอมจากฐาน');
  rFinCo();document.querySelector('[data-fce="'+id.a+'"]').click();check($('#feComm').disabled&&$('#feComm').value==='','[ช่องค่าคอม] ต้องปิดช่องและไม่แสดงค่าคอม');
  const comm=companies.find(f=>f.id===id.a).commission;await finCompanySave({...finById(id.a),rate:2.3,commission:9999});
  const patch=requests.filter(r=>r.table==='finance_company'&&r.method==='PATCH').pop();
  check(!Object.hasOwn(patch.body,'commission')&&!patch.select.split(',').includes('commission')&&companies.find(f=>f.id===id.a).commission===comm,'[รักษาค่าคอม] ผู้ไม่มีสิทธิ์ต้องไม่เขียนหรือรับค่าคอมกลับ');
  const beforeBlocked=JSON.stringify(FIN_CO),writeCount=requests.filter(r=>r.table==='finance_company'&&r.method!=='GET').length;
  PERMS.manager['page:settings']='read';
  const blockedSave=await finCompanySave({...finById(id.a),rate:7}),blockedDelete=await finCompanyDelete(id.d);
  check(!blockedSave&&!blockedDelete&&JSON.stringify(FIN_CO)===beforeBlocked&&requests.filter(r=>r.table==='finance_company'&&r.method!=='GET').length===writeCount,'[สิทธิ์เขียน] ไม่มีสิทธิ์ตั้งค่าต้องไม่ส่งคำสั่งเขียนหรือลบ');
  closeModal();sbFetch=originalFetch;return bad;
 });console.log(fails.length?'FAILS:\n'+fails.join('\n'):'ALL_CHECKS_PASS (finance-company-r56)');console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'NO_PAGE_ERRORS');await b.close();process.exit(fails.length||errors.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
