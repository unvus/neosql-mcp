# spawn 기반 통합 테스트

CLI·MCP 서버처럼 **프로세스 단위로 배포되는 코드**를 테스트할 때 쓰는 기법.
이 문서는 HTTP/Spring 위주 경험을 가진 개발자를 대상으로 "spawn이 뭐고, 왜 테스트에서 쓰며, 어떻게 동작하는가"를 정리한다.

## 한 줄 요약

> **spawn = "프로세스를 새로 낳는다".** 테스트 코드가 부모 프로세스가 되어, 빌드된 CLI를 자식 프로세스로 실행하고 stdin/stdout으로 대화한다. **사용자가 커맨드 라인에서 실행하는 것과 동일한 경로**로 내 코드를 돌려보는 방식.

## 1. 사전적 의미부터

영어 `spawn`의 원래 뜻:
- (동사) 알을 낳다, 새끼를 치다. 물고기·개구리가 한꺼번에 많은 알을 낳는 행동.
- (비유) 발생시키다, 새로 생겨나게 하다.

프로그래밍 용어로 옮기면 **"프로세스가 새 프로세스를 낳는다"** — 부모 프로세스가 자식 프로세스를 생성한다는 뜻. 유닉스 전통의 `fork + exec` 조합을 한 단어로 부르는 이름이다. 한 생명체가 새끼를 낳는 비유를 소프트웨어에 가져온 것.

## 2. 부모/자식 프로세스 개념

OS 관점에서 **프로세스**는 실행 중인 프로그램 하나:
- 자기만의 메모리 공간
- 자기만의 파일 디스크립터 (열린 파일·소켓)
- 자기만의 표준 입출력: **stdin**, **stdout**, **stderr**
- OS가 부여한 고유 ID (**pid**)

한 프로세스가 다른 프로세스를 실행시키면 OS는 둘을 **부모–자식 관계**로 연결한다. 예:

- 터미널(셸)이 부모, `ls` 명령이 자식
- Node 테스트 러너가 부모, `dist/cli.js`가 자식

자식은 부모와 **독립된 메모리**를 가진다. 함수 호출처럼 같은 메모리를 공유하지 않는다 — 완전히 다른 실행 컨텍스트라는 점이 핵심.

## 3. 왜 함수 호출이 아니라 프로세스로 띄우는가 — Spring에 빗대어

Spring 개발자에게 익숙한 대비:

| 층위 | Spring | Node CLI |
|------|--------|---------|
| 소스 함수 호출 | 순수 JUnit 단위 테스트 | `import { ping } from './ping.ts'` 직접 호출 |
| 애플리케이션 컨텍스트 in-process | `@SpringBootTest` | `InMemoryTransport`로 server↔client 연결 |
| **실제 배포된 바이너리를 OS가 실행** | `java -jar app.jar` 을 새 JVM으로 돌려 확인 | `node dist/cli.js`를 자식 프로세스로 spawn |
| 외부 시스템 포함 e2e | 실제 DB·외부 API | 실제 neosql Desktop |

Spring에서 `@SpringBootTest`는 편리하지만 **같은 JVM** 안에서 돌아간다. 진짜 배포는 별도 JVM 프로세스 — 환경변수, 워킹 디렉토리, 클래스패스, CLI 인자 해석 같은 층은 테스트 환경과 다를 수 있다. 그 공백을 메우는 것이 "배포된 jar를 별도 JVM으로 실행해서 확인" 단계다.

Node CLI도 똑같다. `dist/cli.js`를 **진짜 `node`가 실행**할 때만 드러나는 층이 있다:

- **shebang** (`#!/usr/bin/env node`) 누락 → 직접 실행 불가
- `package.json`의 `bin` 필드 오타 → `npx neosql-mcp` 가 연결 안 됨
- 번들링 설정 오류 → ESM import 실패
- 실행 권한(`chmod +x`) 누락
- stdout 버퍼링 타이밍 문제

이 층을 덮는 것이 spawn 기반 통합 테스트의 역할.

## 4. Node에서 spawn 하는 법

Node 표준 라이브러리 `node:child_process`:

```ts
import { spawn } from 'node:child_process';

const child = spawn('node', ['dist/cli.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr 를 파이프로 붙잡음
});

child.stdin.write('{"jsonrpc":"2.0","method":"ping","id":1}\n');
child.stdout.on('data', (chunk) => console.log(String(chunk)));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('exit', (code) => console.log('exited', code));
```

