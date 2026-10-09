-- =====================================================================
-- 財政部公務人員協會 線上會員系統：資料庫結構與權限
-- 用法：在 Supabase 專案的「SQL Editor」貼上全文，按 Run（可重複執行）。
-- 權限原則：每張表都開啟「列層級安全」（RLS），預設誰都看不到；
--   一般會員只看得到自己的資料，幹部（預設：理事長、秘書長、總幹事、會計、承辦人，可在「系統設定」增刪）才看得到全部。
--   網頁上的公開金鑰（publishable key，舊版稱 anon key）本身沒有任何讀取權限，所有保護都在資料庫這一層。
-- =====================================================================

-- ---------- 資料表 ----------

-- 會員：理監事欄只能是「理事」或「監事」其中之一（互斥），會員代表可與任一身分並存
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  member_no text unique,
  name text not null check (length(trim(name)) > 0),
  gender text not null default '' check (gender in ('', '女', '男')),
  employee_no text not null default '',
  agency text not null default '',
  unit text not null default '',
  title text not null default '',
  email text not null default '',
  phone text not null default '',
  join_date date,
  category text not null default '一般會員',
  status text not null default '有效' check (status in ('有效', '停權', '退會')),
  board_role text not null default '' check (board_role in ('', '理事', '監事')),
  board_title text not null default '',
  is_representative boolean not null default false,
  staff_role text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 幹部角色、理監事職稱改由「系統設定」的清單決定（v2.1）；舊版寫死在約束裡的清單移除，改由觸發程序檢查
alter table public.members drop constraint if exists members_staff_role_check;
alter table public.members drop constraint if exists members_board_title_ok;
create unique index if not exists members_email_uniq on public.members (lower(email)) where email <> '';
-- 帳號連結是否由理事長、秘書長、總幹事（或 SQL Editor）建立或核准（v1.8）。
-- 會計、承辦人連結的帳號，要先改由管理者重新連結，才能被指派為幹部，避免有人先把分身帳號連到日後會當幹部的會員
-- 升級時只做一次（以欄位說明當作「已回填」標記，v1.8、v1.9 的資料庫也會補做）：
-- 目前已是幹部的那幾筆視為管理者連結（舊版只有管理者或 SQL Editor 能連結幹部）
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'linked_by_admin') then
    alter table public.members add column linked_by_admin boolean not null default false;
  end if;
  if col_description('public.members'::regclass,
      (select attnum from pg_attribute where attrelid = 'public.members'::regclass and attname = 'linked_by_admin')) is distinct from '帳號連結由管理者建立（已回填既有幹部）' then
    update public.members set linked_by_admin = true where user_id is not null and staff_role <> '' and not linked_by_admin;
    comment on column public.members.linked_by_admin is '帳號連結由管理者建立（已回填既有幹部）';
  end if;
end $$;

-- ---------- 系統設定：幹部角色、理監事職稱（具管理權限的幹部可在「系統設定」增刪） ----------
-- 幹部角色：is_admin＝具管理權限（可指派幹部角色、建立登入帳號、重設密碼、解除帳號連結、刪除會員、修改系統設定）
-- 理監事職稱：每個職稱屬於「理事」或「監事」其中一類（兩者互斥）；會員代表另外勾選，可與任一類並存
-- 只在第一次建立時放入預設值；之後重新執行這份結構，不會把管理者刪掉的項目加回來
do $$
begin
  if to_regclass('public.staff_roles') is null then
    create table public.staff_roles (
      name text primary key check (length(name) between 1 and 20 and name = btrim(name)),
      is_admin boolean not null default false,
      sort int not null default 0
    );
    insert into public.staff_roles (name, is_admin, sort) values
      ('理事長', true, 1), ('秘書長', true, 2), ('總幹事', true, 3), ('會計', false, 4), ('承辦人', false, 5);
    insert into public.staff_roles (name, sort)
      select distinct staff_role, 99 from public.members where staff_role <> '' on conflict do nothing;
  end if;
  if to_regclass('public.board_titles') is null then
    create table public.board_titles (
      title text primary key check (length(title) between 1 and 20 and title = btrim(title) and position('|' in title) = 0),
      board_role text not null check (board_role in ('理事', '監事')),
      sort int not null default 0
    );
    insert into public.board_titles (title, board_role, sort) values
      ('理事長', '理事', 1), ('常務理事', '理事', 2), ('理事', '理事', 3),
      ('監事會召集人', '監事', 4), ('常務監事', '監事', 5), ('監事', '監事', 6);
    insert into public.board_titles (title, board_role, sort)
      select distinct board_title, board_role, 99 from public.members where board_title <> '' and board_role <> '' on conflict do nothing;
  end if;
end $$;
alter table public.staff_roles enable row level security;
alter table public.board_titles enable row level security;
-- 登入者都讀得到清單（畫面上的選單要用）；只能透過下面的管理函式修改
revoke all on public.staff_roles, public.board_titles from anon, authenticated;
grant select on public.staff_roles, public.board_titles to authenticated;
drop policy if exists staff_roles_select on public.staff_roles;
create policy staff_roles_select on public.staff_roles for select to authenticated using (true);
drop policy if exists board_titles_select on public.board_titles;
create policy board_titles_select on public.board_titles for select to authenticated using (true);

-- 這筆的姓名、Email 或員工編號最後是不是由會計、承辦人（不具管理權限的幹部）新增或修改的（v2.2）。
-- 是的話，具管理權限的幹部替他建立帳號或核准連結時不算「管理者連結」，要在會員資料「已向本人核對」後才能指派幹部
-- （避免有人先把名冊上的 Email 改成自己分身的信箱，再讓管理者照著建立帳號）
alter table public.members add column if not exists identity_by_staff boolean not null default false;

