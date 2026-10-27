// โหมดตัวอย่าง: ข้อมูลจำลองในหน่วยความจำ ใช้ทดลองหน้าจอก่อนเชื่อม Supabase
// รีเฟรชหน้าแล้วข้อมูลจะกลับเป็นค่าเริ่มต้น
import { canView, daysAgoISO, displayName } from './constants.js';

export function createDemoApi() {
  const profiles = [
    { id: 'u1', full_name: 'สมใจ รักงาน', email: 'somjai.r@megaclinicthailand.com', home_branch: 'สยาม', role: 'staff', scope: 'own', scope_branches: [], can_export: false, can_verify: false, can_manage: false },
    { id: 'u2', full_name: 'กานดา พูลผล', email: 'kanda.p@megaclinicthailand.com', home_branch: 'สยาม', role: 'lead', scope: 'branches', scope_branches: ['สยาม'], can_export: true, can_verify: false, can_manage: false },
    { id: 'u3', full_name: 'วิภา ศรีสุข', email: 'wipa.s@megaclinicthailand.com', home_branch: 'รังสิต', role: 'staff', scope: 'own', scope_branches: [], can_export: false, can_verify: false, can_manage: false },
    { id: 'u4', full_name: 'ปิยะ มั่นคง', email: 'piya.m@megaclinicthailand.com', home_branch: 'ลาดพร้าว', role: 'staff', scope: 'branches', scope_branches: ['ลาดพร้าว'], can_export: false, can_verify: false, can_manage: false },
    { id: 'u5', full_name: 'อรุณี แก้วใส', email: 'arunee.k@megaclinicthailand.com', home_branch: 'เวสต์เกต', role: 'staff', scope: 'own', scope_branches: [], can_export: false, can_verify: false, can_manage: false },
    { id: 'u6', full_name: 'ธนพล ใจเย็น', email: 'thanaphon.j@megaclinicthailand.com', home_branch: 'ศรีนครินทร์', role: 'lead', scope: 'branches', scope_branches: ['ศรีนครินทร์'], can_export: true, can_verify: false, can_manage: false },
    { id: 'u7', full_name: 'ฝ่ายจัดซื้อ (ตัวอย่าง)', email: 'purchasing@megaclinicthailand.com', home_branch: 'สำนักงานใหญ่', role: 'purchasing', scope: 'all', scope_branches: [], can_export: true, can_verify: true, can_manage: false },
    { id: 'u8', full_name: 'ผู้ดูแลระบบ (ตัวอย่าง)', email: 'admin@megaclinicthailand.com', home_branch: 'สำนักงานใหญ่', role: 'admin', scope: 'all', scope_branches: [], can_export: true, can_verify: true, can_manage: true },
    // ผู้ใช้ใหม่ที่เพิ่งเข้าสู่ระบบครั้งแรก ยังไม่ได้กรอกข้อมูล
    { id: 'u9', full_name: 'newuser', email: 'newuser@megaclinicthailand.com', home_branch: null, role: 'staff', scope: 'own', scope_branches: [], can_export: false, can_verify: false, can_manage: false, profile_completed: false },
  ];
  const NICK = { u1: 'ใจ', u2: 'ดา', u3: 'วิ', u4: 'ปิ', u5: 'นี', u6: 'พล', u7: '', u8: '' };
  profiles.forEach((p) => {
    p.nickname = p.nickname ?? NICK[p.id] ?? '';
    p.profile_completed = p.profile_completed ?? true;
    p.requested_role = null;
    // สาขาประจำเห็นได้อัตโนมัติ scope_branches = สาขาอื่นที่อนุมัติเพิ่ม
    if (p.scope === 'own') p.scope = 'branches';
    if (p.scope === 'branches') p.scope_branches = [];
    p.requested_branches = [];
    p.branch_request_note = '';
  });
  byIdInit('u4').scope_branches = ['รังสิต']; // ตัวอย่าง: ได้รับอนุมัติให้ดูสาขารังสิตเพิ่ม
  Object.assign(byIdInit('u3'), { requested_branches: ['ลาดพร้าว'], branch_request_note: 'ช่วยดูแลสต็อกลาดพร้าวช่วงพนักงานลา' });
  function byIdInit(id) { return profiles.find((p) => p.id === id); }

  const byId = (id) => profiles.find((p) => p.id === id);
  let seq = 130;
  const mk = (n, uid, branch, off, time, doc, status, items, note = '', photos = 2) => {
    const u = byId(uid);
    const date = daysAgoISO(off);
    return {
      id: 'r' + n, gr_no: 'GR-' + date.slice(2, 4) + date.slice(5, 7) + '-' + String(n).padStart(4, '0'),
      received_by: uid, receiver_name: displayName(u), branch, received_date: date,
      created_at: date + 'T' + time + ':00+07:00', doc_type: doc, status, note,
      items: items.map(([name, qty, unit]) => ({ name, qty, unit })),
      photos: Array.from({ length: photos }, (_, i) => ({ name: 'รูป ' + (i + 1), url: null })),
      docs: doc === 'none' ? [] : [{ name: 'เอกสาร', url: null }],
    };
  };

  const receipts = [
    mk(127, 'u1', 'สยาม', 0, '10:42', 'tax_invoice', 'pending', [['ถุงมือไนไตร ไซซ์ M', 10, 'กล่อง'], ['สำลีก้อน 450 g', 6, 'ห่อ'], ['แอลกอฮอล์ 70% 1 ลิตร', 4, 'ขวด']], 'กล่องถุงมือบุบ 1 กล่อง สินค้าด้านในปกติ', 3),
    mk(126, 'u3', 'รังสิต', 0, '09:15', 'delivery_note', 'pending', [['กระดาษ A4 80 แกรม', 5, 'รีม'], ['หมึกพิมพ์ HP 682', 2, 'ตลับ']]),
    mk(125, 'u4', 'ลาดพร้าว', 1, '16:30', 'none', 'pending', [['ผ้าก๊อซ 3x3 นิ้ว', 20, 'แพ็ค']], 'ผู้ขายแจ้งจะส่งใบกำกับตามมาทางอีเมล'),
    mk(124, 'u5', 'เวสต์เกต', 1, '11:05', 'tax_invoice', 'pending', [['เข็มฉีดยา 30G', 3, 'กล่อง'], ['ไซริงค์ 1 ml', 3, 'กล่อง'], ['แผ่นแปะแอลกอฮอล์', 2, 'กล่อง'], ['ถุงขยะติดเชื้อ', 1, 'แพ็ค']], '', 4),
    mk(123, 'u6', 'ศรีนครินทร์', 2, '14:20', 'delivery_note', 'pending', [['น้ำดื่ม 600 ml', 6, 'แพ็ค']], '', 1),
    mk(122, 'u2', 'สยาม', 2, '13:10', 'delivery_note', 'pending', [['ทิชชู่เช็ดหน้า', 12, 'กล่อง'], ['ผ้าขนหนูผืนเล็ก', 20, 'ผืน']]),
    mk(119, 'u1', 'สยาม', 3, '10:00', 'tax_invoice', 'verified', [['มาสก์ทางการแพทย์', 10, 'กล่อง'], ['หมวกคลุมผม', 4, 'แพ็ค']]),
    mk(116, 'u3', 'รังสิต', 4, '15:45', 'none', 'verified', [['ทิชชู่ม้วนใหญ่', 2, 'ลัง']], '', 1),
    mk(115, 'u4', 'ลาดพร้าว', 5, '09:30', 'delivery_note', 'verified', [['เจลอัลตราซาวด์ 5 ลิตร', 2, 'แกลลอน'], ['ผ้าปูเตียงใช้แล้วทิ้ง', 5, 'ม้วน']], '', 3),
    mk(111, 'u2', 'สยาม', 8, '11:20', 'tax_invoice', 'verified', [['สบู่ล้างมือ 500 ml', 8, 'ขวด']]),
    mk(108, 'u1', 'สยาม', 12, '16:05', 'delivery_note', 'verified', [['ถุงมือไนไตร ไซซ์ S', 6, 'กล่อง'], ['สำลีแผ่น', 10, 'ห่อ']]),
    mk(104, 'u5', 'เวสต์เกต', 20, '10:40', 'tax_invoice', 'verified', [['แอลกอฮอล์เจล 450 ml', 12, 'ขวด']]),
    mk(61, 'u1', 'สยาม', 75, '11:15', 'tax_invoice', 'verified', [['ถุงมือไนไตร ไซซ์ M', 8, 'กล่อง']]),
  ];
  // ตัวอย่างใบรับของเก่ากว่า 60 วัน: รูปสินค้าถูกลบแล้ว ข้อมูลยังอยู่
  receipts[receipts.length - 1].photos.forEach((p) => { p.purged = true; });

  const log = [
    { at: daysAgoISO(2) + 'T09:12:00+07:00', actor_name: 'ผู้ดูแลระบบ (ตัวอย่าง)', target_name: 'ปิยะ มั่นคง', summary: 'ขอบเขตการดู: เฉพาะของตัวเอง → สาขาที่เลือก (ลาดพร้าว)' },
    { at: daysAgoISO(9) + 'T14:30:00+07:00', actor_name: 'ผู้ดูแลระบบ (ตัวอย่าง)', target_name: 'กานดา พูลผล', summary: 'บทบาท: พนักงานสาขา → หัวหน้าสาขา' },
  ];

  let me = null; // เริ่มที่หน้าล็อกอิน
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const wait = (v, ms = 120) => new Promise((r) => setTimeout(() => r(v), ms));
  const ROLE_LABEL = { staff: 'พนักงานสาขา', lead: 'หัวหน้าสาขา', purchasing: 'จัดซื้อ', admin: 'ผู้ดูแลระบบ' };

  // ---------- แจ้งเตือน (ระบบจริงสร้างโดย trigger ในฐานข้อมูล) ----------
  const notes = [];
  let nseq = 0;
  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  function notify(users, type, title, body, link, at, read) {
    users.forEach((u) => {
      if (!u || (me && u.id === me.id)) return; // ไม่แจ้งเตือนคนที่เป็นผู้ทำเอง
      notes.unshift({ id: 'n' + (++nseq), user_id: u.id, type, title, body, link, created_at: at || new Date().toISOString(), read_at: read ? (at || new Date().toISOString()) : null });
    });
  }
  const managers = () => profiles.filter((p) => p.can_manage);
  const fmtD = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d}/${m}/${y + 543}`; };

  // ข้อมูลแจ้งเตือนตั้งต้น
  notify([byId('u1')], 'verified', 'ตรวจรับของแล้ว · ' + receipts[6].gr_no, 'ฝ่ายจัดซื้อ (ตัวอย่าง) ตรวจสอบรายการรับของสาขาสยามแล้ว', 'receipt:r119', hoursAgo(70), true);
  notify(managers(), 'request', 'ขอดูรายการสาขา · วิภา ศรีสุข (วิ)', 'ลาดพร้าว · ช่วยดูแลสต็อกลาดพร้าวช่วงพนักงานลา', 'admin:u3', hoursAgo(1));
  notify([byId('u4')], 'permission', 'สิทธิ์ของคุณถูกปรับ', 'อนุมัติให้ดูสาขา รังสิต', 'all', hoursAgo(50), true);

  return {
    mode: 'demo',
    async init() { return me && clone(me); },
    async currentProfile() { return me && clone(me); },
    demoUsers() { return profiles.map((p) => ({ id: p.id, full_name: p.full_name, nickname: p.nickname, email: p.email, role: p.role, home_branch: p.home_branch, profile_completed: p.profile_completed })); },
    async completeProfile({ full_name, nickname, home_branch, requested_role }) {
      const self = ['staff', 'lead'].includes(requested_role);
      Object.assign(me, {
        full_name, nickname, home_branch, profile_completed: true,
        role: self ? requested_role : 'staff', can_export: requested_role === 'lead',
        requested_role: self ? null : requested_role,
      });
      notify(managers(), 'new_user', 'ผู้ใช้ใหม่ · ' + displayName(me),
        `สาขาประจำ ${home_branch} · ${ROLE_LABEL[me.role]}${me.requested_role ? ' · ขอบทบาท' + ROLE_LABEL[me.requested_role] : ''}`, 'admin:' + me.id);
      return wait(clone(me), 300);
    },
    async requestBranches(branches, note) {
      Object.assign(me, { requested_branches: branches, branch_request_note: note || '' });
      if (branches.length) notify(managers(), 'request', 'ขอดูรายการสาขา · ' + displayName(me), branches.join(', ') + (note ? ' · ' + note : ''), 'admin:' + me.id);
      return wait(clone(me), 300);
    },
    switchUser(id) { me = byId(id) || me; return clone(me); },
    // จำลองการล็อกอิน: ในระบบจริงจะไปหน้า Microsoft แล้วกลับมาพร้อมชื่อผู้ใช้
    async signInMicrosoft() { me = byId('u1'); return wait(clone(me), 600); },
    async signInEmail(email) {
      const p = profiles.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
      if (!p) throw new Error('ไม่พบอีเมลนี้ในข้อมูลตัวอย่าง ลองเลือกบัญชีตัวอย่างด้านล่าง');
      me = p;
      return wait(clone(me), 400);
    },
    async signInDemo(id) { me = byId(id); return wait(clone(me), 200); },
    isRecoveryLink() { return false; },
    // โหมดตัวอย่าง: ใช้อีเมลของบัญชีตัวอย่าง รหัสผ่านอะไรก็ได้ (ตั้งแต่ 8 ตัว)
    async signInPassword(email) { return this.signInEmail(email); },
    async signUp(email) {
      if (profiles.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error('User already registered');
      const p = { id: 'u' + (profiles.length + 1), full_name: email.split('@')[0], email, home_branch: null, role: 'staff', scope: 'branches', scope_branches: [], can_export: false, can_verify: false, can_manage: false, profile_completed: false, nickname: '', requested_role: null, requested_branches: [] };
      profiles.push(p); me = p; return wait(clone(me), 300);
    },
    async sendPasswordReset() { return wait(true, 300); },
    async updatePassword() { return wait(clone(me), 200); },
    async signOut() { me = null; },

    async createReceipt(input) {
      seq += 1;
      const today = input.received_date;
      const r = {
        id: 'r' + seq, gr_no: 'GR-' + today.slice(2, 4) + today.slice(5, 7) + '-' + String(seq).padStart(4, '0'),
        received_by: me.id, receiver_name: displayName(me), branch: input.branch, received_date: input.received_date,
        created_at: new Date().toISOString(), doc_type: input.doc_type, status: 'pending', note: input.note || '',
        items: input.items.map((i) => ({ name: i.name, qty: Number(i.qty), unit: i.unit })),
        photos: input.photos.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
        docs: input.docs.map((f) => ({ name: f.name, url: URL.createObjectURL(f), isPdf: f.type === 'application/pdf' })),
      };
      receipts.unshift(r);
      return wait(clone(r));
    },

    async getReceipt(id) {
      const r = receipts.find((x) => x.id === id);
      if (!r || !canView(me, r)) throw new Error('ไม่พบรายการ หรือคุณไม่มีสิทธิ์ดูรายการนี้');
      return wait(clone(r));
    },

    async listReceipts({ mineOnly = false, from, to } = {}) {
      return wait(clone(receipts.filter((r) =>
        (mineOnly ? r.received_by === me.id : canView(me, r)) &&
        (!from || r.received_date >= from) && (!to || r.received_date <= to))));
    },

    async setVerified(id, verified) {
      if (!me.can_verify) throw new Error('คุณไม่มีสิทธิ์ตรวจสอบรายการ');
      const r = receipts.find((x) => x.id === id);
      if (r.status !== (verified ? 'verified' : 'pending')) {
        r.status = verified ? 'verified' : 'pending';
        notify([byId(r.received_by)], verified ? 'verified' : 'unverified',
          (verified ? 'ตรวจรับของแล้ว · ' : 'ยกเลิกสถานะตรวจแล้ว · ') + r.gr_no,
          `${displayName(me)} ${verified ? 'ตรวจสอบ' : 'ยกเลิกการตรวจ'}รายการรับของสาขา${r.branch} วันที่ ${fmtD(r.received_date)}`, 'receipt:' + r.id);
      }
      return wait(clone(r));
    },

    async listProfiles() {
      if (!me.can_manage) throw new Error('เฉพาะผู้ดูแลระบบ');
      return wait(clone(profiles));
    },

    async updateProfile(id, patch, summary) {
      if (!me.can_manage) throw new Error('เฉพาะผู้ดูแลระบบ');
      const p = byId(id);
      Object.assign(p, patch);
      if (summary) {
        log.unshift({ at: new Date().toISOString(), actor_name: me.full_name, target_name: p.full_name, summary });
        notify([p], 'permission', 'สิทธิ์ของคุณถูกปรับ', summary, 'all');
      }
      if (p.id === me.id) me = p;
      return wait(clone(p));
    },

    async listPermissionLog() { return wait(clone(log.slice(0, 30))); },

    // ตัวเลขบนเมนู
    async badgeCounts(sinceISO) {
      const newReceipts = receipts.filter((r) => r.received_by !== me.id && canView(me, r) && r.created_at > sinceISO).length;
      const pending = me.can_manage ? profiles.filter((p) => (p.requested_role && p.requested_role !== p.role) || (p.requested_branches || []).length).length : 0;
      return wait({ newReceipts, pending }, 30);
    },

    async listNotifications() { return wait(clone(notes.filter((n) => me && n.user_id === me.id).slice(0, 50)), 60); },
    async markNotificationsRead(ids) {
      const now = new Date().toISOString();
      notes.forEach((n) => { if (n.user_id === me.id && !n.read_at && (!ids || ids.includes(n.id))) n.read_at = now; });
      return wait(true, 30);
    },
  };
}
