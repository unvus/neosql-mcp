# Claude plugin directory 등록 설계

`neosql-mcp`를 Anthropic plugin directory(claude.ai **Customize > Plugins**의 Discover,
웹사이트 이름은 Claude Marketplace)에 plugin bundle로 등록하기 위한 설계 문서다.

- 상태: 제안(Proposed). 합의 후 `PLAN.md`/`CHECKLIST.md`에 항목을 추가하고 이 문서를
  단일 진실의 원천으로 참조한다.
- 작성일: 2026-09-28
- 외부 요구사항 확인일: 2026-09-28
- 기준 코드: `neosql-mcp` 1.8.0 (`main`, `fe9fa6a`), 공개 README는 `df238e6`, neosql 본체
  `../neosql` `3f9ffe363`
- 관련 문서: `PLAN.md`, `docs/npm-publish.md`, `docs/project-structure.md`, `README.md`

## 1. 이 문서의 사용 규칙

- 구현과 제출에 필요한 외부 요구사항은 §3에 확인일과 함께 스냅샷으로 고정한다. 작업자는
  외부 대화 기록이나 그때그때의 웹 조사가 아니라 §3과 저장소 소스를 근거로 삼는다.
- 외부 요구사항은 다음 시점에만 원문을 다시 확인한다. 확인하면 §3 내용과 확인일을 함께
  갱신한다.
  1. 첫 제출 직전 1회.
  2. developer portal **Validate** 결과가 §3과 다를 때. 이때는 Validate 결과가 최종 판정이다.
  3. 제출 후 reviewer가 §3에 없는 요구를 할 때.
- §3에는 원문을 직접 읽고 확인한 내용만 적는다. 설계를 좌우하는 문장(중복 판정, 우선순위 등)은
  원문을 그대로 인용한다. 요약본을 옮겨 적어 생긴 오류가 있었다(§12).
- 미확정 사항은 §11에만 모은다. 본문의 결정(§5)은 §11이 닫히지 않아도 유효한 범위만 다룬다.

## 2. 범위

포함:

- 이 저장소 안의 plugin 폴더(`plugins/neosql/`)와 manifest, MCP 서버 선언, plugin README.
- directory 정책을 충족하기 위한 MCP tool annotation 추가(`src/mcp/tools/`).
- npm 릴리스 흐름과 plugin 버전 동기화, directory가 추적할 branch 운영.
- developer portal 제출 절차와 제출 폼 답변 초안.

제외:

- remote MCP connector 제출. `neosql-mcp`는 local stdio 서버이며 remote endpoint가 없다.
- MCPB/desktop extension 패키징. directory가 더 이상 받지 않는다(§3.5).
- plugin skill, command, agent, hook. v1은 MCP 서버 선언만 담는다(D8).
- 자체 marketplace(`marketplace.json`) 운영. 필요하면 별도 설계로 다룬다.
- neosql main app(electron-main, renderer, embedded-server) 변경. Desktop의 데이터 처리는
  공개(D11)만 하고, 로그 축소처럼 동작을 바꾸는 일은 별도 작업으로 결정한다(§11).

## 3. 외부 요구사항 스냅샷 (2026-09-28 확인)

결과 표기는 portal 용어를 따른다.

| 표기      | 의미                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| Blocks    | 고치기 전에는 제출할 수 없다                                                               |
| Hold      | 제출은 가능하지만 Anthropic reviewer가 읽은 뒤에만 게시된다. 새 버전마다 다시 걸릴 수 있다 |
| Warning   | 제출 가능. 정책 준수 의무는 그대로다                                                       |
| 검증 중단 | report 없이 **Couldn't validate that repository** 등 단일 오류로 끝난다                    |

### 3.1 제출 경로와 자격

- 제출처는 claude.ai developer portal(`https://claude.ai/directory/manage`)의 **Submit new** >
  **Plugin bundle**이다. 예전 Claude Console 제출 form은 더 이상 지원하지 않는다.
- "Claude Marketplace"라는 별도 제출 경로는 없다. directory로 제출한다.
- 제출 자격은 Pro, Max, Team, Enterprise plan이다(Free는 불가). Team과 Enterprise에서는
  Owner가 제출하며, Enterprise에서는 **Directory** 권한을 가진 custom role도 가능하다.
- listing은 제출한 claude.ai 조직이 소유한다. 같은 repository와 folder 조합은 먼저 제출한
  조직만 가질 수 있다.
- 제출 전 claude.ai에 GitHub 계정을 연결해야 하며, 그 계정은 repository에 push 권한이
  있어야 한다. repository는 private 상태에서도 제출할 수 있지만 게시 전에는 public이어야 한다.
- 제출한 뒤에는 **repository와 plugin folder를 바꿀 수 없다**. 바꾸려면 새로 제출해야 한다.
- 조직당 24시간에 10건까지 제출할 수 있다(draft와 withdraw 포함).
- portal 단계: Source(Repository, Plugin path, Branch or tag) → Validate → Listing details →
  Data handling → Compliance(연락 email, 동의 항목 4개) → Review and submit(새 버전 반영
  방식: GitHub push webhook 또는 Scheduled check only).

### 3.2 저장소와 plugin 폴더

plugin 폴더는 `.claude-plugin/plugin.json`이 있는 폴더다. repository root일 수도 있고 하위
폴더일 수도 있다. 설치하는 사람은 plugin 폴더만 받는다. 폴더가 하위에 있으면 directory는 그
폴더만 읽고 스캔한다.

| 요구                                                                                                     | 결과                                    |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `.claude-plugin/plugin.json`을 가진 폴더를 제출                                                          | Blocks                                  |
| 한 번에 plugin 하나만 제출                                                                               | Blocks                                  |
| hook, MCP 서버 command, script가 쓰는 파일은 모두 plugin 폴더 안에 두기                                  | 폴더 밖 경로면 Blocks                   |
| symlink, git submodule, LFS pointer 쓰지 않기                                                            | plugin이 로드하면 Blocks, 그 외 Warning |
| `.DS_Store`, `Thumbs.db`, `desktop.ini`, `__MACOSX` 두지 않기                                            | Blocks                                  |
| 파일명이 Windows와 macOS 양쪽에서 유효 (콜론, 끝 점·공백, 장치명, 대소문자만 다른 중복 금지)             | 검증 중단                               |
| plugin 경로의 폴더명은 영문자·숫자·`.`·`-`·`_`만, 대소문자까지 정확히 입력                               | 검증 중단                               |
| `.gitattributes`에 `export-ignore`, `export-subst`, `filter`(LFS 포함) 두지 않기                         | 검증 중단                               |
| archive 50 MiB 미만, 풀었을 때 256 MiB 미만, 파일·폴더 10,000개 미만, plugin 폴더의 파일은 각 5 MiB 미만 | 검증 중단                               |

### 3.3 Manifest

`plugin.json`에서 필수 필드는 `name` 하나다. `author`는 객체이며 `name`이 필수이고 `email`,
`url`은 선택이다. `homepage`는 URL로 파싱되지 않으면 plugin이 로드되지 않는다. `license`는
SPDX identifier다.

