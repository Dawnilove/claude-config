<img src="docs/banner.svg" alt="claude-config 배너: Claude Code 작업 흐름 5단계와 알림 훅이 끼어드는 자리" width="100%">

# claude-config

AI 코딩 에이전트 개인 설정 묶음. 다른 컴퓨터에 같은 환경을 만든다. 에이전트마다 맞춘 폴더가 따로 있다: `claude/`(Claude Code), `codex/`(Codex), `antigravity/`(Antigravity IDE·`agy` CLI), `orca/`(Orca 플러그인). Codex와 Antigravity 설치는 [8절](#8-codex와-antigravity에-설치한다), Orca는 [9절](#9-orca에-설치한다)에 있다.

사이트: https://dawnilove.github.io/claude-config/ (묶음을 누르면 작업 흐름의 어느 단계에 끼어드는지 보인다)

설치 3단계 (자세한 설명은 [2절](#2-새-컴퓨터에-설치한다-처음-1번)):

1. Git, GitHub CLI(`gh`), Claude Code를 설치하고 `gh auth login`을 실행한다.
2. PowerShell에서 [2-2절](#2-2-설치한다-powershell-명령-1줄)의 명령 1줄을 실행한다. 저장소를 받고 `setup.ps1`을 실행한다.
3. Claude Code와 데스크톱 앱을 완전히 종료하고 다시 시작한다.

## 1. 들어 있는 것

| 경로 | 내용 |
|---|---|
| `claude/CLAUDE.md` | 전역 규칙 (언어, 작업 방식, 코드 유지보수 책임, 노력 수준, 선택표 사용). 모든 판의 원본이다 |
| `docs/` | 규칙의 본문 5개: 노력 수준, 작업 방식, 요약 시스템, 디자인 스킬 선택표, 검토 선택표. 사이트(`index.html`)도 이 폴더에 있다. 설치는 `.md`만 복사한다 (Claude판만) |
| `claude/agents/summarizer.md` | 요약 에이전트 |
| `claude/skills/stageshow/` | 로컬 스킬 (계정에 올리면 이 사본은 필요 없다) |
| `claude/skills/design-clash/` | 로컬 스킬. 디자인 스킬 3개로 시안 3개를 따로 만들고 선택기에서 비교한다. 명령: `/design-clash` |
| `claude/skills/refresh/` | 로컬 스킬. 명령: `/refresh` (로드맵 갱신 → 병렬 진행 → 쓰지 않는 세션 정리 → 결정할 것 보고). Orca 안에서는 `orca.md`의 절차로 돈다 |
| `claude/skills/data-iso/` | 로컬 스킬. 측정 데이터(로봇 경로, 센서 기록)를 등각 기술 도면 SVG와 시간 슬라이더로 그린다. `replay.js`는 anatomy(MIT)에서 가져왔다 (`NOTICE`) |
| `claude/skills/graphify/` | Graphify-Labs/graphify(Apache-2.0) 스킬의 사본. 코드를 지식 그래프로 만들어 질문한다. `/graphify`로 쓰고, 그래프(`graphify-out/graph.json`)가 있는 프로젝트에서만 자동으로 쓴다(설명 줄만 바꿈, 훅 없음). 본체는 `setup.ps1`이 `uv tool install graphifyy`로 `~\.uv-tools`에 설치한다 |
| `claude/skills/improve/`, `claude/skills/nothing-design/` | 외부 스킬의 사본 (shadcn/improve, dominikmartn/nothing-design-skill, 둘 다 MIT) |
| `claude/plugins/` | 내가 만든 플러그인. 앱이 환경 변수로 이 폴더를 직접 읽는다. session-board(오른쪽 패널, 입력창 위 띠, 파일을 깨뜨리는 명령 거부, 비밀 파일 읽기 가드, 하위 에이전트, 결재함), relay-skills(`/handoff`, `/ship`, `/recall`), relay-agents(설계·구현·리뷰 에이전트), superpowers-lite(obra/superpowers의 스킬 4개를 내 방식에 맞춘 사본), humanizer-ko(blader/humanizer의 한국어 판). 결재함 규칙: `docs/통합_작업방식.md` 11절. 자세한 설명은 `claude/plugins/README.md` |
| `claude/hooks/reminder.txt` | 알림 훅의 문구. 메시지마다 Claude에게 규칙 4개를 알린다 |
| `codex/` | Codex판: `AGENTS.md`, 하위 에이전트 4개(`agents/*.toml`), 위험 명령 승인 규칙(`rules/`), 알림 훅 문구, 같이 쓰는 스킬 목록(`skills.txt`) |
| `antigravity/` | Antigravity판: `AGENTS.md`, 하위 에이전트 4개(`agents/*.md`), 알림 훅(`hooks/reminder.ps1`), 같이 쓰는 스킬 목록(`skills.txt`) |
| `orca/` | Orca판: Orca 자체 플러그인 3개(`plugins/agent-band`, `plugins/agent-guard`, `plugins/ko-language-boost`). Orca가 띄우는 에이전트의 규칙·스킬은 위 폴더들이 맡는다 |
| `plugins-backup/` | 플러그인 본체의 사본 (`ponytail`, `egm`, `frontend-design`). 백업용이다. 설치는 명령으로 한다. 설치된 판보다 낡을 수 있다 |
| `setup.ps1` | 설치 스크립트. `-Agent claude`(기본) / `codex` / `antigravity` / `orca` |

## 2. 새 컴퓨터에 설치한다 (처음 1번)

### 2-1. 준비한다

1. Git을 설치한다.
2. GitHub CLI(`gh`)를 설치한다.
3. Claude Code와 Claude 데스크톱 앱을 설치한다.
4. 데스크톱 앱에 같은 계정으로 로그인한다. 계정 스킬(`anthropic-skills:*`)이 들어온다.
5. PowerShell에서 GitHub에 로그인한다: `gh auth login`

### 2-2. 설치한다 (PowerShell, 명령 1줄)

```powershell
gh repo clone Dawnilove/claude-config "$env:USERPROFILE\claude-config"; powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-config\setup.ps1"
```

끝난 뒤 Claude Code와 데스크톱 앱을 **완전히 종료하고 다시 시작한다.** 환경 변수(6단계)는 새로 시작한 프로세스부터 적용된다. 창만 닫으면 앱이 백그라운드에 남아 적용되지 않는다.

주의: `gh`는 로그인해야 동작한다. `gh auth login`을 하지 않으면 `gh repo clone`이 실패한다. 설치 명령은 한 줄이다. 따로 `git pull`을 하지 않는다. 폴더가 아직 없기 때문이다.

다른 방법: Claude Code에 "Dawnilove/claude-config 저장소를 받아 README대로 설치해 줘"라고 말한다.

`CLAUDE_CODE_PLUGIN_DIRS`에 다른 값이 이미 있으면 스크립트가 경고만 하고 바꾸지 않는다. 그때는 아래 명령으로 직접 정한 뒤 앱을 다시 시작한다.

```powershell
[Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', "$env:USERPROFILE\claude-config\plugins", 'User')
```

### 2-3. 스크립트가 하는 일

| 순서 | 동작 | 기존 내용 |
|---|---|---|
| 1 | 공통 규칙을 `~/.claude/CLAUDE.shared.md`로 복사한다 | 그 컴퓨터의 `CLAUDE.md`를 덮어쓰지 않는다 |
| 2 | 그 컴퓨터의 `CLAUDE.md` 끝에 `@CLAUDE.shared.md` 1줄을 추가한다 | 이미 있으면 추가하지 않는다 |
| 3 | `docs`, `agents`, `skills`, `hooks`를 `~/.claude`에 복사한다 | 같은 이름의 파일은 덮어쓴다 |
| 3-1 | 구 `skills/decision-rack`이 있으면 지운다 | 결재함이 `session-board`로 옮겨졌다 |
| 4 | `settings.json`에 알림 훅 1개와 `"language": "korean"`을 추가한다 | 다른 설정과 훅은 그대로 둔다. 언어 설정이 이미 있으면 그 값을 둔다. 고치기 전의 파일은 `settings.json.bak-setup`으로 남긴다 |
| 5 | 플러그인 4개를 설치한다: `ponytail`, `frontend-design`, `egm`, `codex` | 이미 있으면 건너뛴다. `codex`는 Codex CLI(`npm install -g @openai/codex`)와 `codex login`이 필요하다 |
| 6 | 사용자 환경 변수 `CLAUDE_CODE_PLUGIN_DIRS`를 저장소의 `plugins`로 정한다. 내 플러그인(`session-board`, `relay-skills`, `relay-agents`)이 켜진다. `-SkipPlugins`로 실행해도 이 단계는 한다 | 옛 경로(`...\my-own-mods\plugins`)는 새 경로로 바꾼다. 다른 값이 있으면 경고만 하고 그대로 둔다 |

### 2-4. 설치를 확인한다

1. Claude Code에서 "전역 규칙을 요약해 줘"라고 묻는다. 규칙이 나오면 `@CLAUDE.shared.md`가 작동한다.
2. `/anthropic-skills:prototype`를 입력한다. 응답이 나오면 계정 스킬이 작동한다.
3. 플러그인 목록을 본다: `claude plugin list`
4. 작은 코딩 작업을 시킨다. Claude가 작업 전에 노력 수준을 말하고, 작업 끝에 검토 명령을 제안하면 정상이다.
5. 내 모드를 확인한다. 다시 시작한 Claude Code(데스크톱 앱)에서 아래를 본다.
   - 환경 변수: PowerShell에서 `[Environment]::GetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS','User')`를 실행한다. `...\claude-config\plugins`가 나오면 정상이다.
   - 오른쪽에 `세션` 패널이 열리고, 입력창 위에 고양이 띠가 보인다. 패널은 `/session_board`로 열고 닫는다.
   - 입력창에 `/handoff`를 입력하면 자동 완성에 나온다.
   - 보이지 않으면 앱을 완전히 종료했다가 다시 시작한다. 그래도 없으면 7절을 본다.

## 3. 저장소의 변경을 다른 컴퓨터에 적용한다

저장소에 새 커밋이 올라온 뒤에 실행한다. 플러그인은 다시 설치하지 않는다.

주의: 이 명령은 저장소 폴더(`%USERPROFILE%\claude-config`)가 이미 있어야 작동한다. 그 컴퓨터에서 2-2절의 설치를 한 번도 하지 않았으면 2-2절의 명령을 먼저 실행한다. 폴더가 없으면 `fatal: cannot change to '...\claude-config': No such file or directory` 오류가 난다. 이 오류는 아무것도 바꾸지 않는다.

```powershell
git -C "$env:USERPROFILE\claude-config" pull; powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-config\setup.ps1" -SkipPlugins
```

끝난 뒤 Claude Code를 다시 시작한다. 자동으로 적용되지 않는다. 변경이 있을 때마다 이 명령을 실행한다.

주의: `git pull` 뒤에는 이 명령의 `setup.ps1`까지 꼭 실행한다. 폴더가 옮겨지면 환경 변수와 옛 폴더를 이 스크립트가 정리한다.

`-SkipPlugins`는 5단계(외부 플러그인 설치)만 건너뛴다. 환경 변수(6단계)는 항상 맞춘다. 단 `-Target`을 다른 폴더로 준 시험 실행에서는 환경 변수를 바꾸지 않는다. 내 플러그인 코드는 저장소 폴더를 직접 읽으므로 `git pull`만으로 갱신된다.

## 4. 고친 설정을 저장소에 올린다

주의: 올리기 전에 항상 `git pull --rebase`를 먼저 실행한다. 다른 컴퓨터나 다른 세션이 먼저 올렸을 수 있다.

### 4-1. 어느 파일을 고치는가

| 컴퓨터 | 공통 규칙이 있는 파일 | 저장소로 복사할 때 |
|---|---|---|
| 원본 컴퓨터 (`setup.ps1`을 실행하지 않은 곳) | `~/.claude/CLAUDE.md` | `CLAUDE.md` → 저장소의 `CLAUDE.md` |
| 설치로 만든 컴퓨터 | `~/.claude/CLAUDE.shared.md` | `CLAUDE.shared.md` → 저장소의 `CLAUDE.md` |

설치로 만든 컴퓨터의 `~/.claude/CLAUDE.md`는 그 컴퓨터만의 규칙이다. 저장소에 올리지 않는다.

### 4-2. 원본 컴퓨터에서 올린다

```powershell
$c="$env:USERPROFILE\.claude"; $r="$env:USERPROFILE\claude-config"
git -C $r pull --rebase
Copy-Item "$c\CLAUDE.md" "$r\claude" -Force
Copy-Item "$c\docs\*" "$r\docs" -Force
Copy-Item "$c\agents\*" "$r\claude\agents" -Force
Copy-Item "$c\hooks\reminder.txt" "$r\claude\hooks" -Force
foreach ($s in 'design-clash', 'refresh', 'data-iso', 'graphify') { Copy-Item "$c\skills\$s" "$r\claude\skills" -Recurse -Force }
git -C $r add -A
git -C $r commit -m "설정 갱신"
git -C $r push
```

### 4-3. 설치로 만든 컴퓨터에서 올린다

4-2와 같다. 3번째 줄만 다르다.

```powershell
Copy-Item "$c\CLAUDE.shared.md" "$r\claude\CLAUDE.md" -Force
```

규칙을 바꾸면 `codex/AGENTS.md`와 `antigravity/AGENTS.md`에도 같은 내용을 반영한다. 세 파일은 자동으로 맞춰지지 않는다.

### 4-4. Claude에게 시킨다

Claude Code에 "전역 설정을 claude-config 저장소에 올려 줘"라고 말한다. Claude는 올리기 전에 확인을 받는다.

## 5. 되돌린다

| 대상 | 방법 |
|---|---|
| `settings.json` | `settings.json.bak-setup`을 `settings.json`으로 복사한다 |
| 공통 규칙 | 그 컴퓨터의 `CLAUDE.md`에서 `@CLAUDE.shared.md` 줄을 지운다 |
| 플러그인 | `claude plugin uninstall egm@egm` (다른 플러그인도 같은 형식이다) |
| 저장소의 이전 버전 | `git -C "$env:USERPROFILE\claude-config" log --oneline`으로 커밋을 찾는다. `git checkout <커밋> -- <파일>`로 그 파일만 되돌린다 |

## 6. 들어 있지 않은 것

- `settings.json`: 훅 경로가 컴퓨터마다 다르다. `setup.ps1`이 알림 훅과 언어 설정만 추가한다.
- `.claude.json`, `.credentials.json`: 인증 정보다. 절대 넣지 않는다.
- 메모리: 프로젝트 폴더 경로에 묶여 있다. 컴퓨터마다 따로 쌓인다.
- 계정 스킬: 계정이 보관한다. 데스크톱 앱에 로그인하면 들어온다.
- `orca-cli`, `orchestration`, `jetdeck`: Madang과 JetDeck이 설치할 때 넣는다.

## 7. 문제가 생기면

| 증상 | 원인과 해결 |
|---|---|
| `fatal: cannot change to '...\claude-config'`가 나온다. `setup.ps1`이 없다고 나온다 | 그 컴퓨터에 저장소 폴더가 없다. 3절의 갱신 명령 대신 2-2절의 설치 명령을 실행한다. 다음부터 3절의 명령을 쓴다 |
| `gh`를 찾을 수 없다 | GitHub CLI가 없다. `winget install GitHub.cli`로 설치한다. PowerShell을 다시 연다 |
| 저장소를 받을 때 로그인을 요구한다 | `gh`에 로그인하지 않았다. `gh auth login`을 실행한다 |
| `git push`가 거절된다 | 다른 곳에서 먼저 올렸다. `git pull --rebase`를 실행한 뒤 다시 올린다 |
| 계정 스킬이 안 보인다 | 데스크톱 앱에 같은 계정으로 로그인했는지 확인한다. 앱을 다시 시작한다 |
| 규칙이 적용되지 않는다 | Claude Code를 다시 시작한다. 규칙은 새 세션부터 적용된다 |
| 알림이 들어오지 않는다 | `settings.json`의 `hooks.UserPromptSubmit`에 `reminder.txt`를 읽는 명령이 있는지 확인한다. 없으면 `setup.ps1 -SkipPlugins`를 다시 실행한다 |
| 플러그인 설치가 실패한다 | `claude` 명령이 있는지 확인한다. 본체의 사본은 `plugins-backup/`에 있다 |

## 8. Codex와 Antigravity에 설치한다

저장소가 이미 있으면 받기 단계를 건너뛴다. 에이전트마다 명령 1줄이다.

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-config\setup.ps1" -Agent codex
```

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-config\setup.ps1" -Agent antigravity
```

| 넣는 것 | Codex | Antigravity |
|---|---|---|
| 전역 규칙 | `~/.codex/AGENTS.md` | `~/.gemini/config/AGENTS.md` |
| 하위 에이전트 4개 (summarizer, relay-design·build·review) | `~/.codex/agents/*.toml` | `~/.gemini/config/agents/*.md` |
| 스킬 12개 (`skills.txt`의 목록, `claude/`에서 복사) | `~/.agents/skills/` | `~/.gemini/config/skills/` |
| 알림 훅 | `~/.codex/hooks.json`의 `UserPromptSubmit` | `~/.gemini/config/hooks.json`의 `claude-config-reminder` (`PreInvocation`, 턴의 첫 호출에만) |
| 위험 명령 승인 | `~/.codex/rules/claude-config.rules` | 규칙 파일이 없다. `AGENTS.md`의 지시로만 묻는다 |
| graphify 본체 | `uv tool install graphifyy` | 같음 |

- 그 컴퓨터만의 `AGENTS.md`가 있으면 `AGENTS.md.bak-setup`으로 남기고 덮어쓴다. 남긴 파일의 규칙은 손으로 합친다.
- `hooks.json`의 다른 훅은 그대로 둔다. 고치기 전에 `hooks.json.bak-setup`을 남긴다.
- Codex: 설치 뒤 Codex에서 `/hooks`를 1번 열고 알림 훅을 신뢰한다. 신뢰하기 전에는 훅이 돌지 않는다.
- 빠진 것: session-board(Claude 데스크톱 앱 전용), `/recall`(Claude 대화 기록 전용), `/refresh`(Claude 하위 세션 전용), `/design-clash`(Claude 디자인 스킬 필요), ponytail·egm 같은 Claude 마켓 플러그인.
- 되돌리기: 위 표의 파일을 지운다. `*.bak-setup`이 있으면 원래 이름으로 되돌린다.

## 9. Orca에 설치한다

Orca는 Claude Code·Codex·Antigravity를 각자의 설정 폴더로 띄운다. 그래서 전역 규칙, 하위 에이전트, 스킬, `settings.json` 훅은 위의 `-Agent claude | codex | antigravity` 설치가 그대로 Orca 안에서도 적용된다 (Claude는 Orca 터미널과 chat UI에서 시험했다). `orca/`는 그 위에 Orca 자체 플러그인만 둔다.

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-config\setup.ps1" -Agent orca
```

| 플러그인 | 하는 일 | 설치 |
|---|---|---|
| `agent-band` | 상태 표시줄에 `진행 n · 대기 n` (기본 켬)과 `오늘 갱신 세션 N 토큰` (기본 끔, 세션의 누적 토큰). Claude 데스크톱 앱의 입력창 띠를 옮겼다 | 코드를 도는 플러그인이라 승인이 필요하다 |
| `agent-guard` | 파일을 깨뜨리는 명령과 비밀 파일 읽기를 거부한다 (둘 다 기본 켬). session-board의 가드를 옮겼다 | 승인이 필요하다. session-board가 로드된 PC(`CLAUDE_CODE_PLUGIN_DIRS`가 이 저장소의 `claude\plugins`)에서는 `setup.ps1`이 설치를 건너뛴다 |
| `ko-language-boost` | Orca 한국어 화면에서 빠진 문구만 채우는 언어 팩 (1,911개). 원본 Orca에 낸 PR이 병합되면 필요 없다 | 승인 없이 설치된다 |

- 승인은 사용자가 한다. 스크립트는 `orca plugin install <폴더>`를 실행하고, 승인이 필요한 플러그인은 Orca가 출력한 `--approve <지문>` 명령을 보인다. 설치된 권한을 읽고 그 명령을 직접 실행한다. 파일이 바뀌면 지문도 바뀐다.
- 플러그인 id가 `orca`로 시작하면 Orca가 공식 플러그인용 이름이라며 설치를 거부한다. 그래서 `agent-`를 붙였다.
- 스킬: `/handoff`와 `/recall`은 Orca에서 그대로 돈다. `/refresh`는 Orca 안이면(`ORCA_CLI_COMMAND`가 있으면) `claude/skills/refresh/orca.md`의 절차로 돈다. Orca CLI에는 보관 명령이 없어서 카드 상태를 "완료"로 바꾸고 닫기·삭제는 먼저 묻는다.
- 못 옮긴 것: 오른쪽 패널(필요 없다고 했다), 결재함 카드, `인계 ▸` 단추, 컨텍스트 %. Orca가 플러그인에 주지 않는다. 5시간·주간 사용량은 Orca의 기본 상태 표시줄이 이미 보인다 (사용량 칩).
- `agent-guard`의 규칙은 `claude/plugins/session-board/hooks/guard.ts`·`secrets.ts`의 복사본이다. 규칙을 고치면 두 곳을 같이 고친다.
- 되돌리기: `orca plugin uninstall local.agent-band` (다른 플러그인도 같다).

### 9-1. 켜기와 끄기

| 끄는 범위 | 방법 |
|---|---|
| 플러그인 전체 | Orca의 Settings > Plugins에서 끈다. 또는 `orca plugin disable local.agent-band` (켜기: `orca plugin enable local.agent-band`). 끄면 훅과 띠가 모두 멈춘다 |
| `agent-band`의 항목 | Settings > Plugins > Band에서 "에이전트 띠", "오늘 토큰"을 끈다. 끈 항목은 상태 표시줄에서 숨고, 꺼진 토큰은 세션 목록을 읽지도 않는다 |
| `agent-guard`의 가드 | Settings > Plugins > Guard에서 "파일을 깨뜨리는 명령 거부", "비밀 파일 읽기 거부"를 각각 끈다. 설정을 못 읽으면 켜진 채로 둔다 |
| 언어 팩 | Settings > Appearance > Language를 내장 한국어로 되돌린다. 또는 `orca plugin disable local.ko-language-boost` |

### 9-2. Orca 기존 기능과 겹침 점검 (2026-11-21)

| 대상 | 결과 | 조치 |
|---|---|---|
| Orca가 `~/.claude/settings.json`에 넣은 훅 (`orca-agent-hook.exe`, 이벤트 18개)와 `statusLine` | 충돌 없음. `setup.ps1 -Agent claude`를 시험 폴더에 돌려 이 값들이 그대로임을 확인했다 | Claude의 `statusLine`은 Orca가 쓴다. 우리 상태 줄을 넣지 않는다 |
| Orca의 사용량 칩 (5시간·주간, 상태 표시줄) | `agent-band`의 "오늘 토큰"과 일부 겹친다. 값은 다르다 (칩은 한도의 %, 띠는 오늘 토큰 합) | "오늘 토큰"을 기본 끔으로 했다 |
| Orca 사이드바의 작업 공간별 에이전트 상태 | `agent-band`의 "진행·대기"와 일부 겹친다. 띠는 모든 작업 공간의 합을 한곳에 보인다 | 필요 없으면 "에이전트 띠"를 끈다 |
| session-board의 가드 (`CLAUDE_CODE_PLUGIN_DIRS`로 Claude에 로드됨) | **`agent-guard`와 같은 일을 한다.** 이 PC의 Orca 채팅에서 session-board 가드가 `sed -i`를 막는 것을 확인했다. 둘 다 켜면 같은 사유로 두 번 막는다 | 이 PC에서는 `agent-guard`가 중복이다. session-board가 로드된 PC에서는 `setup.ps1`이 설치를 건너뛴다. session-board가 없는 곳에서만 쓸 만하다 |
| 내장 한국어와 언어 팩 | 팩이 같은 키를 덮어쓴다. 전체 목록이면 내장 번역이 좋아져도 옛 값으로 덮는다 | 팩을 내장과 다른 문구만 담도록 줄였다 (20,463 → 1,911개) |
| 다른 설치된 플러그인 | 테마 5개뿐이다. 훅·상태 표시줄 항목을 쓰는 것이 없다 | 없음 |
