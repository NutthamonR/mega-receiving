-- =====================================================================
-- ระบบรับของสาขา MEGA Clinic : โครงสร้างฐานข้อมูล + สิทธิ์ (Supabase)
-- วิธีใช้: Supabase > SQL Editor > New query > วางทั้งไฟล์ > Run (รันครั้งเดียวในโปรเจกต์ใหม่)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- ตาราง ----------

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  nickname       text not null default '',
  home_branch    text check (home_branch in ('สำนักงานใหญ่', 'สยาม', 'ลาดพร้าว', 'รังสิต', 'เวสต์เกต', 'ศรีนครินทร์')),
  profile_completed boolean not null default false,  -- กรอกข้อมูลครั้งแรกแล้วหรือยัง
  requested_role text check (requested_role in ('staff', 'lead', 'purchasing', 'admin')),  -- บทบาทที่ขอ รอผู้ดูแลอนุมัติ
  role           text not null default 'staff' check (role in ('staff', 'lead', 'purchasing', 'admin')),
  -- branches = สาขาประจำ + สาขาที่อนุมัติเพิ่ม (scope_branches); all = ทุกสาขา
  scope          text not null default 'branches' check (scope in ('branches', 'all')),
  scope_branches text[] not null default '{}',     -- สาขาอื่นที่อนุมัติให้ดูเพิ่ม
  requested_branches text[] not null default '{}', -- สาขาที่ขอดู รอผู้ดูแลอนุมัติ
  branch_request_note text,
  can_export     boolean not null default false,
  can_verify     boolean not null default false,
  can_manage     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create sequence public.gr_seq start 1;

create table public.receipts (
  id            uuid primary key default gen_random_uuid(),
  gr_no         text unique,
  received_by   uuid not null default auth.uid() references public.profiles(id),
  receiver_name text not null default '',
  branch        text not null check (branch in ('สยาม', 'ลาดพร้าว', 'รังสิต', 'เวสต์เกต', 'ศรีนครินทร์')),
  received_date date not null,
  doc_type      text not null check (doc_type in ('tax_invoice', 'delivery_note', 'none')),
  note          text,
  status        text not null default 'pending' check (status in ('pending', 'verified')),
  verified_by   uuid references public.profiles(id),
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index receipts_date_idx   on public.receipts (received_date desc, created_at desc);
create index receipts_branch_idx on public.receipts (branch);
create index receipts_user_idx   on public.receipts (received_by);

create table public.receipt_items (
  id         bigint generated always as identity primary key,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  line_no    int not null,
  name       text not null check (length(trim(name)) > 0),
  qty        numeric not null check (qty > 0),
  unit       text
);
create index receipt_items_receipt_idx on public.receipt_items (receipt_id);

create table public.receipt_files (
  id         bigint generated always as identity primary key,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  kind       text not null check (kind in ('photo', 'document')),
  path       text not null unique,
  file_name  text,
  created_at timestamptz not null default now(),
  purged_at  timestamptz  -- ไฟล์ถูกลบตามระยะเวลาเก็บแล้ว (ดู scripts/purge-old-photos.mjs)
);
create index receipt_files_receipt_idx on public.receipt_files (receipt_id);
create index receipt_files_purge_idx on public.receipt_files (created_at) where purged_at is null;

create table public.permission_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid default auth.uid(),
  actor_name  text,
  target_id   uuid references public.profiles(id) on delete set null,
  target_name text,
  summary     text not null
);

-- ---------- ฟังก์ชันตรวจสิทธิ์ ----------

create or replace function public.can_view_receipt(p_branch text, p_received_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p_received_by = p.id
           or p.scope = 'all'
           or p_branch = p.home_branch
           or p_branch = any (p.scope_branches))
  );
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_manage from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_verifier()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_verify from profiles where id = auth.uid()), false);
$$;

