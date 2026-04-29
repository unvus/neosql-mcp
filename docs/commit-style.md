# Commit Style

`neosql-mcp` 의 commit 메시지 규칙. [Conventional Commits](https://www.conventionalcommits.org/) 의 단순화된 부분집합.

## 형식

```
<type>[(<scope>)]: <subject>

[body — "왜(why)" 가 비자명할 때만]
```

- `<type>`: 아래 6개 중 하나.
- `<scope>` (선택): 영향 범위. `cli`, `mcp`, `upstream`, `infra`, `plan`, `docs` 등.
- `<subject>`: 한글/영문 무관, 명령형/명사형. 50–72자 이내.
- `<body>`: 선택. `무엇(what)` 은 diff 가 보여주므로 생략. `왜(why)` 가 자명하지 않을 때만 작성.

## Type 6종

| type | 용도 | 예시 |
|---|---|---|
| `feat` | 새 기능 | `feat: ping tool 추가` |
| `fix` | 버그 수정 | `fix(cli): --dev 플래그 우선순위 보정` |
| `refactor` | 동작 변경 없는 구조 개선 | `refactor: src/ 4분할 + tests/ 분리` |
| `test` | 테스트만 추가/수정 | `test(upstream): health-check stale_socket 케이스 추가` |
| `docs` | 문서만 수정 (코드 변경 없음) | `docs: project-structure.md 추가` |
| `chore` | 빌드/설정/의존성/잡일 | `chore: tsup entry 경로 갱신` |

판별 기준이 모호하면:
- 코드와 문서가 같이 바뀌면 코드의 성격(`feat`/`fix`/`refactor`)으로 분류.
- 빌드 설정만 바뀌면 `chore`.

## 핵심 규칙

1. **한 commit = 한 논리적 변경**. 무관한 변경은 분리.
2. **제목은 명령형/명사형**. "추가했음" / "added" 가 아니라 "추가" / "add".
3. **마침표 없음**. 제목 끝에 `.` 안 붙임.
4. **body 는 선택**. `왜` 가 비자명할 때만 작성하고, 빈 줄 1개 띄우고 시작.
5. **소문자 type**. `Feat:` 가 아니라 `feat:`.

## 예시

좋은 예:
```
refactor: src/ 구조 cli/mcp/upstream/infra 4분할

평면 배치된 12 파일을 4개 경계로 분리. Phase 2 의 http-client/SSE 파서가
upstream/ 으로 자연스럽게 들어갈 자리 확보.
```

```
feat(upstream): Phase 1 endpoint-resolver / health-check / cli-args
```

```
docs: 미사용 문서 삭제
```

피해야 할 예:
```
phase1 작성              ← type 없음, 무엇을 추가했는지 모호
WIP                      ← 의미 없음
fix bug                  ← 어떤 버그인지 불명
업데이트                 ← 무엇을?
```

## 참고

- 풀세트 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) 도 호환됨 (이 문서는 그 단순 부분집합).
- 추후 changelog 자동화·semver 자동 bump 도입 시 그대로 활용 가능.
