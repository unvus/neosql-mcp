# 테스트 운영 매뉴얼

이 프로젝트의 TDD·테스트 전략. 사람과 coding agent가 **같은 방식**으로 테스트를 쓰고 실행한다.

## 원칙

1. **테스트는 사람과 에이전트의 계약서.** 사람이 구현 라인을 전부 읽지 않아도, 테스트만 읽어서 의도대로 구현됐는지 검증할 수 있어야 한다.
2. **red → green → refactor.** 모든 새 동작은 실패하는 테스트부터 시작한다.
3. **속도는 비용이 아니라 신뢰다.** 단위 테스트는 수 초 내에 끝나야 한다. 느려지면 layer를 나눈다.
4. **사람도 에이전트도 같은 명령으로 실행.** 진입점은 `npm test`.
5. **경계가 있는 곳에서 mock.** 파일·HTTP·프로세스 같은 외부 I/O는 명시적으로 분리한다.

## 실행 방법

```bash
npm test                  # 전체 (단위 + 통합, 통합은 빌드 선행)
npm run test:watch        # 변경 감지 자동 재실행 (단위 포함, 가장 자주 쓰는 루프)
npm run test:unit         # 단위만 (InMemory 기반, 초 이하)
npm run test:integration  # 빌드 + spawn 기반 통합만
npm run typecheck         # tsc --noEmit (테스트와 별도 정적 검증)
```

특정 파일/이름만:

```bash
npx vitest run src/server.test.ts          # 특정 파일
npx vitest run -t "ping"                   # 이름에 "ping" 포함되는 테스트
```

## 계층 구분

| 계층 | 정의 | 예시 | 속도 |
|------|------|------|------|
| **unit** | 프로세스 내부, 외부 I/O는 mock 또는 in-process 대체 | `InMemoryTransport`로 server ↔ client 연결 | 수 ms |
| **integration** | 빌드 산출물을 자식 프로세스로 실행 | `dist/cli.js`를 `spawn`, stdio로 통신 | 수십~수백 ms |
| **e2e** | 실제 외부 시스템까지 포함 | 실제 neosql Desktop에 붙여 호출 (절차: `docs/e2e-manual.md`) | 초 단위, 수동 실행 |

spawn 기반 통합 테스트의 개념적 설명은 `docs/spawn.md`.

파일 규칙:
- **단위**: `src/**/*.test.ts` (단, `*.spawn.test.ts` 제외)
- **통합 (spawn)**: `src/**/*.spawn.test.ts`
- **e2e**: 현재는 수동. 필요 시 별도 디렉토리(`e2e/`)로 분리.

## 언제 mock, 언제 실제 I/O

- 파일 시스템 / 자식 프로세스 / HTTP = 경계 외부 → **mock** 또는 in-process 대체 (unit)
- **빌드된 CLI 실행** = 사용자 실제 경로 검증 → **spawn** (integration)
- **실제 neosql Desktop·실제 DB** = 수동 smoke (e2e)

## 테스트 이름 규칙

- `should`는 지양, 동작을 그대로 서술한다.
  - 지양: `it('should return pong')`
  - 권장: `it('returns "pong" when the ping tool is called')`
- 테스트 이름 모음이 "이 모듈이 약속하는 동작 목록"으로 읽혀야 한다.

## 새 기능 추가 워크플로 (Phase 1부터 적용)

1. **에이전트가 test list 제시** — 구현 착수 전.
   예시:
   ```
   portResolver 테스트 후보:
   - 정상 파일 → port 반환
   - 파일 없음 → PortFileNotFound
   - pid dead → PortFileStale
   - port not listening → PortFileStale
   - 스키마 불일치 → PortFileInvalid
   ```
2. **사람이 리뷰.** 추가·삭제·수정 요청. 합의가 되어야 다음 단계.
3. **에이전트: 실패 테스트 작성 → 실행 → red 확인.**
4. **에이전트: 구현 → 실행 → green 확인.**
5. **사람이 로컬에서 `npm test` 재실행** (필요 시 diff/PR 리뷰).
6. 다음 test list로 이동.

**2번(test list 리뷰)이 가장 중요한 트러스트 포인트.** 테스트가 틀리면 구현도 같은 방향으로 틀리고, 둘 다 통과한 채 끝나버린다. 여기서 시간을 쓰는 것이 가장 가성비 높은 방어선.

## Java/Spring 경험자용 1:1 매핑

| Spring / Gradle | 이 프로젝트 |
|-----------------|-------------|
| `@Test` / JUnit `@DisplayName` | Vitest `describe` / `it` |
| `./gradlew test` | `npm test` |
| `@MockBean` | `vi.mock()` / `InMemoryTransport` (in-process 대체) |
| `@SpringBootTest` | spawn 기반 통합 테스트 (`*.spawn.test.ts`) |
| Arrange-Act-Assert | 그대로 (비공식 관례) |

새로 익혀야 할 두 가지만:
- **"에이전트와 test list 합의"** 단계.
- **"사람은 테스트를 읽어 의도를 검증한다"** 라는 계약 관계.

## 참고

- spawn 기반 통합 테스트 개념: `docs/spawn.md`
- Vitest 문서: https://vitest.dev/
- MCP SDK 테스트 패턴: `InMemoryTransport.createLinkedPair()` — `node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.d.ts`
