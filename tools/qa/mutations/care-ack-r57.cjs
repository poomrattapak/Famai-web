const fs=require('fs'),http=require('http'),cp=require('child_process'),path=require('path');
const root=process.argv[2]||path.resolve(__dirname,'../../..'),original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cases=[
 ['request-id', 'if(state.requestFingerprint!==fingerprint){', 'if(true){','ลองใหม่ต้องใช้รหัสเดิม'],
 ['task-before-ack', '  t.saving=true;','  t.saving=true;t.done=!!done;','ก่อน ACK checkbox ห้ามปิดงานจริง'],
 ['service-before-ack', "  state.saving=true;button.disabled=true;", "  SERVICE.push({id:'mutation-before-ack'});state.saving=true;button.disabled=true;",'ก่อน ACK ห้ามเพิ่มข้อมูลในเครื่อง']
];
let source=original;const srv=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(source);});
const run=()=>new Promise(resolve=>{const p=cp.spawn(process.execPath,[path.join(root,'tools/qa/suites/care-ack-r57.js')],{cwd:root,env:{...process.env,QA_URL:'http://127.0.0.1:8125'}});let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('exit',code=>resolve({code,out}));});
(async()=>{await new Promise(r=>srv.listen(8125,'127.0.0.1',r));try{for(const [name,from,to,expected] of cases){if(original.split(from).length!==2)throw Error('mutation target '+name);source=original.replace(from,to);const r=await run();if(r.code===0||!r.out.includes(expected))throw Error(name+' ไม่จับข้อที่ตั้งใจ '+r.out);console.log(name+': จับได้ — '+expected);}source=original;const clean=await run();if(clean.code)throw Error(clean.out);console.log('ต้นฉบับผ่าน หลังตรวจ mutation 3/3');}finally{srv.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
