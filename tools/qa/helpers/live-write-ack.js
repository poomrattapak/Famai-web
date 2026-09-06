/* จำลองเฉพาะคำตอบยืนยันของฐานสำหรับชุดตรวจที่มีตัวเก็บคำขออยู่แล้ว
   ฐานจริงตอบ return=representation และ create_sale_bundle; คืน {} จะทำให้แอปปฏิเสธถูกต้อง
   แต่ชุดเก่าจะไปอ่านแถวสาธิตใบสุดท้ายแทนใบที่ทดสอบ โดยไม่รู้ว่าการบันทึกไม่เคยสำเร็จ */
function installLiveWriteAck(){
  const previous=sbFetch,autoTasks=new Map();
  sbFetch=async(path,opt)=>{
    const result=await previous(path,opt),method=opt&&opt.method||'GET',body=opt&&opt.body?JSON.parse(opt.body):null;
    if(method==='GET'&&path.includes('/follow_up_task?')&&path.includes('task_source=eq.delivery_month')){
      const id=new URLSearchParams(path.split('?')[1]).get('sale_id').replace(/^eq\./,'');
      return autoTasks.has(id)?[autoTasks.get(id)]:[];
    }
    if(method==='POST'&&path.includes('/rpc/create_sale_bundle'))return {sale:{...body.p_sale},registration:{...body.p_registration}};
    if(method==='POST'&&/^\/rest\/v1\/(customer|finance_case)(\?|$)/.test(path))return [{...body,created_at:punchNow().toISOString(),updated_at:punchNow().toISOString()}];
    if(method==='PATCH'&&path.includes('/registration?')&&body.delivered_at){
      const id=new URLSearchParams(path.split('?')[1]).get('id').replace(/^eq\./,'');
      const r=REGS.find(x=>x.id===id);
      if(r&&!autoTasks.has(r.saleId))autoTasks.set(r.saleId,{id:uuid4(),sale_id:r.saleId,customer_id:SALES.find(s=>s.id===r.saleId).custId,
        task_source:'delivery_month',title:'ติดตาม 1 เดือนหลังส่งมอบ',due_at:careMonthDate(body.delivered_at),done_at:null,note:null});
    }
    if(method==='PATCH'&&String(opt&&opt.headers&&opt.headers.Prefer||'').includes('return=representation'))return [{...body}];
    return result;
  };
}
module.exports={installLiveWriteAck};
