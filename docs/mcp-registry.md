# 공식 MCP Registry 등록

`neosql-mcp`를 공식 [MCP Registry](https://registry.modelcontextprotocol.io)에
`io.github.unvus/neosql-mcp`로 게시하기 위한 내부 개발자 참고 문서다. 외부 요구사항,
설계 결정, 릴리스 흐름, 실패 대응을 이 문서에 모은다.

- 상태: 구현·로컬 검증 완료(2026-09-30). 첫 게시는 `mcpName`이 포함된 다음 릴리스에서 확인한다.
- 작성일: 2026-09-30
- 외부 요구사항 확인일: 2026-09-30
- 기준 코드: `neosql-mcp` 1.8.8 (`main`, `14932ae`)
- 관련 문서: `PLAN.md`, `CHECKLIST.md`, `docs/npm-publish.md`, `docs/claude-plugin-directory.md`

## 1. 목적과 범위

공식 MCP Registry는 MCP 프로젝트(`modelcontextprotocol` GitHub 조직)가 운영하는 MCP 서버
메타데이터 목록이다. 패키지 파일은 보관하지 않고 npm 같은 패키지 registry를 가리킨다.
MCP 클라이언트와 제3자 디렉터리가 이 데이터를 원본으로 가져간다.

등록 목적:

- 공개 npm·GitHub를 추측해 수집하는 제3자 목록(예: mcprush)이 공식 메타데이터를 쓰게 한다.
  2026-09-29에 plugin 승인 전인데 mcprush에 `unvus/neosql-mcp` 페이지가 있는 것을 확인한 것이 계기다.
  mcprush는 공개 npm·PyPI·docker 등에서 수집한다고 밝히고 있으며, Claude plugin directory의
  GitHub push webhook(Anthropic으로만 전달)과는 관계없다.
- `io.github.unvus/neosql-mcp`를 공식 이름으로 확보한다.

기대하지 않는 것:

- 신규 사용자 유입. `neosql-mcp`는 NeoSQL Desktop이 있어야 동작하므로 일반 목록에서 찾은
  사용자는 바로 쓰기 어렵다. 실제 유입 경로는 Desktop 안내와 Claude plugin directory다.
- 사칭 방지. 다른 사람이 같은 npm 패키지를 자기 이름으로 등록하는 것은 등록 여부와 관계없이
  `mcpName` 검증 때문에 불가능하다.

범위 밖:

- Claude plugin directory 제출. 별도 경로이며 `docs/claude-plugin-directory.md`를 따른다.
  한쪽 등록이 다른 쪽 심사에 영향을 주지 않는다.
- 제3자 디렉터리 개별 대응(삭제 요청, listing claim 등).

## 2. 외부 요구사항 스냅샷 (2026-09-30 확인)

원문은 §9 출처를 따른다. 요구사항이 바뀌었을 가능성이 있으면 원문을 다시 확인하고 이 절과
확인일을 함께 갱신한다.

### 2.1 운영 상태

- registry는 **preview**다. 원문: "Breaking changes or data resets may occur before general
  availability." API는 v0.1로 freeze되어 있다.
- 게시한 버전의 메타데이터는 바꿀 수 없다. 원문: "The version string **MUST** be unique for each
  publication of the server. Once published, the version string (and other metadata) cannot be
  changed."
- 버전 상태는 `mcp-publisher status --status <active|deprecated|deleted>`로 바꿀 수 있다.

### 2.2 이름과 인증

| 인증 | 이름 형식 | 필요한 것 |
| --- | --- | --- |
| GitHub (device flow, PAT, OIDC) | `io.github.<user 또는 org>/*` | org namespace는 org Owner만 |
| DNS | `com.example.*/*` (도메인 역순) | 도메인 apex TXT 레코드, 비밀키 |

- GitHub Actions OIDC(`mcp-publisher login github-oidc`)는 별도 secret이 필요 없다. job에
  `id-token: write` 권한만 있으면 된다.
- `unvus`는 GitHub **개인 계정**이다(Organization 아님). 따라서 `io.github.unvus`는 개인
  namespace다.

### 2.3 npm 패키지 소유권 검증

- registry는 npm 공개 registry(`https://registry.npmjs.org`)만 지원한다.
- npm에 올라간 해당 버전 `package.json`의 `mcpName`이 `server.json`의 `name`과 같아야 한다.
- 따라서 npm 배포가 먼저 끝나야 하며, `mcpName`이 없는 기존 버전은 게시할 수 없다.

### 2.4 `server.json`

- 필수: `name`, `description`, `version`. package 항목 필수: `registryType`, `identifier`,
  `transport`.
- `description` 최대 100자, `title` 최대 100자, `name`은 `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`.
- 버전 범위(`^1.2.3`, `1.x` 등)는 금지. local 서버는 package 버전과 server 버전을 맞추기를
  권장한다.
- schema: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`.

## 3. 설계 결정

### R1. 이름은 `io.github.unvus/neosql-mcp`, 인증은 GitHub OIDC

DNS 인증으로 회사 도메인 이름(예: `com.unvus/neosql-mcp`)을 쓸 수도 있지만 `unvus.com` apex에
TXT 레코드를 추가하고 CI에 비밀키를 보관해야 한다. OIDC는 장기 credential이 없고 설정이
필요 없어 채택했다.

### R2. `server.json` 버전은 자리표시로 두고 CI가 넣는다

Claude plugin 파일(`plugin.json`, `.mcp.json`)은 directory가 git branch에서 직접 읽으므로 release
commit에서 버전을 맞춘다. `server.json`은 git에서 읽는 곳이 없고 게시 순간에만 쓰인다.
그래서 두 `version`을 `0.0.0`으로 두고 workflow가 tag 버전을 넣는다. github-mcp-server도 같은
방식(`${VERSION}` 자리표시)을 쓴다.

- release commit 구성(4개 파일), `sync-plugin-version.mjs`, release 스킬의 파일 확인은 바꾸지
  않는다.
- 자리표시 상태로 실수로 게시해도 npm에 `neosql-mcp@0.0.0`이 없어 소유권 검증에서 거부된다.

### R3. 게시는 `publish.yml`과 분리한 workflow가 맡고, 배포 완료 조건에 넣지 않는다

배포 완료는 npm 기준이다(`publish.yml` 성공, npm 조회, `plugin-release` 전진). registry job을
`publish.yml`에 넣으면 registry 실패가 run 전체 실패가 되어 `scripts/wait-for-release.mjs`와
release 스킬의 완료 판정이 흔들린다. 그래서 같은 `v*` tag로 시작하는 별도 workflow로 분리했다.
registry 게시가 늦거나 실패해도 npm 패키지와 MCP 동작에는 영향이 없다. chrome-devtools-mcp와
github-mcp-server도 registry 게시 workflow를 따로 둔다.

### R4. npm 반영 지연은 조건 polling과 publish 재시도로 흡수한다

npm은 `publish` 성공 뒤에도 조회 반영이 늦을 수 있고, 반영 완료 신호를 제공하지 않는다. 이
저장소의 측정치(2026-09-28 UTC, `Publish to npm` 종료부터 registry `time` 기록까지):

| 릴리스 | 지연 |
| --- | --- |
| `1.8.3` | 약 76초 |
| `1.8.4` | 약 189초 |

plugin 쪽은 npm 조회가 필요 없어 확인 단계를 없앴지만(`def0f08`), registry는 서버가 npm을 직접
읽어 검증하므로 기다려야 한다. 고정 시간 대기 대신:

1. `npm view neosql-mcp@<version> mcpName --prefer-online`이 기대값을 돌려줄 때까지 30초 간격,
   최대 15분 polling. registry가 검사하는 값 자체를 확인한다. 반영되는 즉시 진행하므로 제한
   시간을 늘려도 평소 속도는 같다.
2. runner의 조회가 성공해도 registry 서버의 npm 조회가 늦을 수 있어 `mcp-publisher publish`를
   30초 간격, 최대 3분 재시도한다. 거부된 publish는 아무것도 저장하지 않으므로 안전하다.
3. job 제한 시간 20분. 초과하면 실패로 끝내고 수동 재실행한다.

참고로 chrome-devtools-mcp는 npm 조회를 60초 간격으로 약 5분, github-mcp-server는 Docker image
조회를 30초 간격으로 약 5분 기다린다. 이 저장소는 측정된 최대 지연(189초)에 비해 5분이
넉넉하지 않아 15분으로 잡았다.

### R5. `mcp-publisher`는 버전을 고정하고 서명을 검증한다

공식 예시는 매 실행마다 `releases/latest`를 내려받는다. 이 job은 OIDC 권한으로 게시하므로
검증하지 않은 최신 바이너리를 실행하지 않도록 `MCP_PUBLISHER_VERSION`(현재 `v1.8.1`, 2026-08-06
release)을 고정하고, release의 sigstore bundle을 cosign으로 검증한다. chrome-devtools-mcp도
같은 방식이다.

대가: registry API가 바뀌어 고정 버전이 동작하지 않으면 직접 올려야 한다. 공식 문제 해결표의
"invalid audience" 오류가 이 경우다("Your `mcp-publisher` binary is too old").

### R6. `server.json`에 인자와 환경변수를 선언하지 않는다

기본 profile이 prod이므로 인자 없이 동작한다. `--profile`은 내부 개발자용 옵션이라 공개
메타데이터에 노출하지 않는다. `remotes`도 두지 않는다(local stdio 서버).

## 4. 파일 구성

| 파일 | 역할 |
| --- | --- |
| `package.json#mcpName` | `io.github.unvus/neosql-mcp`. npm 패키지에 포함되어 소유권 검증에 쓰인다 |
| `server.json` (root) | registry 메타데이터. 버전 `0.0.0` 자리표시. npm 패키지에는 포함하지 않는다 |
| `.github/workflows/publish-mcp-registry.yml` | tag push 시 버전 주입·검증·대기·게시 |
| `tests/registry/server-json.test.ts` | `mcpName`·이름·package 선언·설명 길이·자리표시 계약 검사 |

`server.json`의 설명은 package description(175자)과 별도로 100자 이내로 쓴다.

## 5. 릴리스 흐름

```text
npm version → git push → tag push (v*)
  ├─ publish.yml             npm publish → release-plugin (plugin-release 전진)   ← 배포 완료 기준
  └─ publish-mcp-registry.yml
       1. tag == package.json version 확인, server.json 두 version에 주입
       2. mcp-publisher 다운로드 + cosign 서명 검증 → validate
       3. npm이 mcpName을 돌려줄 때까지 polling (30초 간격, 최대 15분)
       4. login github-oidc (대기 뒤 로그인해 token 만료 회피)
       5. publish, 실패 시 재시도 (30초 간격, 최대 3분)
```

`workflow_dispatch`는 tag를 선택했을 때만 job이 실행된다. branch에서 실행하면 건너뛴다.

release 스킬은 registry 결과를 완료 보고에 참고로 덧붙인다. 실패해도 스킬이 임의로
재실행하지 않고 보고만 한다.

게시 확인:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.unvus/neosql-mcp&version=latest"
```

## 6. 실패 대응

| 상황 | 대응 |
| --- | --- |
| npm 대기 15분 초과 | npm 반영 확인 후 Actions → **Publish to MCP Registry** → **Run workflow**에서 해당 tag로 재실행 |
| publish 재시도 3분 초과 | 로그의 registry 오류 확인. 소유권 검증 실패면 npm 버전의 `mcpName` 확인 후 재실행 |
| "invalid audience" | `MCP_PUBLISHER_VERSION`을 새 release로 올리고 sigstore bundle 존재 확인 |
| OIDC가 `io.github.unvus` namespace를 받지 못함 | 로컬에서 `mcp-publisher login github`(브라우저 device flow, `unvus` 계정) 후 버전을 넣은 `server.json`으로 `mcp-publisher publish`. 브라우저 인증이라 사람이 직접 한다 |
| 이미 게시된 버전 재게시 | registry가 중복으로 거부한다. 정상 동작이다 |
| 잘못된 메타데이터 게시 | 수정할 수 없다. 새 patch로 다시 게시하고 필요하면 `mcp-publisher status --status deprecated`로 표시 |

어느 경우에도 `publish.yml`은 재실행하지 않는다. 같은 npm 버전은 다시 publish할 수 없다.

## 7. 검증 기록

로컬 검증 (2026-09-30):

- `tests/registry/` 5개 red → green. 전체 단위 301개, spawn 12개, lint, typecheck, build 통과.
- `npm pack --dry-run`에서 `server.json` 제외, `package.json`(`mcpName` 포함) 포함 확인.
- actionlint 1.7.12 통과.
- `mcp-publisher v1.8.1 validate`: 자리표시(`0.0.0`)와 주입 버전 모두 통과.
- workflow 단계를 실제 명령으로 실행: 버전 주입, tag 불일치 거부, `mcpName`이 없는 `1.8.8`의
  대기 timeout, `mcpName`이 있는 패키지(chrome-devtools-mcp)의 일치 판정.

미검증 (첫 릴리스에서 확인, `CHECKLIST.md`에 기록):

- OIDC 로그인과 `io.github.unvus` namespace 부여.
- 실제 게시와 registry 조회.

## 8. 미결 사항

- registry GA 시 API·schema 변경 여부. preview 기간 data reset이 있으면 다음 릴리스 때 다시
  게시된다.
- registry 데이터를 실제로 반영하는 클라이언트·디렉터리 범위는 확인하지 않았다.

## 9. 출처

- [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
- [Quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx)
- [Authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx)
- [Package Types](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx)
- [GitHub Actions](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/github-actions.mdx)
- [Versioning](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/versioning.mdx)
- [server.json schema 2025-12-11](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
- 예시: [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/.github/workflows/publish-to-mcp-registry-on-tag.yml),
  [github-mcp-server](https://github.com/github/github-mcp-server/blob/main/.github/workflows/registry-releaser.yml)
- npm 반영 지연 측정: `def0f08`에서 추가하고 `3ef3c35`에서 제거한 `docs/release-plugin-registry-lag.md`
