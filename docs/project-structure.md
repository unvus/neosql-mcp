# Project Structure

`neosql-mcp` 리포의 디렉토리 구조와 새 파일 배치 규칙. **새 파일·모듈을 추가하거나 기존 파일을 이동할 때는 이 문서를 먼저 참조한다.**

## 레이아웃

```
src/                            (프로덕션 코드만)
├── cli/         바이너리 진입점 + CLI 인자 파싱
│   ├── cli.ts                  package.json#bin 타깃
│   └── cli-args.ts             --profile prod, dev, local, stage 인자 파싱
│   └── check-desktop-installation.ts
│                               npm run check:desktop-installation 으로 실행하는
│                               macOS/Windows 설치 감지 진단 CLI
├── mcp/         MCP stdio 서버 + tool 카탈로그
│   ├── server.ts               createServer 팩토리
│   └── tools/                  MCP 도구 등록
│       ├── ping.ts
│       ├── shared.ts           tool 응답/forward 공통 헬퍼
│       ├── code-generation/
│       ├── context/
│       ├── ddl/
│       ├── schema/
│       └── sql/
├── upstream/    electron-main HTTP 채널 (UDS / Named Pipe)
│   ├── app-activation.ts       OS-level NeoSQL Desktop activation request
│   ├── desktop-readiness.ts    tool 호출 전 Desktop health/activation 공통 흐름
│   ├── endpoint-resolver.ts    profile → socket path 산출, /mcp/rpc 상수
│   ├── health-check.ts         socket path connect 시도
│   ├── http-client.ts          JSON-RPC over HTTP POST 클라이언트
│   ├── mcp-config-record.ts    NeoSQL Desktop 이 기록한 appPath hint 읽기
│   ├── profile-names.ts        profile → protocol/package name 산출
│   └── sse-parser.ts           GET SSE 채널용 event-stream 파서
└── infra/       횡단 관심사
    ├── log-path.ts             Electron-style OS별 로그 경로 계산
    └── logger.ts               pino → log file, 실패 시 stderr fallback

tests/                          (모든 테스트 코드)
├── cli/                        src/cli/ 미러링 (단위 테스트)
│   └── cli-args.test.ts
├── mcp/                        src/mcp/ 미러링
│   └── server.test.ts
├── upstream/                   src/upstream/ 미러링
│   ├── endpoint-resolver.test.ts
│   └── health-check.test.ts
├── spawn/                      built dist/cli.js 대상 통합 테스트
│   └── cli.spawn.test.ts
├── integration/                mock UDS 서버 대상 통합 테스트
│   └── round-trip.test.ts
├── (Phase 2 예정) fixtures/    mock RPC 응답, 샘플 config 등
└── helpers/                    mock 서버 빌더, 공통 setup 유틸
    ├── mock-uds-server.ts
    └── socket.ts

docs/   사용자/에이전트 가이드 (이 문서 포함)
├── research/                  제품 문서가 아닌 분석/도구 사용 참고 자료
│   └── supabase-cli/          Supabase CLI 참조 분석 문서 (`../cli` sibling clone 대상)
poc/    transport 실험 (프로덕션 아님)
dist/   tsup 빌드 산출물 (편집 금지)
```

### 왜 src ↔ tests 분리인가

- 프로덕션 코드(`src/`)와 테스트 인프라(`tests/`)가 시각적으로 분리됨.
- `tests/fixtures/`, `tests/helpers/` 같은 비프로덕션 코드의 자연스러운 자리 확보 (Phase 2 부터 mock UDS/HTTP 서버 fixture가 늘어남).
- `tests/integration/`, `tests/spawn/`, (이후) `tests/e2e/` 처럼 테스트 종류별 폴더 분리가 깔끔.
- `package.json#files` 화이트리스트와 별개로 멘탈 모델이 단순 — `src/` = 패키지, `tests/` = 검증.
- TypeScript 컴파일러 본체, Vitest, Prettier, ts-node 등 동일 성격 도구 프로젝트의 다수 컨벤션과 일치.

## 새 파일 분류 가이드

### `src/` 4개 경계

