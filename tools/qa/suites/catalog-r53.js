/* เจ้าของ: หารูปรถจริงมาแทน mockup โดยเช็กรุ่นและสีให้ตรงกัน
   ตรวจรูปจริงครบ ตารางจับคู่ไม่รั่วข้ามสี/ปี รูปอัปโหลดมาก่อน และรูปโหลดได้ในเบราว์เซอร์ */
const {chromium,EXE,BASE}=require('./env');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sources=require('../../../assets/motorcycles/sources.json');
(async()=>{
  assert.equal(sources.images.length,35);
  for(const row of sources.images)assert.ok(fs.existsSync(row.path),row.path);
  const b=await chromium.launch({executablePath:EXE});
  try{
    const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(BASE+'/index.html');
    await p.click('#lgUsers [data-id="ST1"]');await p.click('#lgGo');
    const result=await p.evaluate(async rows=>{
      const fails=[],check=(yes,msg)=>{if(!yes)fails.push(msg);};
      for(const row of rows){
        const box=document.createElement('div');box.innerHTML=bikeArt(row.variant,row.color,row.colorCode);
        const img=box.querySelector('img');
        check(img?.getAttribute('src')===row.path,'[1] ผิดรุ่น/สี '+row.variant+'/'+row.colorCode);
        if(img){img.loading='eager';await img.decode().catch(()=>fails.push('[2] โหลดรูปไม่ได้ '+row.path));
          check(img.naturalWidth>=500,'[2] รูปเล็กหรือไฟล์เสีย '+row.path);}
      }
      for(const u of UNITS)check(/<img/.test(bikeArt(u.variant,u.color,u.colorCode)),'[3] รถในสต๊อกยังไม่มีรูป '+u.variant+'/'+u.colorCode);
      check(/<svg/.test(bikeArt('BTF200','ชมพู','010D')),'[4] ชื่อสีไม่ตรงแต่ได้รูปจริง');
      check(/<svg/.test(bikeArt('BTF200','ดำ','UNKNOWN')),'[4] รหัสสีไม่รู้จักแต่ได้รูปจริง');
      check(/<svg/.test(bikeArt('UNKNOWN','ดำ','010D')),'[4] ใช้รูปข้ามรุ่น');
      const before=JSON.stringify(PRICE.BTF200),pr=PRICE.BTF200;
      try{
        pr.yr=2568;check(/<svg/.test(bikeArt('BTF200','ดำ','010D')),'[5] ใช้รูปข้ามปี');
        pr.yr=2569;pr.c['010D'].name='ชมพู';
        check(/<svg/.test(bikeArt('BTF200','ชมพู','010D')),'[5] เปลี่ยนสีแล้วยังใช้รูปเดิม');
        pr.c['010D'].name='ดำ';pr.c['010D'].img='data:image/png;base64,AAAA';
        check(bikeArt('BTF200','ดำ','010D').includes('data:image'),'[6] รูปอัปโหลดไม่ชนะภาพแคตตาล็อก');
        pr.c['010D'].imgUrl='https://example.test/owner.webp';
        check(bikeArt('BTF200','ดำ','010D').includes('owner.webp'),'[6] รูปถาวรไม่ชนะภาพในเซสชัน');
      }finally{PRICE.BTF200=JSON.parse(before);}
      const pub=pubModel('BTF200');check(pub.colors.every(c=>c.photo&&c.photo.includes('BTF200-'+c.code)), '[7] รูปส่งออกไม่ตรงสี');
      return fails;
    },sources.images);
    assert.deepEqual(result,[]);assert.deepEqual(errors,[]);
    console.log('ผ่าน 7 ข้อ · 35 ภาพ · รถสต๊อกครบ · รูปไม่ข้ามรุ่น/สี/ปี');
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