| 요구                                                                                                            | 결과                                    |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `name`: 소문자·숫자·하이픈, 64자 이하, 영문자나 숫자로 시작하고 끝남                                            | 비ASCII는 Blocks, 그 외 위반은 Warning  |
| `claude`, `anthropic`, `official`, `plugin`, `mcp`, `test`를 이름 전체로 쓰지 않기, 공식 plugin처럼 보이지 않기 | Blocks. generic 단어로만 된 이름은 Hold |
| 다른 조직 plugin과 같은 이름 쓰지 않기 (대소문자·구두점 차이는 같은 이름으로 봄)                                | Blocks. 비슷한 이름은 Hold              |
| `name`, `displayName`, `author.name`이 남의 plugin·publisher·브랜드와 혼동되지 않기                             | Hold                                    |
| `displayName`, `author.name`은 한 가지 문자 체계만, 모양이 비슷한 문자나 보이지 않는 문자 금지                  | Blocks                                  |
| `mcpServers` 등 component key 철자를 정확히, `experimental` 밖에 두기                                           | Blocks                                  |
| `description`, `author`, `version` 설정                                                                         | 없으면 Warning                          |

- `name`은 영구 식별자다. 릴리스 후에는 바꾸지 않는다. 표시 이름은 `displayName`으로 바꾼다.
- `version`은 릴리스마다 올린다. Claude Code에서 `version`을 설정하면 그 문자열이 바뀔 때까지
  사용자가 같은 cache를 쓴다. directory에서 sync된 plugin은 claude.ai가 기록한 버전을 쓴다.

### 3.4 README와 license

| 요구                                                                                   | 결과   |
| -------------------------------------------------------------------------------------- | ------ |
| plugin 폴더에 40단어 이상의 README(`README.md` 권장). code block 안의 단어는 세지 않음 | Blocks |
| plugin 폴더에 `LICENSE` 파일을 두거나 `plugin.json`에 `license`를 설정                 | Blocks |

README는 listing 설명으로 그대로 쓰인다. 무엇을 하는지, 어떻게 쓰는지, 어떤 데이터를
보내는지를 적는다.

### 3.5 실행과 연결

package launcher는 package를 내려받아 실행하는 명령이다: `npx`, `bunx`, `pnpm dlx`,
`yarn dlx`, `uvx`, `pipx run`, `uv run`.

