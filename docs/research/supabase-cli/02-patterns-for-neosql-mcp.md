# 02. neosql-mcp에 빌려올 패턴들

> Supabase CLI에서 발견한 설계 패턴 중, **neosql-mcp**(npx로 배포되는 TypeScript MCP 서버, **neosql Electron 앱 안에서 동작하는 embedded-server**와 통신하는 중계자)에 직접 매핑 가능한 것만 정리한다.
>
> 각 패턴은 다음 3블록으로 구성:
> 1. **Supabase CLI 구현** — 어떻게 풀고 있는가 (file:line 인용)
> 2. **핵심 아이디어** — 왜 이렇게 하는가
> 3. **neosql-mcp 적용 포인트** — TypeScript로 어떻게 옮기는가, 무엇을 주의할까

배경은 [01-cli-overview.md](01-cli-overview.md), spawn 기반 통합 테스트의 핵심은
[`docs/testing.md`](../../testing.md) 참고.

## 아키텍처 전제 (load-bearing)

이 문서 전체의 매핑은 아래 사실에 기대고 있다:

- **neosql Electron 앱이 embedded-server JAR을 번들·spawn**한다 (`~/workspace/neosql/docs/architecture/execution-modes.md`, `module-dependencies.md`).
- neosql-mcp는 **JAR을 직접 spawn하지 않는다.** Electron 앱이 노출하는 HTTP endpoint(`http://127.0.0.1:{I_PORT}`)에 연결해 MCP 요청을 중계만 한다.
- Electron 앱은 사용자가 **neosql 웹사이트**(neosql 프로젝트의 `web/` 모듈에서 다운로드 링크 제공)에서 별도로 설치한다. neosql-mcp는 이 설치를 감지하고, 미설치 시 안내만 담당한다.

따라서 Supabase CLI의 "도커 이미지 풀 + 외부 바이너리 다운로드/캐시" 류 패턴은 우리에게 **약하게만** 적용된다. 진짜 빌릴 만한 건 detect-or-launch, 헬스체크, 에러 안내, 설정 우선순위 같은 일반 패턴들이다.

---

## Pattern 1 — npm postinstall로 플랫폼별 바이너리 다운로드

### Supabase CLI 구현

**핵심 파일**: `package.json`, `scripts/postinstall.js`

`package.json` 요지:
```json
{
  "files": ["scripts"],
  "scripts": { "postinstall": "node scripts/postinstall.js" },
  "bin": { "supabase": "bin/supabase" },
  "dependencies": {
    "bin-links": "^6.0.0",
    "https-proxy-agent": "^9.0.0",
    "node-fetch": "^3.3.2",
    "tar": "7.5.13"
  }
}
```

`postinstall.js`가 하는 일:

1. `process.platform` × `process.arch`를 Go의 `$GOOS`/`$GOARCH`로 매핑 (`darwin/linux/win32` × `x64/arm64`)
2. GitHub Releases URL 조립: `github.com/supabase/cli/releases/download/v{ver}/supabase_{platform}_{arch}.tar.gz`
3. `checksums.txt` 먼저 다운로드 → 파싱
4. tar.gz 스트리밍 다운로드 + sha256 누적 계산
5. gunzip → tar 추출(`bin/` 디렉토리로)
6. checksum 검증 (불일치 시 throw)
7. `bin-links`로 PATH 등록

추가 디테일:
- npm/yarn proxy 설정 자동 인식 (`HttpsProxyAgent`)
- Windows면 `bin: "supabase.exe"`로 동적 변경
- **글로벌 설치 거부** (`npm i -g` 시 에러 throw — supported 채널로 안내)

### 핵심 아이디어

- **단일 진실 원천 = GitHub Releases.** npm 패키지는 "어떤 버전을 받아올지"를 결정하는 얇은 진입점일 뿐. tar.gz는 빌드/CI에서 한 번만 만들면 모든 플랫폼이 같은 파일을 받는다.
- npm 패키지 자체엔 바이너리를 **포함하지 않는다** — 1MB 패키지 메타만 배포되고, postinstall이 진짜 페이로드를 가져온다. 패키지 사이즈/버전 관리에 유리.
- checksum 검증으로 MITM/손상 방지.

