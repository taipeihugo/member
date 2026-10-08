-- =====================================================================
-- 財政部公務人員協會 線上會員系統：資料庫結構與權限
-- 用法：在 Supabase 專案的「SQL Editor」貼上全文，按 Run（可重複執行）。
-- 權限原則：每張表都開啟「列層級安全」（RLS），預設誰都看不到；
--   一般會員只看得到自己的資料，幹部（理事長、秘書長、會計、承辦人）才看得到全部。
--   網頁上的公開金鑰（anon key）本身沒有任何讀取權限，所有保護都在資料庫這一層。
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
  updated_at timestamptz not null default now(),
  constraint members_board_title_ok check (
    (board_role = '' and board_title = '')
    or (board_role = '理事' and board_title in ('理事長', '常務理事', '理事'))
    or (board_role = '監事' and board_title in ('監事會召集人', '常務監事', '監事')))
);
-- 幹部角色（另外寫成可重複執行的約束，舊資料庫升級時也會更新允許的角色）
alter table public.members drop constraint if exists members_staff_role_check;
alter table public.members add constraint members_staff_role_check
  check (staff_role in ('', '理事長', '秘書長', '總幹事', '會計', '承辦人'));
create unique index if not exists members_email_uniq on public.members (lower(email)) where email <> '';

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

-- 是否為理事長、秘書長或總幹事（可以指派幹部角色）
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_staff_role() in ('理事長', '秘書長', '總幹事')
$$;