| 요구                                                                                                                     | 결과                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| launcher가 실행하는 package는 정확한 버전으로 고정(`npx <pkg>@1.2.3`). range나 `@latest` 금지                            | Blocks (**Unpinned npx launcher**)        |
| launcher를 쓰는 plugin에 registry·proxy를 설정하는 파일(`.npmrc` 등) 두지 않기                                           | Blocks                                    |
| 파일, 문서, 예시에 실제 credential 넣지 않기. 필요하면 `userConfig`의 `sensitive: true` 사용                             | Blocks                                    |
| 사용자 환경의 credential(예: `$GITHUB_TOKEN`)을 읽어 서버로 보내지 않기                                                  | Hold                                      |
| `.mcp.json`은 유효한 JSON이고 각 server 항목이 MCP schema에 맞아야 함                                                    | Blocks                                    |
| local MCP 서버는 plugin 안의 파일을 plain argument로 실행. shell, `-c` 같은 inline program, `npm run` 금지               | Hold (**MCP server command wasn't read**) |
| 하위 폴더 plugin에서 hook·MCP command의 경로는 `${CLAUDE_PLUGIN_ROOT}`부터 전체 경로로 쓰고 다른 변수·치환·wildcard 금지 | 하위 폴더일 때 Blocks                     |
| MCP 서버를 `.mcpb`/`.dxt` bundle로 선언하지 않기                                                                         | Hold. URL에서 받는 bundle은 Blocks        |

directory는 MCPB(desktop extension)로 포장한 local MCP 서버를 더 이상 받지 않는다. local
MCP 서버를 배포하려면 plugin bundle에 넣는다.

### 3.6 항상 reviewer가 확인하는 선택

다른 검사를 모두 통과해도 다음 선택은 Hold다.

- **Runs a pinned npx or uvx package**: 정확한 버전으로 고정한 launcher도 Hold다. package의
  하위 의존성이 설치 시점에 결정되기 때문이다. 같은 Hold가 새 버전마다 다시 걸릴 수 있다.
- **Dependencies install from a lockfile**: plugin 폴더 root에 `package.json`과
  `package-lock.json`(또는 `npm-shrinkwrap.json`, `bun.lock`, `bun.lockb`)이 함께 있으면 Hold다.
  Claude Code는 설치할 때마다 plugin cache에서 `npm ci --ignore-scripts`(60초 제한)를 실제로
  실행한다.
- **Scripts the validator couldn't follow**: 하위 폴더 plugin의 hook이나 MCP command가 shell
  script가 아닌 plugin 내부 파일을 실행하면 Hold다.

package 코드를 plugin에 번들해도 Hold가 없어지지 않을 수 있다. 번들 파일도 256 KiB 제한과
스캔 대상이며, 컴파일되거나 minify된 코드는 Hold다(§3.7, §3.8).

### 3.7 plugin 폴더 파일 제한

| 요구                                                                                        | 결과 |
| ------------------------------------------------------------------------------------------- | ---- |
| 이미지와 폰트를 제외한 파일은 각 256 KiB 미만                                               | Hold |
| 파일 512개 이하                                                                             | Hold |
| 텍스트, SVG, PNG, JPEG, GIF, WebP, 폰트만 포함. `.ico`, `.pdf`, `.zip`, 실행 파일 등은 Hold | Hold |

### 3.8 Security scan

- 제출 후 추적 대상 branch나 tag의 새 commit마다 검증을 다시 돌리고 security scan을 실행한다.
- 공개하지 않은 동작을 찾는다. 예: 알리지 않은 곳으로 데이터 전송, 숨긴 코드 실행, Claude
  권한 설정 변경.
- plugin이 실행하고, 보내고, 가져오는 모든 것을 README에 적는다. README에 적었다고 해서
  정책상 허용되는 것은 아니다. 소스는 읽을 수 있는 형태로 commit한다.
- 첫 제출이 scan에 실패하면 reject된다. 이후 버전이 실패하면 그 버전은 게시되지 않고, 그
  다음 버전들도 reviewer가 풀어줄 때까지 대기한다.

### 3.9 Surface별 지원

| Component                            | Chat (웹·데스크톱·모바일 대화) | Cowork                                     | Claude Code |
| ------------------------------------ | ------------------------------ | ------------------------------------------ | ----------- |
| Local MCP 서버 (앱이 command로 시작) | 무시                           | Cowork 세션이 사용자 컴퓨터에서 돌 때 로드 | 로드        |
| Skills                               | 로드                           | 로드                                       | 로드        |
| 최상위 `bin/` 폴더                   | 설치 불가                      | 설치 불가                                  | 로드        |

- portal은 이 규칙으로 지원 surface를 계산해 제출 전에 보여준다.
- directory 탐색(Discover)은 Pro, Max, Team, Enterprise에서 가능하다. claude.ai에서 추가한
  plugin은 Claude Code에 `<name>@synced`로 동기화된다(Claude Code v2.1.273 이상, claude.ai
  계정으로 로그인한 terminal 세션).

### 3.10 게시와 업데이트

- 새 버전 반영 방식은 GitHub push webhook(기본값, repository admin 권한 필요)이나 주기적 확인
  중에서 고른다. 어느 쪽이든 추적 대상 branch/tag를 주기적으로도 확인한다.
- 게시 설정의 기본값은 **reviewer가 버전마다 게시**다. reviewer가 "첫 버전만 reviewer 게시"나
  "첫 버전부터 개발자 게시"로 바꿀 수 있고, 그 뒤로는 통과한 버전이 자동 게시된다. 단,
  reviewer 대기 중이면 자동 게시되지 않는다.
- 새 버전이 게시되기 전까지 listing은 마지막 게시 버전을 계속 제공한다.
- 추적 대상이 tag면 새 버전을 낼 때마다 portal Settings에서 추적할 tag를 바꿔야 한다.
- 이름과 짧은 설명은 게시된 버전의 `plugin.json`과 README를 따른다.

### 3.11 Claude Code에서 plugin MCP 서버의 동작

- tool의 호출 이름은 `mcp__plugin_<plugin-name>_<server-name>__<tool-name>`이다.
- 중복 판정과 우선순위(원문 인용, "Scope hierarchy and precedence"):

  > When the same server is defined in more than one place, Claude Code connects to it once, using
  > the definition from the highest-precedence source. ... Local scope, Project scope, User scope,
  > Plugin-provided servers, claude.ai connectors. Claude Code matches duplicates across the three
  > scopes by name. It matches plugins and connectors by endpoint, so one that points at the same
  > URL or command as a server above counts as a duplicate.
  - local, project, user scope끼리만 **이름**으로 중복을 판정한다.
  - plugin 서버는 **endpoint(stdio는 command)**가 같을 때만 위 scope 서버의 중복으로 본다. 이름이
    같아도 command가 다르면 둘 다 로드된다. 인자만 달라도 별개 서버로 남는다. 예를 들어
    `--project-id`를 추가하거나, 버전을 고정하지 않은 `neosql-mcp`와 고정한 `neosql-mcp@X.Y.Z`를
    쓰는 경우다. 이 동작은 2026-09-28 외부 검토에서 Claude Code 2.1.283으로 확인했고, W6에서 다시
    확인한다.

- plugin을 특정 project에서만 끄려면 `enabledPlugins`에 `"<name>@<origin>": false`를 넣는다.
  - 팀 공유는 project의 `.claude/settings.json`, 개인용은 `.claude/settings.local.json`에 넣는다.
    우선순위는 local > project > user다.
  - directory에서 추가한 plugin의 origin은 `synced`다. 따라서 `"neosql@synced": false`다.
  - 조직이 필수(required)로 지정한 plugin은 끌 수 없다.
  - 출처: plugin loading 문서의 "Control which synced plugins load", "Find where a plugin is enabled".
- plugin을 제거하지 않고 `/mcp`에서 plugin 서버 연결만 끌 수도 있다.
- MCP stdio 서버의 `command`, `args`, `env`에서 `${CLAUDE_PLUGIN_ROOT}`와
  `${CLAUDE_PLUGIN_DATA}`가 치환된다.

### 3.12 Anthropic Software Directory Policy 중 해당 항목

| 적용 범위     | 요구                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| 모든 Software | 기능에 필요한 데이터만 수집. 로그 목적으로도 불필요한 대화 데이터를 수집하지 않음   |
| 모든 Software | 데이터를 수집하거나 remote 서비스에 연결하면 개인정보 처리방침 링크 제공            |
| 모든 Software | 검증된 연락처와 지원 채널, 동작·목적·문제 해결 문서                                 |
| 모든 Software | Anthropic 검증용 테스트 계정과 샘플 데이터                                          |
| 모든 Software | 핵심 기능을 보여주는 실제 동작 예시 프롬프트 3개 이상                               |
| 모든 Software | 연결하는 endpoint·도메인·리소스의 소유 또는 통제 확인, 합리적 기간 내 유지보수      |
| MCP 서버      | 해당하는 tool annotation 모두 제공. 특히 `readOnlyHint`, `destructiveHint`, `title` |
| MCP 서버      | tool 이름 64자 이하, 도움이 되는 오류 처리, 작업에 비례하는 token 사용              |
| MCP 서버      | local 서버는 적당히 최신인 의존성 버전 사용                                         |
| 금지          | 금전·암호화폐 이체, 이미지·영상·음성 생성, 광고                                     |

### 3.13 출처

- 제출: https://claude.com/docs/plugins/submit
- 사전 점검표: https://claude.com/docs/plugins/pre-submission-checklist
- directory 게시와 자격: https://claude.com/docs/directory/publish
- plugin 구조와 테스트: https://claude.com/docs/plugins/build
- surface별 지원: https://claude.com/docs/plugins/platform-support
- plugin loading, 버전, 의존성 설치: https://code.claude.com/docs/en/plugins/loading
- manifest reference: https://code.claude.com/docs/en/plugins/manifest-reference
- plugin MCP 서버: https://code.claude.com/docs/en/mcp
- Software Directory Policy: https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy

## 4. 현재 저장소 상태와 gap (1.8.0)

| 항목                    | 현재 상태                                                                                                                                                                                                                                                      | 판정                                                     | 조치                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| plugin 폴더와 manifest  | 없음                                                                                                                                                                                                                                                           | Blocks                                                   | W2                                                   |
| `.mcp.json`             | root에 gitignore된 개발자 로컬 파일만 있음. 개인 서버 설정과 credential이 들어갈 수 있음. `.gitignore`의 `.mcp.json` 패턴은 하위 폴더에도 적용되어 `plugins/neosql/.mcp.json`도 제외됨(`git check-ignore`로 확인)                                              | root plugin이면 충돌 위험, plugin 파일이 commit에서 빠짐 | plugin 폴더 안에 별도 파일 (D2), gitignore 예외 (W2) |
| 실행 방식               | README 예시는 버전 고정 없는 `npx -y neosql-mcp`                                                                                                                                                                                                               | plugin에서 그대로 쓰면 Blocks                            | 정확한 버전 고정 (D3)                                |
| README                  | 영문 `README.md`(npm landing)와 한국어 `README.ko.md`를 함께 갱신. Security, Desktop Readiness, Troubleshooting 공개 내용이 있음                                                                                                                               | plugin 폴더에 README가 없음                              | plugin 전용 README (D7)                              |
| 공개 CLI 옵션           | `--project-id=<id>`: 도구 실행 전 해당 project로 이동하고 실행 대상과 일치를 요구. 빈 값이면 CLI가 시작 실패 (`src/cli/cli-args.ts`)                                                                                                                           | plugin 고정 args로는 설정 불가                           | 그 project에서 plugin을 끄고 수동 설정 (D10)         |
| 내부 CLI 옵션           | `--profile`은 내부 개발용이며 두 공개 README에서 제외 (`docs/mcp-client-config.md`)                                                                                                                                                                            | plugin README도 공개 문서                                | 노출하지 않음 (D7)                                   |
| License                 | root `LICENSE`, `package.json#license` = Apache-2.0                                                                                                                                                                                                            | plugin 폴더에 없음                                       | `plugin.json#license` (D7)                           |
| Tool `title`            | 10개 tool 모두 `registerTool` config에 `title` 있음                                                                                                                                                                                                            | 충족                                                     | —                                                    |
| Tool annotation         | `readOnlyHint`/`destructiveHint` 없음                                                                                                                                                                                                                          | Policy 미충족                                            | W1 (D9)                                              |
| Tool 이름 길이          | 가장 긴 호출 이름 `mcp__plugin_neosql_neosql__get-mcp-session-id`가 45자                                                                                                                                                                                       | 충족                                                     | —                                                    |
| 저장소 규모             | 추적 파일 98개, archive 약 0.2 MiB, `.gitattributes`·`.npmrc` 없음                                                                                                                                                                                             | 충족                                                     | —                                                    |
| 로그 (Node 중계)        | prod는 info 레벨. tool 인자와 결과는 기록하지 않고 준비 과정 메타데이터와 오류 객체만 기록 (`src/mcp/tools/shared.ts`)                                                                                                                                         | 데이터 최소화 원칙에 부합                                | README에 로그 위치 공개                              |
| SQL 저장·전송 (Desktop) | `execute-query`로 받은 SQL 전문을 project의 MCP SQL 편집기에 덧붙여 저장한다(`appendExternalSql` → `saveSql`). 로컬 프로젝트는 PouchDB에 저장하고, 계정 프로젝트는 NeoSQL 서버 API(`POST /api/project/{id}/sql-editor`, `PUT /api/sql-editor/{id}`)로 전송한다 | Node 구간만으로는 데이터 흐름 설명이 불완전              | Node와 Desktop을 나눠 공개 (D11)                     |
| 로그 (Desktop)          | MCP RPC 서버가 받은 요청 본문 전체를 info 레벨로 기록한다(`[McpRpc] Received: ${body}`, electron-log 기본 설정). SQL과 모든 tool 인자가 포함된다                                                                                                               | 데이터 최소화 원칙 위반 가능성                           | 공개 (D11), 축소 여부 결정 (§11)                     |
| 사전 조건               | Node.js 20 이상, 같은 머신의 NeoSQL Desktop                                                                                                                                                                                                                    | Chat에서는 동작 불가                                     | README와 지원 surface 명시 (D6)                      |
| 릴리스                  | `npm version` → `v*` tag push → `publish.yml`이 npm publish (`contents: read`)                                                                                                                                                                                 | plugin 버전 반영 경로 없음                               | W3, W4 (D4, D5)                                      |
| 개인정보 처리방침       | NeoSQL web 소스에 `/privacy` route가 있지만 공개 URL은 확인하지 않음                                                                                                                                                                                           | 확인 필요                                                | §11                                                  |
| 지원 연락처             | NeoSQL web 소스에 `contact@unvus.com`이 있음                                                                                                                                                                                                                   | 확정 필요                                                | §11                                                  |

Desktop 행의 근거 소스(`../neosql`, `3f9ffe363`):

- `app/src/pages/project/sql-editor/sql-editor-container.vue`: MCP 실행 경로가
  `appendExternalSql(request.sql)`을 호출한다(1732행). `appendExternalSql`은 1763행에 있다.
- `app/src/services/sql/sql.service.ts`: `saveSql`(113행)이 로컬 프로젝트면 PouchDB에 저장하고,
  아니면 원격 API로 보낸다.
- `app/src-electron/mcp-rpc/server.ts`: 195행에서 요청 본문 전체를 로그로 남긴다.
- `app/src-electron/logger.ts`: electron-log를 추가 설정 없이 쓴다.

## 5. 설계 결정

### D1. Plugin bundle 하나로 제출하고 connector는 제출하지 않는다

- 근거: `neosql-mcp`는 remote URL이 없는 local stdio 서버다. MCP connector 제출은 remote 서버
  URL을 등록하는 경로다. MCPB 경로는 directory에서 폐지되었다(§3.5).

### D2. Plugin 폴더는 이 저장소의 `plugins/neosql/`로 한다

- 제출 값: Repository `unvus/neosql-mcp`, Plugin path `plugins/neosql`.
- 이 값은 제출 후 바꿀 수 없다(§3.1). 폴더명은 §3.2의 문자 규칙을 지킨다.
- root를 plugin 폴더로 쓰는 안은 기각한다.
  - root에 `package.json`과 `package-lock.json`이 함께 있어 Hold가 걸린다. 더 큰 문제는 모든
    사용자의 설치 cache에서 `npm ci --ignore-scripts`가 실제로 돌아 devDependencies까지
    내려받는다는 점이다(§3.6).
  - `src/`, `tests/`, `docs/`, `poc/`, 내부 계획 문서가 plugin 파일로 배포되고 scan 대상이 된다.
  - plugin용 root `.mcp.json`을 commit하려면 gitignore를 풀어야 한다. 그러면 개발자 로컬
    `.mcp.json`의 credential이 commit될 위험이 생긴다.
- 별도 저장소 안은 기각한다. npm 버전과 plugin pin을 두 저장소에서 맞춰야 한다. 반면 얻는
  이점(하위 폴더 전용 규칙 회피)은 D3 구성에서는 해당하지 않는다. MCP command가 plugin 내부
  파일이나 경로를 쓰지 않기 때문이다.
- `plugins/<name>/`는 여러 plugin 저장소의 관례와 같다. 나중에 자체 marketplace를 만들 때 root
  `.claude-plugin/marketplace.json`만 추가하면 된다.

### D3. MCP 서버는 `npx -y neosql-mcp@<정확한 버전>`으로 실행한다

- 버전을 고정하지 않으면 Blocks이므로 반드시 고정한다(§3.5).
- **Runs a pinned npx or uvx package** Hold가 버전마다 걸릴 수 있다는 것을 운영 비용으로
  받아들인다(§3.6).
- `dist/cli.js`를 plugin에 번들하는 안은 기각한다.
  - 번들된 빌드 산출물은 읽기 어려운 코드로 Hold 대상이다.
  - 하위 폴더 plugin이 shell이 아닌 파일을 실행하면 **Scripts the validator couldn't follow**
    Hold다.
  - 빌드 산출물을 git에 두는 것은 `dist/` 편집 금지·commit 금지 규칙과 충돌한다.
  - npm이 이미 단일 배포 경로다.
- `command`는 `npx`, `args`는 `["-y", "neosql-mcp@X.Y.Z"]`로 둔다. shell이나 `cmd /c`로
  감싸지 않는다(§3.5의 Hold 조건). Windows 동작은 W6에서 실측한다(§11).

### D4. Plugin 버전은 npm 버전과 같게 두고 `npm version`에서 자동으로 맞춘다

- 불변 조건: `package.json#version` = `plugins/neosql/.claude-plugin/plugin.json#version` =
  `plugins/neosql/.mcp.json`의 `neosql-mcp@` 버전.
- 구현: npm `version` lifecycle script가 `package.json`의 새 버전을 읽어 두 파일을 갱신하고
  `git add`한다. npm은 `version` script에서 `git add`한 파일을 version commit에 포함한다. 따라서
  `npm version <x>` 한 번으로 commit과 tag 안에서 세 값이 같아진다. `AGENTS.md`의 "버전은
  `npm version`으로만 올린다" 규칙과도 충돌하지 않는다.
- 안전망: 세 값이 같은지 unit test로 검사해 CI와 publish job에서 어긋남을 막는다.
- plugin 파일만 바뀐 경우(README 수정 등)도 다음 npm 릴리스와 함께 나간다. 급하면 patch
  릴리스를 낸다. plugin 버전을 npm과 따로 올리지 않는다.

### D5. Directory는 `plugin-release` branch를 추적하고, npm publish가 성공한 뒤에만 이 branch를 전진시킨다

- 문제: `main`을 추적하면 `git push`로 새 pin이 담긴 commit이 먼저 올라가고, tag push로 npm
  publish가 도는 동안 directory가 그 commit을 스캔할 수 있다. 자동 게시가 켜져 있으면 아직
  없는 npm 버전을 가리키는 plugin이 나가거나, publish가 실패했을 때 계속 깨진 상태로 남는다.
  또 문서 수정 같은 `main`의 모든 commit이 scan 대상이 된다.
- 결정: `publish.yml`에 `publish` 이후 실행되는 job을 추가한다. 이 job은 npm registry에서 새
  버전이 조회되는 것을 확인한 뒤, tag commit으로 `plugin-release` branch를 fast-forward한다.
  webhook은 이 branch push에 반응한다.
- tag 추적 안은 기각한다. 릴리스마다 portal에서 추적 tag를 손으로 바꿔야 한다(§3.10).
- `main` 추적 후 reviewer Hold에 기대는 안도 기각한다. 게시 설정이 자동 게시로 바뀌는 순간
  경쟁 조건이 드러난다.

### D6. 지원 surface는 Claude Code를 기본으로, Cowork 로컬 세션은 실측 후 표기한다

- Chat은 local MCP 서버를 무시하므로 지원 대상이 아니다(§3.9). README에 명시한다.
- Cowork 로컬 세션은 문서상 로드된다. 하지만 `os.tmpdir()` 기준 UDS 경로와 Desktop 활성화가
  그 세션 환경에서 동작하는지는 확인되지 않았다. W6에서 실측하기 전까지 README에는 Claude
  Code만 지원한다고 적는다.
- 전제 조건(Node.js 20 이상, `npx`가 PATH에 있을 것, 같은 머신의 NeoSQL Desktop, macOS/Windows)을
  README 첫 부분에 적는다.

### D7. Plugin 폴더는 manifest, `.mcp.json`, README 세 파일로 구성한다

- license는 `plugin.json#license: "Apache-2.0"`로 충족한다. `LICENSE` 파일을 복사하면 root와
  이중으로 관리해야 하고, symlink는 금지다(§3.2).
- README는 영어로 쓴 plugin 전용 문서다. root README를 복제하지 않고, listing 설명과 security
  scan 공개 항목(§6.3)에 집중한다. 자세한 내용은 root README 링크로 넘긴다.
- README는 영어 한 벌만 둔다. directory listing은 plugin 폴더의 README 하나만 보여주므로
  한국어 plugin README는 두지 않는다. 한국어 안내는 root `README.ko.md` 링크로 넘긴다.
- `--profile`은 노출하지 않는다. plugin은 prod profile만 쓴다. `--profile`은 내부 개발 옵션이고,
  `docs/mcp-client-config.md` 규칙에 따라 공개 문서에서 제외한다. plugin README도 공개 문서이므로
  `--profile`을 언급하지 않는다.

### D8. v1에는 skill, command, agent, hook을 넣지 않는다

- skill은 Chat에서도 로드되지만 MCP 서버는 Chat에서 로드되지 않는다. tool 없는 skill은
  사용자에게 혼란을 준다.
- tool 설명(`execute-query`의 DDL 승인 gate와 transaction 정책 등)은 이미 서버에 있다.
- 워크플로 skill은 v1 게시 뒤 사용 데이터(Usage 탭)를 보고 따로 검토한다.

### D9. 모든 MCP tool에 annotation을 추가한다

Policy §3.12는 MCP 서버의 모든 tool에 해당 annotation을 요구한다. 첫 제출 전에 annotation이
포함된 npm 버전을 릴리스하고, plugin은 그 버전 이상을 고정한다.

제안 값은 다음과 같다. `openWorldHint`는 모두 `false`다. tool은 사용자가 NeoSQL Desktop에
구성한 닫힌 대상만 다룬다.

| Tool                 | `readOnlyHint` | `destructiveHint` | 근거                                       |
| -------------------- | -------------- | ----------------- | ------------------------------------------ |
| `ping`               | true           | —                 | 상태 확인                                  |
| `get-mcp-session-id` | true           | —                 | 조회                                       |
| `list-connections`   | true           | —                 | 조회                                       |
| `list-tables`        | true           | —                 | 조회                                       |
| `get-table-details`  | true           | —                 | 조회                                       |
| `get-context-help`   | true           | —                 | 조회                                       |
| `execute-query`      | false          | true              | DML·DDL 실행 가능                          |
| `generate-code`      | false          | true              | 파일 생성, 기존 파일 덮어쓰기 가능         |
| `erd-create-tables`  | false          | false             | ERD 가상 테이블 추가. DB 변경 없음         |
| `erd-modify-tables`  | false          | true              | ERD 모델의 컬럼·인덱스·제약 조건 제거 가능 |

- `destructiveHint`는 `readOnlyHint: false`일 때만 의미가 있으므로 read-only tool에는 두지 않는다.
- `idempotentHint`는 v1에서 선언하지 않는다(MCP 기본값 적용).
- 조회 tool도 Desktop이 꺼져 있으면 앱을 활성화한다. 이는 데이터 변경이 아니므로
  `readOnlyHint`는 true로 두고, README 공개 항목(§6.3)에서 다룬다.
- 확정 전에 `docs/upstream-rpc-contract.md`와 대조한다(§11).

### D10. `--project-id`는 plugin에서 노출하지 않는다. project를 지정하려면 그 저장소에서 plugin을 끄고 수동 설정을 쓴다

- plugin의 `.mcp.json` args는 `["-y", "neosql-mcp@X.Y.Z"]`로 고정한다. 따라서 plugin 서버는
  Desktop에서 선택된 project를 대상으로 쓴다.
- `userConfig`로 노출하는 안은 기각한다.
  - `userConfig` 값은 사용자 설정(`pluginConfigs`)에 저장되어 모든 project에 똑같이 적용된다.
    project마다 다른 ID를 써야 하는 `--project-id`와 맞지 않는다.
  - 값을 비워 두는 선택 항목을 만들 수 없다. `--project-id=`처럼 빈 값을 넘기면 CLI가 시작하지
    못한다(`src/cli/cli-args.ts`). 이를 허용하려면 CLI 동작부터 바꿔야 한다.
  - Cowork는 기본값이 없는 option을 참조하는 서버를 무시한다(§3.9).
- 수동 설정만 추가하면 plugin 서버가 꺼지지 않는다. `--project-id`를 넣으면 command가 달라져 plugin
  서버와 수동 서버가 둘 다 로드된다(§3.11). 그러면 project 제한이 없는 plugin 쪽 tool이 호출되어
  다른 project에 쿼리가 실행될 수 있다.
- 그래서 project 지정이 필요한 저장소에서는 두 가지를 함께 한다.
  1. 그 저장소에서 plugin을 끈다. 개인용이면 `.claude/settings.local.json`, 팀 공유면
     `.claude/settings.json`에 `"enabledPlugins": { "neosql@synced": false }`를 넣는다.
  2. 그 저장소의 `.mcp.json`에 `--project-id`를 넣은 `neosql` 서버를 설정한다.
- 조직이 plugin을 필수로 지정하면 1번이 불가능하다. 이때는 plugin을 쓰면서 project를 지정할
  방법이 없다고 README에 적는다.
- 기존 수동 설정(`npx -y neosql-mcp`) 사용자가 plugin을 추가해도 command가 달라 도구가 두 벌 뜬다.
  둘 중 하나를 고르게 안내한다. plugin을 쓰려면 수동 설정을 지우고, 수동 설정을 계속 쓰려면
  plugin을 끈다.
- 이 안내는 plugin README와 root README 두 벌에 모두 넣는다.

### D11. 데이터 처리는 Node 중계와 NeoSQL Desktop을 나눠 공개한다

- plugin이 실행하는 것은 Node 중계(`neosql-mcp`)뿐이다. 하지만 사용자 데이터의 실제 흐름은
  Desktop을 거친다. security scan과 Data handling 답변은 사용자가 겪는 흐름 전체를 기준으로 쓴다.
- Node 중계: local IPC로만 Desktop과 통신하고, tool 인자와 결과를 저장하거나 로그에 남기지 않는다.
- Desktop(§4 근거):
  - `execute-query`로 실행한 SQL 전문을 project의 MCP SQL 편집기에 저장한다.
  - 로컬 프로젝트는 이 기기의 로컬 저장소에 둔다.
  - 계정 프로젝트는 NeoSQL 서버로 전송해 저장한다.
  - MCP 요청 본문(SQL과 tool 인자)을 Desktop 로그 파일에 기록한다.
- 계정 프로젝트가 NeoSQL 서버로 데이터를 보내므로 개인정보 처리방침 링크(§3.12)는 필수다.
- Desktop 로그에 요청 본문 전체를 남기는 동작은 "로그 목적으로도 불필요한 데이터를 수집하지
  않는다"는 정책(§3.12)과 충돌할 수 있다. 바꾸려면 main app을 고쳐야 하므로 이 저장소 범위 밖이다.
  제출 전에 유지할지 축소할지 결정한다(§11).
- `execute-query` 외 tool(ERD 수정, 코드 생성 등)의 Desktop 측 저장·전송 경로는 아직 전부
  확인하지 않았다. 제출 전에 확인해 공개 항목에 반영한다(§11).

## 6. 파일 설계

### 6.1 배치

```text
plugins/
└── neosql/
    ├── .claude-plugin/
    │   └── plugin.json
    ├── .mcp.json
    └── README.md
```

plugin 폴더에는 `package.json`, lockfile, `.npmrc`, 이미지, 실행 파일을 두지 않는다.

### 6.2 `plugin.json`과 `.mcp.json`

`X.Y.Z`는 D9가 들어간 npm 버전 이상이며, D4 규칙에 따라 `npm version`이 채운다.

```json
{
  "name": "neosql",
  "displayName": "NeoSQL",
  "version": "X.Y.Z",
  "description": "Use the database connections you already configured in NeoSQL Desktop from Claude: inspect schemas, run SQL, edit ERD models, and generate code through a local MCP server.",
  "author": { "name": "<§11에서 확정>", "url": "https://neosql.unvus.com" },
  "homepage": "https://neosql.unvus.com/en/docs/mcp/intro",
  "repository": "https://github.com/unvus/neosql-mcp",
  "license": "Apache-2.0",
  "keywords": ["neosql", "database", "sql", "erd", "schema"]
}
```

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": ["-y", "neosql-mcp@X.Y.Z"]
    }
  }
}
```

- plugin `name`과 server 이름이 모두 `neosql`이므로 tool 호출 이름은
  `mcp__plugin_neosql_neosql__<tool>`이다.
- 사용자가 `neosql`이라는 이름으로 수동 설정해 두었더라도 command가 다르면 plugin 서버가 그대로
  로드되어 도구가 두 벌 뜬다(§3.11). README에서 D10의 선택지를 안내한다.

### 6.3 Plugin README 구성

영어로 작성한다. 코드 블록 밖의 단어가 40개 이상이어야 한다.

1. 한 문단 소개: NeoSQL Desktop에 구성된 연결을 Claude에서 쓰는 local MCP 서버.
2. Requirements: macOS 또는 Windows, Node.js 20 이상과 PATH의 `npx`, 같은 머신에 설치된 NeoSQL
   Desktop, MCP 접근이 허용된 연결과 schema.
3. Where it works: Claude Code. Chat에서는 동작하지 않는다는 점(D6).
4. Examples: 실제로 동작하는 프롬프트 3개 이상(Policy). 초안:
   - "List the tables in my default NeoSQL schema and summarize how they relate."
   - "Show the columns and indexes of the orders table, then write a query for last week's orders."
   - "Add a status column to the customers table in the ERD model."
   - "Generate code for the customers table with my project templates."
5. What it runs, sends, and accesses: security scan 공개 항목. 모두 현재 소스에서 확인한 동작이다.
   Node 중계(이 plugin이 실행하는 서버)와 NeoSQL Desktop을 소제목으로 나눈다(D11).

   **neosql-mcp (이 plugin이 실행하는 서버)**
   - 시작할 때 `npx`가 npm registry에서 고정된 버전의 `neosql-mcp`를 내려받는다.
   - NeoSQL Desktop과는 local Unix Domain Socket(macOS) 또는 Named Pipe(Windows)로만 통신한다.
     TCP port를 열지 않는다.
   - Desktop이 꺼져 있으면 설치를 감지한 뒤 `neosql://mcp/activate` URL을 열어 앱을
     활성화한다. macOS는 `open -a <app> <url>`, Windows는 `cmd /d /c start "" <url>`을 쓴다
     (`src/upstream/app-activation.ts`). 설치를 감지할 때 macOS는 `/Applications`,
     `~/Applications`, `~/.neosql/mcp-config.json`을 읽고, Windows는 HKCU 제거 레지스트리
     항목을 읽는다.
   - `execute-query`는 DDL을 포함한 SQL을 실행할 수 있다. DDL은 Desktop의 승인 정책을 따른다.
   - `generate-code`는 프로젝트 위치에 파일을 쓰며 기존 파일을 덮어쓸 수 있다.
   - schema 정보와 쿼리 결과는 대화에 포함되도록 MCP host(Claude)로 반환된다.
   - 로그: macOS `~/Library/Logs/NeoSqlMcp/neosql-mcp.log`, Windows
     `%APPDATA%\NeoSqlMcp\neosql-mcp.log`. tool 인자와 결과는 기록하지 않는다.
   - DB 접근 범위는 Desktop의 MCP Access Control 설정을 따른다. plugin 설정에는 DB credential이
     필요 없고, plugin이 credential을 저장하지도 않는다. root README Security 절과 같은 표현을
     쓴다.

   **NeoSQL Desktop (요청을 받아 처리하는 앱)**
   - `execute-query`로 실행한 SQL 문은 project의 MCP SQL 편집기에 기록된다. 로컬 프로젝트는 이
     기기에 저장되고, 계정 프로젝트는 NeoSQL 서비스에 저장된다. 이 경로(`saveSql`)가 저장하는
     것은 SQL 문 텍스트다.
   - Desktop은 받은 MCP 요청(SQL과 tool 인자 포함)을 로컬 로그 파일에 기록한다. 로그 위치와 보관
     기간은 §11에서 확정한 뒤 적는다.
   - §11의 전수 확인에서 다른 tool의 저장·전송 경로가 나오면 여기에 추가한다.