### neosql-mcp 적용 포인트

**핵심 인식**: neosql-mcp는 pure TypeScript 모듈이고, embedded-server는 **neosql Electron 앱 안에 이미 번들**되어 있다. 따라서 neosql-mcp 자체엔 다운로드할 외부 페이로드가 없고, Supabase식 postinstall 메커니즘 자체가 **불필요**하다 → npm 패키지는 평범한 JS 파일 묶음.

다만 다른 종류의 "외부 의존"이 있다 — **neosql Electron 앱**. 사용자가 neosql 웹사이트에서 직접 다운로드해서 설치한 상태여야 한다. neosql-mcp가 직접 설치/다운로드할 수는 없지만, **설치 여부를 감지하고 미설치 시 안내**할 책임이 있다.

| 측면 | Supabase CLI | neosql-mcp |
|------|-------------|----------|
| npm 패키지 페이로드 | 작음 (postinstall이 진짜 페이로드 다운로드) | 작음 (TS 코드만, 외부 페이로드 없음) |
| 사용자 머신의 외부 의존 | Docker, Deno 등 | neosql Electron 앱 (이 안에 embedded-server JAR 포함) |
| 의존 설치 책임 | CLI가 일부 자동 (Deno) / 일부 안내 (Docker) | neosql-mcp는 **안내만** — 설치는 사용자가 직접 |

따라서 빌려올 패턴은 "감지·안내":
- 일반적 설치 위치 검사 (각 OS별 — macOS `/Applications`, Windows `Program Files`, Linux 등)
- 미설치 시 친절한 메시지 + 다운로드 URL 제공
- 설치는 되어 있지만 실행 불가 / 버전 mismatch 등 단계별 진단

OS별 설치 위치 / 다운로드 URL은 **별도 조사**: neosql 프로젝트 `web/` 모듈과 빌드 산출물에서 확인 후 PLAN에 정리.

> 참고: Supabase CLI의 postinstall 코드 자체는 우리에게 직접 적용되지 않지만, **global install 거부** / **proxy 자동 인식** 같은 디테일은 향후 우리가 OS별 설치 감지 로직을 짤 때 참고할 만하다.

---

## Pattern 2 — Lazy 다운로드 + 사용자 홈 캐시

### Supabase CLI 구현

**핵심 파일**: `internal/utils/deno.go:39-131`

Edge Functions를 로컬 실행할 때만 필요한 Deno 바이너리는 npm 배포 시점이 아니라 **첫 사용 시점**에 다운로드한다.

```go
// deno.go:39-53
func GetDenoPath() (string, error) {
    home, err := os.UserHomeDir()
    if err != nil { return "", err }
    denoBinName := "deno"
    if runtime.GOOS == "windows" { denoBinName = "deno.exe" }
    return filepath.Join(home, ".supabase", denoBinName), nil
}

// deno.go:55-131 (요지)
func InstallOrUpgradeDeno(ctx, fsys) error {
    // 이미 있으면 → `deno upgrade --version 1.30.3`
    // 없으면 → GitHub releases에서 zip 받아서 ~/.supabase/deno에 0755로 쓰기
}
```

- 다운로드 대상은 `denoland/deno` GitHub Releases (단, `linux-arm64`는 비공식 fork: `LukeChannings/deno-arm64`)
- 압축 해제는 메모리에서 수행 (`zip.NewReader(bytes.NewReader(body))`) — 디스크 임시 파일 안 만듦
- 실행 권한 0755로 명시
- 버전 변경 감지는 `sha256.Sum256(dest) != sha256.Sum256(src)` (`deno.go:144`)

### 핵심 아이디어

- **사용자가 그 기능을 안 쓰면 다운로드 안 한다.** 디스크/네트워크 절약.
- **사용자 홈에 캐시** → npm 패키지 위치(node_modules)와 분리. npm 재설치/삭제와 무관하게 유지.
- 버전이 코드에 **하드코딩**(`DenoVersion = "1.30.3"`)되어 있어 신뢰 가능.
- 업그레이드는 **외부 도구에 위임**(`deno upgrade` 자체 명령). 우리는 이런 부수 도구가 없으므로 직접 받는 패턴만 가져간다.