-- 活動：meal_option 為 true 時，報名要選葷或素
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null default '',
  date date not null,
  start_time text not null default '',
  end_time text not null default '',
  location text not null default '',
  capacity int not null default 0 check (capacity >= 0),
  waitlist int not null default 0 check (waitlist >= 0),
  deadline date,
  fee int not null default 0 check (fee >= 0),
  meal_option boolean not null default false,
  description text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- 活動報名：同一位會員在同一活動只能有一筆有效（非取消）報名
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null default '正取' check (status in ('正取', '候補', '取消')),
  meal text not null default '' check (meal in ('', '葷', '素')),
  note text not null default '',
  paid boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists registrations_one_active
  on public.registrations (activity_id, member_id) where status <> '取消';

-- 會費繳納紀錄
create table if not exists public.fees (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  year int not null,
  item text not null default '常年會費' check (item in ('入會費', '常年會費')),
  amount int not null check (amount > 0),
  paid_date date not null default current_date,
  method text not null default '現金',
  receipt_no text not null unique,
  recorded_by text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists fees_one_per_year on public.fees (member_id, year, item);

-- 線上入會申請
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  gender text not null default '' check (gender in ('', '女', '男')),
  employee_no text not null default '',
  agency text not null default '',
  unit text not null default '',
  title text not null default '',
  email text not null default '',
  phone text not null default '',
  note text not null default '',
  status text not null default '待審' check (status in ('待審', '核准', '退回')),
  review_note text not null default '',
  reviewed_by text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists applications_one_pending on public.applications (user_id) where status = '待審';
-- 申請人的登入 Email（系統寄信用；email 欄是名冊上的公務信箱，只存資料）。舊資料由帳號補上
alter table public.applications add column if not exists login_email text not null default '';
update public.applications a set login_email = lower(u.email) from auth.users u where u.id = a.user_id and a.login_email = '' and u.email is not null;

-- ---------- 身分判斷函式 ----------

-- 目前登入者對應的會員編號（uuid）；沒有對應會員回傳 null
create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() limit 1
$$;

-- 目前登入者的幹部角色（有效會員才算）；不是幹部回傳空字串
create or replace function public.my_staff_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select staff_role from public.members where user_id = auth.uid() and status = '有效' limit 1), '')
$$;

-- 是否為幹部
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_staff_role() <> ''
$$;

-- 是否為具管理權限的幹部（預設是理事長、秘書長、總幹事；可在「系統設定」調整）
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles r where r.name = public.my_staff_role() and r.is_admin)
$$;