6. Existing manual configuration(D10):
   - `neosql`을 직접 설정해 두었다면 plugin과 도구가 두 벌 뜬다. plugin을 쓰려면 수동 설정을
     지우고, 수동 설정을 계속 쓰려면 plugin을 끈다.
   - 특정 project를 대상으로 하려면 그 저장소에서 `"enabledPlugins": { "neosql@synced": false }`로
     plugin을 끄고, `.mcp.json`에 `--project-id`를 넣은 서버를 둔다.
   - 조직이 plugin을 필수로 지정했다면 이 방법을 쓸 수 없다.
   - `--profile`은 언급하지 않는다.
7. Support와 privacy: 지원 연락처, 개인정보 처리방침 URL(§11), root README(영문·한국어)와 NeoSQL
   MCP 문서 링크.

plugin README에 적는 동작은 root `README.md`, `README.ko.md`의 Security, Desktop Readiness,
Troubleshooting과 같은 사실이어야 한다. 사용자-facing 동작을 바꾸면 같은 변경에서 이 세 README를
함께 갱신한다. W5a에서 이 규칙을 `docs/project-structure.md`의 "공개 README" 절에 추가한다.

## 7. 릴리스 흐름

```text
npm version <x>
  ├─ package.json / package-lock.json 버전 변경
  ├─ version script: plugin.json#version, .mcp.json pin 갱신 후 git add   (W3)
  └─ commit + tag vX.Y.Z
git push                 → main (directory는 main을 추적하지 않음)
git push origin vX.Y.Z   → publish.yml
  ├─ job publish: lint, typecheck, test(버전 일치 검사 포함), build, pack, npm publish
  └─ job release-plugin (needs: publish, contents: write)                    (W4)
       ├─ npm view neosql-mcp@X.Y.Z version  (조회될 때까지 짧게 재시도)
       └─ git push origin HEAD:refs/heads/plugin-release  (fast-forward만 허용)
plugin-release push → directory webhook → 검증 + security scan
  → pinned npx Hold → reviewer 확인 → 게시 (게시 설정에 따름)
```

