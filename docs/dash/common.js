/* ตัวช่วยที่ใช้ร่วมกันทั้ง 5 แบบ — ไม่มีไลบรารีนอก กราฟทุกตัววาดด้วย SVG ตรง ๆ */
const B = n => Number(n||0).toLocaleString('th-TH');
const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thDate = s => { const d=String(s||'').split('-'); return d.length<3? '' : (+d[2])+' '+TH_M[+d[1]-1]+' '+(+d[0]+543); };
const thShort = s => { const d=String(s||'').split('-'); return d.length<3? '' : (+d[2])+' '+TH_M[+d[1]-1]; };
const pct = (a,b) => b? Math.round((a-b)/b*100) : 0;
const dayList = (from,to) => { const out=[]; const d=new Date(from+'T00:00:00'), e=new Date(to+'T00:00:00');
  while(d<=e){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); } return out; };

/* เส้นกราฟจากชุดค่า — คืน path ของเส้นและของพื้นที่ใต้เส้น */
function linePath(vals, w, h, pad){
  pad = pad || 0;
  const max = Math.max(1, ...vals);
  const step = vals.length>1 ? (w-pad*2)/(vals.length-1) : 0;
  const pts = vals.map((v,i)=>[pad+i*step, h-pad-(v/max)*(h-pad*2)]);
  const line = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area = line+' L'+(pad+(vals.length-1)*step).toFixed(1)+' '+(h-pad)+' L'+pad+' '+(h-pad)+' Z';
  return {line, area, pts, max};
}
/* ยอดขายรายวันเติมวันที่ไม่มีขายให้เป็น 0 — กราฟจะได้ไม่โกหกเรื่องช่วงเวลา */
function daily(){
  return dayList(D.period.from, D.period.to).map(d=>({d, v: D.byDay[d]||0}));
}
function setTheme(){
  const t = localStorage.getItem('famai_dash_theme');
  if(t) document.documentElement.dataset.theme = t;
  const btn = document.querySelector('[data-theme-toggle]');
  if(btn) btn.onclick = ()=>{
    const now = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches? 'dark':'light');
    const next = now==='dark'? 'light':'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('famai_dash_theme', next);
  };
}
/* แถบเลือกแบบ — ทุกหน้ามีเหมือนกัน กดสลับดูได้โดยไม่ต้องกลับหน้าสารบัญ */
function switcher(cur){
  const items = [['1','ห้องควบคุม'],['2','สรุปผู้บริหาร'],['3','เบนโตะ'],['4','กระดานงาน'],['5','วิเคราะห์']];
  return '<nav class="switch"><a class="home" href="./">ทั้ง 5 แบบ</a>'
    + items.map(([n,t])=>'<a href="'+n+'.html" class="'+(n===cur?'on':'')+'">'+n+'. '+t+'</a>').join('')
    + '<button class="tg" data-theme-toggle aria-label="สลับโหมดมืด">◐</button></nav>';
}
