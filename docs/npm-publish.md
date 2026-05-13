# npm 배포 가이드

`neosql-mcp`를 public npm package로 등록하고, MCP host에서
`npx -y neosql-mcp@latest`로 실행할 수 있게 만들기 위한 배포 기준이다.

기준 날짜: 2026-05-13

## 배포 원칙

- GitHub 공개 저장소를 소스의 단일 진실 원천으로 둔다.
- `main` push는 검증만 수행한다. 자동 npm publish는 하지 않는다.
- npm publish는 Git tag 또는 GitHub Release 생성 시에만 수행한다.
- publish 전에는 `npm ci`, lint, typecheck, test, build, `npm pack --dry-run`을 모두 통과해야 한다.
- 가능하면 npm Trusted Publishing(OIDC)을 사용한다. 장기 npm token은 기본 배포 경로로 쓰지 않는다.

## 현재 패키지 상태

`package.json` 기준 현재 배포 관련 설정은 다음과 같다.

| 항목 | 현재값 | 판단 |
| --- | --- | --- |
| package name | `neosql-mcp` | 배포 직전 `npm view neosql-mcp version`으로 점유 여부 재확인 |
| version | `0.0.1` | 최초 배포 후보로 사용 가능 |
| module type | `module` | TypeScript ESM 패키지 방향과 일치 |
| bin | `neosql-mcp` -> `dist/cli.js` | `npx neosql-mcp` 실행 진입점 |
| build | `tsup`, `src/cli/cli.ts` -> `dist/cli.js` | `tsup.config.ts`에서 shebang 추가 |
| files | `dist`, `README.md`, `LICENSE` | Apache License 2.0 전문 포함 |
| license | `Apache-2.0` | 배포 결정값 반영 완료 |
| engine | `node >=20` | Node 20 이상 MCP host 환경 필요 |
| prepublishOnly | `npm run build` | CI publish 전 별도 검증 job으로 test/build를 강제한다 |

npm은 한 번 publish된 `name@version` 조합을 같은 버전으로 다시 publish할 수 없다.

```bash
npm view neosql-mcp version
npm view neosql-mcp versions --json
```

## 배포 전 TODO

최초 publish 전에 아래 항목을 닫는다. 이 목록은 기존 "배포 전 필수 보완"을 구체화한
publish blocker 목록이다.

### 1. 공개 저장소 준비

- [x] GitHub 공개 저장소 owner/name을 확정한다.
  - 확정 주소: `https://github.com/unvus/neosql-mcp`.
  - 현재 package name이 unscoped `neosql-mcp`이므로 repository URL도 이에 맞춘다.
  - 조직 소유가 필요하면 npm package도 `@<org>/neosql-mcp`로 바꿀지 함께 결정한다.
- [ ] GitHub repository visibility를 public으로 전환하거나 public repository를 새로 만든다.
- [ ] 공개 저장소에 올리기 전 불필요한 로컬 파일이 포함되지 않는지 확인한다.
  - `.mcp.json`, `.env`, local log, generated tarball(`neosql-mcp-*.tgz`), `dist/`,
    `node_modules/`가 commit 대상이 아닌지 확인한다.
- [x] `package.json#repository`, `homepage`, `bugs`에 들어갈 실제 GitHub URL을 확정한다.
  - repository: `git+https://github.com/unvus/neosql-mcp.git`.
  - homepage: `https://github.com/unvus/neosql-mcp#readme`.
  - bugs: `https://github.com/unvus/neosql-mcp/issues`.
- [ ] Trusted Publishing을 사용할 GitHub repository와 npm package가 같은 소유 경계에 있는지 확인한다.

### 2. README 재작성

- [x] `README.md`를 현재 프로젝트 사용자 문서로 재작성한다.
  - 지금 README는 설계 배경과 구현 우선순위 중심이라 npm package landing page로는 부족하다.
  - npm package page에 그대로 노출되므로, 설치와 사용이 먼저 보이도록 구성한다.
- [x] README 첫 화면에 `neosql-mcp`가 무엇인지 명확히 적는다.
  - MCP host에서 `npx neosql-mcp`로 실행하는 local stdio MCP server.
  - NeoSQL Desktop과 UDS/Named Pipe 기반 upstream RPC로 통신한다.
  - NeoSQL Desktop 없이 독립 실행되는 DB 서버나 CLI가 아니라는 점을 명시한다.
