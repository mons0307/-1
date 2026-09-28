-- Run once on a new Supabase project as database owner.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(display_name) between 1 and 80),
 role text not null default 'student' check (role in ('student','teacher')),
 class_id uuid
);
create table public.classrooms (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 80),
 teacher_id uuid not null references public.profiles(id)
);
alter table public.profiles add constraint profile_class_fk foreign key (class_id) references public.classrooms(id) on delete set null;
create index on public.profiles(class_id);
create index on public.classrooms(teacher_id);
create table public.journal_state (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 data jsonb not null default '{"intro":false,"entries":[]}',
 version integer not null default 0,
 updated_at timestamptz not null default now()
);
-- No roles/class assignments are taken from user-editable Auth metadata.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,'학생');
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,display_name) select id,'학생' from auth.users on conflict do nothing;

create function public.is_teacher_of(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles student join public.classrooms c on c.id=student.class_id join public.profiles teacher on teacher.id=c.teacher_id
 where student.id=target and student.role='student' and teacher.id=auth.uid() and teacher.role='teacher');
$$;
alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.journal_state enable row level security;
revoke all on public.profiles,public.classrooms,public.journal_state from anon,authenticated;
grant select on public.profiles,public.classrooms,public.journal_state to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_teacher_of(id));
create policy classes_read on public.classrooms for select to authenticated using (teacher_id=auth.uid());
create policy journal_read on public.journal_state for select to authenticated using (user_id=auth.uid() or public.is_teacher_of(user_id));
-- All writes go through this transaction; the browser cannot change roles or write tables.
create function public.journal_request(payload jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); current_state public.journal_state%rowtype;
 entries jsonb; e jsonb; old_entry jsonb; saved jsonb; answers jsonb; answer jsonb;
 completed integer; day_number integer; expected integer; revision integer;
 done boolean; is_read boolean; activity text; date_today text:=to_char(timezone('Asia/Seoul',now()),'YYYY-MM-DD');