핵심:
- `spawn('node', ['dist/cli.js'])` = 셸에서 `node dist/cli.js` 치는 것과 같다.
- `stdio` 옵션으로 자식의 stdin/stdout/stderr 를 **파이프**(OS가 제공하는 단방향 메시지 통로)로 부모에 연결.
- 부모는 stdin에 쓰고 stdout을 읽는다 — 자식은 반대.

HTTP에 비유:
- stdin ≈ 서버가 읽는 request 스트림
- stdout ≈ 서버가 쓰는 response 스트림
- 다만 **연결은 프로세스가 살아있는 동안 유지되는 장기 채널** (keep-alive의 극단 버전).

## 5. MCP stdio 테스트에서의 구체적 흐름

`src/cli.spawn.test.ts`에서 일어나는 일:

```
[테스트 코드 = 부모]
   │ spawn('node', ['dist/cli.js'])
   ▼
[dist/cli.js = 자식]
   ◀── stdin  : MCP initialize JSON-RPC
   ──▶ stdout : InitializeResult
   ◀── stdin  : tools/call name=ping
   ──▶ stdout : {"result":{"content":[{"type":"text","text":"pong"}]}}
   │
[부모: 응답 파싱 → expect "pong"]
```

MCP SDK의 `StdioClientTransport`가 **spawn + 파이프 연결 + JSON-RPC 파싱**을 한 번에 처리한다:

```ts
const transport = new StdioClientTransport({
  command: 'node',
  args: [CLI_PATH],
});
const client = new Client({ name: 'test', version: '0.0.0' });
await client.connect(transport);
const result = await client.callTool({ name: 'ping', arguments: {} });
```

겉보기는 간단하지만 내부에선:

1. OS가 새 프로세스 생성 → `dist/cli.js` 실행
2. shebang이 `node`를 찾아 해석
3. ESM 로더가 모듈 그래프 해석
4. `StdioServerTransport`가 stdin/stdout을 MCP 메시지 채널로 사용
5. 테스트 종료 시 부모가 transport close → 자식이 stdin EOF 감지 → graceful shutdown

이 **전체 경로**가 정상인지 확인하는 것이 spawn 통합 테스트.

## 6. Unit(InMemory) vs Integration(spawn) — 선택 기준

| 상황 | 권장 |
|------|------|
| 순수 함수·로직 | unit (직접 import) |
| 프로토콜 레벨 (request → response 구조) | unit with InMemoryTransport |
| 모듈 간 와이어링 | unit with real deps, I/O만 mock |
| **빌드 산출물·bin·shebang·OS 실행 경로** | **spawn integration** |
| 실제 외부 시스템 (DB, 외부 API, neosql Desktop) | e2e (수동 / 별도 CI) |

기본 원칙:
- **빠르게 많이 돌리고 싶으면 unit.** (수 ms 단위)
- **사용자 실제 사용 경로를 보장하고 싶으면 spawn.** (수십~수백 ms)
- **둘은 상호 보완적.** unit이 충분해도 spawn 하나는 꼭 둬서 배포 경로 커버.

이 프로젝트 기준 속도:
- `src/server.test.ts` (InMemory) — 테스트 2건 ~10 ms
- `src/cli.spawn.test.ts` (spawn) — 테스트 1건 ~140 ms

## 7. 실전 주의점

- **리소스 누수 금지**: 테스트 종료 시 자식 프로세스를 반드시 close/kill. 누수되면 **좀비 프로세스**가 남아 다음 실행 때 포트 충돌·핸들 부족 등 유발.
- **타임아웃 상한**: 자식이 hang 걸리면 테스트도 같이 멈춤. Vitest의 `testTimeout` 으로 상한 필수 (이 프로젝트 15초).
- **stdout vs stderr 역할 구분**: MCP에서 stdout = 프로토콜 채널, stderr = 로그. 자식의 stderr를 부모 테스트가 프로토콜 파서로 읽어버리면 망가짐 → SDK의 StdioClientTransport가 분리해서 처리.
- **빌드 선행 의무**: integration 테스트는 `dist/` 실행 → `npm run build`가 전제. `test:integration` script가 이를 포함한다.
- **OS 차이**: Windows에서는 shebang이 직접 동작 안 함 → `spawn('node', [CLI_PATH])` 처럼 명시적으로 `node`를 호출하는 패턴이 이식성 면에서 안전.

## 참고

- Node.js `child_process`: https://nodejs.org/api/child_process.html
- MCP `StdioClientTransport` (v1): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md
- 이 리포에서의 사용: `src/cli.spawn.test.ts`
- 테스트 운영 매뉴얼 (계층·워크플로): `docs/testing.md`
