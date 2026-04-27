# 00. Supabase 개괄

> 본 문서는 Supabase **CLI** 패턴을 빌려오기 전에 필요한 최소한의 배경 지식만 정리한다. neosql-mcp는 Supabase 그 자체와는 직접적 관련이 없으므로, 깊이 들어갈 필요는 없다.

## Supabase가 뭔가 — 한 줄 요약

> **Supabase = "오픈소스 Firebase 대안" — PostgreSQL을 코어로, 인증·스토리지·실시간 구독·서버리스 함수 같은 BaaS(Backend-as-a-Service) 기능을 한데 묶어 제공하는 플랫폼.**

- "BaaS" = Backend-as-a-Service. 모바일/웹 앱이 백엔드 코드를 직접 짜지 않고도 인증/DB/스토리지를 쓸 수 있게 해주는 SaaS 카테고리. Firebase, AWS Amplify 등이 동종.
- Supabase의 차별점:
  - **Postgres가 코어**(NoSQL 기반인 Firebase와 가장 큰 차이)
  - **오픈소스** — 자체 호스팅 가능
  - 각 기능이 **독립된 OSS 프로젝트들의 조합**으로 구성되어 있어, 일부만 따로 쓸 수도 있음

## 핵심 컴포넌트 (CLI를 이해할 때 알아야 할 것)

| 컴포넌트 | 역할 | 기반 기술 |
|---------|------|----------|
| **PostgreSQL** | 데이터베이스. 모든 기능의 단일 소스 오브 트루스 | Postgres (확장 다수: pgvector, pg_cron 등) |
| **PostgREST** | Postgres 스키마를 자동으로 REST API로 노출 | Haskell |
| **GoTrue / Auth** | 사용자 인증 (JWT, OAuth, magic link, OTP) | Go |
| **Realtime** | DB 변경을 WebSocket으로 구독 (Postgres logical replication 활용) | Elixir |
| **Storage** | 파일 업로드/다운로드 + S3 호환 | Node.js |
| **Edge Functions** | 서버리스 함수 (Cloudflare Workers 비슷) | Deno 런타임 |
| **Studio** | 웹 대시보드 (Postgres 관리 + 위 컴포넌트 통합 UI) | Next.js |
| **Kong** | 위 컴포넌트들 앞에 두는 API 게이트웨이 | Kong (OpenResty) |

## 두 가지 사용 경로

1. **매니지드 클라우드**: `supabase.com`에서 프로젝트 생성. 위 컴포넌트들이 자동 프로비저닝됨.
2. **로컬/셀프 호스트**: 위 컴포넌트들을 **Docker 컨테이너로 묶어서** 자기 머신에서 실행. ← **CLI의 `supabase start`가 이걸 해준다.**

CLI 패턴을 빌릴 때 우리에게 의미 있는 건 두 번째다 — "여러 컴포넌트를 spawn하고, 헬스체크하고, 끄는" 라이프사이클 매니지먼트 노하우.

## neosql-mcp와의 관계

**직접적 관련 없음.** Supabase 자체는 neosql-mcp의 설계와 무관하다. 다만 다음 측면에서 CLI 구현 패턴이 비슷한 문제를 풀고 있어 참고 가치가 있다:

| 문제 | Supabase CLI | neosql-mcp |
|------|-------------|-----------|
| 사용자 머신에서 외부 프로세스 실행 | docker compose로 컨테이너 일괄 기동 | neosql Electron 앱 실행 (Electron 내부에서 embedded-server JAR을 자동 spawn — neosql-mcp가 JAR을 직접 띄우지 않음) |
| 외부 의존 앱 설치 | Deno 바이너리·Docker 이미지를 CLI가 직접 다운로드/캐싱 | neosql Electron 앱은 사용자가 neosql 웹사이트에서 직접 다운로드. neosql-mcp는 설치 감지·안내만 담당 |
| `npx`/`npm` 경로로 배포 | `npm i supabase --save-dev` (Go 바이너리를 npm으로 배포!) | `npx neosql-mcp` |
| 사용자별 설정 파일 | `~/.supabase/`, 프로젝트 `supabase/config.toml` | `~/.neosql-mcp/`, 프로젝트별 설정 |

위 매핑이 실제로 어떻게 옮겨지는지는 [02-patterns-for-neosql-mcp.md](02-patterns-for-neosql-mcp.md) 참조.

## 참고 링크

- 공식 문서: <https://supabase.com/docs>
- 핵심 컴포넌트 OSS 리포: <https://github.com/supabase/supabase> (모노레포)
- CLI 리포: <https://github.com/supabase/cli> ← **본 디렉토리의 분석 대상**
