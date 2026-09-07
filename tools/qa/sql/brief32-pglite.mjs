/* ตรวจ migration ทุกไฟล์ด้วย Postgres WASM ก่อนตรวจสิทธิ์ด้วย authenticated/anon
   ติดตั้ง @electric-sql/pglite@0.5.8 ในเครื่องตรวจ หรือชี้ PGLITE_PACKAGE ไปโฟลเดอร์ package
   auth/storage เป็นโครง Supabase ขั้นต่ำสำหรับการทดสอบ ไม่ใช่ของที่จะนำไป deploy */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo=path.resolve(import.meta.dirname,'../../..');
const pkg=process.env.PGLITE_PACKAGE;
const modulePath=part=>pkg?pathToFileURL(path.join(pkg,'dist',part)).href:'@electric-sql/pglite'+(part==='index.js'?'':'/contrib/'+part.split('/').pop().replace('.js',''));
const {PGlite}=await import(modulePath('index.js'));
const {pgcrypto}=await import(modulePath('contrib/pgcrypto.js'));
const sourceIndex=process.argv.indexOf('--source');
const source=path.resolve(sourceIndex<0?path.join(repo,'index.html'):process.argv[sourceIndex+1]);
async function checkColumns(db){
  const html=await fs.readFile(source,'utf8');
  let requests=0,columns=0;
  for(const [,table,projection] of html.matchAll(/q2000\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([^']+)'/g)){
    // ตรวจคอลัมน์ชั้นแรก ส่วน embedded relations ของ PostgREST ทดสอบทาง HTTP แยก
    let depth=0,token='',flat=[];
    for(const c of projection+','){
      if(c==='(')depth++;
      if(c===')')depth--;
      if(c===','&&depth===0){if(/^[a-z_][a-z0-9_]*$/.test(token))flat.push(token);token='';}
      else token+=c;
    }
    if(!flat.length)throw Error('ตรวจชื่อคอลัมน์ไม่ได้: '+table);
    await db.query('select '+flat.map(c=>'"'+c+'"').join(',')+' from public."'+table+'" limit 0');
    requests++;columns+=flat.length;
  }
  if(!requests)throw Error('ไม่พบ q2000 projections ใน '+source);
  console.log(JSON.stringify({source_columns_checked:columns,source_queries_checked:requests}));
}
const mutations=[
  ['ownership',"select famai_private.has_role(array['sales'])","select false and famai_private.has_role(array['sales'])",'เซลล์+สต๊อกเห็นลูกค้าของตน'],
  ['internal-approval',"if s.voided_at is not null or coalesce(s.fin_approval->>'status','รอตรวจ')<>'ผ่าน' then","if s.voided_at is not null then",'ทะเบียนเก่ามีขั้นรอทะเบียนแต่ไม่มีวันยังต้องผ่านการเงิน'],
  ['accounting-role',"if auth.uid() is not null and not (famai_private.allowed('act:finApprove',true)","if false and auth.uid() is not null and not (famai_private.allowed('act:finApprove',true)",'ผู้บริหารไม่มีสิทธิ์ปลอมผลการเงิน'],
  ['case-snapshot','or row(f.list_price,f.discount,f.down_payment','or false and row(f.list_price,f.discount,f.down_payment','เงื่อนไขต่างจากเคสไม่ผ่านsnapshot'],
  ['case-freeze','old.variant_id is not null or exists(','false or exists(','เคสใหม่หลังจัดคันแล้วแก้ผลไม่ได้'],
  ['calendar-month',"new.delivered_at+interval '1 month'","new.delivered_at+interval '30 days'",'หนึ่งเดือนปฏิทินจากวันส่งมอบ clamp ปลายเดือน'],
  ['read-only',"famai_private.allowed('page:deal',true)","famai_private.allowed('page:deal',false)",'หน้าดีลอ่านอย่างเดียวเขียนเคสไม่ได้',true],
  ['seen-clock','new.seen_at:=clock_timestamp();','new.seen_at:=new.seen_at;','อ่านแจ้งเตือนใช้เวลาเซิร์ฟเวอร์'],
  ['task-clock','new.done_at:=clock_timestamp(); new.done_by:=auth.uid();','new.done_at:=new.done_at; new.done_by:=auth.uid();','งานบริการเงินไม่บังคับและเสร็จด้วยเวลาผู้ทำจริง'],
  ['appointment-day',"new.due_at:=(new.appointment_at at time zone 'Asia/Bangkok')::date;",'new.due_at:=new.due_at;','นัดหมายเก็บเวลาและสรุปวันแบบไทย'],
  ['archive-clock','new.archived_at:=clock_timestamp(); new.archived_by:=auth.uid();','new.archived_at:=new.archived_at; new.archived_by:=auth.uid();','คลังการตลาดเก็บลูกค้าเดิมและเวลาจริง']
  ,['archive-sale','s.customer_id=new.id and s.voided_at is null','false and s.customer_id=new.id and s.voided_at is null','ขายที่ยังไม่ส่งมอบห้ามเก็บลูกค้าเข้าคลัง']
  ,['archive-booking',"b.customer_id=new.id and b.status='จองอยู่'","false and b.customer_id=new.id and b.status='จองอยู่'",'จองค้างห้ามเก็บลูกค้าเข้าคลัง']
  ,['archive-finance','f.customer_id=new.id and f.sale_id is null','false and f.customer_id=new.id and f.sale_id is null','เคสไฟแนนซ์ค้างห้ามเก็บลูกค้าเข้าคลัง']
  ,['legacy-delivery',"was_delivered:=old.delivered_at is not null;","was_delivered:=old.delivered_at is not null or old.stage='รอทะเบียน';",'ทะเบียนเก่ามีขั้นรอทะเบียนแต่ไม่มีวันยังต้องผ่านการเงิน']
  ,['delivery-evidence','if was_delivered and new.delivered_at is null then','if false and was_delivered and new.delivered_at is null then','ล้างวันส่งมอบเพื่อหลบด่านไม่ได้']
];
mutations.push(...[
  ['task-identity','if row(new.id,new.branch_id,new.customer_id,new.sale_id,new.task_source','if false and row(new.id,new.branch_id,new.customer_id,new.sale_id,new.task_source','เปลี่ยน legacy เป็นงาน care เพื่อหลบสิทธิ์ไม่ได้'],
  ['unit-cost','if identity_changed and not famai_private.any_page','if false and identity_changed and not famai_private.any_page','สิทธิ์จองไม่ให้แก้ต้นทุนคันรถ'],
  ['booking-status',"famai_private.page_action('booking','booking')","famai_private.allowed('act:booking',true)",'หน้าจองอ่านอย่างเดียวเปลี่ยนสถานะรถไม่ได้',true],
  ['unit-price',"if not (famai_private.allowed('page:stock',true) and famai_private.page_action('settings','editFin')) then","if not (true and famai_private.page_action('settings','editFin')) then",'มีสิทธิ์ตั้งค่าแต่หน้าสต๊อกอ่านอย่างเดียวแก้ราคาคันไม่ได้'],
  ['transfer-page',"select famai_private.allowed('page:'||p_page,true) and famai_private.allowed('act:'||p_action,true)","select (p_page='transfer' or famai_private.allowed('page:'||p_page,true)) and famai_private.allowed('act:'||p_action,true)",'หน้าโอนอ่านอย่างเดียวไม่รับโอนผ่าน API'],
  ['inventory-metadata','and not metadata_ok then','and false then','สิทธิ์บริการตัดจำนวนแต่แก้ราคาอะไหล่ไม่ได้'],
  ['expense-page',"if not famai_private.allowed('page:expense',true) then","if false and not famai_private.allowed('page:expense',true) then",'การเงินมี action แต่หน้าค่าใช้จ่ายอ่านอย่างเดียวอนุมัติไม่ได้'],
  ['wholesale-approval',"if not famai_private.page_action('invoice','finApprove') then","if false and not famai_private.page_action('invoice','finApprove') then",'การเงินมี action แต่หน้าเอกสารอ่านอย่างเดียวอนุมัติขายส่งไม่ได้'],
  ['settings-page',"if t='branch_site' then gate:=gate||' and famai_private.branch_ok(branch_id)'; end if;","if t='branch' then gate:='true'; end if; if t='branch_site' then gate:=gate||' and famai_private.branch_ok(branch_id)'; end if;",'หน้าตั้งค่าอ่านอย่างเดียวแก้สาขาไม่ได้'],
  ['storage-page',"(bucket_id<>'model-photo' or famai_private.allowed('page:settings',true))",'true','หน้าตั้งค่าอ่านอย่างเดียวอัปโหลดรูปรุ่นไม่ได้',true],
  ['hr-self-approval',"if staff_user is not distinct from auth.uid() or not famai_private.allowed('act:hrApprove',true) then",'if false then','ยื่นใบลาเองได้แต่อนุมัติตัวเองไม่ได้'],
  ['attendance-direct',"if current_user in ('authenticated','anon') then",'if false then','พนักงาน PATCH เวลาเข้าเองไม่ได้'],
  ['attendance-page',"if not famai_private.allowed('page:hr',true) then","if false and not famai_private.allowed('page:hr',true) then",'หน้าบุคลากรอ่านอย่างเดียวใช้ RPC ลงเวลาไม่ได้'],
  ['counter-direct',"if tg_op='DELETE' or current_user in ('authenticated','anon') then","if tg_op='DELETE' then",'ผู้บริหารแก้ตัวนับเลขเอกสารตรงไม่ได้'],
  ['counter-page',"when 'QUOTE' then famai_private.allowed('page:quote',true)","when 'QUOTE' then famai_private.allowed('page:quote',false)",'หน้าใบเสนออ่านอย่างเดียวเรียก RPC ออกเลขไม่ได้'],
  ['payment-page',"famai_private.page_action('ar','finApprove')","famai_private.allowed('act:finApprove',true)",'ลูกหนี้อ่านอย่างเดียวรับเงินไม่ได้แม้ดีลเขียนได้',true]
  ,['sale-approval-page',"and not famai_private.allowed('page:deal',true) then","and false then",'หน้าเอกสารเขียนได้ไม่ให้อนุมัติขายเมื่อดีลอ่านอย่างเดียว']
].map(m=>[m[0],m[1],m[2],m[3],!!m[4],'_33_permission_guards']));
mutations.push(
  ['care-negative', 'or v_amount<0 or v_amount::text', 'or false or v_amount::text', 'บริการห้ามจำนวนเงินติดลบ', false, '_34_service_bundle'],
  ['care-past', 'if appointment is not null and appointment<=at_time then', 'if false then', 'บริการห้ามนัดย้อนหลัง', false, '_34_service_bundle'],
  ['care-retry', 'or previous.symptom is distinct from detail', 'or false', 'คำขอซ้ำเปลี่ยนข้อมูลไม่ได้', false, '_34_service_bundle']
);
mutations.push(...[
  ['staff-own', 'p_user is distinct from auth.uid()', 'false', 'เซลล์แก้เบอร์พนักงานคนอื่นไม่ได้'],
  ['staff-write', 'set phone=contact where', 'set phone=phone where', 'บันทึกเบอร์ตนเองในประวัติพนักงาน'],
  ['quote-owner', 'new.seller_id:=coalesce(c.owner_id,auth.uid());', 'new.seller_id:=coalesce(auth.uid(),c.owner_id);', 'ใบเสนอดึงเซลล์เจ้าของดีลและเบอร์จากประวัติ'],
  ['quote-contact', 'new.seller_phone:=seller.phone;', 'new.seller_phone:=new.seller_phone;', 'ใบเสนอดึงเซลล์เจ้าของดีลและเบอร์จากประวัติ'],
  ['quote-freeze', 'if row(new.seller_id,new.seller_name,new.seller_phone,new.customer_id)', 'if false and row(new.seller_id,new.seller_name,new.seller_phone,new.customer_id)', 'แก้ผู้ขายบนใบเก่าตรงไม่ได้'],
  ['quote-page', "if not famai_private.allowed('page:quote',true) or", 'if false or', 'ใบเสนออ่านอย่างเดียวเรียกบันทึกไม่ได้'],
  ['sale-seller', 'new.salesperson_id:=coalesce((select owner_id from public.customer where id=new.customer_id),new.salesperson_id,auth.uid());', 'new.salesperson_id:=new.salesperson_id;', 'ผู้บริหารเปิดขายคงรหัสเซลล์เจ้าของลูกค้า']
].map(m=>[...m,false,'_35_staff_quote_identity']));
mutations.push(...[
 ['quote-customer-required', 'create trigger quotation_aa_customer_guard before insert on public.quotation\nfor each row execute function famai_private.quote_customer_guard();', '', 'ใบเสนอใหม่ไม่มีลูกค้าอ้างอิงบันทึกตรงไม่ได้'],
 ['quote-customer-name', 'new.customer_name:=c.full_name;', 'new.customer_name:=new.customer_name;', 'ใบเสนอยืนยันรหัสและข้อมูลลูกค้าจากฐาน'],
 ['quote-customer-phone', 'new.customer_phone:=c.phone;', 'new.customer_phone:=new.customer_phone;', 'ใบเสนอยืนยันรหัสและข้อมูลลูกค้าจากฐาน']
].map(m=>[...m,false,'_36_quote_requires_customer']));
async function run(mutation=null){
const db=new PGlite({extensions:{pgcrypto}});
let step='โครงทดสอบ Supabase';
try{
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role authenticator nologin noinherit;
    create schema auth; create schema storage; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,aud text,role text,email text,created_at timestamptz,updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    create function auth.role() returns text language sql stable as $$select coalesce(auth.jwt()->>'role',current_user)$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
    grant all on storage.objects to authenticated,service_role;
    grant select on storage.objects to anon;
    grant execute on all functions in schema auth,storage,extensions to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  `);
  const migrations=(await fs.readdir(path.join(repo,'supabase/migrations'))).filter(f=>f.endsWith('.sql')).sort();
  for(const file of migrations){
    step=file;
    let sql=await fs.readFile(path.join(repo,'supabase/migrations',file),'utf8');
    if(mutation && file.includes(mutation[5]||'_32_brief_workflows')){
      if(!sql.includes(mutation[1])) throw Error('หาจุด mutation ไม่พบ: '+mutation[0]);
      sql=mutation[4]?sql.replaceAll(mutation[1],()=>mutation[2]):sql.replace(mutation[1],()=>mutation[2]);
    }
    await db.exec(sql);
  }
  if(!mutation){step='คอลัมน์ที่เว็บโหลด';await checkColumns(db);}
  step='ชุดตรวจสิทธิ์และ flow';
  await db.exec('begin');
  const suites=(await fs.readdir(path.join(repo,'supabase/tests'))).filter(f=>/^brief_workflows_\d+\.sql$/.test(f)).sort();
  const suiteSql=await Promise.all(suites.map(f=>fs.readFile(path.join(repo,'supabase/tests',f),'utf8')));
  const results=await db.exec(suiteSql.join('\n'));
  if(mutation) throw Error('ถอดด่านแล้วชุดตรวจยังเขียว: '+mutation[0]);
  console.log(JSON.stringify({migrations:migrations.length,...results.at(-1).rows[0]}));
  await db.exec('rollback');
  const remains=await db.query(`select count(*)::int n from public.app_user where username like 'qa32-%'`);
  if(remains.rows[0].n!==0) throw Error('ข้อมูลทดสอบไม่ถูก rollback');
  console.log('ผ่าน: rollback ไม่ทิ้งผู้ใช้ทดสอบ');
}catch(error){
  if(mutation && error.message.includes('ตรวจไม่ผ่าน: '+mutation[3])){
    console.log(JSON.stringify({mutation:mutation[0],caught:true,assertion:mutation[3]}));
  }else{
    console.error(JSON.stringify({step,mutation:mutation?.[0],message:error.message,detail:error.detail,code:error.code,position:error.position,where:error.where}));
    process.exitCode=1;
  }
}finally{ await db.close(); }
}
await run();
if(process.argv.includes('--mutations') && !process.exitCode){
  for(const mutation of mutations){ await run(mutation); if(process.exitCode) break; }
}
