# /refresh — Orca 안의 절차 (2·5·6단계 대신)

`ORCA`는 환경 변수 `ORCA_CLI_COMMAND`의 값(실행 파일)이다. 명령이 실패하면 오류를 그대로 보고하고 멈춘다. 다른 실행 파일로 바꾸지 않는다. 명령의 자세한 규칙은 `orca-cli` 스킬을 읽는다 (`ORCA skills get orca-cli`). 대상은 `--json`으로 읽는다.

## 2단계: 연결된 세션 확인

1. 이 세션의 작업 공간을 본다: `ORCA worktree show --worktree current --json`. `result.worktree.childWorktreeIds`가 이 세션이 연 자식 작업 공간이다. `current`는 Orca 작업 공간 안에서만 풀린다. 밖이면 `--worktree path:<저장소 경로>`를 쓴다.
2. 자식마다 상태를 읽는다: `ORCA worktree ps --since 7d --json`의 `agents[].state`, 또는 `ORCA agent list --json`의 `state`와 `lastAssistantMessage`.
3. 끝난 자식의 결과를 읽는다: `ORCA agent read <orcaSessionId> --json`. 끝난 에이전트도 읽힌다.
4. `state`가 `blocked`(승인 필요)나 `waiting`(질문함)인 에이전트는 7단계의 `알림:` 줄로 보고한다. 사용자가 그 작업 공간에서 답해야 한다.

## 5단계: 독립된 일을 하위 세션으로 연다

- 개수: 전역 CLAUDE.md의 규칙을 따른다 (기본 3개). 열기 전에 `ORCA agent list --json`에서 일하는 에이전트를 센다.
- 파일을 고치는 일: 새 작업 공간(새 체크아웃)으로 연다. 같은 파일을 두 세션이 고치지 않는다.

  ```text
  ORCA worktree create --project <프로젝트 이름 또는 id> --name "<이름>" --parent-worktree current --agent claude --model <모델 id> --effort <수준> --prompt "<브리프>" --json
  ```

  - `--project`는 PC마다 경로가 달라도 같은 명령으로 돈다. 프로젝트 id는 git 원격 주소에서 나온다 (예: `github:dawnilove/claude-config`). `ORCA project list --json`으로 이름과 id를 찾는다.
  - 저장소가 Orca 프로젝트로 등록되어 있어야 한다. 없으면 사용자에게 묻고 `ORCA repo add --path <경로> --json`으로 등록한다. 등록이 없는 PC에서 프로젝트만 있으면 `ORCA project setup-clone`으로 받는다.
  - 새 작업 공간은 `~/orca/workspaces/<저장소>/<이름>`에 생기고 브랜치는 `<계정>/<이름>`이다. 결과의 `result.worktree.path`와 `branch`를 보고에 쓴다.
  - 에이전트는 사용자의 Chat | CLI 설정대로 열린다 (2026-11-22 시험: chat).

- 읽기만 하는 일(조사, 검토): 지금 작업 공간에 에이전트만 연다.

  ```text
  ORCA agent launch --agent claude --worktree current --model <모델 id> --effort <수준> --prompt "<브리프>" --json
  ```

- `--model`을 생략하면 에이전트의 기본값이다. 정할 때는 이 세션의 모델과 같거나 낮은 것만 쓴다. `--effort`는 `--model`과 같이 쓴다.
- 브리프에 쓸 것: 한국어로 답하라는 말, 할 일, 건드릴 파일과 영역, 완료 기준, 결과를 어디에 남길지 (파일 또는 마지막 답).
- 자식 세션은 새 브랜치에서 일한다. 그 결과는 이 체크아웃에 없다. 병합은 사용자의 승인을 받은 뒤에 한다. 보고에 작업 공간 이름과 브랜치를 쓴다.
- 자식이 끝나기를 반복 조회하며 기다리지 않는다. 연 뒤에 3단계와 이 세션의 일을 계속한다. 끝은 다음 `/refresh`에서 읽는다. 끝날 때까지 기다려야 하면 `orchestration` 스킬을 쓴다.

## 6단계: 쓰지 않는 세션 정리

Orca의 CLI에는 보관(archive) 명령이 없다. 대상은 같다: 끝났고 결과를 확인한 세션. 사용자를 기다리는 세션과 일하는 세션은 건드리지 않는다.

1. 카드 상태를 완료로 바꾼다. 결과를 한 줄 적는다.

   ```text
   ORCA worktree set --worktree <선택자> --workspace-status completed --comment "<한 줄 결과>" --json
   ```

2. 닫기(`ORCA terminal close ...`)와 삭제(`ORCA worktree rm ...`)는 먼저 사용자에게 묻는다. 삭제는 되돌릴 수 없다.
3. 잠재우기(Sleep)와 보관은 Orca 화면의 기능이다. 보고에 "X를 잠재우거나 보관하세요"라고 쓴다.

## 보고에 더할 것

- 연 세션 줄에 작업 공간 이름과 브랜치를 쓴다.
- 정리한 세션 줄에 "카드를 완료로 바꿈"이라고 쓴다.