- `release-plugin` job만 `contents: write`를 가진다. 기존 `publish` job의 권한은 바꾸지 않는다.
- `plugin-release`로 push할 때 `--force`를 쓰지 않는다. fast-forward에 실패하면 이상 신호로 보고
  중단한다.
- 실패할 때의 동작:
  - npm publish가 실패하면 `release-plugin`이 돌지 않는다. listing은 이전 버전을 계속 제공한다.
  - scan이 실패하거나 Hold가 걸려도 listing은 이전 버전을 계속 제공한다(§3.10). 수정한 뒤 새
    patch 릴리스를 낸다.
- 첫 `plugin-release`는 plugin 폴더와 `release-plugin` job이 모두 들어간 첫 릴리스(§8의 릴리스
  B)에서 이 job이 만든다. branch가 없으면 push가 새로 만든다. W1만 담은 릴리스 A에는 plugin
  폴더가 없으므로 이 시점에는 만들지 않는다.

## 8. 작업 분해

진행 순서:

1. W1 → **릴리스 A**: annotation이 들어간 npm 버전. plugin 폴더는 아직 없다.
2. W2, W3, W4, W5a를 `main`에 반영한다. 이 시점의 `package.json` 버전은 A이므로 plugin 파일도
   이미 npm에 있는 A를 가리킨다.
