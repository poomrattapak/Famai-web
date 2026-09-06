/* B18: เรียกคำสั่งจริงเพื่อพิสูจน์ด่านหน้าบัญชี และแก้สถานะรถโดยไม่สร้างแถวที่ข้อมูลไม่ครบ */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.resolve(__dirname,'../../../index.html'),'utf8');
function body(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'หาโค้ดจริงไม่พบ: '+start);return source.slice(a,b);}
const writes=[],rows={},grants=new Set(['page:expense','page:invoice','page:ar','act:finApprove']);let pending;
const ctx=vm.createContext({console,JSON,Object,Array,String,Number,Date,window:{},
  TODAY:'2026-09-06',LIVE:true,ME:{id:'qa-user',role:'acct',nick:'ผู้ตรวจ'},ROLES:{acct:{},sales:{}},BR_IDS:{FMG01:'branch-id'},
  EXPENSES:[{id:'expense',branch:'FMG01',cat:'ค่าเช่า',amt:100,approval:{status:'รอตรวจ'}}],
  WSALES:[{id:'wholesale',branch:'FMG01',docNo:'WS-1',finApproval:{status:'รอตรวจ'}}],
  AR:[{id:'receivable',saleId:'sale',branch:'FMG01',due:100,paid:0}],touchSale(){},
  STAFF:[{id:'staff',branch:'FMG01',name:'พนักงาน',nick:'พนักงาน'}],eFilesArr:[],
  BOOKINGS:[{id:'booking',unitId:'unit',branch:'FMG01',status:'จองอยู่',deposit:100}],
  UNITS:[{id:'unit',branch:'FMG01',model:'รุ่นทดสอบ',status:'reserved'}],
  perm:k=>grants.has(k)?'write':(k==='page:deal'?'read':'none'),permW:k=>grants.has(k),inScope:b=>b==='FMG01',canBooking:()=>true,
  wsVoided:w=>!!w.voidedAt,toast(){},refreshAll(){},fmt:String,baht:String,bName:String,thDate:String,
  num:x=>Number(x)||0,isUuid:()=>true,dbId:()=> 'expense-new',nid:()=> 'unused',
  confirmSave(title,summary,cb){pending=cb;},
  dbUp(table,row){writes.push({method:'POST',table,row});},
  dbPatch(table,id,row){writes.push({method:'PATCH',table,id,row});},
  $:k=>(rows[k]||(rows[k]={value:''}))});
