import { CONFIG } from './config.js';
import { BRANCHES, HOME_BRANCHES, DOC_TYPES, STATUS, ROLES, SCOPES, PERMS, SELF_ROLES, localISO, daysAgoISO, displayName, visibleBranches } from './constants.js';
import { createDemoApi } from './api-demo.js';

/* ---------- utilities ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function fmtDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}
const sumQty = (r) => r.items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
const initials = (name) => (name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
const chip = (label, tone) => `<span class="chip chip-${tone}">${esc(label)}</span>`;
const docChip = (t) => chip(DOC_TYPES[t]?.label || t, DOC_TYPES[t]?.tone || 'neutral');
const statusChip = (s) => chip(STATUS[s]?.label || s, STATUS[s]?.tone || 'neutral');

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h3l2-3h8l2 3h3v12H3z"/><circle cx="12" cy="13" r="4"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M12 11v6M9 14l3-3 3 3"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h4"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};

/* ---------- state ---------- */
const $app = document.getElementById('app');
const newForm = (me) => ({
  branch: me && BRANCHES.includes(me.home_branch) ? me.home_branch : '',
  received_date: localISO(),
  doc_type: 'tax_invoice',
  note: '',
  items: [{ name: '', qty: 1, unit: '' }],
  photos: [], // { file, url }
  docs: [],
  errors: [],
});
const S = {
  api: null, me: null, booting: true, busy: false, toast: '',
  form: null, currentId: null, justSaved: false,
  mine: { range: '30' },
  all: { branch: 'all', doc: 'all', status: 'all', from: daysAgoISO(30), to: localISO(), q: '', selected: null },
  admin: { selected: null, draft: null, q: '', saved: false },
  cache: { mine: null, all: null, detail: null, profiles: null, log: null },
  login: { mode: 'signin', email: '', busy: '', error: '', info: '' }, // signin | signup | forgot
  recovery: null, // ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล
  onb: null, // ข้อมูลหน้ากรอกข้อมูลครั้งแรก
  req: { open: false, branches: [], note: '', busy: false }, // ขอดูสาขาอื่น
  notif: { list: [], open: false, loaded: false }, // แจ้งเตือน
  badges: { newReceipts: 0, pending: 0 }, // ตัวเลขบนเมนู
};

const ROUTES = ['receive', 'mine', 'all', 'admin', 'receipt'];
const route = () => {
  const h = location.hash.replace('#', '');
  return ROUTES.includes(h) ? h : 'receive';
};
const go = (r) => { if (location.hash !== '#' + r) location.hash = r; else render(); };
const allowed = (r) => {
  if (!S.me) return false;
  if (r === 'admin') return !!S.me.can_manage;
  return true;
};

function toast(msg) {
  S.toast = msg;
  const el = document.getElementById('toast');
  if (el) { el.textContent = msg; el.hidden = false; }
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { S.toast = ''; const e = document.getElementById('toast'); if (e) e.hidden = true; }, 2600);
}