3. W6: A를 가리키는 plugin으로 로컬 검증을 한다.
4. **릴리스 B**: plugin 폴더를 포함한 첫 릴리스. `npm version`이 plugin 버전을 B로 맞추고,
   publish가 성공하면 `release-plugin` job이 `plugin-release` branch를 만든다(§7).
5. W7: `plugin-release`(B)로 제출한다.
6. 게시된 뒤 W5b를 진행한다.

코드 변경은 `docs/testing.md`의 test list → 합의 → red → 구현 → green 절차를 따른다. 아래 test
list는 합의용 초안이다.

### W1. Tool annotation (`src/mcp/tools/`)

- 10개 `registerTool` config에 D9 값으로 `annotations`를 추가한다. SDK는
  `@modelcontextprotocol/sdk` 1.29.0이다.
- test list 초안 (`tests/mcp/`, in-memory client `listTools` 기준):
  - `declares readOnlyHint true for the six read-only tools`
  - `declares destructiveHint true for execute-query, generate-code, and erd-modify-tables`
  - `declares readOnlyHint false and destructiveHint false for erd-create-tables`
  - `declares openWorldHint false for every tool`
  - `declares readOnlyHint for every registered tool`: 새 tool이 annotation 없이 추가되는 것을 막는다.
- W1을 포함한 npm 버전(릴리스 A)을 낸다. plugin은 A 이상의 버전을 가리킨다.

