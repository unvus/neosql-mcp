# Supabase CLI 참조 자료

`neosql-mcp`(npx로 배포되는 TypeScript 모듈, embedded-server JAR을 spawn하는 중계자)를 만들면서 **Supabase CLI**의 아키텍처·배포·실행 패턴을 참고하기 위한 자료집.

원본 소스: `../cli` (sibling clone, `~/workspace/cli`) / 업스트림: <https://github.com/supabase/cli>

## 이 디렉토리의 목적

조언받은 포인트 — *"Supabase CLI에는 필요시 app을 실행/다운로드/설치하는 기능이 있고, OSS이니 참고하면 좋겠다"* — 를 출발점으로 삼아, **neosql-mcp 개발 시 참조할 만한 패턴**을 정리한다. Supabase CLI는 **Go**로 작성되어 있어 코드를 직접 가져다 쓸 수는 없고, "어떤 책임을 어떻게 분리했는가"라는 **설계 패턴 수준**에서 빌려온다.

## 문서 구성

| 문서 | 역할 | 누가 읽나 |
|------|------|----------|
| [00-supabase-overview.md](00-supabase-overview.md) | Supabase 자체에 대한 짧은 배경 (BaaS, 컴포넌트) | Supabase 처음 듣는 사람 |
| [01-cli-overview.md](01-cli-overview.md) | Supabase CLI가 무엇을 하고 어떻게 구조화되어 있는가 | 02를 읽기 전 맥락 |
| [02-patterns-for-neosql-mcp.md](02-patterns-for-neosql-mcp.md) ★ | **load-bearing**: neosql-mcp에 빌려올 패턴들 + 적용 포인트 | 실제 구현 단계에서 참조 |

★ = 핵심 문서. 00·01은 짧고 포괄적, 02는 구체적이고 실행 가능한 단위.

## 참고 원칙

- Supabase CLI는 Go이고 neosql-mcp는 TypeScript. **코드가 아니라 설계만 빌린다.**
- 02 문서는 각 패턴마다 "**neosql-mcp 적용 포인트**" 섹션을 포함하고, 우리 사용 케이스에 직접 매핑되지 않는 패턴은 의도적으로 배제한다.
- 원본 코드 경로(`file:line`)는 추적 가능성을 위해 인용하되, 코드 자체를 길게 옮겨오지 않는다.
- 보다 깊이 봐야 할 일이 생기면 `../cli`를 직접 읽는다 (이 문서에 모든 디테일을 담지 않는다).

## 관련 문서

- 상위 `~/workspace/mcp/CLAUDE.md` — neosql-mcp 전체 방향성·개발 지침
- `~/workspace/mcp/PLAN.md` — 단계별 구현 계획
- `~/workspace/mcp/docs/spawn.md` — spawn 개념 입문 (교육용, 본 디렉토리와 상호 보완)
- `~/workspace/mcp/docs/testing.md` — TDD 워크플로

작성일: 2026-04-27
