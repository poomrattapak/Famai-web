/* ============================================================================
   common.js — ของกลางที่ทั้ง 10 แบบใช้ร่วมกัน

   หลักการ: **โครงเหมือนกันหมด สไตล์ต่างกันหมด**
   - รายชื่อคนสร้างจาก renderStaff() ตัวเดียว  ⇒ สัญญา .lg-u[data-id] ครบ 10 เรียง ST1..ST10
     และตัวแรกมีคลาส on ตั้งแต่วาด จะไม่มีวันหลุด ไม่ว่าแบบไหนจะจัดหน้ายังไง
   - หน้าแรกวาดจาก renderDash() ตัวเดียว ปล่อยคลาสคงที่ .dsh-* ให้แต่ละแบบเขียน CSS เอง
     ⇒ 10 หน้าแรก ราคาเท่ากับ 1 + สไตล์ชีต 10 ชุด และเจ้าของเทียบดีไซน์ ไม่ใช่เทียบเนื้อหา
   - contract() ตรวจสัญญาให้ทันทีที่เปิดหน้า ⇒ รู้ตั้งแต่ตอนเขียนว่าแบบนี้หลุดข้อไหน
     ไม่ต้องรอตรวจรอบใหญ่ตอนท้าย
   ============================================================================ */

const $  = (s,r)=> (r||document).querySelector(s);
const $$ = (s,r)=> [...(r||document).querySelectorAll(s)];
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const B  = n => (n==null||isNaN(n))? '—' : Number(n).toLocaleString('en-US');
const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
/* วันที่ พ.ศ. เสมอ — กฎข้อ 6 ของโปรเจกต์ */
function thDate(iso){ const d=new Date(iso+'T00:00:00');
  return d.getDate()+' '+TH_M[d.getMonth()]+' '+(d.getFullYear()+543); }
function thShort(iso){ const d=new Date(iso+'T00:00:00'); return d.getDate()+'/'+(d.getMonth()+1); }

/* อักษรย่อในวงกลม — ยกจาก index.html:3094
   ไทยมีสระนำหน้า (เ แ โ ใ ไ) ตัวเดียวอ่านไม่ออก "เอก ช่างดี" ต้องได้ "เอ" ไม่ใช่ "เ" */
function lgInit(n){ return /^[เ-ไ]/.test(n) ? n.slice(0,2) : n.slice(0,1); }

/* ---------------------------------------------------------------- ไอคอน
   12 ตัวจาก 47 ตัวของแอปจริง เส้น 1.5px มุมมน currentColor — ไม่มีอิโมจิเด็ดขาด */
const ICONS = {
  bike:'<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17h5l4-8h-3M14 9l2.5 8M9 9h5"/>',
  cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.2 2.7-4.9 6-4.9s6 1.7 6 4.9"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18 19c0-2.4-.9-3.9-2.3-4.6"/>',
  lock:'<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  key:'<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15.5 12v2"/>',
  arrow:'<path d="M5 12h13M13 7l5 5-5 5"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  chart:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12.5 16V8M17 16v-6"/>',
  wrench:'<path d="M15.5 3.5a5 5 0 00-6.2 6.7L3.7 15.8a2 2 0 102.8 2.8l5.6-5.6a5 5 0 006.7-6.2L16 9.3 13.5 8 12.2 5.5z"/>',
  left:'<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  right:'<path d="M9.5 5.5L16 12l-6.5 6.5"/>'
};
const ic = (n,c)=> '<svg class="'+(c||'i')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[n]||'')+'</svg>';

/* ---------------------------------------------------------------- รายชื่อคน
   tpl(s,i) คืน HTML "ข้างใน" ปุ่ม — แต่ละแบบเขียนเอง
   แต่ตัวปุ่ม (คลาส lg-u · data-id · ลำดับ · ตัวแรกมี on) สร้างที่นี่ที่เดียว ห้ามแบบไหนเขียนเอง */
let onPick = null, STAFF_TPL = null;
function mountStaff(tpl){ if(tpl) STAFF_TPL=tpl; renderStaff($('#lgUsers'), STAFF_TPL); }
function renderStaff(host, tpl){
  host.innerHTML = S.map((s,i)=>
    '<button type="button" class="lg-u'+(i===0?' on':'')+'" data-id="'+s.id+'">'+tpl(s,i)+'</button>').join('');
  $$('.lg-u', host).forEach(b=> b.onclick=()=>{
    $$('.lg-u', host).forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); if(onPick) onPick(b);
  });
  if(typeof afterStaff==='function') afterStaff();
}
const staffLine = s => ROLE[s.role]+' · '+BR[s.branch].name;   /* ต้องมีคำว่า "สต๊อก" อยู่ในนี้ */
const picked = () => S.find(s=>s.id===($('#lgUsers .lg-u.on')||{dataset:{}}).dataset.id) || S[0];