/* ---------- shell ---------- */
function headerHtml(r) {
  const me = S.me;
  const tabs = [
    ['receive', 'บันทึกรับของ'],
    ['mine', 'รายการของฉัน'],
    ['all', S.me.scope === 'all' ? 'รายการทุกสาขา' : 'รายการสาขา'],
    ['admin', 'จัดการสิทธิ์'],
  ].filter(([k]) => allowed(k));
  const demo = S.api.mode === 'demo';
  return `
  <header class="topbar">
    <div class="wrap topbar-in">
      <a class="brand" href="#receive" style="text-decoration:none;color:inherit">
        <img class="logo" src="images/logo.png" alt="MEGA Clinic">
        <span class="brand-sep" aria-hidden="true"></span>
        <span class="brand-name">ระบบรับของสาขา</span>
      </a>
      <div class="who">
        ${demo ? `
          <label class="demo-switch" for="demo-user"><span class="chip chip-warn">โหมดตัวอย่าง</span>
            <select id="demo-user" data-field="demo-user" aria-label="ดูในฐานะผู้ใช้">
              ${S.api.demoUsers().map((u) => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${esc(u.full_name)} · ${esc(ROLES[u.role].label)}</option>`).join('')}
            </select>
          </label>` : ''}
        <div class="notif-root" id="notif-root">${notifHtml()}</div>
        <div class="who-chip" title="${esc(me.email)}">
          <span class="avatar">${esc(initials(me.full_name))}</span>
          <span class="who-text"><b>${esc(displayName(me))}</b><small>${esc(ROLES[me.role]?.label || me.role)}${me.home_branch ? ' · ' + esc(me.home_branch) : ''}</small></span>
        </div>
        <button class="btn btn-ghost" data-action="signout">ออกจากระบบ</button>
      </div>
    </div>
    <nav class="wrap tabs" aria-label="เมนูหลัก">
      ${tabs.map(([k, label]) => `<a href="#${k}" class="tab ${r === k || (r === 'receipt' && k === 'mine') ? 'is-on' : ''}">${label}<span class="tab-badge" id="badge-${k}" ${badgeFor(k) ? '' : 'hidden'}>${badgeText(badgeFor(k))}</span></a>`).join('')}
    </nav>
  </header>`;
}

async function render() {
  if (S.booting) return;
  const toastDiv = `<div id="toast" class="toast" role="status" ${S.toast ? '' : 'hidden'}>${esc(S.toast)}</div>`;
  if (S.recovery) { $app.innerHTML = recoveryHtml() + toastDiv; return; }
  if (!S.me) { $app.innerHTML = loginHtml() + toastDiv; return; }
  if (!S.me.profile_completed) { $app.innerHTML = onboardingHtml() + toastDiv; return; }
  let r = route();
  if (!allowed(r)) r = 'receive';
  if (r === 'receipt' && !S.currentId) r = 'mine';
  let body = '';
  try {
    body = await VIEWS[r]();
  } catch (e) {
    body = `<div class="wrap page"><div class="notice notice-warn">${esc(e.message)}</div></div>`;
  }
  onVisit(r);
  $app.innerHTML = headerHtml(r) + body + toastDiv;
  afterRender(r);
}

function afterRender(r) {
  if (r === 'all') {
    const q = document.getElementById('all-q');
    if (q && S._refocus === 'all-q') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  if (r === 'admin') {
    const q = document.getElementById('admin-q');
    if (q && S._refocus === 'admin-q') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  S._refocus = null;
}

/* ---------- notifications & menu badges ---------- */
const NOTIF_ICON = {
  verified: ['check', 'ok'], unverified: ['sync', 'neutral'],
  request: ['lock', 'warn'], permission: ['sync', 'info'], new_user: ['user', 'info'],
};
const badgeText = (n) => (n > 99 ? '99+' : String(n || ''));
const seenKey = () => 'mega-recv-seen-all-' + (S.me ? S.me.id : '');
function lastSeenAll() {
  try { const v = localStorage.getItem(seenKey()); if (v) return v; } catch {}
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); // ครั้งแรก: นับรายการของวันนี้
}
function markSeenAll() { try { localStorage.setItem(seenKey(), new Date().toISOString()); } catch {} S.badges.newReceipts = 0; }
const unreadMine = () => S.notif.list.filter((n) => !n.read_at && (n.type === 'verified' || n.type === 'unverified')).length;
function badgeFor(k) {
  if (k === 'all') return S.badges.newReceipts;
  if (k === 'mine') return unreadMine();
  if (k === 'admin') return S.badges.pending;
  return 0;
}
function relTime(ts) {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return m + ' นาทีที่แล้ว';
  if (m < 24 * 60) return Math.floor(m / 60) + ' ชม.ที่แล้ว';
  return fmtDate(new Date(ts).toISOString()) + ' ' + fmtTime(ts);
}

function notifHtml() {
  const N = S.notif;
  const unread = N.list.filter((n) => !n.read_at).length;
  return `
    <button type="button" class="icon-btn bell ${N.open ? 'is-open' : ''}" data-action="notif-toggle" aria-expanded="${N.open}" aria-label="แจ้งเตือน${unread ? ' ยังไม่อ่าน ' + unread + ' รายการ' : ''}">
      ${ICON.bell}${unread ? `<span class="bell-badge">${badgeText(unread)}</span>` : ''}
    </button>
    ${N.open ? `
      <div class="notif-panel" role="dialog" aria-label="แจ้งเตือน">
        <div class="notif-head">
          <b>แจ้งเตือน</b>
          ${unread ? '<button type="button" class="linklike small" data-action="notif-readall">อ่านทั้งหมด</button>' : ''}
        </div>
        ${N.list.length ? `<ul class="notif-list">${N.list.map((n) => {
          const [ic, tone] = NOTIF_ICON[n.type] || ['bell', 'neutral'];
          return `<li><button type="button" class="notif-item ${n.read_at ? '' : 'is-unread'}" data-action="notif-open" data-id="${esc(n.id)}">
            <span class="notif-ic tone-bg-${tone}">${ICON[ic]}</span>
            <span class="notif-text"><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}<small>${relTime(n.created_at)}</small></span>
            ${n.read_at ? '' : '<span class="notif-dot" aria-label="ยังไม่อ่าน"></span>'}
          </button></li>`;
        }).join('')}</ul>` : '<div class="empty"><b>ยังไม่มีแจ้งเตือน</b><span class="muted small">เมื่อมีการตรวจรับของ คำขอ หรือการปรับสิทธิ์ จะแจ้งที่นี่</span></div>'}
      </div>` : ''}`;
}

// อัปเดตเฉพาะกระดิ่งและตัวเลขบนเมนู ไม่วาดหน้าใหม่ (ไม่รบกวนฟอร์มที่กำลังกรอก)
function updateNotifDom() {
  const root = document.getElementById('notif-root');
  if (root) root.innerHTML = notifHtml();
  ['all', 'mine', 'admin'].forEach((k) => {
    const el = document.getElementById('badge-' + k);
    if (!el) return;
    const n = badgeFor(k);
    el.textContent = badgeText(n);
    el.hidden = !n;
  });
}

async function refreshNotifs({ announce = true } = {}) {
  if (!S.me || !S.me.profile_completed || !S.api) return;
  try {
    const before = new Set(S.notif.list.map((n) => n.id));
    const [list, counts] = await Promise.all([S.api.listNotifications(), S.api.badgeCounts(lastSeenAll())]);
    const fresh = list.filter((n) => !n.read_at && !before.has(n.id));
    S.notif.list = list;
    S.badges = counts;
    if (route() === 'all') S.badges.newReceipts = 0;
    if (announce && S.notif.loaded && fresh.length) {
      toast(fresh.length === 1 ? fresh[0].title : `มีแจ้งเตือนใหม่ ${fresh.length} รายการ`);
      if (fresh.some((n) => n.type === 'permission')) { S.me = await S.api.currentProfile(); S.cache.all = null; render(); }
    }
    S.notif.loaded = true;
    updateNotifDom();
  } catch (e) { /* เงียบไว้ ลองใหม่รอบหน้า */ }
}

function onVisit(r) {
  if (r === 'all') markSeenAll();
  if (r === 'mine' || r === 'receipt') {
    const ids = S.notif.list.filter((n) => !n.read_at && (n.type === 'verified' || n.type === 'unverified')
      && (r === 'mine' || n.link === 'receipt:' + S.currentId)).map((n) => n.id);
    if (ids.length) {
      const now = new Date().toISOString();
      S.notif.list.forEach((n) => { if (ids.includes(n.id)) n.read_at = now; });
      S.api.markNotificationsRead(ids).catch(() => {});
    }
  }
}

async function openNotification(id) {
  const n = S.notif.list.find((x) => x.id == id);
  if (!n) return;
  S.notif.open = false;
  if (!n.read_at) { n.read_at = new Date().toISOString(); S.api.markNotificationsRead([n.id]).catch(() => {}); }
  const [kind, ref] = (n.link || '').split(':');
  if (n.type === 'permission') { S.me = await S.api.currentProfile(); resetCaches(); }
  if (kind === 'receipt') { S.currentId = ref; S.justSaved = false; S.cache.detail = null; go('receipt'); }
  else if (kind === 'admin' && S.me.can_manage) { S.admin.selected = ref; S.admin.draft = null; S.cache.profiles = null; S.cache.log = null; go('admin'); }
  else if (kind === 'all') { S.cache.all = null; go('all'); }
  else render();
}

let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  S.notif = { list: [], open: false, loaded: false };
  S.badges = { newReceipts: 0, pending: 0 };
  refreshNotifs({ announce: false });
  pollTimer = setInterval(() => refreshNotifs(), S.api.mode === 'demo' ? 5000 : 30000);
}

/* ---------- login ---------- */
const MS_LOGO = '<svg class="ms-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>';

function loginHtml() {
  const demo = S.api.mode === 'demo';
  const L = S.login;
  return `
  <main class="login">
    <section class="login-brand">
      <div class="login-brand-in">
        <span class="logo-card"><img src="images/logo.png" alt="MEGA Clinic"></span>
        <h1 class="login-title">ระบบรับของสาขา</h1>
        <p class="login-lead">บันทึกการรับสินค้าที่หน้าสาขา แนบรูปและเอกสาร ส่งถึงฝ่ายจัดซื้อทันที</p>
        <ul class="login-points">
          <li>${ICON.camera}<span>ถ่ายรูปสินค้าและเอกสารจากมือถือ</span></li>
          <li>${ICON.sync}<span>ชื่อผู้รับของดึงจากบัญชีอัตโนมัติ</span></li>
          <li>${ICON.lock}<span>แต่ละคนเห็นเฉพาะรายการตามสิทธิ์</span></li>
        </ul>
        <p class="login-branches">${BRANCHES.join(' · ')}</p>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        ${loginFormHtml(L, demo)}


        ${demo ? `
          <div class="demo-accounts stack-sm">
            <div class="row-between"><span class="label">บัญชีตัวอย่าง</span>${chip('โหมดตัวอย่าง', 'warn')}</div>
            <p class="muted small p">ยังไม่ได้เชื่อมฐานข้อมูล เลือกบัญชีเพื่อลองดูว่าแต่ละบทบาทเห็นอะไร</p>
            <div class="demo-list">
              ${S.api.demoUsers().map((u) => `
                <button type="button" class="demo-user" data-action="login-demo" data-id="${u.id}">
                  <span class="avatar">${esc(initials(u.full_name))}</span>
                  <span class="who-text"><b>${u.profile_completed ? esc(displayName(u)) : 'ผู้ใช้ใหม่'}</b><small>${u.profile_completed ? esc(ROLES[u.role].label) + ' · ' + esc(u.home_branch) : 'เข้าครั้งแรก ยังไม่กรอกข้อมูล'}</small></span>
                </button>`).join('')}
            </div>
          </div>` : ''}
      </div>
    </section>
  </main>`;
}

const pwField = (id, label, auto, hint = '') => `
  <div class="stack-xs">
    <label for="${id}" class="label">${label}</label>
    <div class="pw-wrap">
      <input id="${id}" class="input" type="password" autocomplete="${auto}" minlength="8" required>
      <button type="button" class="pw-toggle" data-action="pw-toggle" data-for="${id}" aria-label="แสดงรหัสผ่าน">แสดง</button>
    </div>
    ${hint ? `<span class="muted small">${hint}</span>` : ''}
  </div>`;

function loginFormHtml(L, demo) {
  const domain = esc(CONFIG.ALLOWED_EMAIL_DOMAIN);
  const emailField = `
    <div class="stack-xs">
      <label for="login-email" class="label">อีเมลบริษัท</label>
      <input id="login-email" class="input" type="email" autocomplete="username" inputmode="email" required placeholder="name@${domain}" value="${esc(L.email)}">
    </div>`;
  const err = L.error ? `<div class="notice notice-danger" role="alert">${esc(L.error)}</div>` : '';
  const info = L.info ? `<div class="notice notice-info notice-icon" role="status">${ICON.check}<span>${L.info}</span></div>` : '';

  if (L.mode === 'forgot') {
    return `
      <div class="stack-xs">
        <h2 class="h1">ลืมรหัสผ่าน</h2>
        <p class="muted p">กรอกอีเมลบริษัท ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p>
      </div>
      <form class="stack" data-form="forgot" novalidate>
        ${emailField}
        ${err}${info}
        <button class="btn btn-primary btn-lg btn-block" type="submit" ${L.busy ? 'disabled' : ''}>${L.busy ? 'กำลังส่ง…' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}</button>
      </form>
      <button type="button" class="btn btn-ghost" data-action="login-mode" data-value="signin">← กลับไปหน้าเข้าสู่ระบบ</button>`;
  }

  const signup = L.mode === 'signup';
  return `
    <div class="login-tabs" role="tablist" aria-label="เข้าสู่ระบบหรือสมัครใช้งาน">
      <button type="button" role="tab" aria-selected="${!signup}" class="login-tab ${signup ? '' : 'is-on'}" data-action="login-mode" data-value="signin">เข้าสู่ระบบ</button>
      <button type="button" role="tab" aria-selected="${signup}" class="login-tab ${signup ? 'is-on' : ''}" data-action="login-mode" data-value="signup">สมัครใช้งานครั้งแรก</button>
    </div>
    <p class="muted p">${signup ? `สมัครด้วยอีเมลบริษัท @${domain} และตั้งรหัสผ่านของคุณเอง` : `ใช้อีเมลบริษัท @${domain} และรหัสผ่านที่ตั้งไว้`}</p>
    <form class="stack" data-form="${signup ? 'signup' : 'signin'}" novalidate>
      ${emailField}
      ${signup
        ? pwField('login-pw', 'ตั้งรหัสผ่าน', 'new-password', 'อย่างน้อย 8 ตัวอักษร') + pwField('login-pw2', 'ยืนยันรหัสผ่าน', 'new-password')
        : pwField('login-pw', 'รหัสผ่าน', 'current-password')}
      ${signup ? '' : '<button type="button" class="linklike small forgot-link" data-action="login-mode" data-value="forgot">ลืมรหัสผ่าน?</button>'}
      ${err}${info}
      <button class="btn btn-primary btn-lg btn-block" type="submit" ${L.busy ? 'disabled' : ''}>${L.busy ? 'กำลังดำเนินการ…' : (signup ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ')}</button>
    </form>
    ${demo ? '<p class="muted small p">โหมดตัวอย่าง: ใช้อีเมลของบัญชีตัวอย่างด้านล่าง รหัสผ่านอะไรก็ได้ 8 ตัวขึ้นไป</p>' : ''}`;
}

// หน้าตั้งรหัสผ่านใหม่ (เปิดจากลิงก์ในอีเมล "ลืมรหัสผ่าน")
function recoveryHtml() {
  const R = S.recovery;
  return `
  <main class="wrap page page-narrow">
    <div class="card stack">
      <img class="logo" src="images/logo.png" alt="MEGA Clinic">
      <div class="stack-xs">
        <h1 class="h1">ตั้งรหัสผ่านใหม่</h1>
        <p class="muted p">${S.me ? 'สำหรับ ' + esc(S.me.email) : ''}</p>
      </div>
      <form class="stack" data-form="recovery" novalidate>
        ${pwField('new-pw', 'รหัสผ่านใหม่', 'new-password', 'อย่างน้อย 8 ตัวอักษร')}
        ${pwField('new-pw2', 'ยืนยันรหัสผ่านใหม่', 'new-password')}
        ${R.error ? `<div class="notice notice-danger" role="alert">${esc(R.error)}</div>` : ''}
        <button class="btn btn-primary btn-lg btn-block" type="submit" ${R.busy ? 'disabled' : ''}>${R.busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</button>
      </form>
    </div>
  </main>`;
}

// แปลงข้อความผิดพลาดจากระบบเป็นภาษาไทย
function authError(e) {
  const m = String(e && e.message || e);
  if (/Invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (ถ้ายังไม่เคยตั้งรหัสผ่าน ให้กด "สมัครใช้งานครั้งแรก" หรือ "ลืมรหัสผ่าน?")';
  if (/already registered|already been registered/i.test(m)) return 'อีเมลนี้สมัครไว้แล้ว ให้เข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน?" เพื่อตั้งรหัสใหม่';
  if (/Database error saving new user|อนุญาตเฉพาะอีเมล/i.test(m)) return 'ใช้ได้เฉพาะอีเมล @' + CONFIG.ALLOWED_EMAIL_DOMAIN;
  if (/Email not confirmed/i.test(m)) return 'บัญชียังไม่ได้ยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ';
  if (/Password should be|weak/i.test(m)) return 'รหัสผ่านง่ายเกินไป ใช้อย่างน้อย 8 ตัว ผสมตัวอักษรและตัวเลข';
  if (/rate limit|security purposes|too many/i.test(m)) return 'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (/same.*password|different from the old/i.test(m)) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม';
  return m;
}

function readEmail(L) {
  L.email = document.getElementById('login-email').value.trim();
  const domain = CONFIG.ALLOWED_EMAIL_DOMAIN;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(L.email)) return 'กรอกอีเมลให้ถูกต้อง เช่น name@' + domain;
  if (domain && !L.email.toLowerCase().endsWith('@' + domain)) return 'ใช้ได้เฉพาะอีเมล @' + domain;
  return '';
}

async function submitAuth(kind) {
  const L = S.login;
  L.error = ''; L.info = '';
  const emailErr = readEmail(L);
  if (emailErr) { L.error = emailErr; render(); return; }
  const pw = document.getElementById('login-pw')?.value || '';
  if (kind === 'signup') {
    const pw2 = document.getElementById('login-pw2').value;
    if (pw.length < 8) { L.error = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'; render(); return; }
    if (pw !== pw2) { L.error = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; render(); return; }
  }
  if (kind === 'signin' && !pw) { L.error = 'กรอกรหัสผ่าน'; render(); return; }
  L.busy = kind; render();
  try {
    if (kind === 'forgot') {
      await S.api.sendPasswordReset(L.email);
      L.busy = ''; L.info = `ถ้ามีบัญชีของ <b>${esc(L.email)}</b> ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว เปิดอีเมลแล้วกดลิงก์ภายใน 1 ชั่วโมง`;
      render(); return;
    }
    const r = kind === 'signup' ? await S.api.signUp(L.email, pw) : await S.api.signInPassword(L.email, pw);
    L.busy = '';
    if (r && r.needsConfirm) { L.mode = 'signin'; L.info = 'สมัครแล้ว กรุณาเปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ'; render(); return; }
    finishLogin(r);
  } catch (e) { L.busy = ''; L.error = authError(e); render(); }
}

async function submitRecovery() {
  const R = S.recovery;
  const pw = document.getElementById('new-pw').value;
  const pw2 = document.getElementById('new-pw2').value;
  R.error = '';
  if (pw.length < 8) { R.error = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'; render(); return; }
  if (pw !== pw2) { R.error = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; render(); return; }
  R.busy = true; render();
  try {
    const p = await S.api.updatePassword(pw);
    S.recovery = null;
    history.replaceState(null, '', location.pathname + '#receive');
    toast('ตั้งรหัสผ่านใหม่แล้ว');
    finishLogin(p);
  } catch (e) { R.busy = false; R.error = authError(e); render(); }
}

/* ---------- first-time profile ---------- */
function startOnboarding() {
  const me = S.me;
  // เติมชื่อจากบัญชี Microsoft ไว้ให้ก่อน (ถ้าเป็นชื่อจริง ไม่ใช่ส่วนหน้า @ ของอีเมล)
  const fromAccount = me.full_name && me.full_name !== me.email.split('@')[0] ? me.full_name.trim().split(/\s+/) : [];
  S.onb = {
    first: fromAccount[0] || '', last: fromAccount.slice(1).join(' '), nick: me.nickname || '',
    role: 'staff', branch: HOME_BRANCHES.includes(me.home_branch) ? me.home_branch : '', errors: [], busy: false,
  };
}

function onboardingHtml() {
  if (!S.onb) startOnboarding();
  const o = S.onb;
  const err = (k) => o.errors.includes(k);
  return `
  <header class="topbar">
    <div class="wrap topbar-in">
      <span class="brand"><img class="logo" src="images/logo.png" alt="MEGA Clinic"><span class="brand-sep" aria-hidden="true"></span><span class="brand-name">ระบบรับของสาขา</span></span>
      <button class="btn btn-ghost" data-action="signout">ออกจากระบบ</button>
    </div>
  </header>
  <main class="wrap page page-narrow">
    <form class="stack-lg" data-form="onboard" novalidate>
      <div class="stack-xs">
        <span class="label-sm">เข้าใช้งานครั้งแรก</span>
        <h1 class="h1">กรอกข้อมูลของคุณ</h1>
        <p class="muted p">ชื่อนี้จะแสดงเป็น "ผู้รับของ" ในทุกรายการที่คุณบันทึก</p>
      </div>

      <section class="card stack">
        <div class="receiver">
          <span class="avatar avatar-lg">${esc(initials((o.first + ' ' + o.last).trim() || S.me.email))}</span>
          <div class="receiver-text"><span class="label-sm">บัญชีที่เข้าสู่ระบบ</span><b class="small">${esc(S.me.email)}</b></div>
        </div>
        <div class="name-grid">
          <div class="stack-sm">
            <label class="label" for="onb-first">ชื่อ <span class="req">*</span></label>
            <input id="onb-first" class="input ${err('first') ? 'is-err' : ''}" type="text" autocomplete="given-name" value="${esc(o.first)}" data-field="onb-first" ${err('first') ? 'aria-invalid="true"' : ''}>
          </div>
          <div class="stack-sm">
            <label class="label" for="onb-last">นามสกุล <span class="req">*</span></label>
            <input id="onb-last" class="input ${err('last') ? 'is-err' : ''}" type="text" autocomplete="family-name" value="${esc(o.last)}" data-field="onb-last" ${err('last') ? 'aria-invalid="true"' : ''}>
          </div>
        </div>
        <div class="stack-sm">
          <label class="label" for="onb-nick">ชื่อเล่น <span class="req">*</span></label>
          <input id="onb-nick" class="input ${err('nick') ? 'is-err' : ''}" type="text" autocomplete="nickname" placeholder="เช่น แบม" value="${esc(o.nick)}" data-field="onb-nick" ${err('nick') ? 'aria-invalid="true"' : ''}>
        </div>
      </section>

      <section class="card stack">
        <fieldset class="stack-sm">
          <legend class="h2">สาขาประจำ <span class="req">*</span></legend>
          <div class="seg seg-3 ${err('branch') ? 'is-err' : ''}" role="radiogroup" aria-label="สาขาประจำ">
            ${HOME_BRANCHES.map((b) => `<button type="button" role="radio" aria-checked="${o.branch === b}" class="seg-btn ${o.branch === b ? 'is-on' : ''}" data-action="onb-branch" data-value="${esc(b)}">${esc(b)}</button>`).join('')}
          </div>
        </fieldset>
      </section>

      <section class="card stack">
        <fieldset class="stack-sm">
          <legend class="h2">บทบาท <span class="req">*</span></legend>
          ${Object.entries(ROLES).map(([k, r]) => `
            <button type="button" role="radio" aria-checked="${o.role === k}" class="radio-card ${o.role === k ? 'is-on' : ''}" data-action="onb-role" data-value="${k}">
              <span class="radio-dot"></span><span class="radio-text"><b>${r.label}</b><small>${r.desc}</small></span>
              ${SELF_ROLES.includes(k) ? '' : chip('ต้องอนุมัติ', 'neutral')}
            </button>`).join('')}
        </fieldset>
        ${SELF_ROLES.includes(o.role)
          ? `<div class="notice small">${esc(ROLES[o.role].label)}เห็นทุกรายการรับของของสาขาประจำ${o.branch && o.branch !== 'สำนักงานใหญ่' ? ' (' + esc(o.branch) + ')' : ''} ถ้าต้องการดูสาขาอื่น ขออนุมัติได้ภายหลัง</div>`
          : `<div class="notice notice-info small">ระบบจะส่งคำขอบทบาท "${esc(ROLES[o.role].label)}" ไปให้ผู้ดูแลระบบอนุมัติ ระหว่างรอ คุณใช้งานในสิทธิ์พนักงานสาขาได้ทันที</div>`}
      </section>

      ${o.errors.length ? `<div class="notice notice-danger" role="alert">กรอกให้ครบ: ${o.errors.map((k) => ({ first: 'ชื่อ', last: 'นามสกุล', nick: 'ชื่อเล่น', branch: 'สาขาประจำ' })[k]).join(', ')}</div>` : ''}

      <button type="submit" class="btn btn-primary btn-lg btn-block" ${o.busy ? 'disabled' : ''}>${o.busy ? 'กำลังบันทึก…' : 'บันทึกและเริ่มใช้งาน'}</button>
    </form>
  </main>`;
}

async function submitOnboarding() {
  const o = S.onb;
  ['first', 'last', 'nick'].forEach((k) => { o[k] = (o[k] || '').trim(); });
  o.errors = ['first', 'last', 'nick', 'branch'].filter((k) => !o[k]);
  if (o.errors.length) { render(); return; }
  o.busy = true; render();
  try {
    S.me = await S.api.completeProfile({
      full_name: `${o.first} ${o.last}`, nickname: o.nick, home_branch: o.branch, requested_role: o.role,
    });
    const requested = SELF_ROLES.includes(o.role) ? '' : ROLES[o.role].label;
    S.onb = null; S.form = newForm(S.me); resetCaches(); startPolling();
    toast(requested ? `บันทึกแล้ว ส่งคำขอบทบาท${requested}ให้ผู้ดูแลระบบ` : 'บันทึกแล้ว ยินดีต้อนรับ ' + S.me.nickname);
    if (location.hash !== '#receive') location.hash = 'receive'; else render();
  } catch (e) {
    o.busy = false; o.errors = []; toast('บันทึกไม่สำเร็จ: ' + e.message); render();
  }
}

async function finishLogin(profile) {
  S.me = profile;
  S.login = { mode: 'signin', email: '', busy: '', error: '', info: '' };
  resetCaches();
  S.form = newForm(S.me);
  S.onb = null;
  toast(S.me.profile_completed ? 'ยินดีต้อนรับ ' + (S.me.nickname || S.me.full_name) : 'เข้าสู่ระบบครั้งแรก กรอกข้อมูลเพื่อเริ่มใช้งาน');
  startPolling();
  if (location.hash !== '#receive') location.hash = 'receive'; else render();
}

/* ---------- view: receive form ---------- */
function receiveHtml() {
  const f = S.form;
  const me = S.me;
  const total = f.items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
  return `
  <main class="wrap page page-narrow">
    <form class="stack-lg" data-form="receive" novalidate>
      ${me.requested_role && me.requested_role !== me.role ? `<div class="notice notice-info notice-icon">${ICON.lock}<span>คำขอบทบาท <b>${esc(ROLES[me.requested_role]?.label)}</b> รอผู้ดูแลระบบอนุมัติ ระหว่างนี้ใช้งานในสิทธิ์${esc(ROLES[me.role].label)}</span></div>` : ''}
      <section class="card receiver">
        <span class="avatar avatar-lg">${esc(initials(me.full_name))}</span>
        <div class="receiver-text">
          <span class="label-sm">ผู้รับของ</span>
          <b>${esc(displayName(me))}</b>
          <small class="muted">${esc(me.email)}</small>
        </div>
        <span class="chip chip-ok chip-icon">${ICON.sync}ซิงค์จาก User</span>
      </section>

      <section class="card stack">
        <h2 class="h2">สาขาและวันที่รับ</h2>
        <fieldset class="stack-sm">
          <legend class="label">สาขาที่รับสินค้า</legend>
          <div class="seg seg-3" role="radiogroup" aria-label="สาขาที่รับสินค้า">
            ${BRANCHES.map((b) => `<button type="button" role="radio" aria-checked="${f.branch === b}" class="seg-btn ${f.branch === b ? 'is-on' : ''}" data-action="pick-branch" data-value="${esc(b)}">${esc(b)}</button>`).join('')}
          </div>
        </fieldset>
        <div class="stack-sm">
          <label for="recv-date" class="label">วันที่รับสินค้า</label>
          <input id="recv-date" class="input" type="date" max="${localISO()}" value="${esc(f.received_date)}" data-field="received_date">
        </div>
      </section>

      <section class="card stack">
        <div class="row-between">
          <h2 class="h2">รายการที่รับ</h2>
          <span class="muted small" id="item-total">${f.items.length} รายการ · รวม ${total} ชิ้น</span>
        </div>
        <div class="stack-sm">
          ${f.items.map((it, i) => `
            <div class="item">
              <div class="item-top">
                <span class="item-no">${i + 1}</span>
                <input id="item-name-${i}" class="input" type="text" aria-label="ชื่อสินค้า รายการที่ ${i + 1}" placeholder="พิมพ์ชื่อสินค้า" value="${esc(it.name)}" data-field="item-name" data-idx="${i}" autocomplete="off">
                <button type="button" class="icon-btn" aria-label="ลบรายการที่ ${i + 1}" data-action="remove-item" data-idx="${i}" ${f.items.length === 1 ? 'disabled' : ''}>${ICON.trash}</button>
              </div>
              <div class="item-bottom">
                <div class="stepper">
                  <button type="button" aria-label="ลดจำนวน" data-action="dec" data-idx="${i}">−</button>
                  <input id="item-qty-${i}" type="number" inputmode="decimal" min="0" step="any" aria-label="จำนวน" value="${esc(it.qty)}" data-field="item-qty" data-idx="${i}">
                  <button type="button" aria-label="เพิ่มจำนวน" data-action="inc" data-idx="${i}">+</button>
                </div>
                <input id="item-unit-${i}" class="input" type="text" aria-label="หน่วย" placeholder="หน่วย เช่น กล่อง" value="${esc(it.unit)}" data-field="item-unit" data-idx="${i}" list="unit-list">
              </div>
            </div>`).join('')}
          <datalist id="unit-list">${['ชิ้น', 'กล่อง', 'ขวด', 'ห่อ', 'แพ็ค', 'รีม', 'ลัง', 'ม้วน', 'ตลับ', 'แกลลอน', 'ชุด'].map((u) => `<option value="${u}"></option>`).join('')}</datalist>
        </div>
        <button type="button" class="btn btn-dashed" data-action="add-item">${ICON.plus}เพิ่มรายการ</button>
      </section>

      <section class="card stack">
        <div class="stack-xs">
          <h2 class="h2">รูปสินค้าที่ได้รับ</h2>
          <span class="muted small">ถ่ายให้เห็นสภาพสินค้าและจำนวน อย่างน้อย 1 รูป (สูงสุด 6 รูป) · ระบบเก็บรูปไว้ ${CONFIG.PHOTO_RETENTION_DAYS} วัน</span>
        </div>
        <div class="thumbs">
          ${f.photos.map((p, i) => `
            <div class="thumb">
              <img src="${p.url}" alt="รูปสินค้า ${i + 1}">
              <button type="button" class="thumb-x" aria-label="ลบรูป ${i + 1}" data-action="remove-photo" data-idx="${i}">${ICON.x}</button>
            </div>`).join('')}
          ${f.photos.length < 6 ? `
            <label class="thumb thumb-add" for="photo-input">${ICON.camera}<span>ถ่าย / เลือกรูป</span></label>` : ''}
        </div>
        <input id="photo-input" type="file" accept="image/*" capture="environment" multiple hidden data-field="photos">
      </section>

      <section class="card stack">
        <h2 class="h2">เอกสารที่ได้รับ</h2>
        <div class="stack-sm" role="radiogroup" aria-label="ประเภทเอกสาร">
          ${Object.entries(DOC_TYPES).map(([k, d]) => `
            <button type="button" role="radio" aria-checked="${f.doc_type === k}" class="radio-card ${f.doc_type === k ? 'is-on' : ''}" data-action="pick-doc" data-value="${k}">
              <span class="radio-dot"></span>
              <span class="radio-text"><b>${d.label}</b><small>${d.hint}</small></span>
            </button>`).join('')}
        </div>
        ${f.doc_type !== 'none' ? `
          <div class="stack-sm">
            ${f.docs.map((d, i) => `
              <div class="file-row">
                ${ICON.doc}<span class="file-name">${esc(d.file.name)}</span>
                <button type="button" class="icon-btn" aria-label="ลบไฟล์ ${esc(d.file.name)}" data-action="remove-doc" data-idx="${i}">${ICON.x}</button>
              </div>`).join('')}
            <label class="btn btn-dashed" for="doc-input">${ICON.file}แนบรูป/ไฟล์${DOC_TYPES[f.doc_type].label}</label>
            <input id="doc-input" type="file" accept="image/*,application/pdf" multiple hidden data-field="docs">
          </div>` : `
          <div class="notice notice-warn">รายการนี้จะแสดงสถานะ "ไม่มีเอกสาร" ให้ฝ่ายจัดซื้อเห็นในรายการรับของ</div>`}
      </section>

      <section class="card stack-sm">
        <label for="note" class="h2">หมายเหตุ <span class="muted small">(ถ้ามี)</span></label>
        <textarea id="note" class="input" rows="3" placeholder="เช่น กล่องบุบ 1 กล่อง, ของมาไม่ครบ" data-field="note">${esc(f.note)}</textarea>
      </section>

      ${f.errors.length ? `<div class="notice notice-danger" role="alert"><b>ยังบันทึกไม่ได้</b><ul>${f.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}

      <div class="submit-bar">
        <span class="muted small">${f.branch ? 'สาขา' + esc(f.branch) : 'ยังไม่ได้เลือกสาขา'} · ${fmtDate(f.received_date)}</span>
        <button type="submit" class="btn btn-primary btn-lg" ${S.busy ? 'disabled' : ''}>${S.busy ? 'กำลังบันทึก…' : 'ยืนยันรับของ'}</button>
      </div>
    </form>
  </main>`;
}

function validate(f) {
  const e = [];
  if (!f.branch) e.push('เลือกสาขาที่รับสินค้า');
  if (!f.received_date) e.push('ใส่วันที่รับสินค้า');
  const filled = f.items.filter((i) => i.name.trim());
  if (!filled.length) e.push('พิมพ์ชื่อสินค้าอย่างน้อย 1 รายการ');
  if (filled.some((i) => !(Number(i.qty) > 0))) e.push('จำนวนสินค้าต้องมากกว่า 0');
  if (!f.photos.length) e.push('แนบรูปสินค้าอย่างน้อย 1 รูป');
  if (f.doc_type !== 'none' && !f.docs.length) e.push(`แนบไฟล์${DOC_TYPES[f.doc_type].label} หรือเลือก "ไม่มีเอกสาร"`);
  return e;
}

async function compressImage(file) {
  if (!file.type.startsWith('image/') || S.api.mode === 'demo') return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = CONFIG.MAX_IMAGE_SIZE;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

async function submitReceive() {
  const f = S.form;
  f.errors = validate(f);
  if (f.errors.length) { render(); return; }
  S.busy = true; render();
  try {
    const photos = await Promise.all(f.photos.map((p) => compressImage(p.file)));
    const docs = await Promise.all(f.docs.map((d) => compressImage(d.file)));
    const r = await S.api.createReceipt({
      branch: f.branch, received_date: f.received_date, doc_type: f.doc_type, note: f.note.trim(),
      items: f.items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), qty: Number(i.qty), unit: i.unit.trim() })),
      photos, docs: f.doc_type === 'none' ? [] : docs,
    });
    S.form = newForm(S.me);
    S.currentId = r.id; S.justSaved = true; S.cache.detail = r;
    S.busy = false;
    go('receipt');
  } catch (e) {
    S.busy = false;
    f.errors = ['บันทึกไม่สำเร็จ: ' + e.message + ' ลองกดยืนยันอีกครั้ง'];
    render();
  }
}

/* ---------- view: receipt summary ---------- */
function filesHtml(r, size = 'md') {
  const ph = (label, cls) => `<div class="ph ${cls}">${esc(label)}</div>`;
  const photos = r.photos.map((p, i) => p.purged ? ph(`ลบแล้ว (เกิน ${CONFIG.PHOTO_RETENTION_DAYS} วัน)`, 'ph-purged') : p.url
    ? `<a class="ph-link" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="รูปสินค้า ${i + 1}"></a>`
    : ph(`[รูป ${i + 1}]`, ''));
  const docs = r.docs.map((d, i) => d.purged ? ph(`ลบแล้ว (เกิน ${CONFIG.PHOTO_RETENTION_DAYS} วัน)`, 'ph-purged') : d.url && !d.isPdf
    ? `<a class="ph-link" href="${esc(d.url)}" target="_blank" rel="noopener"><img src="${esc(d.url)}" alt="เอกสาร ${i + 1}"></a>`
    : d.url ? `<a class="ph ph-doc" href="${esc(d.url)}" target="_blank" rel="noopener">${ICON.doc}PDF</a>` : `<div class="ph ph-doc">${ICON.doc}เอกสาร</div>`);
  const all = [...photos, ...docs];
  return all.length ? `<div class="thumbs thumbs-${size}">${all.join('')}</div>` : '<p class="muted small">ไม่มีไฟล์แนบ</p>';
}

function itemsTable(r) {
  return `
    <table class="items-table">
      <thead><tr><th>#</th><th>สินค้า</th><th class="num">จำนวน</th></tr></thead>
      <tbody>${r.items.map((i, k) => `<tr><td class="muted">${k + 1}</td><td>${esc(i.name)}</td><td class="num"><b>${esc(i.qty)}</b> ${esc(i.unit)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>รวม</td><td class="num"><b>${sumQty(r)}</b> ชิ้น</td></tr></tfoot>
    </table>`;
}

async function receiptHtml() {
  let r = S.cache.detail;
  if (!r || r.id !== S.currentId) r = S.cache.detail = await S.api.getReceipt(S.currentId);
  const saved = S.justSaved;
  S.justSaved = false;
  return `
  <main class="wrap page page-narrow stack-lg">
    ${saved ? `
      <section class="success">
        <span class="success-icon">${ICON.check}</span>
        <h1 class="h1">บันทึกรับของเรียบร้อย</h1>
        <span>ส่งข้อมูลถึงฝ่ายจัดซื้อแล้ว</span>
      </section>` : `<a href="#mine" class="back">← กลับไปรายการของฉัน</a>`}
    <section class="card stack">
      <div class="row-between">
        <div class="stack-xs"><span class="label-sm">เลขที่</span><h2 class="h1 mono">${esc(r.gr_no)}</h2></div>
        ${statusChip(r.status)}
      </div>
      <dl class="dl">
        <div><dt>ผู้รับของ</dt><dd>${esc(r.receiver_name)}</dd></div>
        <div><dt>สาขา</dt><dd>${esc(r.branch)}</dd></div>
        <div><dt>วันที่รับสินค้า</dt><dd>${fmtDate(r.received_date)}</dd></div>
        <div><dt>บันทึกเมื่อ</dt><dd>${fmtTime(r.created_at)} น.</dd></div>
        <div><dt>เอกสาร</dt><dd>${docChip(r.doc_type)}</dd></div>
      </dl>
    </section>
    <section class="card stack"><h2 class="h2">รายการที่รับ (${r.items.length})</h2>${itemsTable(r)}</section>
    <section class="card stack-sm"><h2 class="h2">ไฟล์แนบ</h2>${filesHtml(r)}</section>
    ${r.note ? `<section class="card stack-xs"><span class="label-sm">หมายเหตุ</span><p class="p">${esc(r.note)}</p></section>` : ''}
    <div class="stack-sm">
      <a href="#receive" class="btn btn-primary btn-lg btn-block">รับของรายการใหม่</a>
      <a href="#mine" class="btn btn-outline btn-block">ดูรายการของฉัน</a>
    </div>
  </main>`;
}

/* ---------- view: my receipts ---------- */
async function mineHtml() {
  const range = S.mine.range;
  const from = range === 'all' ? null : daysAgoISO(Number(range));
  const list = await S.api.listReceipts({ mineOnly: true, from });
  const qty = list.reduce((a, r) => a + sumQty(r), 0);
  const vis = visibleBranches(S.me);
  return `
  <main class="wrap page page-narrow stack-lg">
    <div class="row-between wrap-row">
      <h1 class="h1">รายการรับของของฉัน</h1>
      <label class="inline-field" for="mine-range"><span class="sr">ช่วงเวลา</span>
        <select id="mine-range" class="input input-sm" data-field="mine-range">
          ${[['7', '7 วันล่าสุด'], ['30', '30 วันล่าสุด'], ['90', '90 วันล่าสุด'], ['all', 'ทั้งหมด']].map(([v, l]) => `<option value="${v}" ${range === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="notice notice-info notice-icon">${ICON.lock}<span>หน้านี้แสดงเฉพาะรายการที่คุณเป็นผู้รับ ${vis.length
      ? `ดูรายการของ${S.me.scope === 'all' ? 'ทุกสาขา' : 'สาขา ' + esc(vis.join(', '))} ได้ที่ <a href="#all">รายการ${S.me.scope === 'all' ? 'ทุกสาขา' : 'สาขา'}</a>`
      : `ยังไม่ได้ตั้งสาขาประจำ ขอดูรายการสาขาได้ที่ <a href="#all">รายการสาขา</a>`}</span></div>
    <p class="muted small">${list.length} ครั้ง · รวม ${qty} ชิ้น</p>
    <div class="stack-sm">
      ${list.length ? list.map((r) => `
        <a class="card card-link" href="#receipt" data-action="open-receipt" data-id="${esc(r.id)}">
          <div class="row-between"><b class="mono">${esc(r.gr_no)}</b>${statusChip(r.status)}</div>
          <div class="muted small">${fmtDate(r.received_date)} · สาขา${esc(r.branch)}</div>
          <div>${esc(r.items[0]?.name || '-')}${r.items.length > 1 ? ` <span class="muted">+${r.items.length - 1} รายการ</span>` : ''}</div>
          <div class="row-between"><span class="small">${sumQty(r)} ชิ้น</span>${docChip(r.doc_type)}</div>
        </a>`).join('') : `
        <div class="empty"><b>ยังไม่มีรายการในช่วงนี้</b><span class="muted">เมื่อคุณบันทึกรับของ รายการจะแสดงที่นี่</span><a href="#receive" class="btn btn-primary">บันทึกรับของ</a></div>`}
    </div>
  </main>`;
}

/* ---------- view: all receipts (procurement) ---------- */
function filterAll(list) {
  const a = S.all;
  const q = a.q.trim().toLowerCase();
  return list.filter((r) =>
    (a.branch === 'all' || r.branch === a.branch) &&
    (a.doc === 'all' || r.doc_type === a.doc) &&
    (a.status === 'all' || r.status === a.status) &&
    (!q || [r.gr_no, r.receiver_name, r.note, ...r.items.map((i) => i.name)].join(' ').toLowerCase().includes(q)));
}

async function allHtml() {
  const a = S.all;
  if (!S.cache.all || S.cache.allKey !== a.from + a.to + S.me.id) {
    S.cache.all = await S.api.listReceipts({ from: a.from, to: a.to });
    S.cache.allKey = a.from + a.to + S.me.id;
  }
  const rows = filterAll(S.cache.all);
  const branches = visibleBranches(S.me);
  let detail = null;
  if (a.selected) {
    if (!S.cache.detail || S.cache.detail.id !== a.selected) S.cache.detail = await S.api.getReceipt(a.selected);
    detail = S.cache.detail;
  }
  const kpi = (label, value, tone = '') => `<div class="kpi"><span>${label}</span><b class="${tone}">${value}</b></div>`;
  return `
  <main class="wrap page stack-lg">
    <div class="row-between wrap-row">
      <div class="stack-xs">
        <h1 class="h1">${S.me.scope === 'all' ? 'รายการรับของทุกสาขา' : 'รายการรับของสาขา'}</h1>
        <span class="muted small">${S.me.scope === 'all' ? 'แสดงทุกสาขาตามสิทธิ์ของคุณ' : branches.length ? 'แสดงทุกรายการของสาขา ' + esc(branches.join(', ')) : 'ยังไม่มีสาขาที่ดูได้ แสดงเฉพาะรายการที่คุณรับเอง'}</span>
      </div>
      <div class="row-gap">
        ${S.me.scope !== 'all' ? `<button class="btn btn-outline" data-action="req-open">${ICON.plus}ขอดูสาขาอื่น</button>` : ''}
        ${S.me.can_export ? `<button class="btn btn-outline" data-action="export">${ICON.download}ส่งออก Excel (CSV)</button>` : ''}
      </div>
    </div>
    ${branchRequestHtml()}

    <section class="card filters" aria-label="ตัวกรอง">
      <div class="stack-xs">
        <span class="label-sm">สาขา</span>
        <div class="pills">
          ${['all', ...branches].map((b) => `<button type="button" class="pill ${a.branch === b ? 'is-on' : ''}" aria-pressed="${a.branch === b}" data-action="all-branch" data-value="${esc(b)}">${b === 'all' ? 'ทั้งหมด' : esc(b)}</button>`).join('')}
        </div>
      </div>
      <div class="stack-xs">
        <label class="label-sm" for="all-from">ช่วงวันที่รับ</label>
        <div class="daterange">
          <input id="all-from" class="input input-sm" type="date" value="${esc(a.from)}" data-field="all-from">
          <span class="muted">–</span>
          <input id="all-to" class="input input-sm" type="date" aria-label="ถึงวันที่" value="${esc(a.to)}" data-field="all-to">
        </div>
      </div>
      <div class="stack-xs">
        <label class="label-sm" for="all-doc">เอกสาร</label>
        <select id="all-doc" class="input input-sm" data-field="all-doc">
          <option value="all">ทั้งหมด</option>
          ${Object.entries(DOC_TYPES).map(([k, d]) => `<option value="${k}" ${a.doc === k ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>
      <div class="stack-xs">
        <label class="label-sm" for="all-status">สถานะ</label>
        <select id="all-status" class="input input-sm" data-field="all-status">
          <option value="all">ทั้งหมด</option>
          ${Object.entries(STATUS).map(([k, d]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${d.label}</option>`).join('')}
        </select>
      </div>
      <div class="stack-xs grow">
        <label class="label-sm" for="all-q">ค้นหา</label>
        <input id="all-q" class="input input-sm" type="search" placeholder="ชื่อสินค้า, ผู้รับ, เลขที่ GR" value="${esc(a.q)}" data-field="all-q">
      </div>
    </section>

    <section class="kpis" aria-label="สรุป">
      ${kpi('ครั้งที่รับของ', rows.length)}
      ${kpi('จำนวนสินค้ารวม', rows.reduce((s, r) => s + sumQty(r), 0) + ' <small>ชิ้น</small>')}
      ${kpi('ไม่มีเอกสาร (ต้องตาม)', rows.filter((r) => r.doc_type === 'none').length, 'tone-warn')}
      ${kpi('รอจัดซื้อตรวจ', rows.filter((r) => r.status === 'pending').length, 'tone-accent')}
    </section>

    <div class="split">
      <section class="card card-flush split-main" aria-label="รายการรับของ">
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>วันที่รับ</th><th>เลขที่</th><th>สาขา</th><th>ผู้รับ</th><th>รายการ</th><th class="num">จำนวน</th><th>เอกสาร</th><th>สถานะ</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr class="${a.selected === r.id ? 'is-sel' : ''}">
                  <td class="nowrap">${fmtDate(r.received_date)}<br><small class="muted">${fmtTime(r.created_at)} น.</small></td>
                  <td><button type="button" class="linklike mono" data-action="select-receipt" data-id="${esc(r.id)}">${esc(r.gr_no)}</button></td>
                  <td class="nowrap">${esc(r.branch)}</td>
                  <td class="nowrap">${esc(r.receiver_name)}</td>
                  <td>${esc(r.items[0]?.name || '-')}${r.items.length > 1 ? ` <span class="muted">+${r.items.length - 1}</span>` : ''}</td>
                  <td class="num"><b>${sumQty(r)}</b></td>
                  <td>${docChip(r.doc_type)}</td>
                  <td>${statusChip(r.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${rows.length ? '' : '<div class="empty"><b>ไม่พบรายการตามตัวกรอง</b><span class="muted">ลองขยายช่วงวันที่หรือเลือก "ทั้งหมด"</span></div>'}
      </section>

      <aside class="card split-side stack" aria-label="รายละเอียด">
        ${detail ? `
          <div class="row-between">
            <div class="stack-xs"><span class="label-sm">รายละเอียดการรับของ</span><h2 class="h2 mono">${esc(detail.gr_no)}</h2></div>
            <button class="icon-btn" aria-label="ปิดรายละเอียด" data-action="close-detail">${ICON.x}</button>
          </div>
          <dl class="dl dl-2">
            <div><dt>สาขา</dt><dd>${esc(detail.branch)}</dd></div>
            <div><dt>วันที่รับ</dt><dd>${fmtDate(detail.received_date)}</dd></div>
            <div><dt>ผู้รับ</dt><dd>${esc(detail.receiver_name)}</dd></div>
            <div><dt>เอกสาร</dt><dd>${docChip(detail.doc_type)}</dd></div>
          </dl>
          ${itemsTable(detail)}
          ${filesHtml(detail, 'sm')}
          ${detail.note ? `<div class="notice">${'หมายเหตุ: ' + esc(detail.note)}</div>` : ''}
          <div class="row-between"><span class="muted small">สถานะ</span>${statusChip(detail.status)}</div>
          ${S.me.can_verify ? (detail.status === 'pending'
            ? `<button class="btn btn-primary btn-block" data-action="verify" data-id="${esc(detail.id)}" data-value="1">${ICON.check}ตรวจสอบแล้ว · ตรงกับใบสั่งซื้อ</button>`
            : `<button class="btn btn-outline btn-block" data-action="verify" data-id="${esc(detail.id)}" data-value="0">ยกเลิกสถานะตรวจแล้ว</button>`) : ''}
        ` : `
          <div class="empty empty-side"><b>เลือกรายการเพื่อดูรายละเอียด</b><span class="muted">กดที่เลขที่ GR ในตาราง</span></div>`}
      </aside>
    </div>
  </main>`;
}

function branchRequestHtml() {
  const me = S.me;
  if (me.scope === 'all') return '';
  const pending = me.requested_branches || [];
  if (pending.length && !S.req.open) {
    return `<div class="notice notice-info notice-icon">${ICON.lock}<span>ส่งคำขอดูรายการสาขา <b>${esc(pending.join(', '))}</b> แล้ว รอผู้ดูแลระบบอนุมัติ
      <button type="button" class="linklike" data-action="req-cancel">ยกเลิกคำขอ</button></span></div>`;
  }
  if (!S.req.open) return '';
  const have = visibleBranches(me);
  const options = BRANCHES.filter((b) => !have.includes(b));
  const r = S.req;
  return `
    <section class="card stack" aria-label="ขอดูรายการสาขาอื่น">
      <div class="row-between">
        <div class="stack-xs"><h2 class="h2">ขอดูรายการสาขาอื่น</h2><span class="muted small">ผู้ดูแลระบบจะได้รับคำขอและอนุมัติให้</span></div>
        <button type="button" class="icon-btn" aria-label="ปิด" data-action="req-close">${ICON.x}</button>
      </div>
      ${options.length ? `
        <div class="checks checks-wide" role="group" aria-label="สาขาที่ต้องการดู">
          ${options.map((b) => {
            const on = r.branches.includes(b);
            return `<button type="button" role="checkbox" aria-checked="${on}" class="check ${on ? 'is-on' : ''}" data-action="req-branch" data-value="${esc(b)}"><span class="check-box">${on ? ICON.check : ''}</span>${esc(b)}</button>`;
          }).join('')}
        </div>
        <div class="stack-sm">
          <label class="label" for="req-note">เหตุผล <span class="muted small">(ถ้ามี)</span></label>
          <input id="req-note" class="input input-sm" type="text" placeholder="เช่น ช่วยดูแลสต็อกช่วงพนักงานลา" value="${esc(r.note)}" data-field="req-note">
        </div>
        <div class="row-gap">
          <button type="button" class="btn btn-primary" data-action="req-send" ${!r.branches.length || r.busy ? 'disabled' : ''}>${r.busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}</button>
          <button type="button" class="btn btn-outline" data-action="req-close">ยกเลิก</button>
        </div>` : '<p class="muted small p">คุณดูได้ทุกสาขาแล้ว</p>'}
    </section>`;
}

async function sendBranchRequest(branches, note) {
  S.req.busy = true; render();
  try {
    S.me = await S.api.requestBranches(branches, note.trim());
    S.req = { open: false, branches: [], note: '', busy: false };
    toast(branches.length ? 'ส่งคำขอแล้ว รอผู้ดูแลระบบอนุมัติ' : 'ยกเลิกคำขอแล้ว');
  } catch (e) { S.req.busy = false; toast('ส่งคำขอไม่สำเร็จ: ' + e.message); }
  render();
}

function exportCsv() {
  const rows = filterAll(S.cache.all || []);
  const head = ['วันที่รับ', 'เวลาบันทึก', 'เลขที่', 'สาขา', 'ผู้รับ', 'ลำดับ', 'สินค้า', 'จำนวน', 'หน่วย', 'เอกสาร', 'สถานะ', 'หมายเหตุ'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(',')];
  rows.forEach((r) => r.items.forEach((i, k) => lines.push([
    r.received_date, fmtTime(r.created_at), r.gr_no, r.branch, r.receiver_name, k + 1, i.name, i.qty, i.unit,
    DOC_TYPES[r.doc_type]?.label, STATUS[r.status]?.label, r.note,
  ].map(q).join(','))));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `รับของ_${S.all.from}_${S.all.to}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`ส่งออก ${rows.length} รายการ`);
}

/* ---------- view: permissions admin ---------- */
function scopeText(p) {
  if (p.scope === 'all') return 'ทุกสาขา';
  const home = BRANCHES.includes(p.home_branch) ? p.home_branch : '';
  const extra = (p.scope_branches || []).filter((b) => b !== home);
  if (!home && !extra.length) return 'เฉพาะของตัวเอง';
  return [home && `สาขาประจำ (${home})`, extra.length && `+ ${extra.join(', ')}`].filter(Boolean).join(' ');
}
const pendingRole = (p) => !!(p && p.requested_role && p.requested_role !== p.role);
const pendingBranches = (p) => !!(p && (p.requested_branches || []).length);
function isCustom(p) {
  const pre = ROLES[p.role]?.preset;
  if (!pre) return false;
  return pre.scope !== p.scope || PERMS.some(({ key }) => !!pre[key] !== !!p[key]);
}
function describeChange(before, after) {
  const out = [];
  if (before.full_name !== after.full_name) out.push(`ชื่อ: ${before.full_name} → ${after.full_name}`);
  if ((before.nickname || '') !== (after.nickname || '')) out.push(`ชื่อเล่น: ${before.nickname || '-'} → ${after.nickname || '-'}`);
  if ((before.home_branch || '') !== (after.home_branch || '')) out.push(`สาขาประจำ: ${before.home_branch || '-'} → ${after.home_branch}`);
  if (before.role !== after.role) out.push(`บทบาท: ${ROLES[before.role].label} → ${ROLES[after.role].label}`);
  if (scopeText(before) !== scopeText(after)) out.push(`ขอบเขตการดู: ${scopeText(before)} → ${scopeText(after)}`);
  PERMS.forEach(({ key, label }) => { if (!!before[key] !== !!after[key]) out.push(`${label}: ${after[key] ? 'เปิด' : 'ปิด'}`); });
  return out.join(' · ');
}

async function adminHtml() {
  if (!S.cache.profiles) S.cache.profiles = await S.api.listProfiles();
  if (!S.cache.log) S.cache.log = await S.api.listPermissionLog();
  const ad = S.admin;
  const q = ad.q.trim().toLowerCase();
  const pendingReq = (p) => pendingRole(p) || pendingBranches(p);
  const users = S.cache.profiles
    .filter((p) => !q || [p.full_name, p.nickname, p.email, p.home_branch].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (pendingReq(b) ? 1 : 0) - (pendingReq(a) ? 1 : 0));
  const pendingCount = S.cache.profiles.filter(pendingReq).length;
  if (!ad.selected && S.cache.profiles.length) ad.selected = S.cache.profiles[0].id;
  const base = S.cache.profiles.find((p) => p.id === ad.selected);
  if (base && (!ad.draft || ad.draft.id !== base.id)) ad.draft = JSON.parse(JSON.stringify(base));
  const d = ad.draft;
  const dirty = d && base && (describeChange(base, d) || d._note || '');
  const self = d && d.id === S.me.id;

  return `
  <main class="wrap page stack-lg">
    <div class="stack-xs">
      <h1 class="h1">จัดการสิทธิ์ผู้ใช้</h1>
      <span class="muted small">พนักงานสาขาและหัวหน้าสาขาเห็นทุกรายการของสาขาประจำโดยอัตโนมัติ การดูสาขาอื่น และบทบาทจัดซื้อ/ผู้ดูแลระบบ ต้องอนุมัติที่หน้านี้</span>
    </div>
    ${pendingCount ? `<div class="notice notice-warn"><b>มี ${pendingCount} คำขอรออนุมัติ</b> แสดงไว้บนสุดของตาราง</div>` : ''}

    <section class="roles" aria-label="บทบาท">
      ${Object.entries(ROLES).map(([k, r]) => `
        <div class="role-tile"><b>${r.label}</b><span class="muted small">${r.desc}</span>
        <span class="small"><span class="muted">มี</span> ${S.cache.profiles.filter((p) => p.role === k).length} คน</span></div>`).join('')}
    </section>

    <div class="split">
      <section class="card card-flush split-main" aria-label="ผู้ใช้">
        <div class="card-head">
          <label class="sr" for="admin-q">ค้นหาผู้ใช้</label>
          <input id="admin-q" class="input input-sm" type="search" placeholder="ค้นหาชื่อ อีเมล หรือสาขา" value="${esc(ad.q)}" data-field="admin-q">
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>ผู้ใช้</th><th>สาขาประจำ</th><th>บทบาท</th><th>ขอบเขตการดู</th><th>สิทธิ์อื่น</th></tr></thead>
            <tbody>
              ${users.map((p) => `
                <tr class="${ad.selected === p.id ? 'is-sel' : ''}">
                  <td>
                    <button type="button" class="user-btn" data-action="select-user" data-id="${esc(p.id)}">
                      <span class="avatar">${esc(initials(p.full_name))}</span>
                      <span class="who-text"><b>${esc(displayName(p))}</b><small class="muted">${esc(p.email)}</small></span>
                    </button>
                  </td>
                  <td class="nowrap">${esc(p.home_branch || '-')}</td>
                  <td class="nowrap">${esc(ROLES[p.role]?.label || p.role)}${isCustom(p) ? ' ' + chip('กำหนดเอง', 'info') : ''}${pendingRole(p) ? '<br>' + chip('ขอเป็น' + ROLES[p.requested_role].label, 'warn') : ''}</td>
                  <td>${esc(scopeText(p))}${pendingBranches(p) ? '<br>' + chip('ขอดู ' + p.requested_branches.join(', '), 'warn') : ''}</td>
                  <td class="small">${PERMS.filter(({ key }) => p[key]).map(({ label }) => esc(label.split(' ')[0])).join(', ') || '<span class="muted">-</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <aside class="card split-side stack" aria-label="แก้ไขสิทธิ์">
        ${d ? `
          <div class="receiver">
            <span class="avatar avatar-lg">${esc(initials(d.full_name))}</span>
            <div class="receiver-text"><b>${esc(displayName(base))}</b><small class="muted">${esc(d.email)}</small></div>
          </div>

          ${pendingBranches(base) ? `
            <div class="notice notice-warn stack-sm">
              <span>ขอดูรายการรับของสาขา <b>${esc(base.requested_branches.join(', '))}</b></span>
              ${base.branch_request_note ? `<span class="small">เหตุผล: ${esc(base.branch_request_note)}</span>` : ''}
              <div class="row-gap">
                <button type="button" class="btn btn-primary" data-action="d-approve-br">อนุมัติ</button>
                <button type="button" class="btn btn-outline" data-action="d-reject-br">ไม่อนุมัติ</button>
              </div>
            </div>` : ''}
          ${pendingRole(base) ? `
            <div class="notice notice-warn stack-sm">
              <span>ขอบทบาท <b>${esc(ROLES[base.requested_role].label)}</b> ตอนกรอกข้อมูลครั้งแรก</span>
              <div class="row-gap">
                <button type="button" class="btn btn-primary" data-action="d-approve" data-value="${esc(base.requested_role)}">อนุมัติเป็น${esc(ROLES[base.requested_role].label)}</button>
                <button type="button" class="btn btn-outline" data-action="d-reject">ไม่อนุมัติ</button>
              </div>
            </div>` : ''}

          <div class="name-grid">
            <div class="stack-sm"><label class="label" for="d-name">ชื่อ-นามสกุล</label>
              <input id="d-name" class="input input-sm" type="text" value="${esc(d.full_name)}" data-field="d-name"></div>
            <div class="stack-sm"><label class="label" for="d-nick">ชื่อเล่น</label>
              <input id="d-nick" class="input input-sm" type="text" value="${esc(d.nickname || '')}" data-field="d-nick"></div>
          </div>

          <div class="stack-sm">
            <label class="label" for="home-branch">สาขาประจำ</label>
            <select id="home-branch" class="input input-sm" data-field="d-home">
              ${d.home_branch ? '' : '<option value="" selected>— ยังไม่ระบุ —</option>'}${HOME_BRANCHES.map((b) => `<option ${d.home_branch === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>

          <fieldset class="stack-sm">
            <legend class="label">บทบาท</legend>
            <div class="seg seg-2" role="radiogroup" aria-label="บทบาท">
              ${Object.entries(ROLES).map(([k, r]) => `<button type="button" role="radio" aria-checked="${d.role === k}" class="seg-btn ${d.role === k ? 'is-on' : ''}" data-action="d-role" data-value="${k}" ${self && k !== 'admin' && d.role === 'admin' ? 'disabled title="เปลี่ยนบทบาทของตัวเองไม่ได้"' : ''}>${r.label}</button>`).join('')}
            </div>
            <span class="muted small">เลือกบทบาทแล้วสิทธิ์ด้านล่างจะตั้งตามค่าเริ่มต้น ปรับรายข้อเพิ่มได้</span>
          </fieldset>

          <fieldset class="stack-sm">
            <legend class="label">ขอบเขตการดูรายการรับของ</legend>
            ${Object.entries(SCOPES).map(([k, s]) => `
              <button type="button" role="radio" aria-checked="${d.scope === k}" class="radio-card ${d.scope === k ? 'is-on' : ''}" data-action="d-scope" data-value="${k}">
                <span class="radio-dot"></span><span class="radio-text"><b>${s.label}</b><small>${s.hint}</small></span>
              </button>`).join('')}
            ${d.scope === 'branches' ? `
              <span class="label-sm">สาขาที่ดูได้ (สาขาประจำเลือกไว้เสมอ)</span>
              <div class="checks" role="group" aria-label="สาขาที่ดูได้">
                ${BRANCHES.map((b) => {
                  const home = b === d.home_branch;
                  const on = home || (d.scope_branches || []).includes(b);
                  return `<button type="button" role="checkbox" aria-checked="${on}" class="check ${on ? 'is-on' : ''}" data-action="d-branch" data-value="${esc(b)}" ${home ? 'disabled title="สาขาประจำ"' : ''}><span class="check-box">${on ? ICON.check : ''}</span>${esc(b)}${home ? ' <small class="muted">(ประจำ)</small>' : ''}</button>`;
                }).join('')}
              </div>` : ''}
          </fieldset>

          <fieldset class="stack-sm">
            <legend class="label">สิทธิ์อื่น</legend>
            <div class="switch-row is-locked"><span class="radio-text"><b>บันทึกรับของ และดูรายการของสาขาประจำ</b><small>ทุกคนมีสิทธิ์นี้</small></span>${ICON.lock}</div>
            ${PERMS.map(({ key, label, hint }) => {
              const lock = self && key === 'can_manage';
              return `<button type="button" role="switch" aria-checked="${!!d[key]}" class="switch-row" data-action="d-perm" data-value="${key}" ${lock ? 'disabled title="ปิดสิทธิ์จัดการของตัวเองไม่ได้"' : ''}>
                <span class="radio-text"><b>${label}</b><small>${lock ? 'ปิดสิทธิ์นี้ของตัวเองไม่ได้' : hint}</small></span>
                <span class="switch ${d[key] ? 'is-on' : ''}"><span></span></span>
              </button>`;
            }).join('')}
          </fieldset>

          ${dirty ? `<div class="notice notice-info small"><b>จะเปลี่ยน:</b> ${esc(dirty)}</div>` : ''}
          <div class="row-gap">
            <button class="btn btn-primary grow" data-action="d-save" ${!dirty || S.busy ? 'disabled' : ''}>${S.busy ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}</button>
            <button class="btn btn-outline" data-action="d-reset" ${dirty ? '' : 'disabled'}>ยกเลิก</button>
          </div>
        ` : '<div class="empty empty-side"><b>ยังไม่มีผู้ใช้</b></div>'}
      </aside>
    </div>

    <section class="card stack-sm" aria-label="ประวัติการเปลี่ยนสิทธิ์">
      <h2 class="h2">ประวัติการเปลี่ยนสิทธิ์</h2>
      ${S.cache.log.length ? `<ul class="log">${S.cache.log.map((l) => `
        <li><span class="muted small nowrap">${fmtDate(l.at)} ${fmtTime(l.at)}</span>
        <span><b>${esc(l.actor_name)}</b> แก้สิทธิ์ของ <b>${esc(l.target_name)}</b> — ${esc(l.summary)}</span></li>`).join('')}</ul>` : '<p class="muted small">ยังไม่มีการเปลี่ยนสิทธิ์</p>'}
    </section>
  </main>`;
}

async function saveDraft() {
  const ad = S.admin;
  const base = S.cache.profiles.find((p) => p.id === ad.selected);
  const d = ad.draft;
  const summary = [d._note, describeChange(base, d)].filter(Boolean).join(' · ');
  const reqBranches = d.requested_branches || [];
  const patch = {
    full_name: d.full_name.trim(), nickname: (d.nickname || '').trim(),
    requested_role: d.requested_role && d.requested_role !== d.role ? d.requested_role : null,
    requested_branches: reqBranches, branch_request_note: reqBranches.length ? d.branch_request_note : null,
    role: d.role, scope: d.scope, home_branch: d.home_branch,
    scope_branches: d.scope === 'branches' ? (d.scope_branches || []).filter((b) => b !== d.home_branch) : [],
    can_export: !!d.can_export, can_verify: !!d.can_verify, can_manage: !!d.can_manage,
  };
  S.busy = true; render();
  try {
    await S.api.updateProfile(d.id, patch, summary);
    S.cache.profiles = null; S.cache.log = null; S.cache.all = null; ad.draft = null;
    if (d.id === S.me.id) S.me = await S.api.currentProfile();
    toast('บันทึกสิทธิ์ของ ' + d.full_name + ' แล้ว');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message);
  }
  S.busy = false; render();
}

const VIEWS = { receive: receiveHtml, receipt: receiptHtml, mine: mineHtml, all: allHtml, admin: adminHtml };

/* ---------- events ---------- */
function resetCaches() { S.onb = null; S.cache = { mine: null, all: null, detail: null, profiles: null, log: null }; S.all.selected = null; S.admin = { selected: null, draft: null, q: '', saved: false }; }

$app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const act = el.dataset.action;
  const idx = Number(el.dataset.idx);
  const f = S.form;
  const d = S.admin.draft;
  switch (act) {
    case 'pick-branch': f.branch = el.dataset.value; render(); break;
    case 'pick-doc': f.doc_type = el.dataset.value; render(); break;
    case 'add-item': f.items.push({ name: '', qty: 1, unit: '' }); await render(); document.getElementById(`item-name-${f.items.length - 1}`)?.focus(); break;
    case 'remove-item': f.items.splice(idx, 1); render(); break;
    case 'inc': f.items[idx].qty = (Number(f.items[idx].qty) || 0) + 1; render(); break;
    case 'dec': f.items[idx].qty = Math.max(0, (Number(f.items[idx].qty) || 0) - 1); render(); break;
    case 'remove-photo': URL.revokeObjectURL(f.photos[idx].url); f.photos.splice(idx, 1); render(); break;
    case 'remove-doc': f.docs.splice(idx, 1); render(); break;
    case 'open-receipt': ev.preventDefault(); S.currentId = el.dataset.id; S.justSaved = false; go('receipt'); break;
    case 'all-branch': S.all.branch = el.dataset.value; render(); break;
    case 'select-receipt': S.all.selected = el.dataset.id; render(); break;
    case 'close-detail': S.all.selected = null; render(); break;
    case 'verify':
      try {
        S.cache.detail = await S.api.setVerified(el.dataset.id, el.dataset.value === '1');
        const row = S.cache.all.find((r) => r.id === el.dataset.id);
        if (row) row.status = S.cache.detail.status;
        toast(el.dataset.value === '1' ? 'บันทึกว่าตรวจแล้ว' : 'เปลี่ยนกลับเป็นรอตรวจ');
      } catch (e) { toast(e.message); }
      render(); break;
    case 'export': exportCsv(); break;
    case 'select-user': S.admin.selected = el.dataset.id; S.admin.draft = null; render(); break;
    case 'd-role': d.role = el.dataset.value; Object.assign(d, ROLES[d.role].preset); if (d.id === S.me.id) d.can_manage = true; render(); break;
    case 'd-scope': d.scope = el.dataset.value; render(); break;
    case 'd-branch': {
      const set = new Set(d.scope_branches || []);
      set.has(el.dataset.value) ? set.delete(el.dataset.value) : set.add(el.dataset.value);
      d.scope_branches = BRANCHES.filter((b) => set.has(b)); render(); break;
    }
    case 'd-perm': d[el.dataset.value] = !d[el.dataset.value]; render(); break;
    case 'd-reset': S.admin.draft = null; render(); break;
    case 'd-save': saveDraft(); break;
    case 'd-approve': d.role = el.dataset.value; Object.assign(d, ROLES[d.role].preset); d.requested_role = null; d._note = 'อนุมัติคำขอบทบาท'; saveDraft(); break;
    case 'd-reject': d._note = 'ไม่อนุมัติคำขอบทบาท ' + ROLES[d.requested_role].label; d.requested_role = null; saveDraft(); break;
    case 'd-approve-br':
      d._note = 'อนุมัติให้ดูสาขา ' + d.requested_branches.join(', ');
      if (d.scope !== 'all') d.scope_branches = BRANCHES.filter((b) => (d.scope_branches || []).includes(b) || d.requested_branches.includes(b));
      d.requested_branches = []; saveDraft(); break;
    case 'd-reject-br': d._note = 'ไม่อนุมัติคำขอดูสาขา ' + d.requested_branches.join(', '); d.requested_branches = []; saveDraft(); break;
    case 'req-open': S.req = { open: true, branches: [], note: '', busy: false }; render(); break;
    case 'req-close': S.req.open = false; render(); break;
    case 'req-branch': {
      const set = new Set(S.req.branches);
      set.has(el.dataset.value) ? set.delete(el.dataset.value) : set.add(el.dataset.value);
      S.req.branches = BRANCHES.filter((b) => set.has(b)); render(); break;
    }
    case 'req-send': sendBranchRequest(S.req.branches, S.req.note); break;
    case 'req-cancel': sendBranchRequest([], ''); break;
    case 'onb-role': S.onb.role = el.dataset.value; render(); break;
    case 'onb-branch': S.onb.branch = el.dataset.value; S.onb.errors = S.onb.errors.filter((x) => x !== 'branch'); render(); break;
    case 'notif-toggle': S.notif.open = !S.notif.open; updateNotifDom(); if (S.notif.open) refreshNotifs({ announce: false }); break;
    case 'notif-readall':
      S.notif.list.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
      updateNotifDom(); S.api.markNotificationsRead(null).catch(() => {}); break;
    case 'notif-open': openNotification(el.dataset.id); break;
    case 'signout': await S.api.signOut(); S.me = null; resetCaches(); clearInterval(pollTimer); toast('ออกจากระบบแล้ว'); render(); break;
    case 'login-ms':
      S.login.busy = 'ms'; S.login.error = ''; render();
      try {
        const p = await S.api.signInMicrosoft(); // ระบบจริงจะพาไปหน้า Microsoft แล้วกลับมาเอง
        if (p) finishLogin(p);
      } catch (e) { S.login.busy = ''; S.login.error = 'เข้าสู่ระบบไม่สำเร็จ: ' + e.message; render(); }
      break;
    case 'login-demo': finishLogin(await S.api.signInDemo(el.dataset.id)); break;
    case 'login-mode': {
      const email = document.getElementById('login-email')?.value?.trim();
      S.login = { ...S.login, mode: el.dataset.value, error: '', info: '', email: email ?? S.login.email };
      render(); document.getElementById(S.login.email ? 'login-pw' : 'login-email')?.focus(); break;
    }
    case 'pw-toggle': {
      const inp = document.getElementById(el.dataset.for);
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      el.textContent = show ? 'ซ่อน' : 'แสดง';
      el.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'); break;
    }
  }
});

$app.addEventListener('input', (ev) => {
  const el = ev.target;
  const field = el.dataset?.field;
  if (!field) return;
  const f = S.form;
  const i = Number(el.dataset.idx);
  if (field === 'item-name') f.items[i].name = el.value;
  else if (field === 'item-unit') f.items[i].unit = el.value;
  else if (field === 'item-qty') {
    f.items[i].qty = el.value;
    const t = document.getElementById('item-total');
    if (t) t.textContent = `${f.items.length} รายการ · รวม ${f.items.reduce((a, x) => a + (Number(x.qty) || 0), 0)} ชิ้น`;
  } else if (field === 'note') f.note = el.value;
  else if (field === 'd-name') S.admin.draft.full_name = el.value;
  else if (field === 'd-nick') S.admin.draft.nickname = el.value;
  else if (field === 'req-note') S.req.note = el.value;
  else if (field.startsWith('onb-')) {
    const k = field.slice(4); S.onb[k] = el.value;
    if (el.value.trim()) { S.onb.errors = S.onb.errors.filter((x) => x !== k); el.classList.remove('is-err'); el.removeAttribute('aria-invalid'); }
  }
  else if (field === 'all-q') { S.all.q = el.value; S._refocus = 'all-q'; clearTimeout(S._qt); S._qt = setTimeout(render, 200); }
  else if (field === 'admin-q') { S.admin.q = el.value; S._refocus = 'admin-q'; clearTimeout(S._qt); S._qt = setTimeout(render, 200); }
});

$app.addEventListener('change', async (ev) => {
  const el = ev.target;
  const field = el.dataset?.field;
  if (!field) return;
  const f = S.form;
  switch (field) {
    case 'received_date': f.received_date = el.value; render(); break;
    case 'photos': {
      const room = 6 - f.photos.length;
      [...el.files].slice(0, room).forEach((file) => f.photos.push({ file, url: URL.createObjectURL(file) }));
      if (el.files.length > room) toast('แนบรูปได้สูงสุด 6 รูป');
      render(); break;
    }
    case 'docs': [...el.files].forEach((file) => f.docs.push({ file })); render(); break;
    case 'mine-range': S.mine.range = el.value; render(); break;
    case 'all-from': S.all.from = el.value; S.cache.all = null; render(); break;
    case 'all-to': S.all.to = el.value; S.cache.all = null; render(); break;
    case 'all-doc': S.all.doc = el.value; render(); break;
    case 'all-status': S.all.status = el.value; render(); break;
    case 'd-home': S.admin.draft.home_branch = el.value; render(); break;
    case 'd-name': case 'd-nick': render(); break;
    case 'demo-user':
      S.me = S.api.switchUser(el.value); resetCaches(); S.form = newForm(S.me); startPolling();
      toast('กำลังดูในฐานะ ' + S.me.full_name);
      if (!allowed(route())) go('receive'); else render();
      break;
  }
});

$app.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target.dataset.form;
  if (form === 'receive') submitReceive();
  if (form === 'onboard') submitOnboarding();
  if (form === 'signin' || form === 'signup' || form === 'forgot') submitAuth(form);
  if (form === 'recovery') submitRecovery();
});

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
window.addEventListener('auth-recovery', async () => {
  S.me = await S.api.currentProfile(); S.recovery = { error: '', busy: false }; render();
});
window.addEventListener('auth-changed', async () => {
  if (S.recovery) return;
  S.me = await S.api.currentProfile(); resetCaches(); S.form = newForm(S.me); render();
});

/* ---------- boot ---------- */
(async function boot() {
  try {
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      const { createSupabaseApi } = await import('./api-supabase.js');
      S.api = await createSupabaseApi(CONFIG);
    } else {
      S.api = createDemoApi();
    }
    S.me = await S.api.init();
    if (S.api.isRecoveryLink && S.api.isRecoveryLink()) S.recovery = { error: '', busy: false };
  } catch (e) {
    $app.innerHTML = `<main class="wrap page"><div class="notice notice-danger">เชื่อมต่อระบบไม่สำเร็จ: ${esc(e.message)}<br>ตรวจสอบค่าใน js/config.js</div></main>`;
    return;
  }
  S.form = newForm(S.me);
  S.booting = false;
  render();
  if (S.me) startPolling();
})();

// ปิดแผงแจ้งเตือนเมื่อคลิกที่อื่น และโหลดใหม่เมื่อกลับมาที่แท็บ
document.addEventListener('click', (ev) => {
  // ปุ่มในแผงถูกวาดใหม่แล้ว (หลุดจากหน้า) = คลิกภายในแผง ไม่ต้องปิด
  if (S.notif.open && document.contains(ev.target) && !ev.target.closest('#notif-root')) { S.notif.open = false; updateNotifDom(); }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && S.notif.open) { S.notif.open = false; updateNotifDom(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshNotifs(); });