-- ---------- สร้างโปรไฟล์อัตโนมัติเมื่อผู้ใช้เข้าสู่ระบบครั้งแรก ----------
-- ชื่อผู้รับของดึงจากบัญชี (Microsoft: ชื่อที่แสดงใน Microsoft 365)
-- ผู้ใช้ใหม่ = พนักงานสาขา เห็นเฉพาะรายการของตัวเอง

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_domain text := 'megaclinicthailand.com';  -- ใส่ '' ถ้าไม่ต้องการจำกัดโดเมนอีเมล
begin
  if v_domain <> '' and lower(split_part(new.email, '@', 2)) <> v_domain then
    raise exception 'อนุญาตเฉพาะอีเมล @%', v_domain;
  end if;
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- กรอกข้อมูลครั้งแรก ----------
-- ผู้ใช้แก้ได้เฉพาะชื่อ ชื่อเล่น สาขาประจำ และ "ขอ" บทบาท; สิทธิ์จริงเปลี่ยนได้โดยผู้ดูแลระบบเท่านั้น

create or replace function public.complete_profile(
  p_full_name text, p_nickname text, p_home_branch text, p_requested_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_nickname), '') = '' or p_home_branch is null then
    raise exception 'กรอกชื่อ-นามสกุล ชื่อเล่น และสาขาประจำให้ครบ';
  end if;
  update profiles set
    full_name = trim(p_full_name),
    nickname = trim(p_nickname),
    home_branch = p_home_branch,
    -- พนักงานสาขา/หัวหน้าสาขา เลือกเองได้ทันที; จัดซื้อ/ผู้ดูแลระบบ เป็นคำขอรออนุมัติ
    role = case when p_requested_role in ('staff', 'lead') then p_requested_role else 'staff' end,
    can_export = (p_requested_role = 'lead'),
    requested_role = case when p_requested_role in ('staff', 'lead') then null else p_requested_role end,
    profile_completed = true
  where id = auth.uid() and profile_completed = false;
  if not found then raise exception 'กรอกข้อมูลครั้งแรกไปแล้ว หากต้องการแก้ไขให้ติดต่อผู้ดูแลระบบ'; end if;
end $$;

grant execute on function public.complete_profile(text, text, text, text) to authenticated;

-- ---------- ขอดูรายการสาขาอื่น ----------
-- ส่ง array ว่าง = ยกเลิกคำขอ; ผู้ดูแลระบบอนุมัติโดยย้ายไปไว้ใน scope_branches

