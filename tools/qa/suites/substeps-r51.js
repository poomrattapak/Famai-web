/* เจ้าของแก้บรีฟ v1.52: ต้องเห็นแถบ 4 ขั้นรวมกันด้านบน ไม่กระจายจนต้องเลื่อนยาว
   รายละเอียดเดิมครบ แต่เปิดดูทีละขั้น · ตรวจสถานะจริง เงินสด ไฟแนนซ์ ส่งมอบ สิทธิ์และการ escape
   รวมตำแหน่ง 1440/900/390/320 สองธีม และการเลือกแท็บที่ต้องไม่เปลี่ยนข้อมูลดีล */
const { chromium, EXE, BASE } = require('./env');
(async () => {
  const b=await chromium.launch({executablePath:EXE});
  const ctx=await b.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Bangkok'});
  const p=await ctx.newPage(), fails=[];
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  await p.goto(BASE+'/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo');
  const checks=await p.evaluate(()=>{
    const bad=[], check=(yes,msg)=>{if(!yes)bad.push(msg);};
    const fixture=()=>({c:{name:'ลูกค้าทดสอบ',phone:'0800000000',addr:'ชัยภูมิ',idNo:'1234567890123',
      variant:'รุ่นทดสอบ',intent:'เงินผ่อน',owner:'',createdAt:'2026-08-01'},
      s:{docNo:'SALE-QA',pay:'finance',net:76543,down:12345,term:36,per:2345,sales:'เซลล์จากใบขาย',soldAt:'2026-08-02'},
      u:{model:'รุ่นทดสอบ',color:'น้ำเงิน'},fc:{status:'รอผลพิจารณา',amount:65432,at:'2026-08-02',
        log:[{to:'ส่งเรื่อง',at:'2026-08-02'},{to:'รอผลพิจารณา',at:'2026-08-03'}]},
      fin:{name:'บริษัททดสอบ'},rg:{due:'2026-09-10'},tasks:[],track:DEAL_TRACK,
      k:'fin',i:1,off:false,cash:false,late:0,delivered:false,waitPlate:false});
    const draw=d=>{
      const box=document.createElement('div');
      box.innerHTML=dealProgress(d);
      return box;
    };
    let d=fixture(), before=JSON.stringify(d), box=draw(d);
    check(JSON.stringify(d)===before,'[1] การวาดเปลี่ยนข้อมูลดีล');
    check(box.querySelectorAll('.pstep .pn').length===4,'[1] ต้องมีแถบภาพรวมครบ 4 ขั้น');
    check(box.querySelectorAll('.dl-step-panel').length===4&&box.querySelectorAll('.dl-step-panel:not([hidden])').length===1,
      '[1] ต้องเก็บรายละเอียดครบทุกขั้นและเปิดทีละขั้น');
    check(box.querySelector('.dl-step-panel:not([hidden])')?.dataset.step==='fin','[1] ต้องเปิดรายละเอียดขั้นปัจจุบันให้อัตโนมัติ');
    check(box.querySelectorAll('.substep').length===14,'[1] รายละเอียดขั้นย่อยไม่ครบ 14 งาน');
    check([...box.querySelectorAll('.substep')].every(el=>el.querySelector('.sstate')?.textContent&&el.querySelector('.sdetail')?.textContent),
      '[1] ขั้นย่อยต้องมีทั้งสถานะและรายละเอียด');
    check(!box.querySelector('.substeps button, .substeps input, .substeps a'),'[1] ขั้นย่อยต้องเป็นตัวบอกสถานะ');
    check(box.querySelector('[data-step="lead"]')?.textContent.includes('เซลล์จากใบขาย'),'[2] ชื่อเซลล์หลังโหลดข้อมูลจริงหาย');
    check(!box.querySelector('[data-step="sale"] .substep')?.classList.contains('done'),'[3] มีใบจองไม่ได้แปลว่าเปิดการขายแล้ว');
    check(!box.querySelector('[data-step="deliver"] .substep:nth-child(2)')?.classList.contains('done'),'[3] มีกำหนดส่งมอบไม่ได้แปลว่าส่งแล้ว');
    d.fc.status='ยื่นเอกสาร'; d.fc.log.push({to:'อนุมัติแล้ว',at:'2026-08-04'}); box=draw(d);
    check(box.querySelectorAll('[data-step="fin"] .substep.now').length===1,'[4] ชื่อไฟแนนซ์เก่าต้องชี้ขั้นปัจจุบันได้');
    check(!box.querySelector('[data-step="fin"] .substep:last-child .sdt'),'[4] ถอยขั้นแล้วต้องไม่แสดงวันที่อนุมัติเก่าเป็นผลปัจจุบัน');
    d.off=true; d.fc.status='ปฏิเสธ';d.fc.rejectReason='ข้อมูลไม่ครบ'; box=draw(d);
    check(box.querySelector('[data-step="fin"] .substep.off')?.textContent.includes('ข้อมูลไม่ครบ'),'[5] ต้องแสดงผลปฏิเสธและเหตุผล');
    check(!box.querySelector('[data-step="fin"] .substep.now'),'[5] ปฏิเสธแล้วไม่แสดงว่ากำลังพิจารณา');
    d=fixture();d.fc.status='อนุมัติแล้ว';d.k='deliver';d.i=3;d.late=2;box=draw(d);
    check(box.querySelectorAll('[data-step="fin"] .substep.done').length===4,'[6] อนุมัติแล้วงานไฟแนนซ์ต้องครบ');
    check(box.querySelector('[data-step="sale"] .substep')?.classList.contains('done'),'[6] อนุมัติแล้วต้องเปิดการขายได้');
    check(box.querySelector('[data-step="deliver"] .substep')?.classList.contains('hold'),'[6] เลยกำหนดต้องใช้สถานะเตือน');
    d.delivered=true;d.late=0;d.k='done';d.i=4;d.waitPlate=true;
    d.rg.deliveredAt='2026-09-05';d.rg.dlvPlace='บ้านลูกค้า';d.rg.dlvBy='ผู้ส่งทดสอบ';box=draw(d);
    const delivery=box.querySelector('[data-step="deliver"] .substep:nth-child(2)');
    check(delivery?.classList.contains('done')&&delivery.textContent.includes('บ้านลูกค้า')&&delivery.textContent.includes('ผู้ส่งทดสอบ'),
      '[7] ส่งมอบจริงต้องมีสถานที่และผู้ส่งมอบ');
    d=fixture();d.cash=true;d.s.pay='cash';d.fc=null;d.track=DEAL_TRACK.filter(x=>x.k!=='fin');box=draw(d);
    check(box.querySelectorAll('.pst').length===3&&!box.querySelector('[data-step="fin"]'),'[8] เงินสดต้องคงเส้นทาง 3 ขั้นเดิม');
    d=fixture();d.c.idNo='';d.fin.name='<img src=x onerror=alert(1)>';box=draw(d);
    check(!box.querySelector('img')&&box.textContent.includes('<img'),'[9] ข้อมูลที่ผู้ใช้กรอกต้อง escape');
    check(!box.textContent.includes('1234567890123'),'[9] ห้ามแสดงเลขบัตรเต็มในขั้นย่อย');
    check(box.querySelector('[data-step="lead"] .substep')?.textContent.includes('ยังขาด เลขบัตรประชาชน'),
      '[9] ข้อมูลที่ไม่มีต้องแจ้งว่ายังขาด');
    const keep=PERMS[ME.role]['data:money'];
    try{
      PERMS[ME.role]['data:money']='none';box=draw(fixture());
      check(!/76,543|12,345|65,432|2,345/.test(box.textContent),'[10] ไม่มีสิทธิ์เงินแต่ยังเห็นตัวเลข');
    }finally{PERMS[ME.role]['data:money']=keep;}
    go('deal');DEAL_SEL=dealAll().find(x=>x.k==='fin'&&!x.off).c.id;rDeal();
    return bad;
  });
  fails.push(...checks);
  for(const width of [1440,900,390,320])for(const theme of ['', 'dark']){
    await p.setViewportSize({width,height:1000});
    await p.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
    const layout=await p.evaluate(()=>{
      const nodes=[...document.querySelectorAll('#dlOne .pstep .pn')],bar=document.querySelector('#dlOne .pstep');
      const panels=[...document.querySelectorAll('#dlOne .dl-step-panel')].filter(el=>el.getClientRects().length);
      return {n:nodes.length,overflow:document.documentElement.scrollWidth>innerWidth+1,
        rows:nodes.map(el=>Math.round(el.getBoundingClientRect().top)),
        barHeight:bar?.getBoundingClientRect().height,visiblePanels:panels.length,
        detailHeight:panels[0]?.getBoundingClientRect().height};
    });
    if(layout.n!==4||new Set(layout.rows).size!==1||layout.barHeight>120||layout.overflow)
      fails.push('[11] แถบ 4 ขั้นต้องอยู่แถวเดียวครบทุกจอ '+width+' '+theme+' '+JSON.stringify(layout));
    if(layout.visiblePanels!==1||layout.detailHeight>700)fails.push('[11] รายละเอียดต้องกระชับและเปิดทีละขั้น '+JSON.stringify(layout));
  }
  const interaction=await p.evaluate(()=>{
    const bad=[],snapshot=JSON.stringify(dealOf(DEAL_SEL));
    const tabs=[...document.querySelectorAll('#dlOne [data-dlstep]')];
    const current=()=>[...document.querySelectorAll('#dlOne .pn')].findIndex(n=>n.classList.contains('now'));
    const original=current();
    for(const tab of tabs){
      tab.click();
      const visible=[...document.querySelectorAll('#dlOne .dl-step-panel')].filter(p=>!p.hidden);
      if(visible.length!==1||visible[0].dataset.step!==tab.dataset.dlstep)bad.push('[12] เลือกแท็บแล้วรายละเอียดไม่ตรงขั้น');
      if(document.querySelectorAll('#dlOne [aria-selected="true"]').length!==1||tab.tabIndex!==0)
        bad.push('[12] สถานะการเลือกแท็บไม่ถูกต้อง');
      if(current()!==original||JSON.stringify(dealOf(DEAL_SEL))!==snapshot)bad.push('[12] การดูรายละเอียดเปลี่ยนความคืบหน้าจริง');
    }
    tabs[0].focus();tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    if(document.activeElement!==tabs[1]||tabs[1].getAttribute('aria-selected')!=='true')bad.push('[12] คีย์บอร์ดเปลี่ยนแท็บไม่ได้');
    tabs[1].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
    if(document.activeElement!==tabs[tabs.length-1])bad.push('[12] ปุ่ม End ไม่ไปแท็บสุดท้าย');
    rDeal();
    if(document.querySelector('#dlOne .dl-step-panel:not([hidden])')?.dataset.step!=='fin')bad.push('[12] เปิดดีลใหม่ต้องกลับมาที่ขั้นปัจจุบัน');
    return bad;
  });
  fails.push(...interaction);
  await b.close();
  if(fails.length){console.log('FAILS:\n'+fails.join('\n'));process.exit(1);}
  console.log('ALL_CHECKS_PASS (substeps-r51: 12 ข้อ รวมรูปแบบ v1.52)');
})().catch(e=>{console.error('SUITE_CRASH',e);process.exit(2);});
