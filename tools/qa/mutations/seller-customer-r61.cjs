// ทดสอบสำเนาในหน่วยความจำเท่านั้น ไม่เขียน index.html
const fs=require('node:fs'),http=require('node:http'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2]||process.cwd(),original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cases=[
 ['staff-roster',"const sellers=STAFF.filter(s=>(s.roles||[s.role]).includes('sales')||s.id===customer?.ownerId);","const sellers=STAFF.filter(s=>SALESPEOPLE.includes(s.nick));",'[8] รายชื่อเซลล์เปิดขาย'],
 ['demo-unit',"const u = sellable.find(u=>u.branch===seller?.branch && u.status==='available');","const u = sellable[i*3 % sellable.length];",'[1] ลูกค้าของ'],
 ['demo-leads','branch:seller.branch, variant:l[4]','branch:\'FMG01\', variant:l[4]','[1] ลูกค้าของ'],
 ['all-time',"r:key==='deal'?0:30","r:30",'[2] ลูกค้าเก่า'],
 ['branches','[...new Set([ME.branch,...(ME.branches||[])])]','[ME.branch]','[2] ลูกค้าเก่า'],
 ['manual-seller','<div id="qSellerInfo" role="status"></div>','<select id="qSeller"></select><div id="qSellerInfo" role="status"></div>','[3] ใบเสนอไม่ต้องเลือก'],
 ['deal-owner',"const c=quoteCustomer(),id=c?.ownerId||ME.id;","const c=quoteCustomer(),id=ME.id;",'[3] ผู้บริหารทำใบเสนอ'],
 ['profile-phone',"const sellerPhone=(seller.phone||'').trim(),branch=customer?.branch||seller.branch;","const sellerPhone=(ME.phone||'').trim(),branch=customer?.branch||seller.branch;",'[3] ผู้บริหารทำใบเสนอ'],
 ['saved-contact',"sellerPhone=saved?saved.sellerPhone||'ไม่ระบุในเอกสารเดิม':seller.phone||''","sellerPhone=seller.phone||''",'[4] เบอร์พนักงานเปลี่ยน'],
 ['contact-guard',"if(!staffContactCanEdit(id)){toast('ไม่มีสิทธิ์แก้ข้อมูลพนักงานคนนี้'","if(false){toast('ไม่มีสิทธิ์แก้ข้อมูลพนักงานคนนี้'",'[5] เซลล์ห้ามแก้เบอร์คนอื่น'],
 ['contact-ack',"const row=LIVE?await sbFetch('/rest/v1/rpc/staff_set_contact'","s.phone=phone;const row=LIVE?await sbFetch('/rest/v1/rpc/staff_set_contact'",'[5] ยังไม่ตอบ'],
 ['hydrate-phone',"nick:a.nickname||a.full_name,phone:a.phone||'',allBranch:","nick:a.nickname||a.full_name,phone:'',allBranch:",'[6] โหลดเบอร์'],
 ['quote-ack',"if(!LIVE){dbUp('quotation',body);","if(true){dbUp('quotation',body);",'[7] ใบเสนอต้องรอ'],
 ['quote-authority','q.sellerPhone=row.seller_phone;','q.sellerPhone=q.sellerPhone;','[7] ต้องใช้ชื่อเบอร์'],
 ['sale-prefill','const seller=STAFF.find(s=>s.id===c.ownerId);','const seller=null;','[8] เปิดขายต้องเติม'],
 ['sale-owner',"const seller=STAFF.find(x=>x.id===c.ownerId)||STAFF.find(x=>x.id===$('#sSales').selectedOptions[0]?.dataset.staffId)||STAFF.find(x=>x.nick===$('#sSales').value)||ME;","const seller=STAFF.find(x=>x.nick===$('#sSales').value)||ME;",'[8] บันทึกขายต้องเก็บ']
];
const resultFile='/tmp/famai-r61-mutations.json',statusFile='/tmp/famai-r61-mutations-status.json';
const results=process.argv.includes('--resume')?JSON.parse(fs.readFileSync(resultFile,'utf8')).filter(r=>r.caught):[];
let source=original;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(source);});
const run=()=>new Promise(resolve=>{
 const child=cp.spawn(process.execPath,[path.join(root,'tools/qa/suites/seller-customer-r61.js')],{cwd:root,env:{...process.env,QA_URL:'http://127.0.0.1:8126',QA_PLAYWRIGHT:'/tmp/famai-qa/node_modules/playwright',QA_CHROMIUM:'/home/poom/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'}});let output='';
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('exit',code=>resolve({code,output}));
});
(async()=>{
 fs.writeFileSync(statusFile,JSON.stringify({status:'running',caught:results.length,total:cases.length}));
 await new Promise(resolve=>server.listen(8126,'127.0.0.1',resolve));
 try{
  const clean=await run();fs.writeFileSync('/tmp/famai-r61-mutation-original.log',clean.output);if(clean.code)throw Error('ต้นฉบับต้องผ่านก่อน: '+clean.output);console.log('ORIGINAL_PASS');
  for(const [name,from,to,expected] of cases){
   if(results.some(r=>r.name===name&&r.caught))continue;
   if(original.split(from).length!==2)throw Error('หาเป้าเฉพาะจุดไม่ได้ '+name);
   source=original.replace(from,()=>to);const result=await run();fs.writeFileSync('/tmp/famai-r61-mutation-'+name+'.log',result.output);
   const caught=result.code!==0&&result.output.includes(expected);results.push({name,expected,caught,code:result.code});fs.writeFileSync(resultFile,JSON.stringify(results,null,2));
   if(!caught)throw Error(name+' ไม่จับข้อที่ตั้งใจ: '+result.output);console.log(name+': CAUGHT '+expected);
  }
  source=original;const cleanAfter=await run();if(cleanAfter.code)throw Error(cleanAfter.output);
  console.log('ORIGINAL_PASS / MUTATIONS_CAUGHT '+results.length+'/'+cases.length);
  fs.writeFileSync(statusFile,JSON.stringify({status:'complete',caught:results.length,total:cases.length,sourceSha:crypto.createHash('sha256').update(original).digest('hex')}));
 }finally{server.close();}
})().catch(e=>{console.error(e);fs.writeFileSync(statusFile,JSON.stringify({status:'failed',message:e.message}));process.exitCode=1;});