- [x] README에 prerequisites를 추가한다.
  - Node.js `>=20`.
  - 설치 및 실행 가능한 NeoSQL Desktop.
  - MCP host가 stdio server 실행을 지원해야 한다는 조건.
- [x] README에 빠른 설정 예시를 추가한다.
  - Claude Code `.mcp.json` 예시.
  - Codex `config.toml` 예시.
  - `npx -y neosql-mcp@latest`와 `--profile=dev` 예시.
  - 공개 설정 예시는 README에 둔다. `docs/mcp-client-config.md`는 내부 개발자용
    CLI option/profile/context mapping 참고 문서로 유지한다.
- [x] README에 CLI option 표를 추가한다.
  - `--profile=<prod|dev|local|stage>`.
  - `--project=<value>`.
  - `--default-connection=<value>`.
  - `--default-schema=<value>`.
- [x] README에 현재 제공하는 MCP tool 목록을 추가한다.
  - `ping`.
  - `listConnections`.
  - `generateCode`.
  - `listTables`.
  - `getTableDetails`.
  - `setContext`.
  - `getContext`.
  - `getContextHelp`.
  - `createTables`.
  - `modifyTables`.
  - `executeQuery`.
  - `getMcpSessionId`.
- [x] README에 transport/endpoint 동작을 사용자 관점으로 요약한다.
  - macOS는 deterministic UDS path를 사용한다.
  - Windows는 deterministic Named Pipe path를 사용한다.
  - TCP port, config file discovery, environment override를 사용하지 않는다는 점을 명시한다.
- [x] README에 troubleshooting을 추가한다.
  - NeoSQL Desktop 미설치.
  - Desktop 미실행 또는 readiness timeout.
  - profile mismatch.
  - Node version mismatch.
  - MCP host 설정에서 `npx` args를 잘못 나눈 경우.
- [x] README에 development section을 추가한다.
  - `npm ci`.
  - `npm run build`.
  - `npm test`.
  - `npm link` 기반 로컬 MCP host 검증.
- [x] README의 한국어 내용을 영어로 옮긴다.
  - 단순 번역이 아니라 위 항목을 반영한 영어 사용자 문서로 재작성한다.

### 3. 공개 문서 영문화 범위 결정

- [x] npm package에 직접 노출되는 `README.md`는 반드시 영어로 작성한다.
- [ ] README에서 직접 참조하지 않는 내부/maintainer 문서는 당장 영문화하지 않는다.
  - `docs/testing.md`: internal/contributor test workflow.
  - `docs/project-structure.md`: internal file placement guide.
  - `docs/npm-publish.md`: internal publish checklist.
  - 향후 외부 contributor 문서로 노출할 때만 public-facing 영어 문서로 재작성한다.
- [x] `docs/e2e-manual.md`와 `docs/endpoint-resolver.md`는 내부 개발/검증 문서로
  유지한다. README에서 직접 링크하지 않는다.
- [x] public support OS는 NeoSQL Desktop과 동일하게 macOS/Windows만 표기한다.
  - Linux를 포괄하는 표현(`macOS/Linux`, generic POSIX support 등)은 public-facing
    문서와 npm metadata에서 사용하지 않는다.
- [x] `docs/mcp-client-config.md`는 end-user 설정 문서가 아니라 내부 개발자용
  CLI option/profile/context mapping 참고 문서로 유지한다.
- [ ] 내부 작업 기록 성격의 문서를 공개 저장소에 둘지 결정한다.
  - `PLAN.md`.
  - `CHECKLIST.md`.
  - `CLAUDE.md`.
  - `AGENTS.md`.
  - `docs/research/supabase-cli/*.md`.
- [x] `docs/claude-code/*.md`는 프로젝트와 무관한 개인 참고 자료이므로
  `~/workspace/docs/claude-code/`로 이동한다.
- [x] `docs/supabase-cli/*.md`는 `docs/research/supabase-cli/` 아래로 이동한다.
- [x] `docs/embedded-server-tool-analysis.md`와 `docs/mcp-context-holder-analysis.md`는
  삭제한다.