### W2. Plugin 폴더와 manifest 검사

- §6.1~6.3의 파일을 만든다.
- `.gitignore`의 `.mcp.json` 줄 뒤에 `!/plugins/neosql/.mcp.json` 예외를 추가한다. root의 개인
  `.mcp.json`은 계속 제외하고 plugin 파일만 추적한다. 이 예외가 없으면 W3의
  `git add plugins/neosql`에서 `.mcp.json`이 조용히 빠진다.
- test list 초안 (`tests/plugin/plugin-manifest.test.ts`, 새 test 분류):
  - `does not ignore the plugin files in git`: `git check-ignore`로 plugin 폴더의 세 파일이 제외되지
    않는지, root `.mcp.json`은 계속 제외되는지 확인한다.
  - `keeps the plugin name neosql`
  - `sets plugin.json version to the package.json version`
  - `pins the npx launcher in .mcp.json to the package.json version`
  - `declares exactly one MCP server named neosql with args -y and the pinned package only`:
    `--profile`과 `--project-id`가 들어가지 않았는지 함께 확인한다(D7, D10).
  - `declares the Apache-2.0 license in plugin.json`
  - `includes a README with at least 40 words outside code blocks`
  - `keeps package manifests, lockfiles, and .npmrc out of the plugin folder`

### W3. 버전 동기화 script

- `scripts/sync-plugin-version.mjs`(새 최상위 분류)를 만들고 `package.json`에
  `"version": "node scripts/sync-plugin-version.mjs && git add plugins/neosql"`를 추가한다.
  `AGENTS.md` 규칙대로 버전 bump 자체는 계속 `npm version`만 수행한다.
- 테스트할 수 있도록 로직은 파일 경로를 인자로 받는 export 함수로 둔다.
- test list 초안 (`tests/scripts/sync-plugin-version.test.ts`):
  - `rewrites the plugin version and npx pin to the given version`
  - `keeps other manifest and server fields unchanged`
  - `fails when .mcp.json has no neosql-mcp launcher argument`
- `tsconfig`, eslint, vitest include 범위에 `scripts/`를 넣을지 이 작업에서 정한다.

### W4. `publish.yml` 확장

- §7의 `release-plugin` job을 추가한다. 직접 실행하기 전에 workflow 문법 검토와 fork 또는
  prerelease tag에서의 시험 방법을 PR에 적는다.

### W5. 문서 갱신

W5a는 W2~W4와 같은 시기에 한다.

- `docs/project-structure.md`: `plugins/`, `scripts/`, `tests/plugin/`, `tests/scripts/` 분류.
  기존 "공개 README" 절에 `plugins/neosql/README.md`를 추가하고 세 README 동기화 규칙을 적는다.
- `docs/npm-publish.md`: 버전과 태그 절차에 plugin 동기화와 `plugin-release` 확인 단계 추가.
- `PLAN.md`, `CHECKLIST.md`: 이 문서를 참조하는 항목.

W5b는 directory에 게시된 뒤에 한다.

- `README.md`, `README.ko.md`: "Install as a Claude plugin" 절. 기존 수동 설정과 도구가 두 벌
  뜨는 문제, project별로 plugin을 끄는 방법(D10)을 함께 적는다. 게시 전에는 추가하지 않는다.

### W6. 로컬 검증

- `claude plugin validate ./plugins/neosql`에서 `✔ Validation passed`가 나와야 한다.
- `claude --plugin-dir ./plugins/neosql`로 Claude Code를 띄우고 `/mcp`에서 `plugin:neosql:neosql`
  연결과 10개 tool을 확인한다. 이렇게 띄운 plugin의 id는 `neosql@inline`이다.
  - 기본 검증은 user·project·local scope의 `neosql` 수동 설정을 잠시 치우고 한다. 수동 설정이
    있으면 plugin 서버와 둘 다 떠서 어느 쪽 tool이 호출됐는지 구분하기 어렵다.
- macOS와 Windows에서 각각 확인한다: Desktop 실행 중, Desktop 종료 상태에서 자동 활성화,
  §6.3의 예시 프롬프트 4개.
- 중복과 project별 비활성화(§3.11, D10):
  - 버전을 고정하지 않은 수동 설정 `neosql`과 plugin을 함께 두면 서버가 둘 다 로드되는지 확인한다.
  - project scope `.mcp.json`에 `--project-id`를 넣은 `neosql` 서버만 추가하면 plugin 서버가
    여전히 로드되는지 확인한다.
  - 같은 저장소의 `.claude/settings.local.json`에 `"neosql@inline": false`를 추가하면 수동 서버만
    남는지 확인한다.
  - 실제 id인 `neosql@synced`는 plugin zip을 개인 claude.ai 계정에 올려(**Customize > Plugins >
    Upload plugin**) Claude Code로 동기화한 뒤 같은 방법으로 확인한다.
