// ทดสอบสำเนาในหน่วยความจำเท่านั้น ไม่เขียน index.html
const fs=require('node:fs'),http=require('node:http'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2]||process.cwd(),original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cases=[
 ['picker-refocus',"document.activeElement!==picker&&!$('#qCustomerList').contains(document.activeElement)","!$('#qCustomerList').contains(document.activeElement)",'[2] กลับโฟกัสทันทีต้องไม่ถูกซ่อนด้วยเวลา blur เดิม'],
 ['customer-required',"return CUSTOMERS.find(c=>c.id===qCustomerId&&customerVisible(c)&&!c.archivedAt)||null;","return CUSTOMERS.find(c=>c.id===qCustomerId&&customerVisible(c)&&!c.archivedAt)||CUSTOMERS.find(customerVisible)||null;",'[1] ต้องเลือกลูกค้าในระบบ'],
 ['customer-readonly','id="qName" readonly','id="qName"','[1] ชื่อและเบอร์'],
 ['picker-owner',"const list=CUSTOMERS.filter(c=>customerVisible(c)&&!c.archivedAt&&(","const list=CUSTOMERS.filter(c=>!c.archivedAt&&(",'[2] ค้นหาเบอร์'],
 ['customer-snapshot',"name:customer.name,phone:customer.phone||'',until:","name:$('#qName').value,phone:$('#qPhone').value,until:",'[2] บันทึกต้องอ้างคนที่เลือก'],
 ['popup-route',"  quotePickerClose();\n  custModal(null,c=>", "  quotePickerClose();go('deal');\n  custModal(null,c=>",'[3] เพิ่มลูกค้าต้องเปิดฟอร์มเดียว'],
 ['popup-fill',"custModal(null,c=>{if(CUR==='quote')quoteSelectCustomer(c.id);});","custModal(null,()=>{});",'[3] บันทึกแล้วต้องเพิ่ม'],
 ['customer-ack',"if(LIVE && !await custPersist(saved,{setOwner:!!ownerEl}))return;","if(LIVE){CUSTOMERS.push(saved);if(!await custPersist(saved,{setOwner:!!ownerEl}))return;}",'[4] ระหว่างรอ'],
 ['customer-double','if(cmSaving)return;','', '[4] ระหว่างรอ'],
 ['customer-retry',"id:cmNewId||(cmNewId=LIVE?dbId():nid('CU'))","id:LIVE?dbId():nid('CU')",'[4] ลองใหม่ต้องใช้รหัสเดิม'],
 ['quote-readonly',"if(!c||qSaving||!permW('page:quote'))return false;","if(!c||qSaving)return false;",'[5] ใบเสนออ่านอย่างเดียว'],
 ['draft-cancel',"  quotePickerClose();\n  custModal(null,c=>", "  quotePickerClose();$('#qDown').value='0';\n  custModal(null,c=>",'[6] ยกเลิกเพิ่มลูกค้า'],
 ['next-id',"const c=CUSTOMERS.find(c=>c.id===q.custId&&customerVisible(c)&&!c.archivedAt);","const c=CUSTOMERS.find(c=>c.phone===q.phone&&customerVisible(c)&&!c.archivedAt);",'[7] ไปขายต้องใช้รหัสลูกค้าเดิม'],
 ['legacy-auto-create',"if(!c){toast('เลือกลูกค้าในระบบและบันทึกใบเสนอใหม่ก่อน'","if(!c){CUSTOMERS.push({id:nid('CU'),name:q.name,phone:q.phone,branch:ME.branch,ownerId:ME.id});toast('เลือกลูกค้าในระบบและบันทึกใบเสนอใหม่ก่อน'",'[7] ใบเก่าไม่มีรหัสลูกค้า'],
 ['legacy-print',"if(!saved&&!quoteCustomer())","if(!quoteCustomer())",'[7] ใบเก่าที่ยังไม่มีรหัสลูกค้า'],
 ['picker-keyboard',"if(i>=0)quoteSelectCustomer(opts[i].dataset.qcustomer);","if(false)quoteSelectCustomer(opts[i].dataset.qcustomer);",'[2] ต้องเลือกลูกค้าด้วยแป้นพิมพ์']
];
const resultFile='/tmp/famai-r62-mutations.json',statusFile='/tmp/famai-r62-mutations-status.json';
const results=process.argv.includes('--resume')?JSON.parse(fs.readFileSync(resultFile,'utf8')).filter(r=>r.caught):[];
let source=original;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(source);});
const run=()=>new Promise(resolve=>{
 const child=cp.spawn(process.execPath,[path.join(root,'tools/qa/suites/quote-customer-r62.js')],{cwd:root,env:{...process.env,QA_URL:'http://127.0.0.1:8127',QA_PLAYWRIGHT:'/tmp/famai-qa/node_modules/playwright',QA_CHROMIUM:'/home/poom/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'}});let output='';
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('exit',code=>resolve({code,output}));
});
(async()=>{
 fs.writeFileSync(statusFile,JSON.stringify({status:'running',caught:results.length,total:cases.length}));
 await new Promise(resolve=>server.listen(8127,'127.0.0.1',resolve));
 try{
  const clean=await run();fs.writeFileSync('/tmp/famai-r62-mutation-original.log',clean.output);if(clean.code)throw Error('ต้นฉบับต้องผ่านก่อน: '+clean.output);console.log('ORIGINAL_PASS');
  for(const [name,from,to,expected] of cases){
   if(results.some(r=>r.name===name&&r.caught))continue;
   if(original.split(from).length!==2)throw Error('หาเป้าเฉพาะจุดไม่ได้ '+name);
   source=original.replace(from,()=>to);const result=await run();fs.writeFileSync('/tmp/famai-r62-mutation-'+name+'.log',result.output);
   const caught=result.code!==0&&result.output.includes(expected);results.push({name,expected,caught,code:result.code});fs.writeFileSync(resultFile,JSON.stringify(results,null,2));
   if(!caught)throw Error(name+' ไม่จับข้อที่ตั้งใจ: '+result.output);console.log(name+': CAUGHT '+expected);
  }
  source=original;const cleanAfter=await run();if(cleanAfter.code)throw Error(cleanAfter.output);
  console.log('ORIGINAL_PASS / MUTATIONS_CAUGHT '+results.length+'/'+cases.length);
  fs.writeFileSync(statusFile,JSON.stringify({status:'complete',caught:results.length,total:cases.length,sourceSha:crypto.createHash('sha256').update(original).digest('hex')}));
 }finally{server.close();}
})().catch(e=>{console.error(e);fs.writeFileSync(statusFile,JSON.stringify({status:'failed',message:e.message}));process.exitCode=1;});
