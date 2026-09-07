/* บรีฟข้อ 08 · .claude/issues/005 — ลูกค้าที่ยังไม่มีเจ้าของต้องไปต่อได้ และผู้บริหารต้องจัดสรรได้จริง
   migration 32 ตั้งใจปล่อย owner_id ว่างให้ผู้บริหารจัดสรร แต่เดิมไม่มีหน้าจอให้จัดสรร
   และ custPersist แนบ owner_id ทุกครั้ง ทำให้ acct โดน 42501 ตอนแค่แก้เบอร์โทร

   [1] ช่องผู้ดูแลโผล่เฉพาะผู้บริหาร — เซลล์และบัญชีไม่เห็น
   [2] รายชื่อในช่องมีเซลล์จริง และมีตัวเลือกคืนเข้ากองกลาง
   [3] ผู้บริหารจัดสรรผ่านฟอร์มแล้วสถานะในหน้าเปลี่ยนตาม
   [4] ตัวกรองเซลล์มีกอง "ยังไม่มีผู้ดูแล" ปักบนสุดและกรองได้ตรง
   [5] โหมดจริง: บัญชีบันทึกลูกค้าไร้เจ้าของได้ และคำขอต้องไม่มี owner_id เลย
   [6] โหมดจริง: ผู้บริหารเปิดมาแก้เฉย ๆ ต้องไม่ยึดเจ้าของ
   [7] โหมดจริง: ผู้บริหารตั้งใจจัดสรร → ส่ง owner_id และฐานบันทึกจริง · คืนกองกลางได้
   [8] โฟลว์จองรถต้องไม่แนบ owner_id ทับเจ้าของลูกค้า (regression จาก 97fe84c)
   ตัว stub จำลองด่าน customer_guard ตามของจริง คำขอที่ผิดกติกาจะถูกปฏิเสธเหมือนฐานจริง */