/* ---------------------------------------------------------------- หน้าแรก
   คลาสคงที่: .dsh .dsh-hd .dsh-grid .dsh-c .dsh-lab .dsh-val .dsh-sub .dsh-wide
              .dsh-bars .dsh-bar .dsh-rows .dsh-row .dsh-meter .dsh-mfill .dsh-dot
   แต่ละแบบเขียน CSS ให้คลาสชุดนี้ ไม่ต้องแตะโครง */
function renderDash(host, who){
  const k=D.kpi, days=Object.keys(D.byDay).sort(), mx=Math.max(...Object.values(D.byDay));
  const bars = days.map(d=>'<div class="dsh-bar" style="--h:'+Math.round(D.byDay[d]/mx*100)+'%">'
    +'<i></i><span>'+thShort(d)+'</span></div>').join('');
  const kpi = (lab,val,unit,sub,tone)=>'<div class="dsh-c'+(tone?' t-'+tone:'')+'">'
    +'<div class="dsh-lab">'+esc(lab)+'</div>'
    +'<div class="dsh-val">'+val+(unit?'<small>'+unit+'</small>':'')+'</div>'
    +'<div class="dsh-sub">'+sub+'</div></div>';
  const brMax = Math.max(...Object.values(D.stockBr));
  host.innerHTML =
    '<div class="dsh">'
    + '<div class="dsh-hd">'
      + '<div><b>หน้าแรก</b><span>'+esc(D.period.text)+' · ทุกสาขาที่เห็นได้</span></div>'
      + '<div class="dsh-me"><span>'+esc(who.name)+' · '+esc(ROLE[who.role])+'</span>'
      + '<button type="button" id="btnOut" class="dsh-out">ออกจากระบบ</button></div>'
    + '</div>'
    + '<div class="dsh-grid">'
      + kpi('รถพร้อมขาย', B(k.stock), 'คัน', 'ทุนจม '+B(k.cost)+' ฿')
      + kpi('ขายได้ในช่วงนี้', B(k.sold), 'คัน', '30 วัน · ก่อนหน้า '+B(k.prevSold)+' คัน', 'pos')
      + kpi('ยอดขายรวม', B(k.rev), '฿', 'เฉลี่ย '+B(Math.round(k.rev/k.sold))+' ฿/คัน')
      + kpi('กำไรขั้นต้น', B(k.gp), '฿', Math.round(k.gp/k.rev*100)+'% ของยอดขาย')
      + kpi('ค้างเกิน '+D.aging+' วัน', B(k.stuck), 'คัน', 'ทุนจม 647,300 ฿', 'attn')
      + kpi('เงินค้างรับ', B(k.ar), '฿', k.arN+' ราย', 'attn')
    + '</div>'
    + '<div class="dsh-c dsh-wide"><div class="dsh-lab">ยอดขายรายวัน</div>'
      + '<div class="dsh-bars">'+bars+'</div></div>'
    + '<div class="dsh-c dsh-wide"><div class="dsh-lab">งานทะเบียนที่ลูกค้ายังรอป้าย · '+k.regWait+' คัน</div>'
      + '<div class="dsh-rows">'+ D.todo.slice(0,4).map(t=>
          '<div class="dsh-row"><span class="dsh-dot"></span><b>'+esc(t.cust)+'</b>'
          +'<span>'+esc(t.stage)+'</span><em>ครบกำหนด '+thDate(t.due)+'</em></div>').join('')
      + '</div></div>'
    + '<div class="dsh-c dsh-wide"><div class="dsh-lab">รถพร้อมขายตามสาขา</div>'
      + '<div class="dsh-rows">'+ D.branches.map(b=>
          '<div class="dsh-row"><b>'+esc(b)+'</b>'
          +'<span class="dsh-meter"><i class="dsh-mfill" style="width:'+Math.round(D.stockBr[b]/brMax*100)+'%"></i></span>'
          +'<em>'+D.stockBr[b]+' คัน</em></div>').join('')
      + '</div></div>'
    + (typeof dashExtra==='function' ? dashExtra(D) : '')
    + '</div>';
  $('#btnOut').onclick = logout;
}

/* ---------------------------------------------------------------- เข้า/ออก
   ใช้กลไกเดียวกับแอปจริงเป๊ะ: #login รับคลาส .off · #app ถอด .off
   ด่านจริง (login-r27 [3][5], privacy-r5) ตรวจแบบนี้ — mock จึงพิสูจน์ได้ว่าดีไซน์นี้พอร์ตได้ */
