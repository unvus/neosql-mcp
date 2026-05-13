# 01. Supabase CLI 개괄

> Supabase CLI가 **무엇을 하고**, **어떻게 구성되어 있고**, **어떻게 배포되는지** 정리. 02의 패턴들을 읽기 전에 큰 그림을 잡기 위한 문서.

## 한 줄 요약

> **Supabase CLI = 로컬 개발 환경(Docker 기반)을 한 방에 띄우고, DB 마이그레이션·Edge Functions 배포·Management API 호출을 모두 수행하는 단일 Go 바이너리.** npm/Homebrew/Scoop/Linux 패키지 매니저로 배포된다.

## 무엇을 하는가 — 5가지 주요 기능

리포 README에 정리된 그대로:

1. **로컬에서 Supabase 실행** — `supabase start`로 Postgres + Auth + Realtime + Storage + Studio 등 컨테이너 일괄 기동
2. **DB 마이그레이션 관리** — `supabase migration` 커맨드 군. SQL 파일 기반.
3. **Edge Functions 생성/배포** — `supabase functions` 커맨드 군. Deno 런타임으로 로컬 실행.
4. **DB 스키마에서 타입 생성** — `supabase gen types` (TypeScript/Go 등)
5. **Management API 호출** — 클라우드 프로젝트의 메타데이터/설정을 CLI로 조작 (`supabase projects`, `supabase orgs`, `supabase secrets` 등).

## 어떻게 배포되는가

다중 채널 동시 배포. 각각 같은 Go 바이너리를 받아오는 얇은 래퍼다:

| 채널 | 동작 |
|------|------|
| **npm** (`npm i supabase --save-dev`) | postinstall 스크립트로 GitHub Releases에서 OS/arch별 tar.gz 다운로드 → 추출 → bin-link |
| **Homebrew** | `brew install supabase/tap/supabase` |
| **Scoop** (Windows) | `scoop install supabase` |
| **Linux 패키지** | `.apk` / `.deb` / `.rpm` / `.pkg.tar.zst` (GitHub Releases) |
| **Direct download** | GitHub Releases에서 바이너리 직접 |

핵심: **GitHub Releases가 단일 진실 원천**이고, 모든 패키지 매니저는 그 위에 얹힌 얇은 진입점이다. neosql-mcp도 같은 모델을 따를 수 있다.

배포 메커니즘 디테일은 02 문서 Pattern 1에서 다룬다.

## 기술 스택