- Windows에서 `command: "npx"`가 그대로 spawn되는지 확인한다(§11).
- 가능하면 Cowork 로컬 세션에서 확인한다(D6).
- `docs/e2e-manual.md`에 plugin 시나리오를 추가한다.

### W7. 제출

§9 절차를 따른다.

## 9. 제출 runbook

1. §11 항목 중 "제출 전 필수"로 표시한 것을 닫는다.
2. §3 재확인 규칙(§1)에 따라 원문을 한 번 확인하고 스냅샷을 갱신한다.
3. 두 가지를 확인한다. `plugin-release`가 plugin 폴더를 포함한 릴리스(B 이상)의 commit을
   가리키는지, 그 commit의 plugin 파일이 가리키는 버전이 npm에 있는지.
4. 제출할 조직의 claude.ai 계정에 GitHub을 연결한다. 이 계정은 `unvus/neosql-mcp` push 권한이
   있어야 한다.
5. `https://claude.ai/directory/manage` → **Submit new** → **Plugin bundle**.
6. Source: Repository `unvus/neosql-mcp`, Plugin path `plugins/neosql`, Branch or tag
   `plugin-release` → **Validate**. Blocks가 있으면 고치고 릴리스한 뒤 **Re-validate**.
7. Listing details: 이름, 설명, README가 제대로 보이는지 확인한다. 고칠 것이 있으면 저장소에서
   고치고 다시 릴리스한다.
8. Data handling: §10 초안으로 답한다.
9. Compliance: 연락 email(§11)을 확인하고 동의 항목 4개를 선택한다.
10. Review and submit: **GitHub push webhook**을 선택하고 **Submit for review**. 이어서 **Set up
    push updates**를 진행한다(repository admin 권한 필요).
11. 제출 후에는 Versions 탭에서 scan 결과와 Hold 사유를 확인하고, 통과하면 **Publish**를 요청한다.

## 10. Data handling 답변 초안

| 질문                                             | 답변 초안                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 개인 데이터를 읽거나 저장하는가                  | 사용자가 요청할 때만 NeoSQL Desktop에 구성된 DB에서 schema와 쿼리 결과를 읽어 대화로 반환한다. DB에 개인 데이터가 있으면 결과에 포함될 수 있다. Node 중계는 결과를 저장하지 않는다. Desktop은 실행한 SQL 문을 project의 MCP SQL 편집기에 저장하고, MCP 요청 본문을 Desktop 로그에 기록한다 |
| 선언한 connector 외의 서비스로 데이터를 보내는가 | Node 중계는 보내지 않는다. 같은 머신의 Desktop과 local IPC로만 통신하고, 시작할 때 `npx`가 npm registry에서 package를 내려받는다. 계정 프로젝트에서는 Desktop이 실행한 SQL 문을 NeoSQL 서비스에 저장한다(§11의 전수 확인 결과를 더한다)                                                    |
| 데이터를 얼마나 보관하는가                       | Node 중계는 tool 인자와 결과를 보관하지 않고, 로컬 로그에 운영 메타데이터와 오류만 남긴다. MCP SQL 편집기의 SQL은 사용자가 지울 때까지 로컬 저장소(로컬 프로젝트)나 NeoSQL 서비스(계정 프로젝트)에 남는다. 로그 보관 기간과 NeoSQL 서비스 보관 정책은 §11에서 확정한다                     |
| 18세 미만 대상인가                               | 아니다                                                                                                                                                                                                                                                                                     |

## 11. 미결 사항

| #   | 항목                                                               | 필요 시점    | 비고                                                                                                          |
| --- | ------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | 제출할 claude.ai 조직과 계정                                       | 제출 전 필수 | listing 소유권은 사실상 영구다(§3.1)                                                                          |
| 2   | `author.name` 표기                                                 | W2           | 회사 공식 표기                                                                                                |
| 3   | 개인정보 처리방침 공개 URL                                         | 제출 전 필수 | 계정 프로젝트가 SQL을 NeoSQL 서비스로 보내므로 필수다(D11). web 소스에 `/privacy` route가 있음. 공개 URL 확인 |
| 4   | 지원 연락처                                                        | 제출 전 필수 | web 소스의 `contact@unvus.com` 사용 여부                                                                      |
| 5   | reviewer 테스트 환경                                               | 제출 전 필수 | Desktop 다운로드, 계정 또는 라이선스, 샘플 DB 제공 방법                                                       |
| 6   | plugin 이름 `neosql` 사용 가능 여부                                | W7           | portal Validate에서만 확인 가능. 대안 `neosql-desktop`                                                        |
| 7   | Windows에서 `npx` command 직접 실행                                | W6           | Claude Code 문서에 언급 없음. 실측                                                                            |
| 8   | Cowork 로컬 세션 동작                                              | W6           | UDS 경로와 Desktop 활성화                                                                                     |
| 9   | `erd-modify-tables`의 `destructiveHint`, 전 tool의 `openWorldHint` | W1           | `docs/upstream-rpc-contract.md`와 대조                                                                        |
| 10  | 로그 파일 위치·보관·rotation 정책 (Node 중계와 Desktop)            | 제출 전 필수 | Data handling 답변과 README 공개 항목에 필요                                                                  |
| 11  | 첫 게시 뒤 게시 설정(자동 게시) 희망 여부                          | 게시 후      | reviewer가 결정                                                                                               |
| 12  | Desktop의 MCP 요청 본문 로그를 유지할지 축소할지                   | 제출 전 필수 | 데이터 최소화 정책과 충돌할 수 있음. 바꾸려면 main app 변경이 필요해 별도 작업 (D11)                          |
| 13  | `execute-query` 외 tool의 Desktop 측 저장·전송 경로 전수 확인      | 제출 전 필수 | ERD 수정, 코드 생성 등. 결과를 §4, §6.3, §10에 반영 (D11)                                                     |
| 14  | NeoSQL 서비스의 MCP SQL 편집기 데이터 보관 정책                    | 제출 전 필수 | §10의 보관 답변에 필요                                                                                        |

## 12. 변경 이력

- 2026-09-28: 초안 작성. 외부 요구사항 스냅샷, 설계 결정 D1~D9, 작업 분해 W1~W7.
- 2026-09-28: 공개 README 개편(`df238e6`) 반영. `README.ko.md` 추가와 세 README 동기화 규칙,
  `--profile` 공개 문서 제외 규칙, 공개 옵션 `--project-id`에 대한 D10 추가.
- 2026-09-28: 외부 검토(대상 `7f26092`) 반영.
  - §3.11 정정: 이전 판은 "같은 이름의 수동 설정이 plugin 서버를 대체한다"고 적었다. 이는 요약본을
    옮겨 적어 생긴 오류다. plugin은 이름이 아니라 command/URL로 중복을 판정한다. 원문을 인용하도록
    바꾸고 §1에 인용 규칙을 추가했다.
  - D10 재작성: project를 지정하려면 그 저장소에서 plugin을 끄고 수동 설정을 쓴다. 기존 수동 설정
    사용자에게는 도구가 두 벌 뜨는 문제를 안내한다.
  - D11 추가: Desktop의 SQL 저장, 계정 프로젝트의 원격 전송, 요청 본문 로그를 Node 중계와 나눠
    공개한다.
  - W2에 `.gitignore` 예외와 추적 여부 test를 추가했다.
  - §8 진행 순서 정정: 첫 `plugin-release`는 plugin 폴더를 포함한 릴리스 B에서 만든다.
