// เชื่อมต่อ Supabase (ล็อกอิน ฐานข้อมูล และที่เก็บรูป)
// สิทธิ์การมองเห็นถูกบังคับที่ฐานข้อมูลด้วย Row Level Security (ดู supabase/schema.sql)
// แม้มีคนแก้โค้ดหน้าเว็บ ก็ดึงข้อมูลที่ไม่มีสิทธิ์ไม่ได้
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const BUCKET = 'receipts';

export async function createSupabaseApi(config) {
  // ลิงก์รีเซ็ตรหัสผ่านจากอีเมล (ต้องเช็กก่อนสร้าง client เพราะ client จะล้างค่าใน URL)
  const recoveryLink = /type=recovery/.test(location.hash + location.search);
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let me = null;

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  async function loadProfile() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; return null; }
    me = check(await sb.from('profiles').select('*').eq('id', session.user.id).single());
    return me;
  }

  function normalize(r) {
    const files = r.receipt_files || [];
    return {
      id: r.id, gr_no: r.gr_no, received_by: r.received_by, receiver_name: r.receiver_name,
      branch: r.branch, received_date: r.received_date, created_at: r.created_at,
      doc_type: r.doc_type, status: r.status, note: r.note || '',
      items: (r.receipt_items || []).sort((a, b) => a.line_no - b.line_no).map((i) => ({ name: i.name, qty: Number(i.qty), unit: i.unit })),
      photos: files.filter((f) => f.kind === 'photo').map((f) => ({ name: f.file_name, path: f.path, url: null, purged: !!f.purged_at })),
      docs: files.filter((f) => f.kind === 'document').map((f) => ({ name: f.file_name, path: f.path, url: null, purged: !!f.purged_at, isPdf: /\.pdf$/i.test(f.path) })),
    };
  }

  async function signUrls(r) {
    const all = [...r.photos, ...r.docs].filter((f) => !f.purged); // ไฟล์ที่ลบแล้วไม่ต้องขอลิงก์
    if (!all.length) return r;
    const signed = check(await sb.storage.from(BUCKET).createSignedUrls(all.map((f) => f.path), 3600));
    signed.forEach((s, i) => { all[i].url = s.signedUrl; });
    return r;
  }

  async function upload(receiptId, file, kind, index) {
    const ext = file.type === 'application/pdf' ? 'pdf' : (file.type === 'image/png' ? 'png' : 'jpg');
    const path = `${me.id}/${receiptId}/${kind}-${index + 1}-${Date.now()}.${ext}`;
    check(await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }));
    return { receipt_id: receiptId, kind, path, file_name: file.name || path.split('/').pop() };
  }

  return {
    mode: 'supabase',

    async init() {
      sb.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') { window.dispatchEvent(new Event('auth-recovery')); return; }
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') window.dispatchEvent(new Event('auth-changed'));
      });
      return loadProfile();
    },

    async currentProfile() { return loadProfile(); },

    async signInMicrosoft() {
      check(await sb.auth.signInWithOAuth({
        provider: 'azure',
        options: { scopes: 'email openid profile', redirectTo: location.origin + location.pathname },
      }));
    },

    async signInEmail(email) {
      check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
    },

    async signOut() { await sb.auth.signOut(); me = null; },

    isRecoveryLink() { return recoveryLink; },

    // เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน
    async signInPassword(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }));
      return loadProfile();
    },

    // สมัครใช้งานครั้งแรก (ปิด Confirm email ใน Supabase แล้ว จะเข้าใช้งานได้ทันที)
    async signUp(email, password) {
      const data = check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
      if (!data.session) return { needsConfirm: true };
      return loadProfile();
    },

    // ลืมรหัสผ่าน: ส่งลิงก์ตั้งรหัสใหม่ไปที่อีเมล
    async sendPasswordReset(email) {
      check(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },

    async updatePassword(password) {
      check(await sb.auth.updateUser({ password }));
      return loadProfile();
    },

    // ขอดูรายการสาขาอื่น (ส่งรายการว่าง = ยกเลิกคำขอ)
    async requestBranches(branches, note) {
      check(await sb.rpc('request_branch_access', { p_branches: branches, p_note: note || null }));
      return loadProfile();
    },

    // กรอกข้อมูลครั้งแรก: แก้ได้เฉพาะชื่อ ชื่อเล่น สาขาประจำ และ "ขอ" บทบาท (สิทธิ์จริงยังเป็นพนักงานสาขา)
    async completeProfile({ full_name, nickname, home_branch, requested_role }) {
      check(await sb.rpc('complete_profile', {
        p_full_name: full_name, p_nickname: nickname, p_home_branch: home_branch, p_requested_role: requested_role,
      }));
      return loadProfile();
    },

    async createReceipt(input) {
      // ผู้รับ เลขที่ GR และเวลา ถูกกำหนดโดยฐานข้อมูล (แก้จากหน้าเว็บไม่ได้)
      const receipt = check(await sb.from('receipts').insert({
        branch: input.branch, received_date: input.received_date, doc_type: input.doc_type, note: input.note || null,
      }).select().single());

      check(await sb.from('receipt_items').insert(input.items.map((i, idx) => ({
        receipt_id: receipt.id, line_no: idx + 1, name: i.name, qty: Number(i.qty), unit: i.unit || null,
      }))));

      const rows = [];
      for (let i = 0; i < input.photos.length; i++) rows.push(await upload(receipt.id, input.photos[i], 'photo', i));
      for (let i = 0; i < input.docs.length; i++) rows.push(await upload(receipt.id, input.docs[i], 'document', i));
      if (rows.length) check(await sb.from('receipt_files').insert(rows));

      return this.getReceipt(receipt.id);
    },

    async getReceipt(id) {
      const r = check(await sb.from('receipts').select('*, receipt_items(*), receipt_files(*)').eq('id', id).maybeSingle());
      if (!r) throw new Error('ไม่พบรายการ หรือคุณไม่มีสิทธิ์ดูรายการนี้');
      return signUrls(normalize(r));
    },

    async listReceipts({ mineOnly = false, from, to } = {}) {
      let q = sb.from('receipts').select('*, receipt_items(*), receipt_files(id, kind, path, file_name, purged_at)')
        .order('received_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
      if (mineOnly) q = q.eq('received_by', me.id);
      if (from) q = q.gte('received_date', from);
      if (to) q = q.lte('received_date', to);
      return check(await q).map(normalize);
    },

    async setVerified(id, verified) {
      check(await sb.from('receipts').update({ status: verified ? 'verified' : 'pending' }).eq('id', id));
      return this.getReceipt(id);
    },

    async listProfiles() {
      return check(await sb.from('profiles').select('*').order('full_name'));
    },

    async updateProfile(id, patch, summary) {
      const p = check(await sb.from('profiles').update(patch).eq('id', id).select().single());
      if (summary) check(await sb.from('permission_log').insert({ target_id: id, summary }));
      if (id === me.id) me = p;
      return p;
    },

    // ตัวเลขบนเมนู: รายการใหม่ที่มองเห็นได้ (ไม่นับของตัวเอง) และคำขอรออนุมัติ
    async badgeCounts(sinceISO) {
      const nr = await sb.from('receipts').select('id', { count: 'exact', head: true })
        .gt('created_at', sinceISO).neq('received_by', me.id);
      if (nr.error) throw new Error(nr.error.message);
      let pending = 0;
      if (me.can_manage) {
        const pr = await sb.from('profiles').select('id', { count: 'exact', head: true })
          .or('requested_role.not.is.null,requested_branches.neq.{}');
        if (pr.error) throw new Error(pr.error.message);
        pending = pr.count || 0;
      }
      return { newReceipts: nr.count || 0, pending };
    },

    async listNotifications() {
      return check(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50));
    },

    // ids ว่าง = อ่านทั้งหมด
    async markNotificationsRead(ids) {
      let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (ids) q = q.in('id', ids);
      check(await q);
      return true;
    },

    async listPermissionLog() {
      return check(await sb.from('permission_log').select('*').order('at', { ascending: false }).limit(30));
    },
  };
}