### neosql-mcp 적용 포인트

**핵심 인식**: 캐시할 "외부 바이너리"가 우리에겐 없다. embedded-server JAR은 Electron 앱 내부에 이미 있어 neosql-mcp가 별도로 관리할 일이 없다.

다만 작은 **discovery 캐시**는 둘 가치가 있다:

```typescript
// ~/.neosql-mcp/discovery.json 같은 형태
{
  "appPath": "/Applications/NeoSQL.app",   // 마지막에 발견한 앱 경로
  "lastSeenPort": 52083,                    // 마지막 alive 포트
  "lastSeenAt": "2026-04-27T10:23:00Z"
}
```

목적: 다음 실행 때 빠른 연결 시도. 단 stale 데이터로 인한 오작동 가능성이 있어 **invalidation 로직**(헬스체크 실패 시 즉시 무효화)이 필수. 굳이 안 둬도 동작은 함.

추가로 둘 만한 것:
- `~/.neosql-mcp/logs/` — neosql-mcp 자체 로그 (영속). 디버깅 시 사용자에게 "이 로그를 첨부해주세요" 안내 가능.

**Supabase의 deno 캐시 패턴**(GitHub release zip → 메모리 추출 → 0755 쓰기 → 후속 호출에서 upgrade 명령으로 버전 검사)은 우리에게 직접 적용되지 않는다. 차용 가능한 작은 원칙은 다음 정도:
- 캐시는 **사용자 홈**에 (npm `node_modules`와 분리, 패키지 재설치와 무관하게 유지)
- atomic write (임시 파일 → rename)
- 권한 처리는 OS/플랫폼별로

