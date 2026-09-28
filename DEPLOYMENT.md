# GitHub → Cloudflare → Supabase 연결 안내

이 폴더 전체가 앱 프로젝트입니다. 기존 GitHub의 `index.html` 칭찬일기와는 별개이며, Cloudflare는 이 프로젝트를 **Workers**로 빌드합니다. Pages의 정적 HTML 배포 설정을 사용하지 마세요.

## 1. GitHub

대상: https://github.com/mons0307/-1

새 브랜치의 변경을 확인한 후 main으로 병합합니다. `.github/workflows/deploy.yml`이 PR에서 타입 검사·DB 권한 테스트·빌드를 수행하고, main의 코드를 Cloudflare로 배포합니다.
GitHub 저장소 Settings → Environments에서 `production`을 만들고 다음 Secrets를 넣습니다.

- `CLOUDFLARE_API_TOKEN`: 해당 계정의 Workers 배포 권한이 있는 토큰
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID

비밀번호, `.dev.vars`, Supabase secret/service_role 키를 커밋하지 않습니다. 이 앱은 service_role 키를 사용하지 않습니다. 워크플로는 비밀 키가 없으면 배포 단계가 실패하며 검사는 실행할 수 있습니다.

## 2. Cloudflare Workers

Node 22.13 이상에서 `npm ci`, `npm run build`, `npm run deploy`로도 수동 배포할 수 있습니다. 수동 첫 배포는 `npx wrangler login`으로 로그인합니다.
Worker 이름은 `wrangler.jsonc`의 `gratitude-note-school`입니다. 다른 이름을 쓰려면 여기에서 바꿉니다. 빌드 결과 `dist/server/wrangler.json`은 자동 생성되므로 직접 수정하지 않습니다.
GitHub Actions와 Cloudflare Git 연동을 동시에 설정하면 중복 배포되므로 이 프로젝트는 GitHub Actions를 배포 경로로 사용합니다.

Supabase를 아직 연결하지 않았으면 로그인 화면에 연결 준비 중 안내가 나옵니다. 아래 설정이 끝나면 실제 로그인과 저장이 가능합니다.

## 3. Supabase 프로젝트

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/migrations/202609280001_school_journal.sql` 전체를 한 번 실행합니다. 기존 테이블과 이름이 겹치지 않는 새 프로젝트를 권장합니다. 기존 D1 기록을 자동으로 가져오지는 않습니다.
3. Authentication 설정에서 공개 회원가입을 끄고 이메일/비밀번호 로그인을 사용합니다. 계정은 관리자만 생성합니다.
4. Authentication → Users에서 교사와 학생 계정을 생성합니다. 이메일 형식의 학교 발급 아이디와 서로 다른 비밀번호를 사용합니다. 실제 학생 개인 이메일은 필수가 아닙니다. 관리자 생성 계정의 이메일 확인을 완료 처리합니다.
5. 생성된 사용자의 UUID를 복사해 아래 SQL을 실제 값으로 바꿔 실행합니다. 교사 권한은 관리자 SQL에서만 부여합니다.

```sql
update public.profiles set display_name='담임 선생님', role='teacher'
where id='교사-사용자-UUID';

insert into public.classrooms(name,teacher_id)
values ('5학년 1반','교사-사용자-UUID') returning id;

update public.profiles set display_name='01번 학생', class_id='위에서-반환된-학급-UUID'
where id='학생-사용자-UUID';
```

표시 이름은 번호나 별명으로 설정해도 됩니다. 학생은 자신의 프로필·학급·역할을 바꿀 수 없습니다. 한 학생은 한 학급에 배정되며 한 교사는 여러 학급을 담당할 수 있습니다. 학급 배정이 없는 학생은 자기 일기만 쓰고, 교사는 그 기록을 볼 수 없습니다.

6. Supabase 프로젝트 URL과 **publishable key (`sb_publishable_…`)**를 확인합니다. Cloudflare Worker의 Settings → Variables and Secrets에 아래 두 값을 **Secret**으로 추가하고 Deploy 합니다. 값 자체는 브라우저에 공개되는 설정이며, 데이터 접근은 RLS로 제한됩니다. 오래된 anon JWT와 service_role/secret 키는 이 앱에 넣지 않습니다.

```
SUPABASE_URL=https://프로젝트참조.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

CLI로 입력할 때는 빌드 후 아래 명령을 사용합니다. 값은 명령행에 직접 붙이지 말고 입력 프롬프트에서 넣습니다.

```
npx wrangler secret put SUPABASE_URL --config dist/server/wrangler.json
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY --config dist/server/wrangler.json
```

7. Supabase의 Site URL을 Cloudflare에서 발급받은 HTTPS 주소로 설정합니다. 이 버전은 이메일 링크 로그인이나 비밀번호 재설정 링크를 사용하지 않습니다. 비밀번호 분실은 선생님/관리자가 Supabase에서 처리합니다.

## 실제 연결 확인

서로 다른 브라우저에서 학생과 교사로 로그인합니다. 학생이 일기를 저장하면 교사 화면에 기록과 완료 일수가 나타나야 합니다. 작성 중 저장한 기록도 보이지만 저장하지 않은 타이핑은 전송하지 않습니다.
다른 학생 계정, 다른 학급 교사 계정에서는 해당 기록이 보이지 않아야 합니다. Supabase Realtime publication에 `journal_state`, `profiles`, `classrooms`가 포함되어야 합니다(마이그레이션이 설정합니다).
교사 화면은 실시간 구독과 30초 재확인, 수동 새로고침을 제공합니다. 연결 상태와 마지막 조회 시간이 표시됩니다. 삭제·학급 이동은 재조회 시 반영됩니다.

공용 기기에서는 로그아웃합니다. 인증 세션은 탭의 sessionStorage에 저장하고 일기 내용은 로컬 저장소에 따로 보관하지 않습니다. 탭 복제나 브라우저 세션 복구 시에는 로그인 상태가 남을 수 있으므로 로그아웃이 필요합니다.

## 로컬 개발과 검증

`.dev.vars.example`을 `.dev.vars`로 복사하고 본인의 Supabase 공개 설정을 입력합니다.

```
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

`npm test`는 로컬 PostgreSQL(PGlite)에서 실제 마이그레이션과 RLS·저장 규칙을 검증합니다. 실제 Supabase Auth/Realtime 네트워크와 Cloudflare 계정 배포는 별도 프로젝트 연결 후 확인해야 합니다.

## 데이터 구조와 한계

- `profiles`: 계정 ID, 표시 이름, 학생/교사 역할, 학급
- `classrooms`: 학급 이름, 담당 교사 ID
- `journal_state`: 학생별 서두 완료 여부와 일기 배열, 충돌 방지 버전, 최근 저장 시간
- `journal_request`: 로그인 사용자 확인, 입력 검증, 한국 날짜, 하루 한 진도, 버전 충돌 검사, 트랜잭션 저장
- `teacher_students`: 담당 학급 학생과 저장 기록만 조회(RLS 적용)

현재는 학급 규모의 초기 버전으로 학생별 일기 배열 전체를 읽습니다. 장기간 다수 학급으로 확대할 때는 일기별 테이블과 페이지 단위 조회로 전환하는 것이 좋습니다. 기존 Sites 검토용 D1 데이터는 이 앱에 자동 이관되지 않으며 기존 사이트는 그대로 남습니다.

참고: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
