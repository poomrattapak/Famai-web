/* เก็บแถวจากทุกหน้าผ่านปุ่มจริง เพื่อให้ด่านเดิมยังตรวจข้อมูลครบโดยไม่เปิดทางลัดในแอป */
exports.installPages = async p => p.evaluate(() => {
 window.qaPageRows=(id,selector)=>{
  if(LIST_PAGES[id])pageGo(id,1);
  const rows=[];let visited=0;
  do{
   rows.push(...document.querySelectorAll(selector));
   const next=document.querySelector('[data-list="'+id+'"] [data-next]');
   if(!next||next.disabled)break;
   if(++visited>1000)throw Error('เลขหน้าไม่สิ้นสุด '+id);
   next.click();
  }while(true);
  if(LIST_PAGES[id])pageGo(id,1);
  return rows;
 };
});