function login(who){
  $('#login').classList.add('off');
  $('#app').classList.remove('off');
  renderDash($('#app'), who);
  window.scrollTo(0,0);
}
function logout(){
  $('#app').classList.add('off');
  $('#login').classList.remove('off');
  $('#app').innerHTML='';
  swapMode(false);
  mountStaff();                 /* คืนค่า ST1 ถูกเลือกเหมือนเปิดใหม่ */
  window.scrollTo(0,0);
}
/* สลับโหมด — ต้องซ่อนด้วย display:none ให้ offsetParent เป็น null จริง
   (opacity:0 / visibility:hidden ใช้ไม่ได้ ด่าน login-r27 [4] ตรวจ offsetParent) */
function swapMode(toLive){
  $('#lgLive').style.display = toLive? '' : 'none';
  $('#lgDemo').style.display = toLive? 'none' : '';
  $('#lgSwap').textContent  = toLive? 'กลับไปโหมดสาธิต' : 'ใช้ข้อมูลจริงจากฐานข้อมูล';
  if(typeof afterSwap==='function') afterSwap(toLive);
}
function wireLogin(){
  $('#lgGo').onclick  = ()=> login(picked());
  $('#lgGo2').onclick = ()=>{
    const em=$('#lgEmail').value.trim(), pw=$('#lgPw2').value;
    if(!em||!pw){ note('กรอกอีเมลและรหัสผ่านก่อน'); return; }
    login({name:em.split('@')[0], role:'admin'});
  };
  $('#lgSwap').onclick = ()=> swapMode($('#lgLive').style.display==='none');
  $('#lgPw2').onkeydown = e=>{ if(e.key==='Enter') $('#lgGo2').click(); };
  swapMode(false);
}
/* ข้อความเตือนบนหน้าตัวอย่าง — ของจริงใช้ toast() ของแอป */
function note(msg){
  let n=$('#lgNote'); if(!n){ n=document.createElement('div'); n.id='lgNote'; document.body.appendChild(n); }
  n.textContent=msg; n.className='on'; clearTimeout(n._t); n._t=setTimeout(()=>n.className='',2600);
}

/* ---------------------------------------------------------------- ธีมมืด
   ตัดสินใจใน <head> ของทุกไฟล์ (สคริปต์บรรทัดเดียว) เพื่อไม่ให้จอกะพริบขาวก่อนเป็นมืด
   ผลคือแต่ละไฟล์เขียนบล็อกสีมืดแค่ชุดเดียว (html[data-theme="dark"]) ไม่ต้องเขียนซ้ำใน media query */
function setTheme(t){
  if(t) document.documentElement.dataset.theme='dark';
  else  document.documentElement.removeAttribute('data-theme');
  try{ localStorage.setItem('famai_login_dark', t?'1':'0'); }catch(e){}
}

/* ---------------------------------------------------------------- แถบสลับแบบ
   ลอยอยู่ล่างจอ ไม่แตะเลย์เอาต์ของแบบ (position:fixed จึงไม่ดัน scrollWidth)
   ?bare=1 = ซ่อน ใช้ตอนถ่ายสกรีนช็อต */
const BARE = new URLSearchParams(location.search).has('bare');
function switcher(cur){
  if(BARE) return;
  const el=document.createElement('div'); el.id='sw';
  el.innerHTML = '<a href="index.html" title="สารบัญ">สารบัญ</a>'
    + '<span class="sw-n">'+ Array.from({length:10},(_,i)=>i+1).map(n=>
        n===cur? '<b>'+n+'</b>' : '<a href="'+n+'.html">'+n+'</a>').join('') +'</span>'
    + '<button type="button" id="swView">หน้าแรก</button>'
    + '<button type="button" id="swDark">มืด</button>';
  document.body.appendChild(el);
  $('#swDark').onclick=()=> setTheme(!document.documentElement.dataset.theme);
  $('#swView').onclick=()=>{
    if($('#login').classList.contains('off')) logout();
    else login(picked());
    $('#swView').textContent = $('#login').classList.contains('off')? 'หน้าล็อกอิน' : 'หน้าแรก';
  };
}

/* ---------------------------------------------------------------- ตรวจสัญญา
   ทุกแบบเรียกตอนโหลด — สัญญาชุดนี้คือสิ่งที่ทำให้ "รื้อดีไซน์แล้วแก้ด่าน 0 ชุด" เป็นจริง
   ที่มาของแต่ละข้ออยู่ใน tools/qa/suites/login-r27.js และ smoke-r2.js */
