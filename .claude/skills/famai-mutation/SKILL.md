---
name: famai-mutation
description: "พิสูจน์ว่าด่านตรวจแดงได้จริง — mutation ของโปรเจกต์นี้. ใช้เมื่อ mutation แล้วด่านยังเขียว, เขียนด่านใหม่ใน tools/qa/suites แล้วจะพิสูจน์, สงสัยว่าด่านอ่อน, หรือจะแก้ด่านเดิมที่สัญญาเปลี่ยนตามคำสั่งเจ้าของ"
---

# ด่านที่แดงไม่ได้ ไม่ใช่ด่าน

กฎอยู่ใน `.claude/CLAUDE.md` แล้ว — ไฟล์นี้ตอบคำถามถัดไป: **ถอด guard แล้วทำไมมันยังเขียว**
ทุกข้อข้างล่างเจอมาแล้วจริงในแอปตัวนี้ ไม่ใช่ทฤษฎี

## ตัวรัน — ก็อปแล้วแก้ MUTS

เขียนลง scratchpad ไม่ใช่ใน repo · หนึ่งไฟล์ต่อหนึ่งด่าน · แก้ทีละตัวแล้วคืนไฟล์ทุกครั้ง

```python
import subprocess, shutil, sys, io
SRC='/home/user/Famai-web/index.html'
BAK='<scratchpad>/index.<ชื่อด่าน>.bak'
shutil.copy(SRC, BAK)

MUTS=[                      # (ชื่อข้อที่ต้องแดง, ข้อความเดิม, ข้อความใหม่)
 ("[1] ...", "โค้ดจริงบรรทัดเดียวที่ทำให้ข้อ 1 ผ่าน", "โค้ดที่ถอดความสามารถนั้นออก"),
]
ok=True
for name, old, new in MUTS:
    src=io.open(BAK, encoding='utf-8').read()
    if src.count(old)!=1:                       # ไม่เจอ/เจอหลายที่ = mutation ใช้ไม่ได้ ต้องรู้ทันที
        print(f'[{name}] target เจอ {src.count(old)} ที่'); ok=False; continue
    io.open(SRC,'w',encoding='utf-8').write(src.replace(old,new))
    r=subprocess.run(['node','tools/qa/suites/<ชื่อด่าน>.js'], cwd='/home/user/Famai-web',
                     capture_output=True, text=True, timeout=400)
    line=next((l for l in r.stdout.splitlines() if l.startswith('[')),'')
    print(f'[{name}] {"แดงตามคาด" if r.returncode else "ยังเขียว (เทสต์อ่อน!)"} — {line[:110]}')
    if not r.returncode: ok=False
    shutil.copy(BAK, SRC)
shutil.copy(BAK, SRC)
r=subprocess.run(['node','tools/qa/suites/<ชื่อด่าน>.js'], cwd='/home/user/Famai-web',
                 capture_output=True, text=True, timeout=400)
print('คืนไฟล์แล้ว:', 'เขียว' if r.returncode==0 else 'แดง!')
sys.exit(0 if ok and r.returncode==0 else 1)
```

**อ่านบรรทัดที่มันแดง ไม่ใช่แค่ดูว่าแดง** — mutation ข้อ 3 ที่ไปทำข้อ 5 แดง แปลว่าข้อ 3 ยังไม่ถูกพิสูจน์
เสร็จแล้วต้องจบด้วย "คืนไฟล์แล้ว: เขียว" ทุกครั้ง ไม่งั้นมีของค้างอยู่ในไฟล์จริง

## ยังเขียว — ไล่เจ็ดข้อนี้ตามลำดับ

**1 · ด่าน crash แทนที่จะ fail**
`page.click('[data-pop="reg"]')` บนของที่ถูก mutation ลบไป → Playwright timeout 30 วิ แล้ว throw
ออกจาก process ทางอื่น ข้อความ `FAILS:` ไม่เคยถูกพิมพ์ · เช็คว่ามีของก่อนแตะเสมอ
`const el = await p.$(sel); if(!el){ fails.push('...'); } else { ... }`