const {chromium,EXE,BASE}=require('./env');
(async()=>{
 const b=await chromium.launch({executablePath:EXE});
 const p=await b.newPage({timezoneId:'Asia/Bangkok',viewport:{width:1440,height:900}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'});
 await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');await p.waitForTimeout(300);

 const result=await p.evaluate(async()=>{
  const failures=[],check=(ok,m)=>{if(!ok)failures.push(m);};
  const admin=STAFF.find(x=>x.id==='ST1'),manager=STAFF.find(x=>x.id==='ST2'),
        sales=STAFF.find(x=>x.id==='ST3'),acct=STAFF.find(x=>x.id==='ST7');
  const mkCust=(id,over)=>({id,name:'ลูกค้า '+id,phone:'0800000000',branch:admin.branch,
    src:'เดินเข้าร้าน',stage:'สนใจ',intent:'เงินสด',owner:'—',ownerId:'',
    createdAt:TODAY+'T01:00:00+07:00',upAt:TODAY+'T09:00:00+07:00',...over});

  /* ---------- [1][2][3][4] หน้าจอ (โหมดสาธิต) ---------- */
  const none=mkCust('QAOWN-NONE');                                   /* ยังไม่มีเจ้าของ */
  const mine=mkCust('QAOWN-MINE',{ownerId:sales.id,owner:sales.nick,branch:sales.branch});
  CUSTOMERS.push(none,mine);ME=admin;go('deal');

  custModal(none.id);
  check(!!$('#cmOwner'),'[1] ผู้บริหารไม่เห็นช่องผู้ดูแล');
  const optIds=$('#cmOwner')?[...$('#cmOwner').options].map(o=>o.value):[];
  check(optIds[0]==='','[2] ไม่มีตัวเลือกคืนลูกค้าเข้ากองกลาง');
  check(optIds.includes(sales.id),'[2] รายชื่อผู้ดูแลไม่มีเซลล์ให้เลือก');
  check($('#cmOwner').value==='','[2] ลูกค้าไร้เจ้าของกลับถูกเลือกค่าอื่นไว้ล่วงหน้า');
  $('#cmOwner').value=sales.id;$('#cmGo').click();
  check(none.ownerId===sales.id&&none.owner===sales.nick,'[3] จัดสรรผู้ดูแลผ่านฟอร์มแล้วไม่มีผล');
  closeModal();

  none.ownerId='';none.owner='—';                                    /* คืนสภาพไว้ตรวจข้อถัดไป */
  ME=sales;go('deal');custModal(mine.id);
  check(!$('#cmOwner'),'[1] เซลล์เห็นช่องผู้ดูแล');
  closeModal();
  ME=acct;go('deal');custModal(none.id);
  check(!$('#cmOwner'),'[1] บัญชีเห็นช่องผู้ดูแล');
  closeModal();

  ME=admin;go('deal');fsClear('deal');rDeal();
  const labels=[...$('#dlSales').options].map(o=>o.textContent);
  check(labels[1]===OWNER_NONE,'[4] ตัวกรองไม่ได้ปักกอง "ยังไม่มีผู้ดูแล" ไว้บนสุด');
  check(!labels.includes('—'),'[4] ตัวกรองยังมีตัวเลือก "—" ที่อ่านไม่รู้เรื่อง');
  $('#dlSales').value=OWNER_NONE;rDeal();
  const rows=dealRows();
  check(rows.length>0&&rows.every(d=>dealOwnerName(d)===OWNER_NONE),'[4] กรองกองไร้เจ้าของแล้วได้รายการปนกัน');
  check(rows.some(d=>d.c.id===none.id),'[4] ลูกค้าไร้เจ้าของไม่อยู่ในกองที่กรอง');
  fsClear('deal');rDeal();

  /* ---------- [5][6][7] คำขอที่ส่งขึ้นฐาน (โหมดจริง + stub ด่าน customer_guard) ---------- */
  const REQ=[],OWNERS={};
  const isMgr=()=>['admin','manager'].some(r=>myRoles().includes(r));
  LIVE=true;
  sbFetch=async(path,opt)=>{
    const method=(opt&&opt.method)||'GET',body=opt&&opt.body?JSON.parse(opt.body):null;
    REQ.push({path,method,body});
    if(method!=='POST'||!/^\/rest\/v1\/customer\?/.test(path))return {};
    const had=Object.prototype.hasOwnProperty.call(OWNERS,body.id),old=had?OWNERS[body.id]:null;
    let next=old;
    if('owner_id' in body){
      next=body.owner_id||null;
      if(!had)next=next||ME.id;                                      /* coalesce(owner_id, auth.uid()) */
      if(next!==old&&!isMgr())throw new Error('เฉพาะผู้บริหารที่เปลี่ยนผู้ดูแลลูกค้าได้');
    }else if(!had)next=ME.id;                                        /* ไม่ส่ง = trigger เติมให้เอง */
    OWNERS[body.id]=next;
    const at=punchNow().toISOString();
    return [{...body,owner_id:next,created_at:at,updated_at:at}];
  };

  OWNERS[none.id]=null;                                              /* ฐานมีลูกค้ารายนี้แบบไร้เจ้าของ */
  ME=acct;REQ.length=0;
  const acctOk=await custPersist({...none,phone:'0899999999'});
  check(acctOk,'[5] บัญชีบันทึกลูกค้าที่ยังไม่มีเจ้าของไม่สำเร็จ (เดิมโดน 42501)');
  check(REQ.length&&!('owner_id' in REQ[REQ.length-1].body),'[5] ยังแนบ owner_id ไปทั้งที่ไม่ได้ตั้งใจเปลี่ยน');
  check(OWNERS[none.id]===null,'[5] เจ้าของถูกเปลี่ยนโดยไม่มีใครสั่ง');

  ME=manager;REQ.length=0;
  check(await custPersist({...none,phone:'0877777777'}),'[6] ผู้บริหารบันทึกลูกค้าไร้เจ้าของไม่สำเร็จ');
  check(OWNERS[none.id]===null,'[6] ผู้บริหารยึดเจ้าของเงียบ ๆ ตอนแค่เปิดมาแก้');

  REQ.length=0;
  const assigned={...none,ownerId:sales.id};
  check(await custPersist(assigned,{setOwner:true}),'[7] ผู้บริหารจัดสรรเจ้าของไม่สำเร็จ');
  check(REQ[REQ.length-1].body.owner_id===sales.id,'[7] ไม่ได้ส่ง owner_id ที่ผู้บริหารเลือก');
  check(OWNERS[none.id]===sales.id&&assigned.owner===sales.nick,'[7] ฐานหรือหน้าจอไม่รับเจ้าของใหม่');
  check(await custPersist({...assigned,ownerId:''},{setOwner:true})&&OWNERS[none.id]===null,'[7] คืนลูกค้าเข้ากองกลางไม่ได้');

  ME=acct;REQ.length=0;
  const fresh={...mkCust('QAOWN-NEW'),ownerId:''};
  check(await custPersist(fresh),'[5] เพิ่มลูกค้าใหม่โดยไม่ระบุเจ้าของไม่สำเร็จ');
  check(!('owner_id' in REQ[REQ.length-1].body),'[5] ลูกค้าใหม่ยังแนบ owner_id ไปเอง');
  check(OWNERS['QAOWN-NEW']===acct.id&&fresh.ownerId===acct.id,'[5] ลูกค้าใหม่ไม่ได้เจ้าของจาก trigger');

  /* ---------- [8] โฟลว์จองรถ ต้องไม่ทับเจ้าของลูกค้า ----------
     กันไม่ให้แพตเทิร์น owner_id:c.ownerId||ME.id กลับมาทางอื่นอีก
     ดัก dbUp ไว้ที่ตัวมันเอง จึงตรวจได้ว่า "โฟลว์จองส่งอะไร" โดยไม่ติดด่าน uuid ภายใน */
  ME=sales;go('booking');
  const UP=[],realUp=dbUp;dbUp=(t,b)=>{UP.push({t,b});};
  const unit=UNITS.find(x=>x.status==='available'&&inScope(x.branch));
  const walkin=mkCust('QAOWN-BOOK',{phone:'0866554433',branch:unit.branch});   /* ownerId ว่างจาก mkCust */
  CUSTOMERS.push(walkin);
  rBooking();
  $('#bkName').value=walkin.name;$('#bkPhone').value=walkin.phone;
  $('#bkUnit').innerHTML='<option value="'+unit.id+'">x</option>';$('#bkUnit').value=unit.id;
  $('#bkDeposit').value='0';$('#bkNote').value='';
  bookSave();if($('#cfmGo'))$('#cfmGo').onclick();
  dbUp=realUp;
  const custUp=UP.find(x=>x.t==='customer');
  check(!!UP.find(x=>x.t==='booking'),'[8] จองไม่สำเร็จ ชุดตรวจนี้จึงพิสูจน์อะไรไม่ได้');
  check(!!custUp,'[8] จองแล้วไม่ได้อัปเดตลูกค้าเลย');
  check(custUp&&!('owner_id' in custUp.b),'[8] โฟลว์จองยังแนบ owner_id ทับเจ้าของลูกค้า (regression 97fe84c)');
  check(walkin.ownerId==='','[8] การจองเปลี่ยนเจ้าของลูกค้าในหน้าจอ');
  return failures;
 });

 console.log(result.length?'FAILS:\n'+result.join('\n'):'ALL_CHECKS_PASS (owner-r61: 8 กลุ่ม)');
 console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'NO_PAGE_ERRORS');
 await b.close();process.exit(result.length||errors.length?1:0);
})().catch(e=>{console.error('SUITE_CRASH',e);process.exit(2);});
