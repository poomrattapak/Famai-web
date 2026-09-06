/* บรีฟ B17-B18: แม่แบบต้องเป็นแบบร่าง ระดับดูต้องหยุดฟังก์ชันเขียน และไม่เพิ่มสิทธิ์แฝง */
const { chromium, EXE, BASE } = require('./env');
(async()=>{
  const browser=await chromium.launch({executablePath:EXE});
  const ctx=await browser.newContext({timezoneId:'Asia/Bangkok',viewport:{width:1440,height:1000}});
  const p=await ctx.newPage(), fails=[], errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const check=(ok,msg)=>{ console.log((ok?'ผ่าน ':'ไม่ผ่าน ')+msg); if(!ok) fails.push(msg); };
  await p.goto(BASE+'/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo');
  await p.waitForSelector('#app:not(.off)');
  await p.evaluate(()=>{ go('settings','#cfTabs [data-p="cf7"]'); PM_ROLE='sales'; rPerms();
    window.__permsOriginal=JSON.parse(JSON.stringify(PERMS));
    window.__as=id=>{ ME={...STAFF.find(s=>s.id===id)}; }; });
  check(await p.locator('#pmList [data-pmgroup]').count()===6,'[1] ครบหกหมวดเดียวกับเมนูจริง');
  const levels=await p.locator('[data-pmk="page:deal"] option').evaluateAll(es=>es.map(e=>e.value));
  check(levels.join(',')==='none,read,write','[2] หน้าเลือกไม่เห็น/ดู/แก้ไขได้ชัดเจน');
  const preview=await p.evaluate(()=>{
    const before=JSON.stringify(PERMS.sales), n=DB_Q.length;
    $('#pmRead').click();
    return {unchanged:JSON.stringify(PERMS.sales)===before&&DB_Q.length===n,
      draft:permDraft('sales')['page:deal']==='read'&&permDraft('sales')['act:finStage']==='none'
        &&permDraft('sales')['data:money']==='none',
      status:$('#pmStatus').textContent.includes('ยังไม่ได้บันทึก'),enabled:!$('#pmSave').disabled};
  });
  check(preview.unchanged&&preview.draft&&preview.status&&preview.enabled,'[3] แม่แบบดูอย่างเดียวเป็นแบบร่างและไม่เพิ่มสิทธิ์เงิน');
  await p.locator('[data-pmk="page:quote"]').selectOption('write');
  check(await p.evaluate(()=>permDraft('sales')['page:quote']==='write'&&PERMS.sales['page:quote']==='write'
    &&permDraft('sales')['page:deal']==='read'),'[4] ปรับแม่แบบรายข้อได้ก่อนบันทึก');
  const saved=await p.evaluate(async()=>{
    const ok=await permSave('sales'); __as('ST3');
    const out={ok,see:canSee('deal'),read:permR('page:deal'),write:permW('page:deal'),money:noMoney()};
    __as('ST1'); return out;
  });
  check(saved.ok&&saved.see&&saved.read&&!saved.write&&saved.money,'[5] บันทึกระดับดูยังเข้าหน้าได้แต่ไม่มีสิทธิ์เขียน');
  const guards=await p.evaluate(async()=>{
    PM_ROLE='tech'; rPerms(); permApplyTemplate('tech','read'); await permSave('tech');
    const job=SERVICE.find(x=>x.status!=='ส่งมอบแล้ว'&&x.branch==='FMG01');
    if(!job) return {missing:true};
    const old=job.status, n=DB_Q.length; __as('ST9');
    const refused=await svDeliver(job.id);
    const deny=refused===false&&job.status===old&&DB_Q.length===n;
    __as('ST1'); permSet('tech','page:service','write'); __as('ST9');
    const yes=await svDeliver(job.id);
    const write=yes===true&&job.status==='ส่งมอบแล้ว';
    job.status=old; __as('ST1'); return {deny,write};
  });
  check(!guards.missing&&guards.deny&&guards.write,'[6] ดูอย่างเดียวเรียกปิดงานซ่อมตรง ๆ ไม่ได้ เปิดแก้ไขคืนแล้วทำได้');
  const blocked=await p.evaluate(async()=>{
    const all=JSON.stringify(PERMS); __as('ST2');
    const d=permDraftSet('sales','page:deal','write')===false;
    const t=permApplyTemplate('sales','default')===false;
    const s=await permSave('sales')===false;
    const i=permSet('sales','page:deal','write')===false;
    const untouched=JSON.stringify(PERMS)===all;
    __as('ST1');
    const a=permApplyTemplate('admin','read')===false&&await permSave('admin')===false
      &&permDraftSet('admin','page:settings','none')===false;
    const invalid=permDraftSet('sales','data:money','write')===false
      &&permDraftSet('sales','act:finStage','read')===false;
    return d&&t&&s&&i&&untouched&&a&&invalid;
  });
  check(blocked,'[7] กันผู้ไม่ใช่แอดมิน การแก้บทบาทแอดมิน และค่าที่ผิดประเภทในฟังก์ชันจริง');
  const union=await p.evaluate(()=>{
    PERMS=JSON.parse(JSON.stringify(__permsOriginal));
    PERMS.sales['page:deal']='read'; PERMS.stock['page:deal']='write';
    ME={...STAFF.find(s=>s.id==='ST3'),roles:['sales','stock']};
    const yes=perm('page:deal')==='write'&&noMoney();
    __as('ST1'); PERMS=JSON.parse(JSON.stringify(__permsOriginal)); PM_DRAFT={}; PM_ROLE='sales'; rPerms();
    return yes&&PERMS.sales['act:allocateUnit']==='none'&&PERMS.manager['act:allocateUnit']==='write'
      &&PERMS.sales['act:deliver']==='write'&&PERMS.sales['act:archiveCustomer']==='write';
  });
  check(union,'[8] หลายบทบาทรวมระดับสูงสุด และค่าเริ่มต้นไม่ให้เซลล์จัดสรรรถเอง');
  const failure=await p.evaluate(async()=>{
    permDraftSet('sales','page:deal','read');
    const oldLive=LIVE, originalFetch=sbFetch, before=JSON.stringify(PERMS);
    LIVE=true; sbFetch=async()=>{throw new Error('ทดสอบบันทึกล้มเหลว');};
    const ok=await permSave('sales');
    LIVE=oldLive; sbFetch=originalFetch;
    return ok===false&&JSON.stringify(PERMS)===before&&permDraft('sales')['page:deal']==='read'
      &&!$('#pmSave').disabled;
  });
  check(failure,'[9] ฐานข้อมูลปฏิเสธแล้วสิทธิ์เดิมคงอยู่และแบบร่างลองใหม่ได้');
  const cancel=await p.evaluate(()=>{
    $('#pmCancel').click();
    return permChanges('sales').length===0&&$('#pmSave').disabled;
  });
  check(cancel,'[10] ยกเลิกแบบร่างคืนค่าที่บันทึกไว้จริง');
  const pageGuards=await p.evaluate(()=>{
    __as('ST2');
    const cases=[['transfer',canTransfer],['booking',canBooking],['invoice',canWholesale],
      ['settings',canEditOrg],['settings',canEditSites],['settings',canEditFin],
      ['cal',canExecCal],['hr',canFixAtt],['plate',canPlate]];
    const out=cases.map(([key,fn])=>{ const old=PERMS.manager['page:'+key];
      PERMS.manager['page:'+key]='read'; const blocked=!fn();
      PERMS.manager['page:'+key]='write'; const allowed=fn();
      PERMS.manager['page:'+key]=old; return blocked&&allowed; });
    PERMS.manager['page:cal']='read'; PERMS.manager['page:invoice']='read'; PERMS.manager['page:hr']='read';
    const view=canSeeExecCal()&&canSeeWholesale()&&canViewHr();
    __as('ST1'); PERMS=JSON.parse(JSON.stringify(__permsOriginal)); PM_DRAFT={}; rPerms();
    return out.every(Boolean)&&view;
  });
  check(pageGuards,'[13] หน้าดูอย่างเดียวกันการกระทำแฝง แต่สิทธิ์อ่านแท็บเดิมยังอยู่');
  const actualPart=await p.evaluate(()=>{
    __as('ST6'); go('parts');
    $('#pCode').value='QA-READONLY'; $('#pName').value='อะไหล่ทดสอบสิทธิ์';
    const n=PARTS.length, old=PERMS.stock['page:parts'];
    PERMS.stock['page:parts']='read'; partSave();
    const blocked=PARTS.length===n;
    PERMS.stock['page:parts']='write'; partSave();
    const allowed=PARTS.length===n+1;
    PARTS.splice(n); PERMS.stock['page:parts']=old; __as('ST1');
    return blocked&&allowed;
  });
  check(actualPart,'[14] เรียกเพิ่มอะไหล่ตรง ๆ ด้วยสิทธิ์ดูไม่ได้ แต่เปิดแก้ไขแล้วเพิ่มได้');
  const actualSetting=await p.evaluate(()=>{
    __as('ST2'); go('settings'); rSettings();
    const old=CFG.aging; $('#cfAging').value=String(Number(old)+5);
    PERMS.manager['page:settings']='read'; $('#cfSave').onclick();
    const blocked=CFG.aging===old;
    PERMS.manager['page:settings']='write'; $('#cfSave').onclick();
    const allowed=CFG.aging===Number(old)+5;
    CFG.aging=old; __as('ST1'); rPerms(); return blocked&&allowed;
  });
  check(actualSetting,'[15] callback บันทึกตั้งค่าตรวจระดับแก้ไข ณ เวลาบันทึก');
  for(const width of [1440,390]) for(const theme of ['light','dark']){
    await p.setViewportSize({width,height:1000});
    await p.evaluate(t=>{document.documentElement.dataset.theme=t; go('settings','#cfTabs [data-p="cf7"]');},theme);
    const layout=await p.evaluate(()=>{
      const host=$('#cf7'), box=host.getBoundingClientRect();
      const shown=[...host.querySelectorAll('select,button,label')].filter(e=>e.getBoundingClientRect().width);
      return box.right<=innerWidth+1&&shown.every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;});
    });
    check(layout,'[11] สิทธิ์ไม่ล้นกรอบ '+width+'px ธีม'+theme);
    if(process.env.QA_ARTIFACT_DIR) await p.screenshot({path:process.env.QA_ARTIFACT_DIR+'/permissions-'+width+'-'+theme+'.png',fullPage:true});
  }
  check(!errors.length,'[12] ไม่มีข้อผิดพลาด JavaScript');
  console.log(fails.length?'FAILS:\n'+fails.join('\n'):'ALL_CHECKS_PASS');
  if(errors.length) console.log('ERRORS:\n'+errors.join('\n'));
  await browser.close(); process.exit(fails.length||errors.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