create or replace function public.request_branch_access(p_branches text[], p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clean text[];
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  select coalesce(array_agg(b order by b), '{}') into v_clean
  from (select distinct unnest(coalesce(p_branches, '{}')) as b) x
  join profiles p on p.id = auth.uid()
  where b in ('สยาม', 'ลาดพร้าว', 'รังสิต', 'เวสต์เกต', 'ศรีนครินทร์')
    and b is distinct from p.home_branch
    and not (b = any (p.scope_branches));
  update profiles
     set requested_branches = v_clean,
         branch_request_note = case when cardinality(v_clean) > 0 then nullif(trim(p_note), '') end
   where id = auth.uid();
end $$;

grant execute on function public.request_branch_access(text[], text) to authenticated;

-- ---------- กันการแก้ข้อมูลที่ไม่ควรแก้ ----------

create or replace function public.receipts_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select case when nickname <> '' then full_name || ' (' || nickname || ')' else full_name end
    into v_name from profiles where id = auth.uid() and profile_completed;
  if v_name is null then
    raise exception 'กรุณากรอกข้อมูลผู้ใช้ให้ครบก่อนบันทึกรับของ';
  end if;
  new.received_by   := auth.uid();
  new.receiver_name := v_name;
  new.status        := 'pending';
  new.verified_by   := null;
  new.verified_at   := null;
  new.created_at    := now();
  new.gr_no := 'GR-' || to_char(now() at time zone 'Asia/Bangkok', 'YYMM') || '-'
               || lpad(nextval('public.gr_seq')::text, 4, '0');
  return new;
end $$;

create trigger receipts_before_insert
  before insert on public.receipts
  for each row execute function public.receipts_before_insert();

create or replace function public.receipts_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner_window boolean;
begin
  new.id := old.id; new.gr_no := old.gr_no; new.received_by := old.received_by;
  new.receiver_name := old.receiver_name; new.created_at := old.created_at;

  -- ผู้รับแก้รายละเอียดได้ภายใน 24 ชม. ถ้ายังไม่ถูกตรวจ; คนอื่นแก้ได้เฉพาะสถานะ
  v_owner_window := old.received_by = auth.uid() and old.created_at > now() - interval '24 hours' and old.status = 'pending';
  if not v_owner_window then
    new.branch := old.branch; new.received_date := old.received_date;
    new.doc_type := old.doc_type; new.note := old.note;
  end if;

  if new.status is distinct from old.status then
    if not public.is_verifier() then
      raise exception 'คุณไม่มีสิทธิ์ตรวจสอบรายการ';
    end if;
    if new.status = 'verified' then
      new.verified_by := auth.uid(); new.verified_at := now();
    else
      new.verified_by := null; new.verified_at := null;
    end if;
  else
    new.verified_by := old.verified_by; new.verified_at := old.verified_at;
  end if;
  return new;
end $$;

create trigger receipts_before_update
  before update on public.receipts
  for each row execute function public.receipts_before_update();

create or replace function public.profiles_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.email := old.email; new.created_at := old.created_at; new.updated_at := now();
  if old.id = auth.uid() and old.can_manage and not new.can_manage then
    raise exception 'ปิดสิทธิ์จัดการของตัวเองไม่ได้ ให้ผู้ดูแลระบบคนอื่นเป็นผู้ปรับ';
  end if;
  if new.scope <> 'branches' then new.scope_branches := '{}'; end if;
  return new;
end $$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

create or replace function public.permission_log_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.actor_id    := auth.uid();
  new.actor_name  := (select full_name from profiles where id = auth.uid());
  new.target_name := (select full_name from profiles where id = new.target_id);
  new.at          := now();
  return new;
end $$;

create trigger permission_log_before_insert
  before insert on public.permission_log
  for each row execute function public.permission_log_before_insert();

-- ---------- Row Level Security ----------

alter table public.profiles       enable row level security;
alter table public.receipts       enable row level security;
alter table public.receipt_items  enable row level security;
alter table public.receipt_files  enable row level security;
alter table public.permission_log enable row level security;

-- profiles: เห็นของตัวเอง; ผู้ดูแลระบบเห็นและแก้ได้ทุกคน
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- receipts: เห็นตามขอบเขตสิทธิ์; บันทึกได้ทุกคน (ในชื่อตัวเอง); ไม่มีการลบ
create policy receipts_select on public.receipts for select to authenticated
  using (public.can_view_receipt(branch, received_by));
create policy receipts_insert on public.receipts for insert to authenticated
  with check (received_by = auth.uid());
create policy receipts_update on public.receipts for update to authenticated
  using (
    (received_by = auth.uid() and created_at > now() - interval '24 hours' and status = 'pending')
    or (public.is_verifier() and public.can_view_receipt(branch, received_by))
  );

-- รายการสินค้าและไฟล์: มองเห็นตามใบรับของ; เพิ่มได้เฉพาะใบของตัวเองภายใน 24 ชม.
create policy items_select on public.receipt_items for select to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_id));
create policy items_insert on public.receipt_items for insert to authenticated
  with check (exists (select 1 from public.receipts r where r.id = receipt_id and r.received_by = auth.uid()
                      and r.created_at > now() - interval '24 hours'));

create policy files_select on public.receipt_files for select to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_id));
create policy files_insert on public.receipt_files for insert to authenticated
  with check (
    split_part(path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.receipts r where r.id = receipt_id and r.received_by = auth.uid()
                and r.created_at > now() - interval '24 hours'));

-- ประวัติการเปลี่ยนสิทธิ์: เฉพาะผู้ดูแลระบบ
create policy log_select on public.permission_log for select to authenticated using (public.is_manager());
create policy log_insert on public.permission_log for insert to authenticated with check (public.is_manager());

-- ---------- ที่เก็บรูป/เอกสาร (Storage) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- อัปโหลดได้เฉพาะในโฟลเดอร์ของตัวเอง (<user id>/...)
create policy receipts_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- เปิดดูไฟล์ได้ถ้าเป็นของตัวเอง หรือมีสิทธิ์ดูใบรับของนั้น
create policy receipts_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or exists (select 1 from public.receipt_files f
                    join public.receipts r on r.id = f.receipt_id
                    where f.path = storage.objects.name))
  );