vm.runInContext([
  body('const myRoles =','const rolePerm ='),
  body('const canFinApprove =','const finApStatus ='),
  body('function wsFinPass(id){','/* เอกสารขายส่งหลายรายการ'),
  body('function expApprove(id, ok, note){','/* ============================= 17.'),
  body('function expSave(){','function rExpense(){'),
  body('function bookCancel(id, reason){','function bookCancelModal(id){'),
  body('function arReceive(arId, amt, way){','/* ============================= 12.')
].join('\n'),ctx);
const run=s=>vm.runInContext(s,ctx);
for(const [page,call,state] of [
  ['page:expense',"expApprove('expense',true)",'EXPENSES[0].approval'],
  ['page:invoice',"wsFinPass('wholesale')",'WSALES[0].finApproval']
]){
  const before=run('JSON.stringify('+state+')');grants.delete(page);writes.length=0;
  assert.strictEqual(run(call),false,'[1] มีสิทธิ์ตรวจการเงินแต่หน้าอ่านอย่างเดียวต้องอนุมัติไม่ได้: '+page);
  assert.strictEqual(run('JSON.stringify('+state+')'),before,'[1] คำตัดสินต้องคงเดิม: '+page);
  assert.strictEqual(writes.length,0,'[1] ต้องไม่ส่งคำสั่งเขียน: '+page);
  grants.add(page);grants.delete('act:finApprove');
  assert.strictEqual(run(call),false,'[2] หน้าเขียนได้แต่ไม่มีสิทธิ์ตรวจการเงินต้องถูกปฏิเสธ: '+page);
  grants.add('act:finApprove');run("ME.role='sales'");
  assert.strictEqual(run(call),false,'[2] บทบาทที่ไม่ใช่ผู้ตรวจการเงินต้องถูกปฏิเสธแม้เปิด action: '+page);
  run("ME.role='acct'");run(page==='page:expense'?"EXPENSES[0].branch='FMG02'":"WSALES[0].branch='FMG02'");
  assert.strictEqual(run(call),false,'[3] ตรวจรายการนอกสาขาไม่ได้: '+page);
  run(page==='page:expense'?"EXPENSES[0].branch='FMG01'":"WSALES[0].branch='FMG01'");
  assert.strictEqual(run(call),true,'[4] มีสิทธิ์ครบจึงอนุมัติได้: '+page);
  assert.strictEqual(writes.length,1,'[4] บันทึกหนึ่งครั้งเมื่อผ่านด่าน: '+page);
}
run("$('#eAmt').value='100';$('#eCat').value='ค่าเช่า';$('#eStaff').value='staff';$('#eBranch').value='FMG01'");
writes.length=0;run('expSave()');assert(pending,'[5] เปิดแผ่นยืนยันรายการได้');
grants.delete('page:expense');const before=run('EXPENSES.length');pending();
assert.strictEqual(run('EXPENSES.length'),before,'[5] ถอนสิทธิ์หลังเปิดแผ่นต้องไม่เพิ่มค่าใช้จ่าย');
assert.strictEqual(writes.length,0,'[5] ถอนสิทธิ์ก่อนยืนยันต้องไม่ส่งเขียน');
grants.add('page:expense');run('expSave()');pending();
assert.strictEqual(run('EXPENSES.length'),before+1,'[6] ยืนยันพร้อมสิทธิ์แล้วบันทึกได้');
writes.length=0;assert.strictEqual(run("bookCancel('booking','ลูกค้ายกเลิก')"),true,'[7] ยกเลิกการจองได้');
const unit=writes.find(x=>x.table==='motorcycle_unit');
assert(unit&&unit.method==='PATCH'&&unit.id==='unit'&&unit.row.status==='available',
  '[7] คืนรถต้อง PATCH แถวเดิมเพื่อไม่ติด NOT NULL จากการ INSERT ข้อมูลไม่ครบ');
// ไม่มีสิทธิ์เขียนดีลแต่มีสิทธิ์เขียนหน้าบัญชี ต้องทำรายการหน้านั้นได้ครบ
assert.strictEqual(run("perm('page:deal')"),'read','[8] บัญชีชุดทดสอบเห็นดีลได้แบบอ่านอย่างเดียว');
assert.strictEqual(run('canFinApprove()'),false,'[8] ไม่มีสิทธิ์เขียนดีลต้องตรวจดีลไม่ได้');
for(const page of ['expense','invoice','ar'])assert.strictEqual(run("canFinApprove('"+page+"')"),true,
  '[8] สิทธิ์ดีลที่อ่านอย่างเดียวต้องไม่ขัดขวางหน้าบัญชีที่เขียนได้: '+page);
writes.length=0;grants.delete('page:ar');
assert.strictEqual(run("arReceive('receivable',50,'โอน')"),false,'[9] หน้าเงินค้างรับอ่านอย่างเดียวต้องรับเงินไม่ได้');
assert.strictEqual(run('AR[0].paid'),0,'[9] ยอดรับต้องคงเดิม');assert.strictEqual(writes.length,0,'[9] ต้องไม่เขียนฐาน');
grants.add('page:ar');
assert.strictEqual(run("arReceive('receivable',50,'โอน')"),true,'[10] เงินค้างรับเขียนได้ต้องรับเงินสำเร็จแม้ดีลอ่านอย่างเดียว');
assert.strictEqual(run('AR[0].paid'),50,'[10] บันทึกยอดรับถูกต้อง');
assert.strictEqual(writes.length,2,'[10] บันทึกหลักฐานรับเงินและยอดรวม');
console.log('ALL_CHECKS_PASS (10 ข้อจากคำสั่งจริง)');
