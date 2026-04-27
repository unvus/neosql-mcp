# Claude Code 사용 가이드

이 디렉토리는 **Claude Code CLI 자체를 잘 사용하기 위한 일반 문서**입니다.
현재 프로젝트(neosql-mcp 등)와는 독립적이며, 다른 작업 디렉토리에서도 그대로 통용됩니다.

## 문서 목록

| 문서 | 내용 |
|------|------|
| [modes.md](modes.md) | Shift+Tab으로 토글하는 3가지 모드 (Normal / Auto-accept / Plan) |
| [slash-commands.md](slash-commands.md) | 자주 쓰는 슬래시 명령어 레퍼런스 |
| [workflow.md](workflow.md) | 기존 IDE 사용자가 coding agent로 전환할 때의 멘탈 모델·작업 흐름 |

## 처음 쓰는 분이라면 읽는 순서

1. **[workflow.md](workflow.md)** — 멘탈 모델부터 잡기
2. **[modes.md](modes.md)** — Plan mode를 알아야 큰 작업이 안전해짐
3. **[slash-commands.md](slash-commands.md)** — 쓰면서 필요할 때마다 참고

## 핵심 한 줄 요약

> Claude Code는 "내가 코드를 친다"가 아니라 **"에이전트에게 작업을 지시하고 diff를 검토한다"**가 기본 자세입니다.
> 작업이 클수록 Plan mode → 검토 → 승인 → 실행 순서를, 작은 변경은 곧장 지시하는 식으로 분리하면 사고를 줄일 수 있습니다.