| 경계        | 책임                                                    | 예시                                   |
| ----------- | ------------------------------------------------------- | -------------------------------------- |
| `cli/`      | 프로세스 진입, CLI 인자 파싱                            | `--verbose` 플래그 추가                |
| `mcp/`      | MCP SDK stdio 서버, tool 등록                           | 새 MCP 도구 (`tools/` 안)              |
| `upstream/` | electron-main 측 채널 (transport + RPC 클라)            | HTTP 클라, SSE 파서, RPC 메서드 핸들러 |
| `infra/`    | 횡단 관심사 (다른 곳이 의존하지만 자신은 의존하지 않음) | 에러 매핑 헬퍼, 메트릭                 |

### 의존 방향

```
cli  ─►  mcp
cli  ─►  upstream
cli  ─►  infra
mcp  ─►  infra
mcp  ─►  upstream     (Phase 2부터 — 도구 핸들러가 upstream RPC 호출)
upstream ─► infra
tests ─► src          (테스트는 항상 ../../src/... 로 import)
```

- `infra/`는 다른 곳에 의존하지 않는다.
- `cli/`는 모두를 호출하지만, 다른 곳이 `cli/`에 의존하지 않는다.
- 같은 폴더 안에서는 자유롭게 import.
- `src/` 안에서는 절대 `tests/`를 import 하지 않는다.

### 모호할 때

- 분류가 모호한 파일은 PR 설명에 분류 근거를 명시한다.
- 새 경계가 필요해 보이면 코드 변경 PR과 **함께 이 문서도 갱신**한다.
- Supabase CLI 소스 분석 문서는 `docs/research/supabase-cli/` 아래에 둔다. 분석 대상
  원본 소스는 이 저장소 기준 `../cli`에 있는 sibling clone이다.

## 테스트 배치 규칙

| 종류        | 위치                               | 명명              | 비고                       |
| ----------- | ---------------------------------- | ----------------- | -------------------------- |
| 단위 테스트 | `tests/<src 미러>/foo.test.ts`     | `*.test.ts`       | mock 사용, 빠름            |
| 통합 테스트 | `tests/integration/...` (Phase 2+) | `*.test.ts`       | mock UDS/HTTP 서버 대상    |
| spawn 통합  | `tests/spawn/...`                  | `*.spawn.test.ts` | 빌드된 `dist/cli.js` spawn |
| E2E         | `tests/e2e/...` (Phase 3+)         | `*.e2e.test.ts`   | 실제 electron-main 대상    |
| fixtures    | `tests/fixtures/`                  | (테스트 아님)     | mock 응답, 샘플 데이터     |
| helpers     | `tests/helpers/`                   | (테스트 아님)     | mock 서버 빌더, setup 유틸 |

- 단위 테스트는 `src/` 구조를 그대로 미러링한다 (예: `src/upstream/health-check.ts` → `tests/upstream/health-check.test.ts`).
- `tests/` 안에서는 `import { foo } from '../../src/<dir>/foo.js'` 형태로 src를 참조한다.
- npm 스크립트 분류:
  - `npm run test:unit` — `*.spawn.test.ts` 제외 (spawn은 빌드 선행 필요)
  - `npm run test:integration` — 빌드 후 `*.spawn.test.ts` 만 실행
  - `npm test` — 전체
- 테스트 워크플로(test list → red → impl → green) 상세는 `docs/testing.md`.

## 빌드 진입점

- `package.json#bin` → `dist/cli.js`
- `tsup.config.ts#entry` → `src/cli/cli.ts`, `src/cli/check-desktop-installation.ts`
- 진입점 변경 시 두 파일을 동시에 수정한다.

## tsconfig / vitest

- `tsconfig.json` `include`: `["src/**/*.ts", "tests/**/*.ts"]` — 테스트도 typecheck 대상.
- `tsconfig.json`은 `rootDir`을 두지 않는다 (tsup이 빌드를 별도 처리하므로 tsc는 noEmit 전용).
- `vitest.config.ts` `include`: `["tests/**/*.test.ts"]` — 테스트는 `tests/` 안에서만 발견.

## 변경 이력

- 2026-04-29: `src/` 평면 → `cli/mcp/upstream/infra` 4분할, `src/` ↔ `tests/` 분리 도입.
- 2026-04-29: Phase 2-1 채널 인프라(`http-client`, `sse-parser`)와 9개 MCP tool 시그니처, mock UDS 통합 테스트 추가.
- 2026-05-11: Phase 3-1 Desktop readiness/activation 모듈 추가.