- [ ] `AGENTS.md` / `CLAUDE.md`를 public repository에 남길 수 있도록 수정할지 검토한다.
  - `AGENTS.md`는 AI coding agent용 작업 규칙으로 남길 수 있지만, public-safe 버전으로
    내부 경로와 private workflow를 축약해야 한다.
  - `CLAUDE.md`는 로컬 workspace 참조와 내부 context loading 용도가 강하므로 삭제하거나
    public-safe 안내 문서로 대체할지 결정한다.
- [ ] 개발 완료 후 `PLAN.md` / `CHECKLIST.md` 삭제를 검토한다.
  - 삭제 전 다른 문서로 이관해야 할 아키텍처 결정, 완료 이력, 배포 전 잔여 작업이
    남아 있는지 확인한다.
  - 외부 공개용 roadmap/changelog가 필요하면 두 문서를 그대로 공개하기보다
    `ROADMAP.md`, `CHANGELOG.md`, 또는 README의 짧은 status 섹션으로 재구성한다.
- [ ] 공개 저장소에 유지할 내부 문서는 영어로 번역하거나, repository 공개 전에 별도 private/internal
  문서로 분리한다.
- [x] `docs/spawn.md`는 삭제하고 핵심 설명만 `docs/testing.md`로 흡수한다.
- [x] 통신 계층 참고 문서는 `docs/research/rpc-vs-transport.md`로 이동하고 메타 정보를
  정리한다.
- [x] `docs/upstream-rpc-contract.md`는 공개 전 실제 구현과 다시 대조해 보정한다.
  - 확인 대상: error code table, lifecycle error handling, `executeQuery` error result
    shape, `generateCode.templatePackId` required 여부, DDL input optionality,
    `schema.listTables` result shape.
  - `src/mcp/tools/*`, `src/mcp/error-map.ts`, `src/upstream/http-client.ts`,
    `tests/mcp/**`, `tests/upstream/**`, `tests/helpers/mock-uds-server.ts`를 기준으로
    문서가 implementation contract인지 design note인지 구분해 정리한다.
  - `../neosql/app/src-electron/mcp-rpc/*`와
    `../neosql/app/src/services/mcp-handler/*`도 함께 확인했다.
  - 확인 중 발견한 `unavailable` lifecycle mapping 누락은 Node handler에서 보정했다.

### 4. package metadata 보강

- [x] `LICENSE` 파일을 Apache License 2.0 전문으로 교체한다.
  - 현재 `package.json#files`에 `LICENSE`가 포함되어 있다.
  - license 결정값은 `Apache-2.0`이다.
  - 현재 `LICENSE` 파일은 Apache License 2.0 전문이다.
- [x] `package.json#license`를 `Apache-2.0`으로 변경한다.
  - 현재 값은 `Apache-2.0`이다.
- [x] `package.json#description`을 현재 아키텍처에 맞게 수정한다.
  - 현재 description은 embedded-server와 Streamable HTTP를 언급한다.
  - 실제 구조는 stdio MCP server -> Electron main JSON-RPC over HTTP on macOS UDS /
    Windows Named Pipe다.
- [ ] `package.json#repository`를 추가한다.
  - npm 권장 형태:
    ```json
    {
      "repository": {
        "type": "git",
        "url": "git+https://github.com/unvus/neosql-mcp.git"
      }
    }
    ```
  - 현재 내부 Git remote(`git.unvus.com`)는 public npm metadata에 넣지 않는다.
- [ ] `package.json#homepage`를 추가한다.
  - 별도 제품/문서 페이지가 없다면 GitHub README landing URL을 사용한다.
  - 기본 후보:
    ```json
    {
      "homepage": "https://github.com/unvus/neosql-mcp#readme"
    }
    ```
  - NeoSQL 공식 MCP 설치 문서 페이지를 별도로 만들면 그 URL을 homepage로 쓸 수 있다.
    예: `https://neosql.unvus.com/docs/mcp`
  - 단순 제품 홈페이지(`https://neosql.unvus.com`)보다 패키지 사용법으로 바로 가는
    URL이 npm 사용자에게 더 적합하다.
- [ ] `package.json#bugs`를 추가한다.
  - GitHub Issues를 받을 계획이면 다음 형태를 사용한다.
    ```json
    {
      "bugs": {
        "url": "https://github.com/unvus/neosql-mcp/issues"
      }
    }
    ```
  - Issues를 닫아둘 계획이면 support/contact 정책을 먼저 정하고, README에 같은 안내를
    둔다. public npm package는 사용자가 문제를 신고할 공개 경로가 있는 편이 낫다.