-- ---------- แจ้งเตือน ----------
-- สร้างโดย trigger ในฐานข้อมูลเท่านั้น (หน้าเว็บสร้างเองไม่ได้) ผู้ใช้อ่าน/ทำเครื่องหมายว่าอ่านแล้วได้เฉพาะของตัวเอง

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,   -- verified | unverified | request | permission | new_user
  title      text not null,
  body       text,
  link       text,            -- receipt:<id> | admin:<user id> | all
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.role_label(p text)
returns text language sql immutable as $$
  select case p when 'staff' then 'พนักงานสาขา' when 'lead' then 'หัวหน้าสาขา'
                when 'purchasing' then 'จัดซื้อ' when 'admin' then 'ผู้ดูแลระบบ' else p end;
$$;

create or replace function public.display_name(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when nickname <> '' then full_name || ' (' || nickname || ')' else full_name end
  from profiles where id = p_id;
$$;

-- ส่งถึงคนเดียว (ไม่ส่งให้คนที่เป็นผู้ทำเอง)
create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link
  where p_user is not null and p_user is distinct from auth.uid();
$$;

-- ส่งถึงกลุ่ม: 'manage' = ผู้ดูแลระบบ, 'verify' = ผู้ตรวจสอบ (จัดซื้อ)
create or replace function public.notify_group(p_group text, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link from profiles
  where id is distinct from auth.uid()
    and ((p_group = 'manage' and can_manage) or (p_group = 'verify' and can_verify));
$$;

revoke execute on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_group(text, text, text, text, text) from public, anon, authenticated;

-- 1) ตรวจรับของแล้ว / ยกเลิกการตรวจ -> แจ้งคนที่รับของ
create or replace function public.receipts_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform notify_user(new.received_by,
      case when new.status = 'verified' then 'verified' else 'unverified' end,
      case when new.status = 'verified' then 'ตรวจรับของแล้ว · ' else 'ยกเลิกสถานะตรวจแล้ว · ' end || new.gr_no,
      coalesce(display_name(auth.uid()), 'ฝ่ายจัดซื้อ')
        || case when new.status = 'verified' then ' ตรวจสอบ' else ' ยกเลิกการตรวจ' end
        || 'รายการรับของสาขา' || new.branch || ' วันที่ ' || to_char(new.received_date, 'DD/MM/') || (extract(year from new.received_date)::int + 543),
      'receipt:' || new.id);
  end if;
  return null;
end $$;

create trigger receipts_notify
  after update on public.receipts
  for each row execute function public.receipts_notify();

-- 2) ผู้ใช้ใหม่กรอกข้อมูลครั้งแรก / 3) ขอดูสาขาอื่น -> แจ้งผู้ดูแลระบบ
create or replace function public.profiles_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not old.profile_completed and new.profile_completed then
    perform notify_group('manage', 'new_user', 'ผู้ใช้ใหม่ · ' || display_name(new.id),
      'สาขาประจำ ' || coalesce(new.home_branch, '-') || ' · ' || role_label(new.role)
        || coalesce(' · ขอบทบาท' || role_label(new.requested_role), ''),
      'admin:' || new.id);
  end if;
  if cardinality(new.requested_branches) > 0 and new.requested_branches is distinct from old.requested_branches then
    perform notify_group('manage', 'request', 'ขอดูรายการสาขา · ' || display_name(new.id),
      array_to_string(new.requested_branches, ', ') || coalesce(' · ' || new.branch_request_note, ''),
      'admin:' || new.id);
  end if;
  return null;
end $$;

create trigger profiles_notify
  after update on public.profiles
  for each row execute function public.profiles_notify();

-- 4) ผู้ดูแลระบบปรับสิทธิ์ / อนุมัติ / ไม่อนุมัติ -> แจ้งเจ้าของบัญชี
create or replace function public.permission_log_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_user(new.target_id, 'permission', 'สิทธิ์ของคุณถูกปรับ', new.summary, 'all');
  return null;
end $$;

create trigger permission_log_notify
  after insert on public.permission_log
  for each row execute function public.permission_log_notify();

-- =====================================================================
-- หลังจากตัวเองเข้าสู่ระบบครั้งแรกแล้ว ให้รันคำสั่งนี้ (แก้อีเมล) เพื่อตั้งเป็นผู้ดูแลระบบคนแรก:
--
-- update public.profiles
--   set role = 'admin', scope = 'all', can_export = true, can_verify = true, can_manage = true
--   where email = 'your.name@megaclinicthailand.com';
-- =====================================================================
