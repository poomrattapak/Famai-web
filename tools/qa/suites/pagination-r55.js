/* เจ้าของ: "มีหลายส่วนที่ถูกซ่อนอยู่ อยากให้เอาการซ่อนนี้เปลี่ยนเป็นหน้าแทน เช่นหน้า 1 2 3"
   ตรวจเดินหน้าครบไม่ซ้ำ/หาย, ย้อนกลับ, เปลี่ยนตัวกรองกลับหน้าแรก, ตาราง/การ์ดตรงกัน,
   จำนวนมากยังพอดีมือถือ, รายการที่เคย slice ทิ้งเข้าถึงได้ และส่งออกครบทุกหน้า */
const {chromium,EXE,BASE}=require('./env');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:EXE});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html');await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
  assert.ok(await p.evaluate(()=>typeof pageSlice==='function'),'[หน้า] ต้องมีระบบแบ่งหน้า');
  const r=await p.evaluate(()=>{
   go('stock');stTab('gal');
   document.querySelector('[data-list="stGal"] [data-page="2"]').click();
   if(LIST_PAGES.stGal.page!==2||!document.querySelector('[data-list="stGal"] [data-page="2"][aria-current="page"]'))throw Error('เลขหน้าไม่เปลี่ยน');
   pageGo('stGal',1);
   const seen=[],quantities=[];
   do{
    seen.push(...$$('#stGal [data-gvariant]').map(e=>e.dataset.gvariant));
    quantities.push(...$$('#stGal .gqty').map(e=>+e.textContent));
    const next=document.querySelector('[data-list="stGal"] [data-next]');
    if(!next||next.disabled)break;next.click();
   }while(seen.length<100);
   const last=LIST_PAGES.stGal.page;
   document.querySelector('[data-list="stGal"] [data-prev]').click();
   const back=LIST_PAGES.stGal.page;
   $('#stQ').value='ไม่มีรถตรงคำนี้';rStock();
   const empty=stList().length,emptyPage=LIST_PAGES.stGal.page;
   fsClear('stock');
   return {seen,sum:quantities.reduce((a,b)=>a+b,0),want:[...new Set(stList().map(u=>u.variant))],total:stList().length,
    last,back,empty,emptyPage,reset:LIST_PAGES.stGal.page,first:$$('#stGal .gcard').length};
  });
  assert.deepEqual([...r.seen].sort(),r.want.sort(),'[ครบ] รถทุกหน้าต้องไม่ซ้ำหรือหาย');
  assert.equal(r.sum,r.total,'[ยอด] จำนวนรถรวมทุกหน้าต้องตรงสต๊อก');
  assert.ok(r.last>=3);assert.equal(r.back,r.last-1,'[ย้อน] ปุ่มก่อนหน้าต้องทำงาน');
  assert.equal(r.empty,0);assert.equal(r.emptyPage,1);assert.equal(r.reset,1,'[กรอง] ล้างแล้วกลับหน้า 1');
  assert.equal(r.first,6,'[ขนาด] ยังจำกัดจำนวนต่อหน้า');
  const group=await p.evaluate(()=>{stTab('grp');pageGo('stGrp',2);const row=document.querySelector('#stGrp [data-grp]');row.click();return {page:LIST_PAGES.stGrp.page,open:!!document.querySelector('#stGrp .grp-sub')};});
  assert.equal(group.page,2,'[รายละเอียด] กางกลุ่มแล้วต้องคงหน้าเดิม');assert.ok(group.open);
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:1000});
   const failures=await p.evaluate(()=>{
    go('stock');$('#stBranch').value='';fsClear('stock');stTab('table');const bad=[],ids=[];
    do{
     ids.push(...$$('#stTable tbody [data-unit]').map(e=>e.dataset.unit));
     const next=document.querySelector('[data-list="stTable"] [data-next]');
     if(!next||next.disabled)break;next.click();
    }while(ids.length<100);
    if(new Set(ids).size!==stList().length||ids.length!==stList().length)bad.push('ตารางรถไม่ครบ');
    window.__export=null;csvMoney=(name,head,rows)=>window.__export=rows;
    $('#expStock').click();if(window.__export.length!==stList().length)bad.push('ส่งออกขาดหน้าที่ไม่ได้เปิด');
    pageGo('stTable',2);$('#stStatus').value='available';rStock();
    if(stList().length<=12)bad.push('ข้อมูลพร้อมขายไม่พอพิสูจน์การรีเซ็ต');
    if(LIST_PAGES.stTable.page!==1)bad.push('เปลี่ยนตัวกรองไม่กลับหน้าแรก');
    $('#stBranch').value='FMG01';rStock();if(LIST_PAGES.stTable.page!==1)bad.push('เปลี่ยนสาขาไม่กลับหน้าแรก');
    go('recv');if(LIST_PAGES.rRecent)pageGo('rRecent',1);const receiptIds=[];
    do{
     receiptIds.push(...$$('#rRecent [data-unit]').map(e=>e.dataset.unit));
     const next=document.querySelector('[data-list="rRecent"] [data-next]');
     if(!next||next.disabled)break;next.click();
    }while(receiptIds.length<100);
    if(receiptIds.length!==UNITS.filter(u=>inScope(u.branch)).length)bad.push('รับรถล่าสุดยังตัดข้อมูลทิ้ง');
    go('imp');$('#impPick').value=SRC_FILES.find(f=>U_RAW.filter(r=>r[11]===f).length>6);impCheck();
    const importFile=$('#impPick').value,importRows=U_RAW.filter(r=>r[11]===importFile),previewIds=[];
    do{
     previewIds.push(...$$('#impPreview [data-import-engine]').map(e=>e.dataset.importEngine));
     const next=document.querySelector('[data-list="impPreview"] [data-next]');
     if(!next||next.disabled)break;next.click();
    }while(previewIds.length<100);
    if(previewIds.join('|')!==importRows.map(r=>r[6]).join('|'))bad.push('ตัวอย่างนำเข้ายังตัดข้อมูลทิ้ง');
    if(impReady.file!==importFile||impReady.total!==importRows.length)bad.push('เปลี่ยนหน้าแล้วข้อมูลนำเข้าเปลี่ยน');
    $('#impPick').value=SRC_FILES.find(f=>f!==importFile&&U_RAW.filter(r=>r[11]===f).length>6);impCheck();
    if(impReady.total<=6)bad.push('ไฟล์นำเข้าไม่พอพิสูจน์การรีเซ็ต');
    if(LIST_PAGES.impPreview.page!==1)bad.push('ตรวจไฟล์ใหม่ไม่เริ่มหน้าแรก');
    // ตารางสังเคราะห์ตรวจการจับคู่แถวกับการ์ดและการหดข้อมูลจากหน้าท้าย
    const host=document.createElement('div');host.id='qaPages';document.querySelector('.screen.on').appendChild(host);
    host.innerHTML='<table id="qaPageTable"></table>';
    const data=Array.from({length:125},(_,i)=>i+1);
    const draw=()=>tbl($('#qaPageTable'),['รายการ'],data.map(i=>'<tr data-row="'+i+'"><td>'+i+'</td></tr>'),'',data.map(i=>crow('data-row="'+i+'"','รายการ '+i,'','','')),10);
    draw();LIST_PAGES.qaPageTable.page=12;draw();
    const rows=$$('#qaPageTable [data-row]').map(e=>+e.dataset.row);
    if(rows.join(',')!=='111,112,113,114,115,116,117,118,119,120')bad.push('หน้าตารางกับการ์ดไม่ตรงกัน');
    const bar=document.querySelector('[data-list="qaPageTable"]');
    if(bar.querySelectorAll('[data-page]').length>5)bad.push('เลขหน้ามากเกินมือถือ');
    if(bar.getBoundingClientRect().right>innerWidth+1)bad.push('ปุ่มแบ่งหน้าล้นจอ');
    data.splice(3);draw();if(LIST_PAGES.qaPageTable.page!==1||$$('#qaPageTable [data-row]').length!==3)bad.push('รายการลดแต่หน้าค้าง');
    host.remove();return bad;
   });
   assert.deepEqual(failures,[],'[ตาราง/มือถือ] '+width);
  }
  assert.deepEqual(errors,[]);console.log('ผ่าน · 14 รหัสรุ่น / 50 คันครบทุกหน้า · ย้อนกลับ/ตัวกรอง/สาขา · ส่งออกครบ · 1440/390');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
