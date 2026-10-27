export const BRANCHES = ['สยาม', 'ลาดพร้าว', 'รังสิต', 'เวสต์เกต', 'ศรีนครินทร์'];
export const HOME_BRANCHES = ['สำนักงานใหญ่', ...BRANCHES];

// ชื่อที่แสดง เช่น "สมใจ รักงาน (ใจ)"
export const displayName = (p) => (p ? (p.nickname ? `${p.full_name} (${p.nickname})` : p.full_name) : '');

export const DOC_TYPES = {
  tax_invoice: { label: 'ใบกำกับภาษี', hint: 'ใบกำกับภาษี / ใบเสร็จรับเงิน', tone: 'ok' },
  delivery_note: { label: 'ใบส่งของ', hint: 'ใบส่งสินค้า / Delivery note', tone: 'info' },
  none: { label: 'ไม่มีเอกสาร', hint: 'ผู้ขายไม่ได้แนบเอกสารมา', tone: 'warn' },
};

export const STATUS = {
  pending: { label: 'รอตรวจ', tone: 'accent' },
  verified: { label: 'ตรวจแล้ว', tone: 'neutral' },
};

// บทบาท = ชุดสิทธิ์ตั้งต้น ผู้ดูแลระบบปรับรายคนได้ภายหลัง
export const ROLES = {
  staff: {
    label: 'พนักงานสาขา',
    desc: 'บันทึกรับของ เห็นทุกรายการของสาขาประจำ',
    preset: { scope: 'branches', can_export: false, can_verify: false, can_manage: false },
  },
  lead: {
    label: 'หัวหน้าสาขา',
    desc: 'เห็นทุกรายการของสาขาประจำ และส่งออกไฟล์ได้',
    preset: { scope: 'branches', can_export: true, can_verify: false, can_manage: false },
  },
  purchasing: {
    label: 'จัดซื้อ',
    desc: 'เห็นทุกสาขา ตรวจรายการ และส่งออกไฟล์',
    preset: { scope: 'all', can_export: true, can_verify: true, can_manage: false },
  },
  admin: {
    label: 'ผู้ดูแลระบบ',
    desc: 'ทำได้ทุกอย่าง รวมถึงจัดการสิทธิ์ผู้ใช้',
    preset: { scope: 'all', can_export: true, can_verify: true, can_manage: true },
  },
};

// บทบาทที่เลือกเองได้ตอนกรอกข้อมูลครั้งแรก (ไม่ต้องอนุมัติ)
export const SELF_ROLES = ['staff', 'lead'];

export const SCOPES = {
  branches: { label: 'สาขาประจำ + สาขาที่อนุมัติเพิ่ม', hint: 'เห็นทุกรายการของสาขาประจำ และสาขาอื่นที่ได้รับอนุมัติ' },
  all: { label: 'ทุกสาขา', hint: 'เห็นทุกรายการในระบบ' },
};

// สาขาที่ผู้ใช้คนนี้มองเห็น (ไม่รวมกรณีทุกสาขา)
export function visibleBranches(p) {
  if (!p) return [];
  if (p.scope === 'all') return [...BRANCHES];
  const set = new Set(p.scope_branches || []);
  if (BRANCHES.includes(p.home_branch)) set.add(p.home_branch);
  return BRANCHES.filter((b) => set.has(b));
}

export const PERMS = [
  { key: 'can_export', label: 'ส่งออกไฟล์ Excel (CSV)', hint: 'ดาวน์โหลดรายการที่มองเห็นได้' },
  { key: 'can_verify', label: 'ตรวจสอบรายการรับของ', hint: 'กดยืนยันว่าตรงกับใบสั่งซื้อ' },
  { key: 'can_manage', label: 'จัดการสิทธิ์ผู้ใช้', hint: 'เปิดหน้านี้และแก้สิทธิ์ของผู้อื่น' },
];

// ใช้ตรรกะเดียวกับฟังก์ชัน can_view_receipt ใน schema.sql
export function canView(profile, receipt) {
  if (!profile) return false;
  if (receipt.received_by === profile.id) return true;
  if (profile.scope === 'all') return true;
  return receipt.branch === profile.home_branch || (profile.scope_branches || []).includes(receipt.branch);
}

export function localISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}
