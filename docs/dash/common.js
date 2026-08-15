/* ตัวช่วยที่ใช้ร่วมกันทั้ง 6 แบบ — ไม่มีไลบรารีนอก กราฟทุกตัววาดด้วย SVG ตรง ๆ
   เจ้าของสั่ง: "กราฟทุกกราฟ อยากให้ดูมีความโค้งมน ไม่เอาแบบหยักหรือเหลี่ยม"
   → เส้นใช้เบซิเยร์ (curvePath) · วงแหวนปลายมน (ringArc/ringGauge) · แท่งใช้ CSS border-radius ในแต่ละหน้า */
const B = n => Number(n||0).toLocaleString('th-TH');
const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const thDate = s => { const d=String(s||'').split('-'); return d.length<3? '' : (+d[2])+' '+TH_M[+d[1]-1]+' '+(+d[0]+543); };
const thShort = s => { const d=String(s||'').split('-'); return d.length<3? '' : (+d[2])+' '+TH_M[+d[1]-1]; };
const pct = (a,b) => b? Math.round((a-b)/b*100) : 0;
const dayList = (from,to) => { const out=[]; const d=new Date(from+'T00:00:00'), e=new Date(to+'T00:00:00');
  while(d<=e){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); } return out; };

/* ---------- เส้นโค้ง ----------
   Catmull-Rom → เบซิเยร์ลูกบาศก์: เส้นลอดทุกจุดจริงแต่ไม่มีมุมหัก
   หนีบค่า y ไม่ให้จุดคุมโค้งทะลุขอบบน-ล่าง (ไม่งั้นช่วงที่ขึ้นชันจะแอ่นเกินกรอบ) */
function curvePath(vals, w, h, pad, tension){
  pad = pad || 0; tension = tension==null? 0.5 : tension;
  const max = Math.max(1, ...vals);
  const lo = pad, hi = h - pad;
  const step = vals.length>1 ? (w-pad*2)/(vals.length-1) : 0;
  const pts = vals.map((v,i)=>[pad+i*step, hi-(v/max)*(hi-lo)]);
  const cl = y => Math.min(hi, Math.max(lo, y));
  let line = 'M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
    const c1=[p1[0]+(p2[0]-p0[0])/6*tension, cl(p1[1]+(p2[1]-p0[1])/6*tension)];
    const c2=[p2[0]-(p3[0]-p1[0])/6*tension, cl(p2[1]-(p3[1]-p1[1])/6*tension)];
    line += ' C'+c1[0].toFixed(1)+' '+c1[1].toFixed(1)+', '+c2[0].toFixed(1)+' '+c2[1].toFixed(1)
          + ', '+p2[0].toFixed(1)+' '+p2[1].toFixed(1);
  }
  const area = line+' L'+pts[pts.length-1][0].toFixed(1)+' '+hi+' L'+pts[0][0].toFixed(1)+' '+hi+' Z';
  return {line, area, pts, max};
}
/* ---------- ส่วนโค้งของวงแหวน ----------
   วาดด้วย stroke-dasharray บนวงกลม r=15.9155 (เส้นรอบวง = 100) ปลายมนด้วย stroke-linecap
   gap เว้นช่องว่างท้ายส่วนโค้งเล็กน้อย ไม่ให้ปลายมนของสองสีทับกัน */
function ringArc(fromPct, toPct, color, width, gap){
  const C = 2*Math.PI*15.9155;
  const len = Math.max(0, (toPct-fromPct)/100*C - (gap==null?1.2:gap));
  if(len<=0) return '';
  return '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="'+color+'"'
    + ' stroke-width="'+(width||7)+'" stroke-linecap="round"'
    + ' stroke-dasharray="'+len.toFixed(2)+' '+C.toFixed(2)+'"'
    + ' stroke-dashoffset="'+(-(fromPct/100*C)).toFixed(2)+'" transform="rotate(-90 21 21)"/>';
}
/* วงแหวนความคืบหน้าวงเดียว (ราง + ส่วนที่ทำได้) */
function ringGauge(p, color, track, width){
  return ringArc(0, 100, track, width, 0) + ringArc(0, Math.max(0,Math.min(100,p)), color, width);
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
  const items = [['1','ตั้งต้น'],['2','เน้นเงิน'],['3','เน้นงานค้าง'],
                 ['4','เน้นสต๊อก'],['5','มืดเรืองแสง'],['6','อ่านง่าย']];
  return '<nav class="switch"><a class="home" href="./">ทั้ง 6 แบบ</a>'
    + items.map(([n,t])=>'<a href="'+n+'.html" class="'+(n===cur?'on':'')+'">'+n+'. '+t+'</a>').join('')
    + '<button class="tg" data-theme-toggle aria-label="สลับโหมดมืด">◐</button></nav>';
}
