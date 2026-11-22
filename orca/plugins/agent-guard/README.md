# Guard

Orca에서 도는 에이전트의 도구 호출을 실행 전에 보고 막는다 (`agent.tool.before` 훅). session-board의 edit-guard와 secret-guard를 옮긴 것이다.

- 막는 것: `sed -i`, heredoc으로 파일 쓰기, python·PowerShell 문자열 치환 후 덮어쓰기 (edit-guard). `.env`·`.credentials.json`·개인 키 읽기 (secret-guard).
- 막지 않는 것: `rm -rf`, `git reset --hard` 같은 삭제·git 명령. 그 확인은 Claude의 `permissions.ask` 규칙이 맡는다.
- **켜기·끄기:** Orca의 Settings > Plugins > Guard에서 두 가드를 따로 켜고 끈다 (둘 다 기본 켬). 설정을 못 읽으면 켜진 채로 둔다. 플러그인 전체는 Settings > Plugins에서 끄거나 `orca plugin disable local.agent-guard`.
- **겹침:** 이 PC의 Claude에는 session-board 플러그인이 이미 같은 가드를 건다 (`CLAUDE_CODE_PLUGIN_DIRS`). 둘 다 켜면 같은 사유로 두 번 막는다. session-board가 로드되지 않는 곳에서만 이 플러그인이 필요하다.
- Claude Code는 훅의 답을 기다려서 거부가 듣는다. 다른 에이전트(Codex 등)는 호출을 알리기만 해서 거부가 무시된다.
- 문서에는 "Orca 터미널의 에이전트"라고 적혀 있다. chat UI에서 훅이 도는지는 설치한 뒤 `orca plugin logs local.agent-guard`로 확인한다.
- 규칙은 `claude/plugins/session-board/hooks/guard.ts`·`secrets.ts`의 복사본이다 (`src/edit-rules.ts`, `src/secret-rules.ts`). 규칙을 고치면 두 곳을 같이 고친다.

## 시험과 설치

```sh
orca plugin test .
orca plugin validate .
orca plugin dev load .     # 이 폴더를 Orca에 올린다. 코드를 도는 플러그인이라 --approve <지문>이 필요하다
```
