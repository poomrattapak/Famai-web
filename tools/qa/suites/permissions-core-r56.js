/* ด่านตรรกะสิทธิ์ที่ไม่ใช้เบราว์เซอร์: โหลดฟังก์ชันจริงจากแอปมาเรียก
   ใช้คู่กับ permissions-brief-r56 ซึ่งตรวจหน้าและฟอร์มจริง ไม่แทนการตรวจภาพ */
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync(path.resolve(__dirname,'../../../index.html'),'utf8');
function between(a,b){ const start=source.indexOf(a), end=source.indexOf(b,start+a.length);
  assert(start>=0&&end>start,'หาโค้ดจริงไม่พบ: '+a); return source.slice(start,end); }
const rows={}; const writes=[];
const ctx=vm.createContext({console,JSON,Object,Array,String,Number,Date,
  ME:{id:'admin-qa',role:'admin',branch:'FMG01'}, LIVE:false,
  TODAY:'2026-09-06',BRANCHES:[{code:'FMG01'}],BR_IDS:{},
  SERVICE:[{id:'service-qa',branch:'FMG01',status:'รับรถ'}], PARTS:[],
  toast(){},refreshAll(){},dbUp(...x){writes.push(x);},dbPatch(...x){writes.push(x);},
  esc:x=>String(x||''),num:x=>Number(x)||0,nid:()=> 'qa-new',dbId:()=>null,
  document:{getElementById(){return null;}},
  $:key=>(rows[key]||(rows[key]={value:'',textContent:'',disabled:false})),
  sbFetch:async()=>{},__writes:writes});
const code=[between('const ROLES =','let STAFF ='),
  between('const myRoles =','/* ---------- เมนู + สิทธิ์ ---------- */'),
  between('const MENU =','/* ============================= UI พื้นฐาน'),
  between('const permLabel =','/* ---------- บริษัทและสาขา'),
  between('function svDeliver(id){','let svFoundUnit='),
  between('const PT_TABS=','let PT_SEL='),
  between('function partSave(){','function rPartsStock(){')].join('\n');
vm.runInContext(code,ctx);
vm.runInContext("rPerms=()=>{}; PM_EDITOR=ME.id;",ctx);
const run=code=>vm.runInContext(code,ctx);
(async()=>{
  const before=run('JSON.stringify(PERMS)');
  assert(run("permApplyTemplate('sales','read')"),'[1] เลือกแม่แบบสำเร็จ');
  assert.strictEqual(run('JSON.stringify(PERMS)'),before,'[1] แม่แบบห้ามแก้สิทธิ์ที่ใช้งานจริงก่อนบันทึก');
  assert(run("permDraft('sales')['page:deal']==='read'&&permDraft('sales')['act:finStage']==='none'&&permDraft('sales')['data:money']==='none'"),'[2] แม่แบบดูอย่างเดียวไม่เปิดเขียนหรือเงิน');
  assert(run("permDraftSet('sales','page:quote','write')"),'[3] แก้แบบร่างรายข้อได้');
  assert(await run("permSave('sales')"),'[3] บันทึกแบบร่างได้');
  run("ME={id:'sales-qa',role:'sales',branch:'FMG01'}");
  assert(run("canSee('deal')&&!permW('page:deal')&&noMoney()"),'[4] ระดับดูเปิดหน้าได้แต่เขียนไม่ได้และเงินยังปิด');
  const frozen=run('JSON.stringify(PERMS)');
  assert.strictEqual(run("permApplyTemplate('sales','default')"),false,'[5] ผู้ไม่ใช่แอดมินใช้แม่แบบไม่ได้');
  assert.strictEqual(await run("permSave('sales')"),false,'[5] ผู้ไม่ใช่แอดมินบันทึกไม่ได้');
  assert.strictEqual(run("permSet('sales','page:deal','write')"),false,'[5] ผู้ไม่ใช่แอดมินแก้สิทธิ์ตรงไม่ได้');
  assert.strictEqual(run('JSON.stringify(PERMS)'),frozen,'[5] สิทธิ์ต้องคงเดิม');
  run("ME={id:'admin-qa',role:'admin',branch:'FMG01'}");
  assert.strictEqual(run("permApplyTemplate('admin','read')"),false,'[6] แม่แบบห้ามตัดสิทธิ์แอดมิน');
  assert.strictEqual(run("permDraftSet('sales','data:money','write')"),false,'[6] ไม่รับระดับเขียนสำหรับข้อมูลอ่อนไหว');
  run("permDraftSet('sales','page:deal','write'); LIVE=true; sbFetch=async()=>{throw Error('ทดสอบ');}");
  const savedBefore=run('JSON.stringify(PERMS)');
  assert.strictEqual(await run("permSave('sales')"),false,'[7] ฐานข้อมูลปฏิเสธต้องรายงานไม่สำเร็จ');
  assert.strictEqual(run('JSON.stringify(PERMS)'),savedBefore,'[7] ฐานข้อมูลปฏิเสธห้ามใช้สิทธิ์ใหม่');
  assert(run("permDraft('sales')['page:deal']==='write'&&!PM_BUSY"),'[7] เก็บแบบร่างเพื่อบันทึกใหม่');
  run("LIVE=false; ME={id:'tech-qa',role:'tech',branch:'FMG01'}; PERMS.tech['page:service']='read'");
  assert.strictEqual(run("svDeliver('service-qa')"),false,'[8] เรียกปิดงานซ่อมตรงด้วยสิทธิ์ดูต้องถูกปฏิเสธ');
  assert(run("SERVICE[0].status==='รับรถ'"),'[8] งานซ่อมต้องไม่เปลี่ยน');
  run("PERMS.tech['page:service']='write'");
  assert.strictEqual(run("svDeliver('service-qa')"),true,'[8] ให้เขียนคืนแล้วปิดงานได้');
  run("ME={id:'stock-qa',role:'stock',branch:'FMG01'}; PERMS.stock['page:parts']='read'; $('#pCode').value='QA'; $('#pName').value='ทดสอบ'");
  run('partSave()'); assert.strictEqual(run('PARTS.length'),0,'[9] เรียกเพิ่มอะไหล่ตรงด้วยสิทธิ์ดูต้องไม่เพิ่ม');
  run("PERMS.stock['page:parts']='write';partSave()");
  assert.strictEqual(run('PARTS.length'),1,'[9] ให้เขียนคืนแล้วเพิ่มอะไหล่ได้');
  run("ME={id:'multi-qa',role:'sales',roles:['sales','stock']}; PERMS.stock['page:deal']='write'");
  assert(run("permW('page:deal')&&noMoney()"),'[10] หลายบทบาทรวมระดับสูงสุดและไม่เปิดเงิน');
  console.log('ALL_CHECKS_PASS (10 ข้อจากฟังก์ชันจริง)');
})().catch(e=>{console.error('FAILS:\n'+e.message);process.exit(1);});