**2 · ถือ element ข้ามการวาดใหม่**
ปฏิทินวาดใหม่ทุกครั้งที่กด — ตัวแปรที่เก็บปุ่มไว้กลายเป็น node ที่หลุดจาก DOM คลิกแล้วไม่มีอะไรเกิด
ค้นสดทุกครั้ง: `const hit = ds => cal.querySelector('[data-prd="'+ds+'"]').click();`

**3 · assert ผ่านฟังก์ชันที่ normalize ให้แล้ว**
`perOf()` สลับวันกลับด้านให้ตอน**อ่าน** — ถอดการสลับออกจากปฏิทินแล้ว `dPeriod()` ก็ยังถูก
ต้อง assert ที่จุดดิบ: ค่าใน `[data-pf]/[data-pt]` และจำนวน `.cday.in` ที่ถูกไฮไลต์

**4 · mutate ผิดชั้น (CSS ทั้งที่ JS เป็นคนคุม)**
"มือถือ 1 เดือน" คุมด้วย `innerWidth>600` ใน JS ไม่ใช่ media query — แก้ CSS ยังไงก็ไม่ขยับ
ก่อน mutate ให้หาว่า**ใครเป็นคนตัดสิน** แล้ว mutate ชั้นนั้น

**5 · ของล้นถูก overflow กลืน**
`#login{overflow-y:auto}` ทำให้แกน x กลายเป็น `auto` และ `.lg-wrap{overflow:hidden}` ตัดทิ้งเงียบ ๆ
`scrollWidth` จึงไม่โต · วัดขอบขวาจริงแทน:
`[...document.querySelectorAll('#login *')].filter(e=>e.getBoundingClientRect().right > innerWidth+1)`
(`nohscroll` สแกนแค่ใน `#app` — หน้า login ไม่เคยถูกสแกน)

**6 · ทางอื่นรีเซ็ต state ให้ก่อนด่านจะทัน**
ปิดแผ่นที่ 390 ด้วย `mouse.click(10,830)` → จุดนั้นคือแถบล่าง → เปลี่ยนหน้า → `render()` → `navBrSync()`
ล้างของค้างให้เอง ด่านเลยมองไม่เห็นว่าโค้ด "คืนค่า" ทำงานไหม · ปิดด้วย `keyboard.press('Escape')`
หลักทั่วไป: การกระทำที่ใช้ปิด/ยกเลิก ต้องไม่พาไปสู่การวาดใหม่

**7 · mutation ไม่ตรงกับความสามารถที่ข้อนั้นอ้าง**
`delete host.dataset.dirty` ไม่ได้หยุดช่วงเวลาไม่ให้ถูกใช้ เพราะ state ถูกเขียนไปตั้งแต่ตอนเลือกแล้ว
ถามก่อน mutate ว่า "ถ้าโค้ดบรรทัดนี้พัง ผู้ใช้เห็นอะไรผิด" ถ้าตอบไม่ได้ แสดงว่าเลือกบรรทัดผิด

## แก้ด่านเดิมเมื่อสัญญาเปลี่ยน

เจ้าของสั่งเปลี่ยนพฤติกรรม → ด่านเดิมที่ล็อกพฤติกรรมเก่าไว้ต้องแก้ **ให้แข็งขึ้น ไม่ใช่ให้อ่อนลง**
เกณฑ์: ด่านใหม่ต้องพิสูจน์ทั้งพฤติกรรมใหม่ **และ** สิ่งที่ด่านเก่าเคยพิสูจน์

ตัวอย่างจริง — `navper-r26 [4]` เดิมพิสูจน์ "เลือกสาขาแล้วข้อมูลกรองตาม"
พอสาขาเปลี่ยนเป็นต้องกดยืนยัน ด่านใหม่พิสูจน์**สองท่อน**: เลือกแล้วยังไม่กรอง · กดยืนยันแล้วกรองจริง
แล้วบอกในรายงานให้เจ้าของรู้ว่าด่านไหนถูกแก้ เพราะอะไร