begin
 if uid is null then raise exception '로그인 후 다시 시도해 주세요.'; end if;
 if not exists(select 1 from public.profiles where id=uid and role='student') then raise exception '학생 계정에서 일기를 작성해 주세요.'; end if;
 -- Serializes both the first insertion and later writes for the same account.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
 select * into current_state from public.journal_state where user_id=uid;
 if not found then
  current_state.user_id:=uid; current_state.data:='{"intro":false,"entries":[]}'::jsonb; current_state.version:=0;
 end if;
 if payload is null then return jsonb_build_object('data',current_state.data,'version',current_state.version,'today',date_today); end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>60000 then raise exception '입력 내용을 확인해 주세요.'; end if;
 if jsonb_typeof(payload->'version') is distinct from 'number' or payload->>'version' !~ '^[0-9]+$' then raise exception '기록 버전을 확인해 주세요.'; end if;
 if (payload->>'version')::numeric<>current_state.version then raise exception '다른 창에서 기록이 바뀌었어요. 입력한 글을 복사한 뒤 다시 불러와 주세요.'; end if;
 if payload->>'action'='start' then current_state.data:=jsonb_set(current_state.data,'{intro}','true');
 elsif payload->>'action'='save' then
  if current_state.data->>'intro'<>'true' then raise exception '먼저 서두를 읽고 시작해 주세요.'; end if;
  e:=payload->'entry';
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'day') is distinct from 'number' or coalesce(e->>'day','') !~ '^[0-9]+$' then raise exception '기록일을 확인해 주세요.'; end if;
  if (e->>'day')::numeric not between 1 and 100000 then raise exception '기록일을 확인해 주세요.'; end if;
  day_number:=(e->>'day')::integer; expected:=case when day_number<=28 then 3 else 2 end;
  if jsonb_typeof(e->'answers') is distinct from 'array' then raise exception '일기 내용을 확인해 주세요.'; end if;
  if jsonb_array_length(e->'answers')<>expected or jsonb_typeof(e->'done') is distinct from 'boolean' or jsonb_typeof(e->'read') is distinct from 'boolean' or jsonb_typeof(e->'activity') is distinct from 'string' then raise exception '일기 내용을 확인해 주세요.'; end if;
  answers:='[]'::jsonb;
  for answer in select value from jsonb_array_elements(e->'answers') loop
   if jsonb_typeof(answer)<>'string' or char_length(answer#>>'{}')>2000 then raise exception '일기는 칸마다 2,000자까지 쓸 수 있어요.'; end if;
   answers:=answers||jsonb_build_array(regexp_replace(answer#>>'{}','^\s+|\s+$','','g'));
  end loop;
  if char_length(e->>'activity')>4000 then raise exception '활동은 4,000자까지 쓸 수 있어요.'; end if;
  entries:=current_state.data->'entries';
  select value into old_entry from jsonb_array_elements(entries) where (value->>'day')::integer=day_number;
  select count(*) into completed from jsonb_array_elements(entries) where value->>'done'='true';
  if old_entry is null and (day_number<>completed+1 or exists(select 1 from jsonb_array_elements(entries) where value->>'done'='true' and value->>'date'=date_today)) then raise exception '오늘의 일기를 이어 써 주세요. 다음 기록은 내일 시작해요.'; end if;
  if jsonb_typeof(e->'revision') is distinct from 'number' or coalesce(e->>'revision','') !~ '^[0-9]+$' then raise exception '일기 버전을 확인해 주세요.'; end if;
  revision:=coalesce((old_entry->>'revision')::integer,0);
  if (e->>'revision')::numeric<>revision then raise exception '이 일기가 다른 창에서 바뀌었어요. 글을 복사한 뒤 다시 불러와 주세요.'; end if;
  done:=(e->>'done')::boolean or coalesce((old_entry->>'done')::boolean,false);
  if done and not exists(select 1 from jsonb_array_elements_text(answers) a where a<>'') then raise exception '오늘의 마음을 한 줄 이상 적어 주세요.'; end if;
  activity:=regexp_replace(e->>'activity','^\s+|\s+$','','g'); is_read:=(e->>'read')::boolean;
  if day_number<=28 or (day_number-28)%4<>0 then activity:=''; is_read:=false; end if;
  saved:=jsonb_build_object('day',day_number,'date',case when old_entry->>'done'='true' then old_entry->>'date' else date_today end,'answers',answers,'activity',activity,'read',is_read,'done',done,'revision',revision+1);
  if old_entry is null then entries:=entries||jsonb_build_array(saved);
  else select jsonb_agg(case when (value->>'day')::integer=day_number then saved else value end order by ordinal) into entries from jsonb_array_elements(entries) with ordinality a(value,ordinal); end if;
  current_state.data:=jsonb_set(current_state.data,'{entries}',entries);
 else raise exception '지원하지 않는 요청이에요.'; end if;
 insert into public.journal_state(user_id,data,version) values(uid,current_state.data,current_state.version+1)
 on conflict(user_id) do update set data=excluded.data,version=excluded.version,updated_at=now();
 return jsonb_build_object('data',current_state.data,'version',current_state.version+1,'today',date_today);
end $$;
create function public.teacher_students() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'class_id',p.class_id,'data',coalesce(j.data,'{"intro":false,"entries":[]}'::jsonb),'updated_at',j.updated_at) order by p.display_name),'[]'::jsonb)
 from public.profiles p join public.classrooms c on c.id=p.class_id left join public.journal_state j on j.user_id=p.id
 where p.role='student' and c.teacher_id=auth.uid() and public.is_teacher_of(p.id);
$$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.is_teacher_of(uuid),public.journal_request(jsonb),public.teacher_students() from public,anon;
grant execute on function public.is_teacher_of(uuid),public.journal_request(jsonb),public.teacher_students() to authenticated;
alter publication supabase_realtime add table public.journal_state,public.profiles,public.classrooms;
commit;