function contract(){
  const f=[], us=$$('#lgUsers .lg-u');
  if(us.length!==10) f.push('ต้องมีปุ่มคน 10 ตัว ได้ '+us.length);
  us.forEach((b,i)=>{ if(b.dataset.id!=='ST'+(i+1)) f.push('ลำดับเพี้ยนที่ตัวที่ '+(i+1)+' ได้ '+b.dataset.id); });
  const on=$$('#lgUsers .lg-u.on');
  if(on.length!==1) f.push('ต้องมีตัวที่เลือกไว้ตัวเดียว ได้ '+on.length);
  else if(on[0]!==us[0]) f.push('ตัวที่ถูกเลือกไว้ต้องเป็นตัวแรก (ST1)');
  ['#login','#app','#lgDemo','#lgLive','#lgUsers','#lgGo','#lgGo2','#lgSwap','#lgEmail','#lgPw2']
    .forEach(s=>{ if(!$(s)) f.push('ไม่มี '+s); });
  const txt = us.map(b=>b.textContent).join(' ');
  if(txt.indexOf('บัญชี')<0) f.push('ข้อความในการ์ดต้องมีคำว่า "บัญชี" (smoke-r2 ค้นจากชื่อ ST7)');
  if(txt.indexOf('สต๊อก')<0) f.push('ข้อความในการ์ดต้องมีคำว่า "สต๊อก" (smoke-r2 ค้นจากชื่อบทบาท)');
  if(us[0] && us[0].textContent.trim().length<6) f.push('การ์ดใบแรกมีตัวอักษรน้อยกว่า 6 ตัว');
  window.__contract = f;
  if(f.length) console.error('สัญญาหลุด:', f); else console.log('สัญญาครบ ✓');
  if(!BARE){
    const el=document.createElement('div'); el.id='ct'; el.className=f.length?'bad':'';
    el.textContent = f.length? ('สัญญาหลุด '+f.length+' ข้อ') : 'สัญญาครบ';
    el.title = f.join(' · '); document.body.appendChild(el);
  }
}

/* ---------------------------------------------------------------- เปลือกของแกลเลอรี
   แถบสลับ / ป้ายสัญญา / ข้อความเตือน — จงใจทำให้หน้าตา "ไม่เข้ากับ" ดีไซน์ใด ๆ
   จะได้ไม่มีใครเผลอตัดสินดีไซน์จากเปลือกนี้ · ทุกชิ้น position:fixed จึงไม่ดัน scrollWidth */
function chrome(){
  if(BARE) return;
  const st=document.createElement('style');
  st.textContent = `
#sw,#ct,#lgNote{ font-family:ui-sans-serif,system-ui,sans-serif; font-size:12px; z-index:9999; }
#sw{ position:fixed; left:50%; transform:translateX(-50%); bottom:10px; display:flex; align-items:center;
  gap:6px; max-width:calc(100vw - 16px); padding:5px 8px; border-radius:999px; color:#F3F4F6;
  background:rgba(17,19,23,.92); box-shadow:0 6px 24px rgba(0,0,0,.32); backdrop-filter:blur(6px);
  overflow-x:auto; scrollbar-width:none; }
#sw::-webkit-scrollbar{ display:none; }
#sw>*{ flex:0 0 auto; }
#sw a,#sw b,#sw button{ color:inherit; font:inherit; text-decoration:none; border:0; background:none;
  padding:4px 7px; border-radius:999px; cursor:pointer; white-space:nowrap; }
#sw .sw-n{ display:flex; gap:1px; border-left:1px solid rgba(255,255,255,.22);
  border-right:1px solid rgba(255,255,255,.22); padding:0 4px; margin:0 2px; }
#sw .sw-n a,#sw .sw-n b{ padding:4px 6px; min-width:22px; text-align:center; }
#sw b{ background:#F3F4F6; color:#111317; font-weight:600; }
#sw a:hover,#sw button:hover{ background:rgba(255,255,255,.16); }
#ct{ position:fixed; right:10px; top:10px; padding:3px 9px; border-radius:999px;
  background:rgba(31,122,77,.92); color:#fff; }
#ct.bad{ background:rgba(191,32,42,.95); }
#lgNote{ position:fixed; left:50%; transform:translate(-50%,-14px); top:14px; padding:9px 15px;
  border-radius:10px; background:rgba(17,19,23,.94); color:#fff; opacity:0; pointer-events:none;
  transition:opacity .2s, transform .2s; }
#lgNote.on{ opacity:1; transform:translate(-50%,0); }
@media print{ #sw,#ct,#lgNote{ display:none; } }`;
  document.head.appendChild(st);
}

/* เรียกท้ายทุกไฟล์ */
function boot(n){ chrome(); wireLogin(); switcher(n); contract(); }