- [x] `package.json#keywords`를 추가한다.
  - 후보: `mcp`, `model-context-protocol`, `neosql`, `stdio`, `database`, `electron`.
- [ ] `package.json#author` 또는 `contributors`를 추가할지 결정한다.
- [x] source map 공개 여부를 결정한다.
  - 현재 `npm pack --dry-run`에 `dist/cli.js.map`이 포함될 수 있다.
  - source map 공개는 허용한다. 현재 기준으로 별도 제외 설정은 추가하지 않는다.

### 5. npm package 소유권과 이름 결정

- [ ] npm registry에서 `neosql-mcp` 점유 여부를 배포 직전에 다시 확인한다.
  - `npm view neosql-mcp version`.
  - `npm view neosql-mcp versions --json`.
- [ ] unscoped `neosql-mcp`를 유지할지 scoped package로 바꿀지 결정한다.
  - scoped package로 바꾸면 README, GitHub Actions, 모든 MCP host 설정 예시의
    package spec을 함께 바꾼다.
  - 내부 CLI option/profile/context mapping이 바뀌면 `docs/mcp-client-config.md`도
    함께 갱신한다.
- [ ] publish 권한을 가진 npm 계정을 결정한다.
  - 개인 npm 계정.
  - 조직 npm 계정.
  - npm organization scope.
- [ ] npm 2FA 정책을 확인한다.
  - Trusted Publishing만 사용할지.
  - 예외 상황에서 OTP 기반 manual publish를 허용할지.

### 6. GitHub Actions 추가

- [ ] main 검증 workflow를 추가한다.
  - trigger: pull request, main push.
  - steps: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
    `npm pack --dry-run`.
- [ ] npm publish workflow를 추가한다.
  - trigger: Git tag `v*` 또는 GitHub Release published.
  - publish job 내부에서도 main 검증과 같은 명령을 다시 실행한다.
- [ ] Trusted Publishing을 사용한다면 workflow permission을 설정한다.
  - `permissions: id-token: write`.
  - 필요한 경우 `contents: read`.
- [ ] npm package Settings에 GitHub Actions trusted publisher를 등록한다.
- [ ] 장기 `NPM_TOKEN` secret을 기본 경로로 쓰지 않는다.
  - Trusted Publishing을 사용할 수 없는 예외 상황에서만 token 전략을 별도로 문서화한다.

### 7. 배포 전 검증

- [ ] clean working tree에서 시작한다.
  - `git status --short`.
- [ ] CI와 같은 검증 명령을 로컬에서 실행한다.
  - `npm ci`.
  - `npm run lint`.
  - `npm run typecheck`.
  - `npm test`.
  - `npm run build`.
  - `npm pack --dry-run`.
- [ ] `npm pack --dry-run` 결과를 확인한다.
  - `dist/cli.js` 포함.
  - `dist/cli.js` 첫 줄의 shebang 포함.
  - `README.md` 포함.
  - `LICENSE` 포함.
  - `src/`, `tests/`, `docs/`, `.env`, `.mcp.json`, local log, `node_modules/` 미포함.
- [ ] 실제 MCP host에서 published package spec으로 수동 검증한다.
  - 최초 publish 전에는 local linked binary 또는 packed tarball로 검증한다.
  - publish 후에는 `npx -y neosql-mcp@latest`로 검증한다.

## GitHub Actions 구성

### main 검증 workflow

`main` push와 pull request에서는 검증만 실행한다.

필수 단계:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

`npm pack --dry-run` 확인 포인트:

- `dist/cli.js`가 포함되어야 한다.
- `dist/cli.js` 첫 줄에 `#!/usr/bin/env node`가 있어야 한다.
- `README.md`와 `LICENSE`가 포함되어야 한다.
- `src/`, `tests/`, `docs/`, `.env`, `.mcp.json`, local log, `node_modules/`는 포함되지 않아야 한다.
- source map을 공개하지 않을 계획이면 `dist/*.map` 포함 여부를 보고 `tsup.config.ts` 또는 `files` 정책을 조정한다.

### npm publish workflow

publish workflow는 Git tag 또는 GitHub Release에서만 실행한다.

권장 trigger:

```yaml
on:
  push:
    tags:
      - 'v*'
```

또는 GitHub Release published event를 사용한다.

publish job도 검증을 다시 실행한다. main 검증 workflow를 통과했더라도 publish job 안에서
다시 `npm ci`, lint, typecheck, test, build, `npm pack --dry-run`을 실행한다.

Trusted Publishing을 사용하는 경우:

- npm package Settings에서 GitHub Actions trusted publisher를 설정한다.
- workflow에는 `permissions: id-token: write`를 부여한다.
- 장기 `NPM_TOKEN` secret을 쓰지 않는다.
- 지원 조건을 만족하면 provenance가 자동 생성되므로 `npm publish --provenance`를 별도로 붙이지 않는다.

publish 명령:

```bash
npm publish --access public
```

scoped package를 public으로 배포하는 경우에도 `--access public`을 명시한다. 현재처럼 unscoped
package인 `neosql-mcp`는 public package로 배포된다.

## 버전과 태그

배포 전 `package.json`의 version이 npm에 아직 없는지 확인한다.

```bash
npm view neosql-mcp versions --json
```

버전 변경은 semver 기준으로 한다.

```bash
npm version patch
npm version minor
npm version major
```

`npm version`은 기본적으로 `package.json`, `package-lock.json`을 수정하고 git tag를 만든다.
tag 기반 publish workflow를 쓸 경우 이 동작을 그대로 활용할 수 있다.

pre-release나 내부 검증용으로 먼저 올리고 싶으면 `latest` 대신 별도 dist-tag를 쓴다.

```bash
npm publish --access public --tag next
npm dist-tag add neosql-mcp@<version> latest
```

## 배포 후 검증

publish가 끝나면 registry와 실제 실행 경로를 확인한다.

```bash
npm view neosql-mcp version
npm view neosql-mcp bin
npm pack neosql-mcp@latest --dry-run
npx -y neosql-mcp@latest
```

`npx -y neosql-mcp@latest`는 stdio MCP server를 실행하므로 일반 터미널에서는 대기 상태처럼
보일 수 있다. 실제 동작 검증은 `docs/e2e-manual.md`의 MCP host 절차로 확인한다.

MCP host 설정도 최신 패키지명과 맞춘다.

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": ["-y", "neosql-mcp@latest"]
    }
  }
}
```

dev profile이 필요하면:

```json
{
  "mcpServers": {
    "neosql-dev": {
      "command": "npx",
      "args": ["-y", "neosql-mcp@latest", "--profile=dev"]
    }
  }
}
```

## 수동 publish

수동 publish는 기본 경로가 아니다. GitHub Actions 또는 npm Trusted Publishing 장애, 최초
패키지 소유권 검증처럼 자동 경로를 사용할 수 없는 경우에만 예외적으로 사용한다.

수동 publish를 해야 한다면 clean working tree에서 CI와 같은 검증을 먼저 실행한다.

```bash
git status --short
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

그 다음 publish한다.

```bash
npm publish --access public
```

2FA OTP를 명시해야 하는 환경이면:

```bash
npm publish --access public --otp <one-time-password>
```

## 문제 발생 시 대응

잘못된 버전을 publish한 경우 같은 버전을 덮어쓸 수 없다.

- 단순 README나 metadata 문제: 수정 후 새 patch version publish.
- 사용자에게 설치하지 말라고 알려야 하는 문제: `npm deprecate` 사용.
- 민감정보 포함: 즉시 token 폐기, repository history 점검, npm unpublish 정책 확인.
- 로컬 npm cache 권한 문제: `npm_config_cache`를 임시 디렉토리로 지정해 pack/publish 전
  검증 명령을 다시 실행한다.

deprecate 예시:

```bash
npm deprecate neosql-mcp@0.0.1 "Use 0.0.2 or later"
```

cache 우회 예시:

```bash
env npm_config_cache=/private/tmp/neosql-mcp-npm-cache npm pack --dry-run
```

## 참고 문서

- npm publish: https://docs.npmjs.com/cli/v11/commands/npm-publish/
- package.json: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
- trusted publishing: https://docs.npmjs.com/trusted-publishers
- 공개 MCP host 설정: `README.md`
- 내부 CLI option/profile/context mapping: `docs/mcp-client-config.md`
- 수동 e2e 검증: `docs/e2e-manual.md`
