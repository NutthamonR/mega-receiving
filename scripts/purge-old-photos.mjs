// ลบรูปที่เก่ากว่า RETENTION_DAYS วัน ออกจาก Supabase Storage
// รันอัตโนมัติทุกวันผ่าน GitHub Actions (.github/workflows/purge-photos.yml)
// ข้อมูลใบรับของ (รายการสินค้า ผู้รับ วันที่ สาขา) ยังอยู่ครบ ลบเฉพาะไฟล์รูป
//
// ตั้งค่าผ่าน environment:
//   SUPABASE_URL               เช่น https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  เก็บใน GitHub Secrets เท่านั้น ห้ามใส่ในโค้ด
//   RETENTION_DAYS             จำนวนวันที่เก็บไว้ (ค่าเริ่มต้น 60)
//   PURGE_KINDS                ชนิดไฟล์ที่ลบ คั่นด้วย , (ค่าเริ่มต้น photo = รูปสินค้าเท่านั้น
//                              ใส่ photo,document ถ้าต้องการลบรูปเอกสารด้วย)
//   DRY_RUN                    ใส่ 1 เพื่อดูว่าจะลบอะไร โดยยังไม่ลบจริง

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DAYS = Number(process.env.RETENTION_DAYS || 60);
const KINDS = (process.env.PURGE_KINDS || 'photo').split(',').map((s) => s.trim()).filter(Boolean);
const DRY = process.env.DRY_RUN === '1';
const BUCKET = 'receipts';
const BATCH = 100;

if (!URL_ || !KEY) {
  // ยังไม่ได้ตั้งค่า Secrets: ข้ามไปก่อน ไม่ให้งานขึ้นว่าล้มเหลว
  console.log('ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน GitHub Secrets ข้ามการลบรูป');
  process.exit(0);
}
if (!(DAYS >= 7)) {
  console.error('RETENTION_DAYS ต้องไม่น้อยกว่า 7 วัน (กันการลบผิดพลาด)');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function call(method, path, body) {
  const res = await fetch(URL_ + path, { method, headers: { ...headers, Prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const cutoff = new Date(Date.now() - DAYS * 86400e3).toISOString();
console.log(`ลบไฟล์ชนิด [${KINDS.join(', ')}] ที่อัปโหลดก่อน ${cutoff} (${DAYS} วัน)${DRY ? ' — ทดลอง ไม่ลบจริง' : ''}`);

let total = 0;
for (;;) {
  const q = `/rest/v1/receipt_files?select=id,path&purged_at=is.null&created_at=lt.${encodeURIComponent(cutoff)}`
    + `&kind=in.(${KINDS.join(',')})&order=created_at.asc&limit=${BATCH}`;
  const rows = await call('GET', q);
  if (!rows.length) break;

  if (DRY) {
    rows.forEach((r) => console.log('  จะลบ', r.path));
    total += rows.length;
    break;
  }

  // ลบไฟล์จริงผ่าน Storage API แล้วจึงบันทึกว่าลบแล้ว
  await call('DELETE', `/storage/v1/object/${BUCKET}`, { prefixes: rows.map((r) => r.path) });
  await call('PATCH', `/rest/v1/receipt_files?id=in.(${rows.map((r) => r.id).join(',')})`, { purged_at: new Date().toISOString() });
  total += rows.length;
  console.log(`  ลบแล้ว ${rows.length} ไฟล์ (รวม ${total})`);
}

console.log(total ? `เสร็จ: ${DRY ? 'พบ' : 'ลบ'} ${total} ไฟล์` : 'ไม่มีไฟล์ที่ต้องลบ');