-- 產生下一個會員編號（M0001…）
create or replace function public.next_member_no() returns text
language sql volatile security definer set search_path = public as $$
  select 'M' || lpad((coalesce(max(nullif(regexp_replace(member_no, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  from public.members
$$;

-- ---------- 觸發程序 ----------

-- 會員資料存檔前：整理理監事職稱（依「系統設定」的職稱決定是理事或監事）、檢查幹部角色、更新修改時間；
-- 不具管理權限的幹部不能指派幹部角色，也不能變更幹部那幾筆的會籍、Email、帳號連結
create or replace function public.members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare 類別 text;
begin
  new.email := lower(trim(new.email));
  new.board_title := btrim(coalesce(new.board_title, ''));
  if new.board_title = '' and new.board_role <> '' then new.board_title := new.board_role; end if;
  if tg_op = 'INSERT' or new.board_title is distinct from old.board_title or new.board_role is distinct from old.board_role then
    if new.board_title = '' then
      new.board_role := '';
    else
      select board_role into 類別 from public.board_titles where title = new.board_title;
      if 類別 is null then raise exception '沒有「%」這個理監事職稱（可到「系統設定」新增）', new.board_title; end if;
      new.board_role := 類別;
    end if;
  end if;
  if new.staff_role <> '' and (tg_op = 'INSERT' or new.staff_role is distinct from old.staff_role)
      and not exists (select 1 from public.staff_roles where name = new.staff_role) then
    raise exception '沒有「%」這個幹部角色（可到「系統設定」新增）', new.staff_role;
  end if;
  if new.member_no is null or new.member_no = '' then
    new.member_no := public.next_member_no();
  end if;
  new.updated_at := now();
  if new.user_id is null then new.linked_by_admin := false; end if;
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.staff_role <> '' then
      raise exception '只有具管理權限的幹部（例如理事長、秘書長、總幹事）可以指派幹部角色';
    elsif tg_op = 'UPDATE' and new.staff_role is distinct from old.staff_role then
      raise exception '只有具管理權限的幹部（例如理事長、秘書長、總幹事）可以指派幹部角色';
    elsif tg_op = 'UPDATE' and old.staff_role <> '' and (
        new.status is distinct from old.status or new.email is distinct from lower(trim(old.email))
        or (new.user_id is distinct from old.user_id and new.user_id is distinct from auth.uid())) then
      raise exception '只有具管理權限的幹部可以變更幹部的會籍、Email 或帳號連結';
    end if;
  end if;
  -- 姓名、Email、員工編號由誰設定：會計、承辦人新增或修改 → 標記，且這筆已連結的帳號不再算管理者連結
  --（避免把分身帳號那筆改成別人、或先把名冊 Email 改成分身信箱，再請管理者建立帳號或指派）；具管理權限的幹部修改 → 清除標記
  if auth.uid() is not null and (tg_op = 'INSERT'
      or (new.name, new.email, new.employee_no) is distinct from (old.name, lower(trim(old.email)), old.employee_no)) then
    if public.is_admin() then
      new.identity_by_staff := false;
    else
      new.identity_by_staff := true;
      if new.user_id is not null then new.linked_by_admin := false; end if;
    end if;
  end if;
  -- 指派或變更幹部角色時（取消角色除外），這筆的帳號連結必須是管理者建立或核准的（SQL Editor 不受限）
  if auth.uid() is not null and tg_op = 'UPDATE' and new.staff_role is distinct from old.staff_role and new.staff_role <> ''
      and new.user_id is not null and not new.linked_by_admin then
    raise exception '「%」的登入帳號還沒經具管理權限的幹部核對（例如由會計、承辦人核准連結、v1.8 以前就已連結，或姓名、Email、員工編號曾被會計、承辦人修改），不能直接指派幹部角色。請在會員資料看過「登入帳號」、向本人確認後，勾選「已向本人核對」並儲存，再指派', new.name;
  end if;
  return new;
end $$;
drop trigger if exists members_before_write on public.members;
create trigger members_before_write before insert or update on public.members
  for each row execute function public.members_before_write();

-- ---------- 列層級安全（RLS） ----------
alter table public.members enable row level security;
alter table public.activities enable row level security;
alter table public.registrations enable row level security;
alter table public.fees enable row level security;
alter table public.applications enable row level security;

-- 未登入（anon）一律不能碰任何資料表
-- 權限：先全部收回，再只給需要的（Supabase 預設會把新資料表的全部權限給 anon、authenticated）
revoke all on public.members, public.activities, public.registrations, public.fees, public.applications from anon, authenticated;
grant select, insert, update, delete on public.activities, public.fees to authenticated;
-- 會員表：帳號連結（user_id）只能經由函式（建立登入帳號、核准連結、核准入會、解除連結）修改，幹部直接改資料表碰不到
grant select, delete on public.members to authenticated;
grant insert (member_no, name, gender, employee_no, agency, unit, title, email, phone, join_date, category, status,
  board_role, board_title, is_representative, staff_role, note) on public.members to authenticated;
grant update (member_no, name, gender, employee_no, agency, unit, title, email, phone, join_date, category, status,
  board_role, board_title, is_representative, staff_role, note) on public.members to authenticated;
-- 報名：新增只能經由 register_activity（會員）或 staff_register（幹部），兩者都會檢查名額
grant select, update, delete on public.registrations to authenticated;
-- 入會申請：新增只能經由 submit_application
grant select, update, delete on public.applications to authenticated;

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated with check (public.is_staff());
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete to authenticated using (public.is_admin());

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (is_public or public.is_staff());
drop policy if exists activities_write on public.activities;
create policy activities_write on public.activities for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations for select to authenticated using (member_id = public.my_member_id() or public.is_staff());
drop policy if exists registrations_write on public.registrations;
create policy registrations_write on public.registrations for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists fees_select on public.fees;
create policy fees_select on public.fees for select to authenticated using (member_id = public.my_member_id() or public.is_staff());
drop policy if exists fees_write on public.fees;
create policy fees_write on public.fees for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists applications_delete on public.applications;
create policy applications_delete on public.applications for delete to authenticated using (public.is_staff());

-- ---------- 會員自己能做的事（透過函式，只能動自己的資料） ----------

-- 回傳目前帳號連結的會員（不再依 Email 自動連結：名冊上的公務信箱收不到外部信，
-- 自動連結反而會讓人冒用別人的公務信箱註冊來取得資料）。保留這個函式，舊版網頁呼叫時不會出錯。
create or replace function public.link_my_member() returns uuid
language sql stable security definer set search_path = public as $$
  select public.my_member_id()
$$;

-- 會員修改自己的資料（只能改這幾欄；理監事、幹部角色、會籍由幹部維護）
create or replace function public.update_my_profile(p_gender text, p_agency text, p_unit text, p_title text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_member_id() is null then raise exception '找不到您的會員資料'; end if;
  update public.members set gender = coalesce(p_gender, ''), agency = coalesce(p_agency, ''), unit = coalesce(p_unit, ''),
    title = coalesce(p_title, ''), phone = coalesce(p_phone, '')
  where id = public.my_member_id();
end $$;

-- 會員報名活動：檢查截止日與名額，額滿自動列候補；需要時必須選葷或素
create or replace function public.register_activity(p_activity uuid, p_meal text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare 我 uuid; 活 public.activities; 正取數 int; 候補數 int; 狀 text;
begin
  select id into 我 from public.members where user_id = auth.uid() and status = '有效';
  if 我 is null then raise exception '只有有效會員可以報名'; end if;
  select * into 活 from public.activities where id = p_activity and is_public for update;
  if not found then raise exception '找不到這個活動'; end if;
  if 活.date < current_date or (活.deadline is not null and 活.deadline < current_date) then raise exception '報名已截止'; end if;
  if 活.meal_option and coalesce(p_meal, '') not in ('葷', '素') then raise exception '請選擇葷食或素食'; end if;
  if exists (select 1 from public.registrations where activity_id = p_activity and member_id = 我 and status <> '取消') then
    raise exception '您已經報名過了';
  end if;
  select count(*) filter (where status = '正取'), count(*) filter (where status = '候補')
    into 正取數, 候補數 from public.registrations where activity_id = p_activity;
  if 活.capacity = 0 or 正取數 < 活.capacity then 狀 := '正取';
  elsif 候補數 < 活.waitlist then 狀 := '候補';
  else raise exception '名額與候補都已額滿';
  end if;
  insert into public.registrations (activity_id, member_id, status, meal, note)
    values (p_activity, 我, 狀, case when 活.meal_option then p_meal else '' end, coalesce(p_note, ''));
  return 狀;
end $$;

-- 取消報名（本人或幹部）：取消的是正取時，最早報名的候補自動遞補（先鎖住活動再讀報名，避免同時取消時遞補兩人）
create or replace function public.cancel_registration(p_registration uuid)
returns text language plpgsql security definer set search_path = public as $$
declare 活動 uuid; 報 public.registrations; 活 public.activities; 遞補 public.registrations; 正取數 int;
begin
  select activity_id into 活動 from public.registrations where id = p_registration;
  if not found then raise exception '找不到可以取消的報名'; end if;
  select * into 活 from public.activities where id = 活動 for update;
  select * into 報 from public.registrations where id = p_registration for update;
  if not found or 報.status = '取消' then raise exception '找不到可以取消的報名'; end if;
  if 報.member_id is distinct from public.my_member_id() and not public.is_staff() then raise exception '沒有權限'; end if;
  if not public.is_staff() and 活.date < current_date then raise exception '活動已結束，無法取消'; end if;
  update public.registrations set status = '取消', checked_in_at = null where id = 報.id and status <> '取消';
  if not found then raise exception '找不到可以取消的報名'; end if;
  if 報.status = '正取' then
    select count(*) into 正取數 from public.registrations where activity_id = 活動 and status = '正取';
    if 活.capacity = 0 or 正取數 < 活.capacity then
      select * into 遞補 from public.registrations where activity_id = 活動 and status = '候補' order by created_at limit 1 for update;
      if found then
        update public.registrations set status = '正取' where id = 遞補.id;
        return 遞補.id::text;
      end if;
    end if;
  end if;
  return '';
end $$;

-- 幹部代會員報名：與會員自己報名相同的名額與葷素檢查（鎖住活動後重新計數），不受截止日限制
create or replace function public.staff_register(p_activity uuid, p_member uuid, p_meal text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare 活 public.activities; 正取數 int; 候補數 int; 狀 text;
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  select * into 活 from public.activities where id = p_activity for update;
  if not found then raise exception '找不到這個活動'; end if;
  if not exists (select 1 from public.members where id = p_member and status = '有效') then raise exception '只有有效會員可以報名'; end if;
  if 活.meal_option and coalesce(p_meal, '') not in ('葷', '素') then raise exception '請選擇葷食或素食'; end if;
  if exists (select 1 from public.registrations where activity_id = p_activity and member_id = p_member and status <> '取消') then
    raise exception '這位會員已經報名過了';
  end if;
  select count(*) filter (where status = '正取'), count(*) filter (where status = '候補')
    into 正取數, 候補數 from public.registrations where activity_id = p_activity;
  if 活.capacity = 0 or 正取數 < 活.capacity then 狀 := '正取';
  elsif 候補數 < 活.waitlist then 狀 := '候補';
  else raise exception '名額與候補都已額滿';
  end if;
  insert into public.registrations (activity_id, member_id, status, meal, note)
    values (p_activity, p_member, 狀, case when 活.meal_option then p_meal else '' end, coalesce(p_note, ''));
  return 狀;
end $$;

-- 線上入會申請（已是會員、或已有待審申請時不能重複送）；p_email 是名冊上的公務信箱（只存資料、不寄信），沒填就用登入 Email；登入 Email 另外記在 login_email（寄信用）
drop function if exists public.submit_application(text, text, text, text, text, text, text, text);
create or replace function public.submit_application(p_name text, p_gender text, p_employee_no text, p_agency text,
  p_unit text, p_title text, p_phone text, p_note text, p_email text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare 編號 uuid; 信箱 text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if public.my_member_id() is not null then raise exception '您已經是會員'; end if;
  if exists (select 1 from public.applications where user_id = auth.uid() and status = '待審') then raise exception '您已有一件申請在審核中'; end if;
  信箱 := lower(trim(coalesce(p_email, '')));
  if 信箱 = '' then select lower(email) into 信箱 from auth.users where id = auth.uid(); end if;
  insert into public.applications (user_id, login_email, name, gender, employee_no, agency, unit, title, email, phone, note)
    values (auth.uid(), coalesce((select lower(email) from auth.users where id = auth.uid()), ''), trim(p_name), coalesce(p_gender, ''), coalesce(p_employee_no, ''), coalesce(p_agency, ''),
      coalesce(p_unit, ''), coalesce(p_title, ''), coalesce(信箱, ''), coalesce(p_phone, ''), coalesce(p_note, ''))
    returning id into 編號;
  return 編號;
end $$;

-- ---------- 幹部用的函式 ----------

-- 核准入會：建立新會員並連結申請人的帳號。
-- 申請人自填的公務信箱無法驗證，所以名冊已有相同信箱時不自動連結，請改走「帳號連結」由幹部人工核對。
create or replace function public.approve_application(p_application uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare 申 public.applications; 新 uuid; 我名 text; 既有 text; 編號 text;
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  select * into 申 from public.applications where id = p_application and status = '待審' for update;
  if not found then raise exception '找不到待審的申請'; end if;
  if exists (select 1 from public.members where user_id = 申.user_id) then raise exception '這個帳號已經連結會員資料'; end if;
  select name into 既有 from public.members where 申.email <> '' and email = lower(申.email) limit 1;
  if 既有 is not null then
    raise exception '名冊已有公務信箱 % 的會員「%」。請退回這件申請，並請申請人改送「連結申請」由幹部核對後連結（或由具管理權限的幹部在「會員管理」替那位會員建立登入帳號）', 申.email, 既有;
  end if;
  select name into 我名 from public.members where user_id = auth.uid();
  insert into public.members (user_id, linked_by_admin, name, gender, employee_no, agency, unit, title, email, phone, join_date, note)
    values (申.user_id, public.is_admin(), 申.name, 申.gender, 申.employee_no, 申.agency, 申.unit, 申.title, 申.email, 申.phone, current_date, 申.note)
    returning id, member_no into 新, 編號;
  update public.applications set status = '核准', review_note = '新建會員 ' || coalesce(編號, ''), reviewed_by = coalesce(我名, ''), reviewed_at = now()
    where id = 申.id;
  return 新;
end $$;

-- 退回入會申請
create or replace function public.reject_application(p_application uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare 我名 text;
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  select name into 我名 from public.members where user_id = auth.uid();
  update public.applications set status = '退回', review_note = coalesce(p_reason, ''), reviewed_by = coalesce(我名, ''), reviewed_at = now()
    where id = p_application and status = '待審';
  if not found then raise exception '找不到待審的申請'; end if;
end $$;

-- 登記繳費（可一次多人）：自動編收據號「民國年-流水號」，已繳的人略過；回傳登記人數
create or replace function public.record_fees(p_members uuid[], p_year int, p_item text, p_amount int, p_date date, p_method text)
returns int language plpgsql security definer set search_path = public as $$
declare 前綴 text := (p_year - 1911)::text || '-'; 序 int; 人 uuid; 筆數 int := 0; 我名 text;
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '金額要大於 0'; end if;
  lock table public.fees in share row exclusive mode;
  select coalesce(max(substring(receipt_no from length(前綴) + 1)::int), 0) into 序
    from public.fees where receipt_no like 前綴 || '%' and substring(receipt_no from length(前綴) + 1) ~ '^\d+$';
  select name into 我名 from public.members where user_id = auth.uid();
  foreach 人 in array p_members loop
    if not exists (select 1 from public.fees where member_id = 人 and year = p_year and item = p_item) then
      序 := 序 + 1;
      insert into public.fees (member_id, year, item, amount, paid_date, method, receipt_no, recorded_by)
        values (人, p_year, p_item, p_amount, coalesce(p_date, current_date), coalesce(p_method, '現金'), 前綴 || lpad(序::text, 4, '0'), coalesce(我名, ''));
      筆數 := 筆數 + 1;
    end if;
  end loop;
  return 筆數;
end $$;

-- 第一次設定用（只能在 SQL Editor 執行）：把某人設為幹部
--   p_login_email：他的登入 Email（要先在會員專區註冊，或在 Supabase「Authentication → Users → Add user」建立）
--   p_office_email：名冊上的公務信箱（可省略）；名冊已有這個公務信箱的會員就直接設定並連結，沒有就新建
-- 例：select public.make_staff('wang@gmail.com', '秘書長', '王小明', 'wang@mail.mof.gov.tw');
drop function if exists public.make_staff(text, text, text);
create or replace function public.make_staff(p_login_email text, p_role text, p_name text default '', p_office_email text default '')
returns text language plpgsql security definer set search_path = public as $$
declare 帳號 uuid; 名冊信箱 text := lower(trim(coalesce(nullif(p_office_email, ''), p_login_email)));
  列 public.members; 已連信箱 text; 他列 text;
begin
  if not exists (select 1 from public.staff_roles where name = p_role) then
    raise exception '角色只能是：%（您填的是「%」）', (select string_agg(name, '、' order by sort) from public.staff_roles), p_role;
  end if;
  select id into 帳號 from auth.users where lower(email) = lower(trim(p_login_email));
  if 帳號 is null then
    raise exception '% 還沒有註冊。請先用這個 Email 到會員專區註冊並完成驗證，再執行這一行', p_login_email;
  end if;
  select email into 他列 from public.members where user_id = 帳號 and email <> 名冊信箱 limit 1;
  if 他列 is not null then
    raise exception '登入帳號 % 已連結名冊上另一筆會員資料（%），請先解除那筆的帳號連結', p_login_email, 他列;
  end if;
  select * into 列 from public.members where email = 名冊信箱;
  if found and 列.user_id is not null and 列.user_id <> 帳號 then
    select email into 已連信箱 from auth.users where id = 列.user_id;
    raise exception '名冊上 % 已連結另一個登入帳號（%）。請先解除帳號連結（SQL：update public.members set user_id = null where email = ''%'';），再執行一次',
      名冊信箱, coalesce(已連信箱, '已刪除的帳號'), 名冊信箱;
  end if;
  if found then
    update public.members set staff_role = p_role, status = '有效', user_id = 帳號, linked_by_admin = true where id = 列.id;
  else
    insert into public.members (user_id, linked_by_admin, name, email, staff_role, join_date)
      values (帳號, true, coalesce(nullif(p_name, ''), split_part(名冊信箱, '@', 1)), 名冊信箱, p_role, current_date);
  end if;
  return '已將 ' || 名冊信箱 || ' 設為' || p_role || '，並連結登入帳號 ' || p_login_email || '。請在會員專區登出後重新登入';
end $$;

-- 函式執行權限：會員與幹部函式只開給登入者；make_staff 只能在 SQL Editor 用
revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_member_id(), public.my_staff_role(), public.is_staff(), public.is_admin(),
  public.link_my_member(), public.update_my_profile(text, text, text, text, text),
  public.register_activity(uuid, text, text), public.cancel_registration(uuid),
  public.submit_application(text, text, text, text, text, text, text, text, text),
  public.approve_application(uuid), public.reject_application(uuid, text), public.staff_register(uuid, uuid, text, text),
  public.record_fees(uuid[], int, text, int, date, text) to authenticated;
revoke execute on function public.make_staff(text, text, text, text), public.next_member_no(), public.members_before_write() from authenticated;

-- 各公開活動的報名人數（只有人數，不含個資），讓會員看得到「已報名 23／40」。
-- 回傳一個 JSON 陣列 [{activity_id, confirmed, waitlisted}]（單一值，不受 Supabase 每次最多回傳筆數的限制）
drop function if exists public.activity_counts();
create function public.activity_counts()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('activity_id', t.id, 'confirmed', t.c, 'waitlisted', t.w)), '[]'::json)
  from (
    select a.id, count(r.id) filter (where r.status = '正取')::int as c, count(r.id) filter (where r.status = '候補')::int as w
    from public.activities a left join public.registrations r on r.activity_id = a.id
    where a.is_public or public.is_staff()
    group by a.id
  ) t
$$;
revoke execute on function public.activity_counts() from public, anon;
grant execute on function public.activity_counts() to authenticated;

-- =====================================================================
-- 帳號連結：會員的登入帳號（Email）連到名冊上的自己。三種方式：
--   1. 具管理權限的幹部在「會員管理」替會員「建立登入帳號」（不用收驗證信，馬上可以登入）
--   2. 會員自己註冊後送「連結申請」，幹部核對名冊後核准
--   3. 線上入會申請核准時自動連結
-- （v2.1 起移除「認領碼」）
-- =====================================================================
drop function if exists public.generate_claim_codes(uuid[]);
drop function if exists public.claim_with_code(text);
drop function if exists public.claim_code_hash(text);
drop table if exists public.claim_codes cascade;

-- 連結申請：會員填寫姓名、機關、公務信箱，由幹部核對名冊後指定對應的會員
create table if not exists public.link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  login_email text not null default '',
  name text not null check (length(trim(name)) > 0),
  agency text not null default '',
  unit text not null default '',
  title text not null default '',
  office_email text not null default '',
  phone text not null default '',
  note text not null default '',
  status text not null default '待審' check (status in ('待審', '核准', '退回')),
  member_id uuid references public.members (id) on delete set null,
  review_note text not null default '',
  reviewed_by text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists link_requests_one_pending on public.link_requests (user_id) where status = '待審';

alter table public.link_requests enable row level security;
revoke all on public.link_requests from anon, authenticated;
grant select, delete on public.link_requests to authenticated;

drop policy if exists link_requests_select on public.link_requests;
create policy link_requests_select on public.link_requests for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists link_requests_delete on public.link_requests;
create policy link_requests_delete on public.link_requests for delete to authenticated using (public.is_staff());

-- 帳號一連結到會員資料（不論透過建立登入帳號、核准連結、核准入會或 make_staff），
-- 就自動結案這個帳號還在待審的連結申請與入會申請，避免留下無法處理的申請
create or replace function public.members_after_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    update public.link_requests set status = '核准', member_id = new.id, reviewed_by = '系統（帳號已連結）', reviewed_at = now()
      where user_id = new.user_id and status = '待審';
    update public.applications set status = '核准', review_note = '帳號已連結既有會員資料', reviewed_by = '系統（帳號已連結）', reviewed_at = now()
      where user_id = new.user_id and status = '待審';
  end if;
  return null;
end $$;
drop trigger if exists members_after_link on public.members;
create trigger members_after_link after insert or update of user_id on public.members
  for each row execute function public.members_after_link();
revoke execute on function public.members_after_link() from public, anon, authenticated;

-- 會員自己註冊後送出連結申請，由幹部核對名冊後核准
create or replace function public.submit_link_request(p_name text, p_agency text, p_unit text, p_title text,
  p_office_email text, p_phone text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare 編號 uuid; 登入信箱 text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if public.my_member_id() is not null then raise exception '您的帳號已經連結會員資料'; end if;
  if exists (select 1 from public.link_requests where user_id = auth.uid() and status = '待審') then raise exception '您已有一件連結申請在審核中'; end if;
  select lower(email) into 登入信箱 from auth.users where id = auth.uid();
  insert into public.link_requests (user_id, login_email, name, agency, unit, title, office_email, phone, note)
    values (auth.uid(), coalesce(登入信箱, ''), trim(p_name), coalesce(p_agency, ''), coalesce(p_unit, ''), coalesce(p_title, ''),
      lower(trim(coalesce(p_office_email, ''))), coalesce(p_phone, ''), coalesce(p_note, ''))
    returning id into 編號;
  return 編號;
end $$;

-- 幹部核准連結申請：指定名冊上對應的會員（必須尚未連結帳號）
create or replace function public.approve_link_request(p_request uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare 申 public.link_requests; 我名 text;
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  select * into 申 from public.link_requests where id = p_request and status = '待審' for update;
  if not found then raise exception '找不到待審的連結申請'; end if;
  if exists (select 1 from public.members where user_id = 申.user_id) then raise exception '這個帳號已經連結其他會員資料'; end if;
  update public.members set user_id = 申.user_id, linked_by_admin = public.is_admin() and not identity_by_staff where id = p_member and user_id is null;
  if not found then raise exception '這位會員已連結其他帳號，或找不到這位會員'; end if;
  select name into 我名 from public.members where user_id = auth.uid();
  update public.link_requests set status = '核准', member_id = p_member, reviewed_by = coalesce(我名, ''), reviewed_at = now() where id = 申.id;
end $$;

-- 幹部退回連結申請
create or replace function public.reject_link_request(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare 我名 text;
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  select name into 我名 from public.members where user_id = auth.uid();
  update public.link_requests set status = '退回', review_note = coalesce(p_reason, ''), reviewed_by = coalesce(我名, ''), reviewed_at = now()
    where id = p_request and status = '待審';
  if not found then raise exception '找不到待審的連結申請'; end if;
end $$;

-- 幹部解除某位會員的帳號連結（例如連錯人、會員換了個人 Email）
create or replace function public.unlink_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以解除帳號連結'; end if;
  update public.members set user_id = null where id = p_member;
end $$;

-- 管理者查某位會員連結的登入帳號（個人 Email），指派幹部角色前核對是不是本人
create or replace function public.member_login_email(p_member uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare 信箱 text;
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以查看登入帳號'; end if;
  select u.email into 信箱 from public.members m join auth.users u on u.id = m.user_id where m.id = p_member;
  return coalesce(信箱, '');
end $$;

-- =====================================================================
-- 管理者替會員建立登入帳號、重設密碼（v2.1）
-- 會員的公務信箱收不到外部信、或是測試用的假帳號時，由具管理權限的幹部直接建立「已驗證」的帳號，
-- 設定一組初始密碼交給本人，馬上可以登入（登入後可在「我的資料 → 修改密碼」自己改）。
-- 密碼用 bcrypt 雜湊（與 Supabase 登入相同的格式），資料庫不存明碼。
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- 讓某個帳號原本的登入全部失效（刪除 Supabase 的登入工作階段，更新憑證會一併失效）
create or replace function public.end_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.sessions where user_id = p_user;
exception when undefined_table then null;
end $$;

-- 建立（或接管）登入帳號並連結到名冊上的這位會員；回傳 '已建立' 或 '已存在'
--   Email 還沒有人註冊：建立一個已驗證的新帳號
--   Email 註冊過但還沒完成驗證（例如收不到驗證信）、也還沒連結任何會員：直接完成驗證、改成這次設定的密碼
--   Email 已註冊並驗證過：不接管（避免改掉別人正在用的帳號密碼），請本人登入後送連結申請
--   這筆的姓名、Email、員工編號若由會計、承辦人修改過，連結後還要在會員資料「已向本人核對」才能指派幹部
create or replace function public.create_member_login(p_member uuid, p_login_email text, p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare 人 public.members; 信箱 text := lower(btrim(coalesce(p_login_email, ''))); 帳號 uuid; 已連 text; 結果 text; 已驗證 boolean;
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以建立登入帳號'; end if;
  if 信箱 !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Email 格式不正確'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception '密碼至少 8 個字元'; end if;
  select * into 人 from public.members where id = p_member for update;
  if not found then raise exception '找不到這位會員'; end if;
  if 人.user_id is not null then raise exception '「%」已經有登入帳號；要換 Email 請先「解除帳號連結」', 人.name; end if;
  select id, email_confirmed_at is not null into 帳號, 已驗證 from auth.users where lower(email) = 信箱 limit 1;
  if 帳號 is not null then
    select name into 已連 from public.members where user_id = 帳號;
    if 已連 is not null then raise exception '% 已經是名冊上「%」的登入帳號', 信箱, 已連; end if;
    if 已驗證 then
      raise exception '% 已經有人註冊並完成驗證，不能直接改它的密碼。請本人用這個 Email 登入後送「連結申請」，再到「申請審核」核准', 信箱;
    end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
      email_confirmed_at = now(), confirmation_token = '', recovery_token = '', updated_at = now()
      where id = 帳號;
    perform public.end_sessions(帳號);
    結果 := '已存在';
  else
    帳號 := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', 帳號, 'authenticated', 'authenticated', 信箱,
        crypt(p_password, gen_salt('bf', 10)), now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), 帳號, 帳號::text,
        jsonb_build_object('sub', 帳號::text, 'email', 信箱, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now());
    結果 := '已建立';
  end if;
  update public.members set user_id = 帳號, linked_by_admin = not 人.identity_by_staff where id = p_member;
  return 結果;
end $$;

-- 管理者替會員重設登入密碼（收不到重設密碼信的人用）；不能替其他具管理權限的幹部重設
create or replace function public.set_member_password(p_member uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare 人 public.members;
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以重設密碼'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception '密碼至少 8 個字元'; end if;
  select * into 人 from public.members where id = p_member;
  if not found then raise exception '找不到這位會員'; end if;
  if 人.user_id is null then raise exception '「%」還沒有登入帳號，請改用「建立登入帳號」', 人.name; end if;
  if 人.user_id <> auth.uid() and exists (select 1 from public.staff_roles r where r.name = 人.staff_role and r.is_admin) then
    raise exception '不能替其他具管理權限的幹部重設密碼，請他自己用「修改密碼」或「忘記密碼」';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf', 10)), updated_at = now() where id = 人.user_id;
  -- 比照 Supabase 自己改密碼：讓這個帳號原本的登入全部失效（例如密碼外洩、在公用電腦忘了登出）
  perform public.end_sessions(人.user_id);
end $$;

-- 管理者核對會員的身分資料與登入帳號：清除「會計、承辦人修改過」標記，已連結的帳號算管理者連結（之後可以指派幹部）
create or replace function public.confirm_member_identity(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以核對會員身分'; end if;
  update public.members set identity_by_staff = false, linked_by_admin = (user_id is not null) where id = p_member;
  if not found then raise exception '找不到這位會員'; end if;
end $$;

-- =====================================================================
-- 系統設定：增刪幹部角色、理監事職稱（只有具管理權限的幹部能用）
-- =====================================================================

-- 新增幹部角色
create or replace function public.add_staff_role(p_name text, p_is_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare 名 text := btrim(coalesce(p_name, ''));
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  if 名 = '' or length(名) > 20 then raise exception '角色名稱要 1～20 個字'; end if;
  if exists (select 1 from public.staff_roles where name = 名) then raise exception '已經有「%」這個角色', 名; end if;
  insert into public.staff_roles (name, is_admin, sort)
    values (名, coalesce(p_is_admin, false), coalesce((select max(sort) from public.staff_roles), 0) + 1);
end $$;

-- 刪除幹部角色：還有人是這個角色時不能刪；至少要留一個具管理權限的角色
create or replace function public.delete_staff_role(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare 人數 int; 管理 boolean;
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  select is_admin into 管理 from public.staff_roles where name = p_name;
  if not found then raise exception '找不到「%」這個角色', p_name; end if;
  select count(*) into 人數 from public.members where staff_role = p_name;
  if 人數 > 0 then raise exception '還有 % 位會員是「%」，請先改掉他們的幹部角色再刪除', 人數, p_name; end if;
  if 管理 and not exists (select 1 from public.staff_roles where is_admin and name <> p_name) then
    raise exception '至少要保留一個具管理權限的角色';
  end if;
  delete from public.staff_roles where name = p_name;
end $$;

-- 設定某個角色是否具管理權限：改完之後至少要有一位已連結帳號的有效會員具管理權限（避免沒有人能再修改設定）
create or replace function public.set_staff_role_admin(p_name text, p_is_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  update public.staff_roles set is_admin = coalesce(p_is_admin, false) where name = p_name;
  if not found then raise exception '找不到「%」這個角色', p_name; end if;
  if not exists (select 1 from public.members m join public.staff_roles r on r.name = m.staff_role
      where r.is_admin and m.user_id is not null and m.status = '有效') then
    raise exception '這樣改之後就沒有任何人具管理權限了（系統設定會無法再修改）。請先讓另一位會員擔任具管理權限的角色';
  end if;
end $$;

-- 依傳入的順序重排幹部角色（選單上的順序）
create or replace function public.reorder_staff_roles(p_names text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  update public.staff_roles r set sort = t.序 from unnest(p_names) with ordinality as t(名, 序) where r.name = t.名;
end $$;

-- 新增理監事職稱（屬於理事或監事）
create or replace function public.add_board_title(p_title text, p_board_role text)
returns void language plpgsql security definer set search_path = public as $$
declare 名 text := btrim(coalesce(p_title, ''));
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  if 名 = '' or length(名) > 20 or position('|' in 名) > 0 then raise exception '職稱要 1～20 個字，不能有「|」'; end if;
  if coalesce(p_board_role, '') not in ('理事', '監事') then raise exception '職稱要歸類為「理事」或「監事」'; end if;
  if exists (select 1 from public.board_titles where title = 名) then raise exception '已經有「%」這個職稱', 名; end if;
  insert into public.board_titles (title, board_role, sort)
    values (名, p_board_role, coalesce((select max(sort) from public.board_titles), 0) + 1);
end $$;

-- 刪除理監事職稱：還有人是這個職稱時不能刪
create or replace function public.delete_board_title(p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare 人數 int;
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  if not exists (select 1 from public.board_titles where title = p_title) then raise exception '找不到「%」這個職稱', p_title; end if;
  select count(*) into 人數 from public.members where board_title = p_title;
  if 人數 > 0 then raise exception '還有 % 位會員是「%」，請先改掉他們的職稱再刪除', 人數, p_title; end if;
  delete from public.board_titles where title = p_title;
end $$;

-- 依傳入的順序重排理監事職稱
create or replace function public.reorder_board_titles(p_titles text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有具管理權限的幹部可以修改系統設定'; end if;
  update public.board_titles b set sort = t.序 from unnest(p_titles) with ordinality as t(名, 序) where b.title = t.名;
end $$;

-- 不能讓系統沒有任何一位能登入的管理者：具管理權限的幹部把自己（或最後一位管理者）取消角色、停權、解除帳號連結、刪除時擋下
-- （SQL Editor 不受限，萬一鎖住可以用 make_staff 救回）
create or replace function public.members_keep_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.user_id is not null and old.status = '有效'
      and exists (select 1 from public.staff_roles r where r.name = old.staff_role and r.is_admin)
      and not exists (select 1 from public.members m join public.staff_roles r on r.name = m.staff_role
        where r.is_admin and m.user_id is not null and m.status = '有效') then
    raise exception '這樣改之後就沒有任何人具管理權限了（系統設定、指派幹部都會無法再操作）。請先讓另一位會員擔任具管理權限的角色';
  end if;
  return null;
end $$;
drop trigger if exists members_keep_admin on public.members;
create trigger members_keep_admin after update of staff_role, status, user_id or delete on public.members
  for each row execute function public.members_keep_admin();

-- 防止一次刪掉一大批（v2.3）：網頁上一次只刪一筆（勾選多筆時逐筆刪），同一個刪除指令刪到兩筆以上就整批取消
-- （SQL Editor 不受限）
create or replace function public.delete_one_at_a_time() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (select count(*) from 刪除的 ) > 1 then
    raise exception '一次只能刪除一筆資料（這次的刪除會刪到 % 筆，已全部取消）', (select count(*) from 刪除的);
  end if;
  return null;
end $$;
drop trigger if exists members_delete_one on public.members;
create trigger members_delete_one after delete on public.members
  referencing old table as 刪除的 for each statement execute function public.delete_one_at_a_time();
drop trigger if exists applications_delete_one on public.applications;
create trigger applications_delete_one after delete on public.applications
  referencing old table as 刪除的 for each statement execute function public.delete_one_at_a_time();
drop trigger if exists link_requests_delete_one on public.link_requests;
create trigger link_requests_delete_one after delete on public.link_requests
  referencing old table as 刪除的 for each statement execute function public.delete_one_at_a_time();

-- 幹部取得會員的登入 Email（寄信用）：系統只寄信到登入 Email，名冊上的公務信箱只存資料、不用來寄信。
-- 回傳 JSON 陣列 [{member_id, email}]（沒有登入帳號的人不列）
create or replace function public.member_login_emails(p_members uuid[])
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  return (select coalesce(json_agg(json_build_object('member_id', m.id, 'email', u.email)), '[]'::json)
    from public.members m join auth.users u on u.id = m.user_id where m.id = any(p_members));
end $$;

-- 函式執行權限：只開給登入者（函式內再檢查身分）
revoke execute on function public.end_sessions(uuid), public.members_keep_admin(), public.delete_one_at_a_time() from public, anon, authenticated;
revoke execute on function public.member_login_email(uuid), public.member_login_emails(uuid[]), public.submit_link_request(text, text, text, text, text, text, text),
  public.approve_link_request(uuid, uuid), public.reject_link_request(uuid, text), public.unlink_member(uuid),
  public.create_member_login(uuid, text, text), public.set_member_password(uuid, text), public.confirm_member_identity(uuid),
  public.add_staff_role(text, boolean), public.delete_staff_role(text), public.set_staff_role_admin(text, boolean), public.reorder_staff_roles(text[]),
  public.add_board_title(text, text), public.delete_board_title(text), public.reorder_board_titles(text[]) from public, anon;
grant execute on function public.member_login_email(uuid), public.member_login_emails(uuid[]), public.submit_link_request(text, text, text, text, text, text, text),
  public.approve_link_request(uuid, uuid), public.reject_link_request(uuid, text), public.unlink_member(uuid),
  public.create_member_login(uuid, text, text), public.set_member_password(uuid, text), public.confirm_member_identity(uuid),
  public.add_staff_role(text, boolean), public.delete_staff_role(text), public.set_staff_role_admin(text, boolean), public.reorder_staff_roles(text[]),
  public.add_board_title(text, text), public.delete_board_title(text), public.reorder_board_titles(text[]) to authenticated;
