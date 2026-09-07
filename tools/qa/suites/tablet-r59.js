/* เจ้าของ: "ตอนนี้อยากให้ออกแบบ tablet หรือ ipad เป็นหลักเลยครับ"
   [1] เมนูเดียวกันทั้งสองแนวและเข้าหน้าที่เหลือได้ [2] เป้าสัมผัสและตัวอักษร
   [3] ไม่มีส่วนงานล้นแนวนอน [4] รายการอ่านเป็นการ์ดตามพื้นที่จริง
   [5] ฟอร์มและสรุปใช้คอลัมน์เหมาะกับแนวจอ [6] หน้าต่างรายละเอียดพอดีจอ
   [7] หมุนจอไม่ล้างใบขาย [8] ไม่ล้างเบอร์เซลล์ในใบเสนอราคา
   [9] แถบบนกะทัดรัดและรักษาตัวกรองที่ยังไม่ได้ยืนยัน
   [10] ตัวเลือกขอบเขตดีลไม่ยืมระยะขอบของทั้งหน้ามาจนข้อมูลแยกห่าง
   [11] แตะงานบริการผ่านพื้นที่ 44px แล้วบันทึกผู้ทำจริง
   [12] ปฏิทินและแผงสาขาที่เปิดอยู่ต้องคงค่าและอยู่ในจอหลังหมุน ส่วน tooltip ต้องปิด */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const b=await chromium.launch({executablePath:EXE});
 try{
  const p=await b.newPage({viewport:{width:820,height:1180},timezoneId:'Asia/Bangkok',hasTouch:true}),fails=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/index.html');
  await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
  // วัดขนาดสุดท้าย ไม่วัดเฟรมแรกที่ popin ยังย่อหน้าต่าง; ชุด popup-r26 ตรวจภาพเคลื่อนไหวแยกอยู่แล้ว
  await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  const rotate=async width=>{await p.setViewportSize({width,height:width<1024?1180:820});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  for(const width of [768,820,1024,1180,1366,1376])for(const theme of ['light','dark']){
   await rotate(width);
   const result=await p.evaluate(({width,theme})=>{
    document.documentElement.dataset.theme=theme;
    const out=[],check=(v,m)=>{if(!v)out.push(m);};
    check(getComputedStyle(document.documentElement).colorScheme===theme,'[2] ช่องเลือก native ต้องใช้ color-scheme ตรงกับธีม '+theme);
    const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const touch=(selector,label)=>{const e=document.querySelector(selector);check(visible(e)&&e.getBoundingClientRect().height>=43.5,'[2] '+label+' ต้องแตะได้สูงอย่างน้อย 44px');};
    const scan=where=>{
     check(document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1,'[3] '+where+' หน้าเกินขอบจอ');
     const screen=$('.screen.on');check(screen&&screen.scrollWidth<=screen.clientWidth+1,'[3] '+where+' เนื้อหาล้นพื้นที่ทำงาน');
     const bad=[...document.querySelectorAll('#app *,#modal *')].filter(e=>visible(e)&&!e.closest('.doc')&&!e.matches('input,select,textarea,option,svg,use')&&['auto','scroll'].includes(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1);
     check(!bad.length,'[3] '+where+' เลื่อนแนวนอน '+bad.slice(0,4).map(e=>e.id||e.className).join(','));
    };
    for(const [id,pages] of [['ST1',['deal','sell','quote','aftercare','settings','stock']],['ST3',['deal','sell','quote','stock']],['ST10',['aftercare','service']]]){
     ME=STAFF.find(s=>s.id===id);buildNav();go(pages[0]);
     check(visible($('#bnav'))&&!visible($('#side')),'[1] '+ME.role+' ต้องใช้เมนูล่างและพื้นที่ทำงานเต็มจอ');
     const more=$('#bnav [data-more]');check(visible(more),'[1] '+ME.role+' ต้องมีเมนูอื่น ๆ');
     if(visible(more)){
      more.click();const target=$('#moreB [data-s]');check(visible(target),'[1] '+ME.role+' เปิดเมนูอื่น ๆ แล้วต้องมีหน้าที่เข้าถึงได้');
      if(visible(target)){const want=target.dataset.s;target.click();check(CUR===want&&$('#s-'+want)?.classList.contains('on'),'[1] '+ME.role+' เมนูอื่น ๆ ต้องเข้าหน้าจริง');}closeMore();
     }
     for(const key of pages){
      go(key);scan(ME.role+'/'+key);
      const tabs=[...document.querySelectorAll('.screen.on>.tabs button,.screen.on .tabs button')];
      for(const tab of tabs){if(!visible(tab))continue;tab.click();scan(ME.role+'/'+key+'/'+tab.textContent.trim());}
     }
    }
    ME=STAFF.find(s=>s.id==='ST1');buildNav();go('sell');goSub('sell','p1');
    touch('#sCust','ช่องชื่อลูกค้า');touch('#sSave','ปุ่มบันทึกขาย');touch('#s-sell .tabs button','แท็บงาน');
    check(parseFloat(getComputedStyle($('#sCust')).fontSize)>=16,'[2] ตัวอักษรในช่องกรอกต้องไม่น้อยกว่า 16px');
    const main=$('#p1>.g2'),cols=main?getComputedStyle(main).gridTemplateColumns.split(' ').length:0;
    check(cols===(width>=1024?2:1),'[5] หน้าขายต้องมี '+(width>=1024?2:1)+' คอลัมน์หลัก');
    const form=$('#sCust').closest('.f2');
    check(form&&getComputedStyle(form).gridTemplateColumns.split(' ').length===2,'[5] ช่องฟอร์มคู่ต้องอยู่สองคอลัมน์บนแท็บเล็ต');
    go('deal');const table=$('#dlTable'),scope=$('#dlArchive')?.parentElement,kpis=$('#dlKpi');
    const ss=scope&&getComputedStyle(scope),gap=scope&&kpis?kpis.getBoundingClientRect().top-scope.getBoundingClientRect().bottom:null;
    check(ss&&['paddingTop','paddingRight','paddingBottom','paddingLeft'].every(k=>parseFloat(ss[k])===0)&&gap!==null&&Math.abs(gap-24)<1,'[10] ตัวเลือกขอบเขตดีลต้องไม่มี padding ซ้ำและห่างสรุป 24px');
    check(table?.classList.contains('cards')&&table.querySelectorAll('.crow').length>1,'[4] ลูกค้าและดีลต้องอ่านเป็นรายการการ์ดบนแท็บเล็ต');
    if(table?.classList.contains('cards')){
     const rows=[...table.querySelectorAll('.crow')],a=rows[0]?.getBoundingClientRect(),z=rows[1]?.getBoundingClientRect(),wrap=table.closest('.tw');
     const two=wrap&&wrap.clientWidth>=840;
     check(a&&z&&(two?Math.abs(a.top-z.top)<1&&z.left>a.left+1:z.top>a.top+1),'[4] รายการต้องจัด '+(two?'สอง':'หนึ่ง')+' คอลัมน์ตามพื้นที่ตารางจริง');
    }
    go('dash');const top=$('.top');
    check(visible($('#npBtn'))&&!visible($('#navCtl'))&&top.getBoundingClientRect().height<=140,'[9] หัวหน้าต้องกะทัดรัดและเปิดตัวกรองจากปุ่ม');
    if(visible($('#npBtn')))$('#npBtn').click();
    check(visible($('#navCtl')),'[9] แตะปุ่มตัวกรองแล้วต้องเปิดแผง');touch('#navOk','ปุ่มยืนยันตัวกรอง');
    perCalOpen($('#navPerBox'),NAV_PER[CUR]);touch('#perCal [data-prd]','วันในปฏิทิน');
    const cal=$('#perCal').getBoundingClientRect();check(cal.left>=-1&&cal.right<=innerWidth+1,'[3] ปฏิทินต้องไม่ล้นจอ');perCalClose();navCtlClose();
    careServiceModal();const box=$('#modal .mbox'),rect=box.getBoundingClientRect();
    check(visible(box)&&rect.width>=Math.min(720,width-48)-1&&rect.left>=23&&rect.right<=width-23,'[6] ฟอร์มบริการต้องใช้ความกว้างแท็บเล็ตและเหลือขอบอย่างน้อย 24px');
    touch('#mdX','ปุ่มปิดหน้าต่าง');scan('หน้าต่างบริการ');
    const mb=getComputedStyle($('#mdB'));check(mb.paddingLeft===mb.paddingRight&&parseFloat(mb.paddingLeft)>=24,'[6] หน้าต่างใช้ช่องไฟด้านข้างเท่ากันอย่างน้อย 24px');closeModal();
    const care=CARE.find(r=>r.tasks.some(t=>!t.pendingSync)),task=care?.tasks.find(t=>!t.pendingSync);
    if(care&&task)careDrawer(care.id,task.id);
    const tick=$('#drwB [data-care-done]'),label=tick?.closest('label'),lr=label?.getBoundingClientRect();
    check(visible(tick)&&visible(label)&&lr.width>=44&&lr.height>=44&&label.contains(tick),'[11] ช่องติ๊กงานบริการต้องมี label ที่แตะได้อย่างน้อย 44×44px');closeDrawer();
    return out;
   },{width,theme});
   fails.push(...result.map(x=>width+'/'+theme+' '+x));
  }
  // วัดการคงร่างผ่านการหมุนจริง ข้ามเส้นแบ่ง 900px เดิม โดยไม่บันทึกข้อมูล
  await rotate(820);
  await p.evaluate(()=>{ME=STAFF.find(s=>s.id==='ST1');buildNav();go('sell');sellTab('p1');$('#sCust').value='ร่างลูกค้าระหว่างหมุนจอ';$('#sNote').value='ยังไม่บันทึกการขาย';$('#sDown').value='12345';});
  for(const width of [1180,820]){
   await rotate(width);
   const ok=await p.evaluate(()=>$('#sCust').value==='ร่างลูกค้าระหว่างหมุนจอ'&&$('#sNote').value==='ยังไม่บันทึกการขาย'&&Number($('#sDown').value.replace(/,/g,''))===12345);
   if(!ok)fails.push('[7] ร่างชื่อ หมายเหตุ และเงินดาวน์ต้องคงเดิมเมื่อหมุนไป '+width);
  }
  await p.evaluate(()=>{go('quote');window.__quoteRotationCustomer=CUSTOMERS.find(c=>customerVisible(c)&&!c.archivedAt).id;quoteSelectCustomer(__quoteRotationCustomer);$('#qUntil').value='2026-12-31';$('#qUntil').oninput();});
  for(const width of [1180,820]){await rotate(width);if(await p.inputValue('#qUntil')!=='2026-12-31'||!await p.evaluate(()=>qCustomerId===__quoteRotationCustomer))fails.push('[8] ลูกค้าที่เลือกและวันยืนราคาในร่างต้องคงเดิมเมื่อหมุนไป '+width);}
  const staged=await p.evaluate(()=>{
   go('dash');if(!$('#navCtl').classList.contains('on'))$('#npBtn').click();
   const pick=[...$('#navBrSel').options].find(o=>o.value&&o.value!==$('#dBranch').value);
   if(!pick)return null;$('#navBrSel').value=pick.value;$('#navBrSel').onchange();return {want:pick.value,actual:$('#dBranch').value};
  });
  if(!staged)fails.push('[9] ต้องมีสาขาทดสอบค่าที่ยังไม่ได้ยืนยัน');
  else for(const width of [1180,820]){
   await rotate(width);const ok=await p.evaluate(({want,actual})=>NAV_BRP===want&&$('#dBranch').value===actual&&!$('#navOk').disabled&&$('#navSum').textContent.includes('ยังไม่ได้ใช้')&&$('#navCtl').classList.contains('on'),staged);
   if(!ok)fails.push('[9] สาขาที่ยังไม่ยืนยันและแผงตัวกรองต้องคงเดิมเมื่อหมุนไป '+width);
  }
  const taskToTap=await p.evaluate(()=>{
   navCtlClose();go('aftercare');const r=CARE.find(r=>r.tasks.some(t=>!t.done&&!t.pendingSync)),t=r?.tasks.find(t=>!t.done&&!t.pendingSync);
   if(!r||!t)return null;careDrawer(r.id,t.id);return {rid:r.id,tid:t.id,name:ME.name};
  });
  if(!taskToTap)fails.push('[11] ต้องมีงานที่ยังไม่เสร็จให้ตรวจการแตะจริง');
  else{
   const label=p.locator('#care-task-'+taskToTap.tid+' label:has(input[data-care-done])');
   if(!await label.count())fails.push('[11] ต้องแตะพื้นที่ label ของช่องติ๊กได้');
   else try{
    await label.tap({position:{x:4,y:4},timeout:2000}); // แตะมุมพื้นที่รับสัมผัส นอกกรอบ checkbox 20px
    await p.waitForFunction(({rid,tid,name})=>{
     const t=CARE.find(r=>r.id===rid)?.tasks.find(t=>t.id===tid),row=document.getElementById('care-task-'+tid);
     return t?.done&&row?.querySelector('input[data-care-done]')?.checked&&row.textContent.includes(name);
    },taskToTap,{timeout:2000});
   }catch(e){fails.push('[11] แตะพื้นที่รอบ checkbox แล้วต้องทำงานเสร็จและแสดงชื่อผู้ติ๊ก: '+e.message.split('\n')[0]);}
  }
  await rotate(1180);
  const calStart=await p.evaluate(()=>{
   closeDrawer();go('dash');$('#npBtn').click();const k=NAV_PER[CUR];perSt(k).from='';perSt(k).to='';
   perCalOpen($('#navPerBox'),k);$('#perCal [data-prd]').click();return {a:PC.a,b:PC.b,ym:PC.ym};
  });
  if(!calStart.a||calStart.b)fails.push('[12] ต้องเลือกวันเริ่มเพียงวันเดียวเพื่อทดสอบร่างช่วงเวลา');
  for(const width of [820,1180]){
   await rotate(width);const ok=await p.evaluate(({a,b,ym})=>{const e=$('#perCal'),r=e.getBoundingClientRect();return e.style.display==='block'&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&PC.a===a&&PC.b===b&&PC.ym===ym;},calStart);
   if(!ok)fails.push('[12] ปฏิทินที่เปิดอยู่ต้องพอดีจอและคงวันเริ่ม/เดือนเมื่อหมุนไป '+width);
  }
  await rotate(1366);
  const branchStart=await p.evaluate(()=>{perCalClose();brPickOpen();const co=$('#brPick [data-bpco]');if(!co)return null;co.click();return {co:BP_CO,pending:NAV_BRP};});
  if(!branchStart)fails.push('[12] ต้องมีบริษัททดสอบแผงสาขาที่เปิดอยู่');
  else for(const width of [768,1366]){
   await rotate(width);const ok=await p.evaluate(({co,pending})=>{const e=$('#brPick'),r=e.getBoundingClientRect();return e.style.display==='block'&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&BP_CO===co&&NAV_BRP===pending;},branchStart);
   if(!ok)fails.push('[12] แผงสาขาที่เปิดอยู่ต้องพอดีจอและคงบริษัท/ค่ารอยืนยันเมื่อหมุนไป '+width);
  }
  await p.evaluate(()=>{brPickClose();navCtlClose();tipShow('รายละเอียดบนกราฟ',1300,600);});
  await rotate(768);
  if(!await p.evaluate(()=>getComputedStyle($('#tip')).display==='none'))fails.push('[12] หมุนจอแล้ว tooltip กราฟต้องปิด ไม่ค้างที่พิกัดเดิม');
  fails.push(...errors.map(e=>'PAGEERROR '+e));
  console.log(fails.length?'FAILS:\n'+[...new Set(fails)].join('\n'):'ALL_CHECKS_PASS · แท็บเล็ต 6 ขนาด × 2 ธีม · 3 บทบาท · หมุนจอรักษาร่างและตัวกรอง');
  process.exitCode=fails.length?1:0;
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
