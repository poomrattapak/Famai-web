/* เจ้าของ: "รูปของรถ บางส่วนถูกตัดขาดออกไปในหลายๆ รูปเลยครับ" และ
   "ทำระบบตัวกรองใหม่ในหน้าสต็อกรถแล้วตรวจเช็กในหลายๆ หน้าด้วยว่าเป็นอย่างนี้ด้วยหรือเปล่า ถ้าเป็นก็แก้ไขให้หมดเลยครับ"
   ล็อกภาพเต็มกรอบทุกขนาด, ล้างจากการ์ด/ผลว่าง/ทีละตัว, คงสาขาและตัวกรองอิสระ,
   แผ่นมือถือคืน control จริง, ดีลและงานทะเบียนล้างแล้วได้รายการเดิม */
const {chromium,EXE,BASE}=require('./env');
const assert=require('node:assert/strict');
(async()=>{
  const b=await chromium.launch({executablePath:EXE});
  try{
    const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(BASE+'/index.html');
    await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
    await p.evaluate(()=>go('stock'));
    // รูปจริงทั้งแกลเลอรีและภาพย่อ ต้องไม่ถูกตัดโดยกล่องหรือขนาดพื้นฐานของ grid
    for(const width of [1440,390]){
      await p.setViewportSize({width,height:1000});
      for(const view of (width===1440?['gal','grp']:['gal','sell'])){
        await p.evaluate(v=>{
          if(v==='sell'){go('sell');sUnitSet(UNITS.find(u=>u.retail!=null&&u.status==='available').id);}
          else{go('stock');stTab(v);}
        },view);
        await p.waitForTimeout(350); // รอการเปลี่ยนขนาดและการเคลื่อนหน้าจอก่อนวัดขอบภาพ
        const fails=await p.evaluate(async()=>{
          const bad=[];let seen=0;
          for(const img of document.querySelectorAll('.screen.on img.bike')){
            if(!img.getClientRects().length)continue;
            seen++;img.loading='eager';await img.decode();
            const a=img.getBoundingClientRect(),z=img.parentElement.getBoundingClientRect();
            if(getComputedStyle(img).objectFit!=='contain'||a.left<z.left-1||a.right>z.right+1||a.top<z.top-1||a.bottom>z.bottom+1)
              bad.push({src:img.getAttribute('src'),a:a.toJSON(),z:z.toJSON(),fit:getComputedStyle(img).objectFit});
          }
          if(!seen)bad.push('ไม่มีรูปให้ตรวจ');
          return bad;
        });
        assert.deepEqual(fails,[],'[ภาพเต็มคัน] '+width+'/'+view);
      }
    }
    await p.setViewportSize({width:1440,height:1000});
    await p.evaluate(()=>{go('stock');stTab('gal');});
    const baseline=await p.evaluate(()=>stList().length);
    await p.locator('#stGal .gcard').first().click();
    assert.ok(await p.evaluate(()=>stList().length)<baseline,'การ์ดต้องกรองรายการจริง');
    assert.ok(await p.locator('#stFsum [data-filter-remove="stVariant"]').isVisible(),'[ชิป] รหัสรุ่นที่การ์ดเลือกต้องเห็นและล้างได้');
    await p.locator('#stFsum [data-filter-clear]').click();
    assert.equal(await p.evaluate(()=>stList().length),baseline,'[ล้างทั้งหมด] คืนจำนวนรถเดิม');
    // ล้างรุ่นพร้อมรหัส/สีที่ผูกกัน แต่คงสถานะและขอบเขตสาขาไว้
    await p.evaluate(()=>{
      $('#stBranch').value='FMG01';rStock();
      const u=stList().find(x=>x.status==='available');
      $('#stModel').value=u.model;rStock();$('#stVariant').value=u.variant;rStock();
      $('#stColor').value=u.color;$('#stStatus').value='available';rStock();
    });
    await p.locator('#stFsum [data-filter-remove="stModel"]').click();
    assert.deepEqual(await p.evaluate(()=>['stModel','stVariant','stColor','stStatus','stBranch'].map(id=>$('#'+id).value)),
      ['','','','available','FMG01'],'[ล้างทีละตัว] ล้างลูก คงสถานะและสาขา');
    await p.fill('#stQ','ไม่มีรถคันนี้');
    assert.equal(await p.evaluate(()=>stList().length),0);
    await p.locator('#stFsum [data-filter-clear]').click();
    assert.ok(await p.evaluate(()=>stList().length)>0,'[ผลว่าง] ล้างแล้วกลับมามีรถ');
    assert.equal(await p.inputValue('#stBranch'),'FMG01','[ขอบเขต] ล้างต้องไม่เปลี่ยนสาขา');
    // มือถือย้ายช่องเดิมเข้าแผ่น ล้างได้โดยไม่ปิด แล้วคืนกลับตำแหน่งเดิม
    await p.setViewportSize({width:390,height:844});
    await p.click('#stFilt');await p.fill('#fsBody #stQ','ไม่มีรถคันนี้');
    assert.ok(await p.locator('#fsReset').isVisible(),'[แผ่น] ต้องมีปุ่มล้าง');
    await p.click('#fsReset');
    assert.equal(await p.inputValue('#fsBody #stQ'),'','[แผ่น] ต้องล้างช่องจริง');
    assert.ok(await p.evaluate(()=>stList().length)>0,'[แผ่น] ต้องวาดผลหลังล้าง');
    await p.click('#fsDone');
    assert.equal(await p.locator('#s-stock #stQ').count(),1,'[คืนช่อง] ช่องกลับเข้าหน้าเดิม');
    await p.click('#stFilt');await p.selectOption('#fsBody #stStatus','reserved');
    await p.click('#fsDone');
    assert.ok(await p.locator('#stFsum [data-filter-remove="stStatus"]').isVisible(),'[ชิปมือถือ] เห็นตัวกรองแม้ปิดแผ่น');
    await p.locator('#stFsum [data-filter-clear]').click();
    // ตัวกรองดีล และช่องค้นหางานทะเบียน ใช้ทางออกเดียวกัน
    await p.evaluate(()=>go('deal'));
    const deals=await p.evaluate(()=>dealRows().length);
    await p.click('#dlFilt');await p.fill('#fsBody #dlQ','ไม่พบลูกค้ารายนี้');
    assert.equal(await p.evaluate(()=>dealRows().length),0);
    await p.click('#fsReset');
    assert.equal(await p.evaluate(()=>dealRows().length),deals,'[ดีล] ล้างในแผ่นคืนรายการเดิม');
    await p.fill('#fsBody #dlQ','ไม่พบลูกค้ารายนี้');await p.click('#fsDone');
    await p.locator('#dlFsum [data-filter-remove="dlQ"]').click();
    assert.equal(await p.evaluate(()=>dealRows().length),deals,'[ดีล] ล้างชิปคืนรายการเดิม');
    await p.evaluate(()=>go('plate'));
    const plates=await p.locator('#plTable').innerText();
    await p.fill('#plQ','ไม่พบทะเบียนนี้');
    assert.ok((await p.locator('#plTable').innerText()).includes('ไม่พบงานที่ค้นหา'));
    await p.locator('#plFsum [data-filter-clear]').click();
    assert.equal(await p.inputValue('#plQ'),'','[ทะเบียน] ช่องต้องว่าง');
    assert.equal(await p.locator('#plTable').innerText(),plates,'[ทะเบียน] คืนรายการเดิม');
    assert.equal(await p.evaluate(()=>PL_Q),'','[ทะเบียน] สถานะค้นหาต้องว่างด้วย');
    assert.deepEqual(errors,[]);
    console.log('ผ่าน · ภาพเต็มคัน 2 ขนาด · สต๊อก '+baseline+' คัน · ดีล '+deals+' ราย · ล้างรายตัว/ทั้งหมด/มือถือ/ทะเบียน · คงสาขา');
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