| 영역 | 도구 |
|------|------|
| 언어 | Go |
| CLI 프레임워크 | [`spf13/cobra`](https://github.com/spf13/cobra) — 커맨드 트리 |
| 설정 관리 | [`spf13/viper`](https://github.com/spf13/viper) — flag/env/file 통합 |
| FS 추상화 | [`spf13/afero`](https://github.com/spf13/afero) — 테스트에서 in-memory FS로 교체 |
| 컨테이너 제어 | Docker SDK + Docker Compose v2 (Go) |
| 토큰 보관 | `zalando/go-keyring` (OS 키체인) + 폴백 파일 |
| 오류 추적 | Sentry (`getsentry/sentry-go`) |
| 텔레메트리 | PostHog 호출 (직접 구현) |
| 빌드 + 릴리즈 | [`goreleaser`](https://goreleaser.com/) (`.goreleaser.yml`) |
| API 클라이언트 | OpenAPI codegen (`oapi-codegen`) — Management API 자동 생성 |

`spf13/*` 패밀리(cobra/viper/afero)는 Go CLI 개발의 사실상 표준. neosql-mcp(TypeScript)는 직접 쓸 수 없지만, **개념적 대응품**은 존재한다 (02 Pattern 5 참조).

## 디렉토리 구조

```
~/workspace/cli/
├── main.go            # 진입점 (cmd.Execute() 한 줄)
├── cmd/               # 커맨드 정의 (cobra 명령 트리)
│   ├── root.go        # 루트 커맨드 + 글로벌 플래그 + lifecycle hook
│   ├── start.go, stop.go, db.go, functions.go, ...  (38개)
│   └── ...
├── internal/          # 비즈니스 로직 (커맨드별 디렉토리)
│   ├── start/         # `supabase start` 구현
│   ├── functions/     # Edge Functions 관련
│   ├── migration/
│   ├── utils/         # 공용 유틸 (docker, deno, config, release, ...)
│   └── ...
├── pkg/               # 외부에 export 가능한 패키지 (api/ 자동생성 클라이언트 등)
├── api/               # OpenAPI 정의
├── scripts/postinstall.js  # npm 배포용 다운로드 스크립트
├── package.json       # npm 패키지 메타
├── go.mod / go.sum
└── .goreleaser.yml    # 멀티 플랫폼 빌드/릴리즈 설정
```

**`cmd/` vs `internal/` 분리**가 핵심 설계: cobra 명령은 얇게 두고(파라미터 파싱·flag 정의만), 실제 로직은 `internal/<feature>/`에 둔다. 테스트 가능성이 좋아진다.

## 커맨드 그룹 (root.go)

`cmd/root.go:27-31`에 정의된 3그룹:

```
- quick-start    : 처음 쓰는 사용자를 위한 핵심 커맨드 (init, start, ...)
- local-dev      : 로컬 개발 (db, functions, migration, gen, ...)
- management-api : 클라우드 프로젝트 조작 (orgs, projects, secrets, ... — 로그인 필요)
```

`management-api` 그룹은 `PersistentPreRunE`에서 자동으로 `promptLogin()`을 호출해 토큰을 강제한다 (`root.go:108-117`). 그룹 단위로 행동을 다르게 가져갈 수 있다는 점이 cobra의 강점.

## 커맨드 lifecycle

cobra의 `PersistentPreRunE`(부모-자식 모든 명령에 적용되는 pre-run 훅)에서 다음 순서로 처리한다 (`cmd/root.go:93-165`):

```
1. experimental flag 체크 (해당 명령이 실험적이면 --experimental 강제)
2. profile 로드 (~/.config/supabase/profile)
3. workdir 변경 (--workdir 처리)
4. management-api 명령이면 토큰 검증
5. database flag 파싱
6. debug 모드면 HTTP transport 교체 (요청/응답 덤프)
7. 텔레메트리 서비스 초기화
8. Sentry 초기화 (마지막에 — flag 파싱 에러는 sentry 안 보냄)
```

명령 실행 후(`Execute()`):

```
9. 텔레메트리 이벤트 전송 (PropExitCode, PropDurationMs)
10. 자동 업데이트 체크 (10시간 캐시) — 새 버전 있으면 stderr에 안내
11. CmdSuggestion이 있으면 stderr에 출력 (에러 발생 시 다음 액션 힌트)
```

**관심 포인트**: 진입/종료 양쪽에 일관된 가로지르기(cross-cutting) 처리를 두는 구조. neosql-mcp도 MCP 서버 시작/종료 시점에 비슷한 hook을 두면 깔끔해진다.

## 자동 업데이트 체크 (눈여겨볼 만)

`cmd/root.go:240-267` + `internal/utils/release.go`:

- `Execute()` 마지막에 `checkUpgrade()` 호출
- `~/.supabase/cli-latest` 파일에 마지막 체크 시각(mtime) + 버전 문자열 저장
- 10시간 이내면 fetch 스킵
- 오프라인이라 fetch 실패하면 빈 파일을 써둠 → 다음 호출에서도 fetch 안 함 (rate limit 보호)
- semver 비교(`golang.org/x/mod/semver`)로 신버전 안내

이 패턴은 02 Pattern 7에서 더 자세히 본다.

## 텔레메트리 / 관측

- **PostHog**: 명령 실행 통계 (성공/실패, 소요 시간, 그룹)
- **Sentry**: 패닉/에러 보고 (`recoverAndExit`로 `defer recover()` + 자동 전송)
- **`--debug`**: HTTP 트래픽 stderr 덤프
- **`--create-ticket`**: 에러 발생 시 Sentry 티켓 ID를 stderr에 노출 (사용자가 이슈 신고 시 첨부)

neosql-mcp 초기엔 이 정도까지 갈 필요 없지만, **에러 코드 표준화**와 **stderr 로깅 일관성**(stdout은 MCP JSON-RPC 전용)은 동일 원칙이 적용된다.

## 다음 문서

[02-patterns-for-neosql-mcp.md](02-patterns-for-neosql-mcp.md)에서 위 시스템의 어떤 조각을 우리가 빌려올지 구체적으로 다룬다.