-- 產生下一個會員編號（M0001…）
create or replace function public.next_member_no() returns text
language sql volatile security definer set search_path = public as $$
  select 'M' || lpad((coalesce(max(nullif(regexp_replace(member_no, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  from public.members
$$;

-- ---------- 觸發程序 ----------

-- 會員資料存檔前：整理理監事職稱、更新修改時間；
-- 非管理者（理事長、秘書長、總幹事以外）不能指派幹部角色，也不能變更幹部那幾筆的會籍、Email、帳號連結
create or replace function public.members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.board_role = '' then
    new.board_title := '';
  elsif new.board_title = '' then
    new.board_title := new.board_role;
  end if;
  if new.member_no is null or new.member_no = '' then
    new.member_no := public.next_member_no();
  end if;
  new.updated_at := now();
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.staff_role <> '' then
      raise exception '只有理事長、秘書長或總幹事可以指派幹部角色';
    elsif tg_op = 'UPDATE' and new.staff_role is distinct from old.staff_role then
      raise exception '只有理事長、秘書長或總幹事可以指派幹部角色';
    elsif tg_op = 'UPDATE' and old.staff_role <> '' and (
        new.status is distinct from old.status or new.email is distinct from lower(trim(old.email))
        or (new.user_id is distinct from old.user_id and new.user_id is distinct from auth.uid())) then
      raise exception '只有理事長、秘書長或總幹事可以變更幹部的會籍、Email 或帳號連結';
    end if;
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
-- 會員表：帳號連結（user_id）只能經由函式（認領碼、核准連結、核准入會、解除連結）修改，幹部直接改資料表碰不到
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

-- 線上入會申請（已是會員、或已有待審申請時不能重複送）；p_email 是公務電子郵件信箱（名冊用），沒填就用登入 Email
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
  insert into public.applications (user_id, name, gender, employee_no, agency, unit, title, email, phone, note)
    values (auth.uid(), trim(p_name), coalesce(p_gender, ''), coalesce(p_employee_no, ''), coalesce(p_agency, ''),
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
    raise exception '名冊已有公務信箱 % 的會員「%」。請退回這件申請，並請申請人改用「連結會員資料」（認領碼或連結申請），由幹部核對後連結', 申.email, 既有;
  end if;
  select name into 我名 from public.members where user_id = auth.uid();
  insert into public.members (user_id, name, gender, employee_no, agency, unit, title, email, phone, join_date, note)
    values (申.user_id, 申.name, 申.gender, 申.employee_no, 申.agency, 申.unit, 申.title, 申.email, 申.phone, current_date, 申.note)
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
--   p_login_email：他在會員專區註冊用的 Email（個人信箱）
--   p_office_email：名冊上的公務信箱（可省略）；名冊已有這個公務信箱的會員就直接設定並連結，沒有就新建
-- 例：select public.make_staff('wang@gmail.com', '秘書長', '王小明', 'wang@mail.mof.gov.tw');
drop function if exists public.make_staff(text, text, text);
create or replace function public.make_staff(p_login_email text, p_role text, p_name text default '', p_office_email text default '')
returns text language plpgsql security definer set search_path = public as $$
declare 帳號 uuid; 名冊信箱 text := lower(trim(coalesce(nullif(p_office_email, ''), p_login_email)));
  列 public.members; 已連信箱 text; 他列 text;
begin
  if p_role not in ('理事長', '秘書長', '總幹事', '會計', '承辦人') then
    raise exception '角色只能是：理事長、秘書長、總幹事、會計、承辦人（您填的是「%」）', p_role;
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
    update public.members set staff_role = p_role, status = '有效', user_id = 帳號 where id = 列.id;
  else
    insert into public.members (user_id, name, email, staff_role, join_date)
      values (帳號, coalesce(nullif(p_name, ''), split_part(名冊信箱, '@', 1)), 名冊信箱, p_role, current_date);
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

-- 各公開活動的報名人數（只有人數，不含個資），讓會員看得到「已報名 23／40」
create or replace function public.activity_counts()
returns table (activity_id uuid, confirmed int, waitlisted int)
language sql stable security definer set search_path = public as $$
  select a.id, count(r.id) filter (where r.status = '正取')::int, count(r.id) filter (where r.status = '候補')::int
  from public.activities a left join public.registrations r on r.activity_id = a.id
  where a.is_public or public.is_staff()
  group by a.id
$$;
revoke execute on function public.activity_counts() from public, anon;
grant execute on function public.activity_counts() to authenticated;

-- =====================================================================
-- 帳號連結（v1.3）：公務信箱收不到外部信，會員改用個人 Email 註冊，
-- 再用「認領碼」或「申請連結（幹部核對後核准）」連到名冊上的自己。
-- =====================================================================

-- 認領碼：幹部替尚未連結帳號的會員產生，一次性、30 天有效
create table if not exists public.claim_codes (
  member_id uuid primary key references public.members (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null default now() + interval '30 days',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

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

alter table public.claim_codes enable row level security;
alter table public.link_requests enable row level security;
revoke all on public.claim_codes, public.link_requests from anon, authenticated;
grant select on public.claim_codes, public.link_requests to authenticated;

drop policy if exists claim_codes_select on public.claim_codes;
create policy claim_codes_select on public.claim_codes for select to authenticated using (public.is_staff());
drop policy if exists link_requests_select on public.link_requests;
create policy link_requests_select on public.link_requests for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- 帳號一連結到會員資料（不論透過認領碼、核准連結、核准入會或 make_staff），
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

-- 幹部產生認領碼（只針對尚未連結帳號的會員；重新產生會取代舊碼）；回傳 會員id、姓名、認領碼、到期日
create or replace function public.generate_claim_codes(p_members uuid[])
returns table (member_id uuid, name text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare 人 public.members; 碼 text; 我名 text;
  -- 不用 0、O、1、I、L，避免抄錯
  字表 constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.is_staff() then raise exception '沒有權限'; end if;
  select m.name into 我名 from public.members m where m.user_id = auth.uid();
  -- 幹部那幾筆（有幹部角色）只有理事長、秘書長、總幹事能產生認領碼
  for 人 in select * from public.members m where m.id = any(p_members) and m.user_id is null
      and (m.staff_role = '' or public.is_admin()) loop
    loop
      碼 := '';
      for i in 1..10 loop 碼 := 碼 || substr(字表, 1 + floor(random() * length(字表))::int, 1); end loop;
      碼 := substr(碼, 1, 5) || '-' || substr(碼, 6, 5);
      exit when not exists (select 1 from public.claim_codes c where c.code = 碼);
    end loop;
    insert into public.claim_codes as c (member_id, code, expires_at, created_by)
      values (人.id, 碼, now() + interval '30 days', coalesce(我名, ''))
      on conflict on constraint claim_codes_pkey do update set code = excluded.code, expires_at = excluded.expires_at, created_by = excluded.created_by, created_at = now();
    member_id := 人.id; name := 人.name; code := 碼; expires_at := now() + interval '30 days';
    return next;
  end loop;
end $$;

-- 會員輸入認領碼連結自己的會員資料（碼用過即作廢）
create or replace function public.claim_with_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare 碼 public.claim_codes; 整理 text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if public.my_member_id() is not null then raise exception '您的帳號已經連結會員資料'; end if;
  整理 := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(整理) <> 10 then raise exception '認領碼不正確'; end if;
  整理 := substr(整理, 1, 5) || '-' || substr(整理, 6, 5);
  select * into 碼 from public.claim_codes where code = 整理 for update;
  if not found or 碼.expires_at < now() then raise exception '認領碼不正確或已過期，請洽協會重新產生'; end if;
  update public.members set user_id = auth.uid() where id = 碼.member_id and user_id is null;
  if not found then raise exception '這筆會員資料已連結其他帳號，請洽協會'; end if;
  delete from public.claim_codes where member_id = 碼.member_id;
  update public.link_requests set status = '核准', member_id = 碼.member_id, reviewed_by = '認領碼', reviewed_at = now()
    where user_id = auth.uid() and status = '待審';
  return 碼.member_id;
end $$;

-- 會員送出連結申請（沒有認領碼時用）
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
  update public.members set user_id = 申.user_id where id = p_member and user_id is null;
  if not found then raise exception '這位會員已連結其他帳號，或找不到這位會員'; end if;
  delete from public.claim_codes where member_id = p_member;
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
  if not public.is_admin() then raise exception '只有理事長、秘書長或總幹事可以解除帳號連結'; end if;
  update public.members set user_id = null where id = p_member;
end $$;

-- 函式執行權限：只開給登入者（函式內再檢查身分）
revoke execute on function public.generate_claim_codes(uuid[]), public.claim_with_code(text),
  public.submit_link_request(text, text, text, text, text, text, text), public.approve_link_request(uuid, uuid),
  public.reject_link_request(uuid, text), public.unlink_member(uuid) from public, anon;
grant execute on function public.generate_claim_codes(uuid[]), public.claim_with_code(text),
  public.submit_link_request(text, text, text, text, text, text, text), public.approve_link_request(uuid, uuid),
  public.reject_link_request(uuid, text), public.unlink_member(uuid) to authenticated;