JAR을 우리가 다운로드/관리할 일이 없으므로 이 패턴은 Top 5에서 제외 — 자세한 건 [의도적으로 빌리지 않을 패턴](#의도적으로-빌리지-않을-패턴) 섹션 참고.

---

## Pattern 3 — Child process spawn + stdio 분리

### Supabase CLI 구현

**핵심 파일**: `internal/utils/deno.go:63-66`, `internal/start/start.go`(전반)

기본형:
```go
cmd := exec.CommandContext(ctx, denoPath, "upgrade", "--version", DenoVersion)
cmd.Stderr = os.Stderr
cmd.Stdout = os.Stdout
return cmd.Run()
```

`signal.NotifyContext(cmd.Context(), os.Interrupt)` (`root.go:99`)로 Ctrl+C 시 자식 프로세스에 자동으로 SIGINT 전파.

`supabase start`는 docker SDK로 컨테이너를 띄우므로 OS-level spawn이 아니라 docker daemon 통신이지만, **lifecycle 패턴(시작 → 헬스체크 → 의존성 순서 → cleanup)**은 동일.

### 핵심 아이디어

- stdout/stderr를 **부모의 것에 연결**해 두면 사용자가 직접 보는 것과 동일한 출력이 흐른다.
- context cancel = 자식에게 SIGINT 전송 (Go의 표준 패턴). 부모 종료 시 좀비 방지.
- 동기 실행이면 `Run()`, 비동기면 `Start()` + `Wait()`.

### neosql-mcp 적용 포인트

**핵심 인식**: 우리가 spawn하는 대상은 **JAR이 아니라 neosql Electron 앱**이다. 그리고 Electron 앱은 GUI 앱이라 **detached 실행 모델**이 자연스럽다 — neosql-mcp가 라이프사이클을 소유하지 않는다.

두 단계 흐름:

**1단계 — 발견·헬스체크 먼저** (launch보다 우선):

이미 실행 중이면 launch 불필요. 사용자가 직접 띄워둔 상태일 수도 있다.

```typescript
async function findRunningNeoSql(): Promise<{ baseUrl: string } | null> {
  // 옵션: discovery 캐시의 lastSeenPort부터 시도 → /actuator/health
  // 옵션: 약속된 포트 범위(52080..) 스캔
  // 옵션: neosql 앱이 publish하는 discovery 파일/엔드포인트 확인 (별도 설계)
  // 모두 실패 시 null
}
```

**2단계 — 미실행 시 GUI 앱 detached launch** (선택적 — PLAN에서 결정):

```typescript
import { spawn } from 'node:child_process';

function launchNeoSql(appPath: string) {
  const proc = spawn(appPath, [], {
    detached: true,
    stdio: 'ignore',  // GUI 앱이라 stdio 무시 — MCP stdio와 자연스럽게 격리
  });
  proc.unref();  // 부모(neosql-mcp)가 종료되어도 앱은 계속 실행
}

// OS별 명령은 다음 형태로도 가능:
// macOS:   spawn('open', ['-a', 'NeoSQL'])
// Windows: spawn('cmd', ['/c', 'start', '', appExe])
// Linux:   spawn(appExe, [], { detached: true, stdio: 'ignore' })
```

**MCP stdio 충돌 위험은 거의 없다** — `detached: true` + `stdio: 'ignore'`이라 자식의 stdout이 neosql-mcp의 stdout에 흘러들지 않는다. Supabase CLI의 docker compose 케이스보다 spawn 책임이 **단순**해진다.

**기억할 것**:
- neosql-mcp 종료 시 Electron 앱은 살아있게 둔다 (`detached: true`, `unref()`).
- 앱이 시작했다고 embedded-server가 ready인 건 아님 — Pattern 4의 헬스체크가 **반드시** 별도로 필요.
- 자동 launch가 적절한지(사용자 의도 모호 상태에서 GUI 앱 띄우기)는 UX 판단 — **에러 + 안내**만 하는 것도 옵션. PLAN에서 결정.

> MCP 서버 자체의 출력 분리(stdout=JSON-RPC, stderr=디버그 로그)는 Pattern 8 참고. 통합 테스트(`docs/testing.md`)에서 반드시 검증.

---

## Pattern 4 — Backoff + 헬스체크 readiness probe

### Supabase CLI 구현

**핵심 파일**: `internal/start/start.go` (PostgreSQL ready 대기 부분)

`supabase start`는 Postgres 컨테이너를 띄운 뒤 다른 서비스(Auth, Realtime 등)가 연결을 시도하기 전에 **Postgres가 실제로 응답하는지** 확인한다:

- `cenkalti/backoff` 패키지로 지수 백오프 재시도
- `pgx`로 실제 SQL 커넥션 시도 — TCP 포트 열림 확인보다 강한 신호
- 타임아웃 후 실패 시 컨테이너 cleanup

`internal/services/`에서 각 서비스 이미지의 `CheckVersions()`로 사전 검증도 수행.

### 핵심 아이디어

- "포트 열림 ≠ 서비스 ready". 실제 프로토콜로 핸드셰이크해야 한다.
- 지수 백오프(처음 100ms → 점차 증가)로 부하 없이 폴링.
- 절대 타임아웃을 둬서 무한 대기 방지.

### neosql-mcp 적용 포인트

**target**: embedded-server는 neosql Electron 앱이 내부적으로 spawn한 자식 프로세스로, 동적 포트(`I_PORT`)에 노출된다. neosql-mcp는 **그 HTTP endpoint**를 폴링한다 — neosql-mcp가 직접 spawn한 무언가가 아니라.

> **포트 발견은 별도 문제** — neosql 앱이 어디에 어떻게 포트를 publish하는지(설정 파일/환경변수/디스커버리 엔드포인트)는 본 문서 범위 밖. PLAN에서 별도 결정.

embedded-server는 Spring Boot 앱이므로 `actuator/health` 엔드포인트가 있다. 가장 단순한 readiness 검사:

```typescript
async function waitForReady(baseUrl: string, opts = { maxMs: 30_000 }) {
  const start = Date.now();
  let delay = 100;
  while (Date.now() - start < opts.maxMs) {
    try {
      const res = await fetch(`${baseUrl}/actuator/health`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'UP') return;
      }
    } catch { /* retry */ }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 2_000);
  }
  throw new Error('embedded-server failed to become ready within 30s');
}
```

또는 백오프 라이브러리(`exponential-backoff`, `p-retry`)를 쓰면 코드가 더 짧아진다.

**주의**: spawn 직후 바로 fetch하면 포트가 아직 안 열려서 `ECONNREFUSED`가 난다 — try/catch로 감싸 정상 흐름으로 처리.

---

## Pattern 5 — Flag > Env > File 설정 우선순위

### Supabase CLI 구현

**핵심 파일**: `cmd/root.go:314-332` (viper init), `internal/utils/access_token.go:35-54`

cobra + viper 표준 설정:
```go
viper.SetEnvPrefix("SUPABASE")  // SUPABASE_PROJECT_REF, SUPABASE_DEBUG ...
viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
viper.AutomaticEnv()
viper.BindPFlags(rootCmd.PersistentFlags())  // flag와 자동 바인딩
```

토큰 같은 민감 값은 우선순위가 명시적으로 짜여 있다 (`access_token.go:35-54` 의 `LoadAccessTokenFS`):

```
1. env SUPABASE_ACCESS_TOKEN
2. CurrentProfile.AccessToken (~/.config/supabase/profile)
3. legacy 파일 (~/.config/supabase/access-token)
4. OS 키체인 (zalando/go-keyring)
```

같은 명명 규칙: env는 `SUPABASE_*`, flag는 `--snake-case` (env에서는 `SUPABASE_SNAKE_CASE`로 매핑).

### 핵심 아이디어

- **flag** = 일회성 오버라이드 (CI/디버그)
- **env** = 환경 일관성 (Docker, CI/CD 환경변수)
- **file** = 영속 사용자 설정
- 셋이 **명시적 우선순위 + 동일한 키 이름**으로 정렬되어야 사용자가 헷갈리지 않는다.

### neosql-mcp 적용 포인트

TypeScript에 cobra/viper 정확한 대응품은 없지만 다음 조합으로 구현 가능:

| 책임 | 대응 도구 |
|------|----------|
| flag 파싱 | [`commander`](https://github.com/tj/commander.js) 또는 [`yargs`](https://github.com/yargs/yargs) |
| env 자동 매핑 | 직접 구현 (간단) |
| 파일 로드 | `JSON.parse(fs.readFileSync(...))` |
| 우선순위 머지 | 직접 구현 |

```typescript
// 단순 구현
function loadConfig(args: string[]): Config {
  const fileConfig = loadFromFile('~/.neosql-mcp/config.json');
  const envConfig = {
    serverUrl: process.env.NEOSQL_MCP_SERVER_URL,
    serverToken: process.env.NEOSQL_MCP_SERVER_TOKEN,
  };
  const flagConfig = parseFlags(args);  // commander.opts() 같은 거

  return {
    ...fileConfig,
    ...stripUndefined(envConfig),
    ...stripUndefined(flagConfig),  // 플래그가 가장 우선
  };
}
```

**키 이름 규약 정하기**:
- env prefix: `NEOSQL_MCP_*` (또는 `NEOSQL_*` — 메인 프로젝트와 공유라면)
- flag: `--server-url`, `--server-token`
- file 키: `serverUrl`, `serverToken` (camelCase)

이 규약은 PLAN에 명시적으로 박아두는 게 좋다. 한 번 결정하면 깨기 어렵다.

---

## Pattern 6 — Profile 시스템으로 다중 환경 분리

### Supabase CLI 구현

**핵심 파일**: `cmd/root.go:101-103`, `internal/utils/profile.go`

`--profile` 글로벌 플래그(기본값 `"supabase"`). 사용자가 여러 Supabase 계정/엔드포인트를 동시에 다룰 때 프로파일을 바꿔가며 사용한다.

`PersistentPreRunE`에서 가장 먼저 `LoadProfile()`을 호출 — workdir 변경보다도 먼저, 토큰 로딩보다도 먼저.

### 핵심 아이디어

- 글로벌 옵션이지만 거의 모든 명령에 영향을 끼침. **lifecycle hook 가장 앞**에 배치.
- "현재 활성 프로파일" 개념을 코드 어디서나 한 군데(`utils.CurrentProfile`)에서 읽음 — 분기 로직 단순화.

### neosql-mcp 적용 포인트

초기 단계엔 **불필요할 가능성** 높음. neosql-mcp는 한 번에 하나의 embedded-server에 붙는 구조이고, MCP 클라이언트별로 프로세스가 따로 뜬다 (stdio 기반). 환경 차이는 MCP 클라이언트 설정에서 분리됨.

**다만** 향후 시나리오 — 한 사용자가 dev/staging/prod 여러 embedded-server를 자주 전환 — 가 떠오르면 그때 도입 검토. **지금 도입하지 말 것** (premature abstraction).

---

## Pattern 7 — 자동 버전 체크 (10시간 캐시)

### Supabase CLI 구현

**핵심 파일**: `cmd/root.go:240-273`, `internal/utils/release.go`

```go
// release.go
func GetLatestRelease(ctx context.Context) (string, error) {
    client := GetGitHubClient(ctx)  // GITHUB_TOKEN 있으면 인증 클라이언트
    release, _, err := client.Repositories.GetLatestRelease(ctx, "supabase", "cli")
    return *release.TagName, err
}

// root.go:240-267 (요지)
func checkUpgrade(ctx, fsys) (string, error) {
    if shouldFetchRelease(fsys) {  // ~/.supabase/cli-latest 의 mtime이 10시간 초과시 true
        version, err := utils.GetLatestRelease(ctx)
        // 결과를 파일에 기록 (오프라인이면 빈 문자열 — 다시 시도 안 하기 위함)
        return version, err
    }
    // 캐시 히트 — 파일에서 읽음
    return readFromCache()
}
```

- 명령 종료 후에 호출 (사용자 흐름 방해 안 함)
- semver 비교로 신버전이면 stderr에 안내
- `--version` 플래그는 캐시 무시하고 강제 fetch

### 핵심 아이디어

- 버전 체크는 **사용자 가치가 낮으면서 네트워크를 쓰는 작업**. 적극적으로 캐시.
- 오프라인 실패도 캐시에 남김 → 매번 같은 실패 반복 안 함 (rate limit / 사용자 경험 보호).
- "끝난 뒤"에 체크 — 시작 지연 안 만듦.

### neosql-mcp 적용 포인트

MCP 서버는 **장기 실행 프로세스**라 명령 단위 lifecycle이 다르다. 적용 옵션:

- **A**: postinstall 단계에서만 체크 (npm 설치 시점)
- **B**: MCP 서버 시작 시 1회 체크 (background, 결과는 다음 시작 시 표시)
- **C**: 도입하지 않음 (사용자가 npm update로 알아서)

→ **권장**: **C**로 시작. 가치 대비 복잡성이 높다. 사용자 피드백이 "버전 알림이 필요하다"고 명시적으로 나오면 그때 B 도입.

---

## Pattern 8 — 사용자 친화적 에러 + 다음 액션 제안

### Supabase CLI 구현

**핵심 파일**: `cmd/root.go:166-202` (`Execute`), `internal/utils/misc.go:39` (`SuggestDebugFlag`), `internal/utils/colors.go`

3가지 도구의 조합:

1. **`utils.CmdSuggestion`**: 전역 string. 명령이 에러로 끝나면 stderr에 추가 표시. 명령 코드에서 `utils.CmdSuggestion = "Run 'supabase login' first"` 같은 식으로 셋팅.
2. **컬러 함수 (lipgloss)**: `utils.Aqua(...)`, `utils.Red(...)`, `utils.Bold(...)` — terminal 자동 감지
3. **`recoverAndExit`** (`root.go:275-312`): `defer`로 panic 잡고 stderr에 메시지 출력. `--debug` 켜져 있으면 스택 트레이스도 출력. 옵션으로 Sentry 보고.

예시 흐름:
```
Error: You need to be logged-in in order to use Management API commands.
Run `supabase login` first.        ← CmdSuggestion (Aqua color)
```

### 핵심 아이디어

- 에러 = "뭐가 잘못됐다" + "다음에 뭘 해야 하나" 두 정보. 둘 다 줘야 사용자가 막히지 않는다.
- panic도 사용자 친화 메시지로 변환. 스택 트레이스는 `--debug` 시에만.
- 컬러는 readability에 큰 차이를 만든다 (지원 안 되는 환경엔 자동 폴백).

### neosql-mcp 적용 포인트

**MCP 도구 응답에서의 에러**:

MCP 프로토콜은 도구 응답에 `isError: true`를 두는 표준이 있다. 메시지에 다음 액션을 포함:

```typescript
return {
  content: [{ type: 'text', text:
    `embedded-server에 연결할 수 없습니다.\n` +
    `다음을 확인하세요:\n` +
    `  - neosql Electron 앱이 설치되어 있나요? (neosql 웹사이트에서 다운로드)\n` +
    `  - neosql 앱이 실행 중인가요?\n` +
    `  - 환경변수 NEOSQL_MCP_SERVER_URL (override 시)\n` +
    `  - 로그: ${LOG_PATH}`
  }],
  isError: true,
};
```

**stderr 로그에서의 에러**:
```typescript
import chalk from 'chalk';
console.error(chalk.red(`[neosql-mcp] ${err.message}`));
console.error(chalk.gray(`Hint: ${suggestion}`));
```

**panic 대응**:
```typescript
process.on('uncaughtException', (err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  if (process.env.NEOSQL_MCP_DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
```

(MCP 클라이언트는 stdout만 보므로 stderr 출력은 안전.)

---

## 즉시 적용 가능한 Top 5 (PLAN 반영 후보)

아키텍처 전제(neosql Electron 앱이 embedded-server를 호스팅) 반영 후 재정렬한 우선순위:

1. **Pattern 4 — backoff + 헬스체크 readiness probe** ★ 최우선  
   외부 앱(Electron 안의 embedded-server)의 ready 신호가 우리 유일한 의존 시그널. `actuator/health` 폴링은 거의 공짜로 도입 가능.

2. **Pattern 3 — 앱 발견 + (필요시) detached launch**  
   JAR을 직접 spawn하지 않으므로 spawn 책임은 가벼워졌지만 진입점 자체는 여전히 핵심. 발견 로직 + 자동 launch UX 결정 필요.

3. **Pattern 8 — 에러 + 다음 액션 제안**  
   초기 셋업에서 막힐 가능성이 높음(앱 미설치, 미실행, 포트 못 찾음 등). 좋은 에러 메시지가 첫 인상.

4. **Pattern 5 — flag/env/file 설정 우선순위**  
   키 이름 규약을 일찍 박아두면 나중에 바꾸기 어렵다. **PLAN에 키 명세 한 페이지**.

5. **Pattern 1의 "감지·안내" 부분만**  
   neosql 앱 설치 위치 검사 + 미설치 시 다운로드 URL 안내. 다운로드 자동화는 안 함(neosql-mcp 책임 밖).

## 의도적으로 빌리지 않을 패턴

명시적 배제(YAGNI / 아키텍처 mismatch):

- **Pattern 1의 postinstall 바이너리 다운로드 자동화**: neosql-mcp는 pure TypeScript 모듈이라 다운로드할 외부 페이로드 없음. neosql Electron 앱은 사용자가 별도로 설치(neosql-mcp 책임 밖). Pattern 1의 "감지·안내" 부분만 차용.
- **Pattern 2의 JAR 캐싱**: JAR은 Electron 앱 내부에 번들되어 있어 neosql-mcp가 다룰 일이 없음. 작은 discovery 캐시(`~/.neosql-mcp/`)는 별개 가치로 유지.
- **Pattern 6 — Profile 시스템**: 현 구조엔 불필요. 시그널 보고 추후 도입.
- **Pattern 7 — 자동 버전 체크**: 가치 대비 복잡성 큼. 사용자 요구 나오면 그때.
- **`spf13/cobra` 수준의 명령 트리**: neosql-mcp는 MCP 서버 1개 + 옵션 몇 개. cobra/commander의 풀 스택은 과잉.
- **Sentry / PostHog 텔레메트리**: 개인용/소규모 단계에선 불필요. **정 필요하면 stderr 로그가 먼저**.

## 다음 단계

이 문서의 내용을 PLAN.md / CHECKLIST.md에 어떻게 녹일지는 **별도 세션에서** 사용자와 함께 합의 후 진행한다 (CLAUDE.md의 "구현 착수 전 test list 제시 → 사람 리뷰" 워크플로 따름).

본 문서는 **참조 자료**이지 액션 아이템이 아니다.
