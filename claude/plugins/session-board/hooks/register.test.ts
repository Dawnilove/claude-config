import { expect, test } from 'claude-code/testing'

import { applyPlan, appLink, avatarSvg, badges, barSvg, delPath, fmtDur, groupOf, headOf, parseRec, nameWidth, progress, projectSlug, titleOf, transcriptTitle, type Rec } from './register'

const NOW = 1_000_000_000_000
const rec = (p: Partial<Rec> = {}): Rec => ({ id: 's1', name: '프로젝트', state: 'idle', since: NOW, turnStartedAt: null, waitFor: null, done: 0, total: 0, step: '', updatedAt: NOW, appId: null, title: '', root: '', ask: null, report: null, askClosedAt: 0, reportClosedAt: 0, ...p })

test('칸 머리글은 상태 글자·뜻 색·시간이고, 작업 목록이 있으면 단계를 붙인다', () => {
  expect(headOf(rec({ state: 'running', turnStartedAt: NOW - 252_000, done: 3, total: 7 }), 'running', NOW)).toEqual({ label: '작업 중', color: 'suggestion', time: '4분 12초 · 3/7 단계', dim: false })
  expect(headOf(rec({ state: 'waiting', waitFor: 'Bash 승인', since: NOW - 65_000 }), 'notice', NOW)).toMatchObject({ label: 'Bash 승인 대기', color: 'warning', time: '1분 05초' })
  const ask = { kind: 'request' as const, question: 'q', background: [], options: [], at: NOW - 60_000 }
  expect(headOf(rec({ ask }), 'request', NOW)).toMatchObject({ label: '결재', color: 'error', time: '1분 00초' })
  expect(headOf(rec({ ask: { ...ask, at: NOW - 25 * 3600_000 } }), 'request', NOW).label).toBe('결재 낡음')
  expect(headOf(rec({ report: { lines: ['a'], at: NOW - 5_000 } }), 'report', NOW)).toMatchObject({ label: '확인', color: 'success' })
  expect(headOf(rec({ state: 'ended', ask }), 'request', NOW)).toMatchObject({ label: '세션 끝남', dim: true })
  expect(headOf(rec({ updatedAt: NOW - 100_000, ask }), 'request', NOW).label).toBe('응답 없음')
})

test('고양이 아바타는 상태마다 다르고, 앱 링크는 앱 세션 번호로 만든다', () => {
  expect(avatarSvg('running')).toContain('use href="#run"')
  for (const g of ['request', 'notice', 'report'] as const) expect(avatarSvg(g)).toContain('use href="#flag"') // 사용자를 기다리는 세 묶음은 깃발 든 고양이
  expect(avatarSvg('running')).not.toContain('id="flag"') // 필요한 고양이 하나만 담는다
  expect(appLink(rec({ appId: 'local_abc-123' }))).toBe('claude://claude.ai/epitaxy/local_abc-123')
  expect(appLink(rec())).toBeNull() // 이전 버전 기록에는 번호가 없다
  expect(parseRec(JSON.stringify({ ...rec(), appId: 'local_x' }))?.appId).toBe('local_x')
  expect(parseRec(JSON.stringify(rec()))?.appId).toBeNull()
})

test('시간은 초, 분, 시간 단위로 줄여 쓴다', () => {
  expect(fmtDur(5_000)).toBe('5초')
  expect(fmtDur(252_000)).toBe('4분 12초')
  expect(fmtDur(3_900_000)).toBe('1시간 05분')
  expect(fmtDur(-1)).toBe('0초')
})

test('깨진 기록 파일은 버리고, 모양이 맞으면 읽는다', () => {
  expect(parseRec('not json')).toBeNull()
  expect(parseRec('{"id":"a"}')).toBeNull()
  expect(parseRec(JSON.stringify({ ...rec(), state: 'zzz' }))).toBeNull()
  expect(parseRec({ base64: 'x' })).toBeNull()
  expect(parseRec(JSON.stringify(rec({ state: 'running', done: 2, total: 5 })))?.total).toBe(5)
})

test('90초 넘게 기록이 없거나 끝난 세션은 숨긴다', () => {
  expect(groupOf(rec({ state: 'running' }), NOW + 89_000)).toBe('running')
  expect(groupOf(rec({ state: 'running' }), NOW + 91_000)).toBe('hidden')
  expect(groupOf(rec({ state: 'ended' }), NOW)).toBe('hidden')
  expect(groupOf(rec({ state: 'waiting' }), NOW)).toBe('notice') // 권한 승인 대기는 알림과 합친다
})

test('뱃지는 진척도, 경과 시간, 대기 사유를 담는다', () => {
  const run = badges(rec({ state: 'running', done: 3, total: 7, turnStartedAt: NOW - 252_000 }), NOW)
  expect(run.map(b => b.text)).toEqual(['3/7 단계', '경과 4분 12초'])
  expect(run[0].main).toBe(true)
  expect(run[1].main).toBe(false)

  const wait = badges(rec({ state: 'waiting', waitFor: 'Bash 승인', since: NOW - 65_000, done: 1, total: 4 }), NOW)
  expect(wait.map(b => b.text)).toEqual(['Bash 승인 대기', '대기 1분 05초', '1/4 단계'])

  const idle = badges(rec({ state: 'idle', since: NOW - 300_000 }), NOW)
  expect(idle.map(b => b.text)).toEqual(['5분 00초 전'])

  // 작업 목록이 없으면 경과 시간이 주 뱃지
  expect(badges(rec({ state: 'running', turnStartedAt: NOW - 3_000 }), NOW).map(b => b.text)).toEqual(['경과 3초'])
})

test('앱의 작업 목록(update_plan)은 통째 교체와 한 단계씩 고침을 모두 따라간다', () => {
  const items = [{ content: 'a', status: 'in_progress' }, { content: 'b', status: 'pending' }, { content: 'c', status: 'pending' }]
  let plan = applyPlan([], { items })
  expect(progress(plan)).toEqual({ total: 3, done: 0, step: 'a' })
  plan = applyPlan(plan, { advance: true }) // a 끝, b 시작
  expect(progress(plan)).toEqual({ total: 3, done: 1, step: 'b' })
  plan = applyPlan(plan, { done: [2], start: 3 }) // 번호는 1부터
  expect(progress(plan)).toEqual({ total: 3, done: 2, step: 'c' })
  plan = applyPlan(plan, { advance: true })
  expect(progress(plan)).toEqual({ total: 3, done: 3, step: '' })
  // 목록이 없을 때 오는 고침 호출과 범위를 벗어난 번호는 무시한다
  expect(applyPlan([], { advance: true, done: [9], start: 0 })).toEqual([])
  expect(items[0].status).toBe('in_progress') // 받은 목록을 바꾸지 않는다
})

test('앱 작업 목록 호출이 오면 기록의 done/total/step 이 바뀐다', async ($, on) => {
  const writes: any[] = []
  on('env.get', () => ({ value: 'C:/home' }))
  on('session.cwd', () => ({ value: 'C:/work/p' }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }) as any)
  on('fs.write', (_, e: any) => {
    writes.push(JSON.parse(e.text))
    return { value: undefined } as any
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: '조사', status: 'in_progress' }, { content: '구현', status: 'pending' }] } as any)
  expect(writes.at(-1)).toMatchObject({ done: 0, total: 2, step: '조사' })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true } as any)
  expect(writes.at(-1)).toMatchObject({ done: 1, total: 2, step: '구현' })
})

test('진척 막대는 채움 길이가 단계 비율과 같고 한도를 넘지 않는다', () => {
  expect(barSvg(1, 4, '#4F6BFF', 160)).toContain('width="40"')
  expect(barSvg(9, 4, '#4F6BFF', 160)).toContain('width="160" height="6" rx="3" fill="#4F6BFF"')
  expect(barSvg(0, 4, '#4F6BFF')).not.toContain('#4F6BFF')
})

test('승인 대화상자와 질문은 대기로 기록하고, 풀리면 진행 중으로 돌아간다', async ($, on) => {
  const states: [string, string | null][] = []
  on('env.get', () => ({ value: 'C:/home' }))
  on('session.cwd', () => ({ value: 'C:/work/p' }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }) as any)
  on('fs.write', (_, e: any) => {
    const r = JSON.parse(e.text)
    states.push([r.state, r.waitFor])
    return { value: undefined } as any
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.check', () => ({ decision: 'ask' }) as any)
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(states).toContainEqual(['waiting', 'Bash 승인'])
  expect(states.at(-1)).toEqual(['running', null])

  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(states).toContainEqual(['waiting', '답변'])
  expect(states.at(-1)).toEqual(['running', null])
})

// 세션 시작부터 패널까지: 작업 목록과 질문 대기를 파일에 쓰고, 패널이 폴더의 다른 세션과 함께 그린다.
test('내 상태를 파일에 쓰고, 패널은 다른 세션 기록과 함께 그린다', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  const other = JSON.stringify(rec({ id: 'other', name: '다른 프로젝트', state: 'running', done: 2, total: 5, step: '시험 실행', turnStartedAt: Date.now() - 60_000, since: Date.now() - 60_000, updatedAt: Date.now() }))
  on('env.get', () => ({ value: 'C:/home' }))
  on('session.cwd', () => ({ value: 'C:/work/내 프로젝트' }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('store.get', () => ({ value: undefined }))
  on('fs.write', (_, e: any) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined } as any
  })
  on('fs.list', () => ({ value: [{ name: 'other.json', kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false }] }) as any)
  on('fs.read', () => ({ value: other }) as any)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Windows 에서는 엔진이 경로 구분자를 \ 로 바꿔 넘긴다
  expect(writes.at(-1)?.path.replaceAll('\\', '/')).toBe('C:/home/.claude/session-board/me.json')
  expect(JSON.parse(writes.at(-1)!.text).name).toBe('내 프로젝트')

  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'a', status: 'completed', activeForm: 'a 중' }, { content: 'b', status: 'in_progress', activeForm: 'b 하는 중' }, { content: 'c', status: 'pending', activeForm: 'c' }] })
  const saved = JSON.parse(writes.at(-1)!.text)
  expect([saved.done, saved.total, saved.step]).toEqual([1, 3, 'b 하는 중'])

  // 세션을 열 때 패널이 같이 열렸으니 따로 명령을 칠 필요가 없다
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-board', component: 'Pane', requestId: 'session-board', props: { title: '세션', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, surface } as any)
    if (surface === 'terminal') {
      // 쉬는 내 세션(1/3 단계)은 보이지 않는다. 일하는 다른 세션만 보인다
      const found = await Promise.all([/2\/5 단계/, /1\/3 단계/, /지금: 시험 실행/].map(async text => (await ui.find({ type: 'Text', text }))?.text !== undefined))
      expect([surface, ...found]).toEqual([surface, true, false, true])
      expect(await ui.find({ type: 'Button', text: /다른 프로젝트/ })).toBeTruthy() // 이름은 누르면 펴지는 단추다
    } else {
      // 데스크톱은 세션마다 얇은 칸이다. 고양이는 그림, 머리글은 글자다
      expect((await ui.find({ type: 'Text', text: /● 작업 중/ }))?.text).toBeDefined()
      expect(await ui.find({ type: 'Svg' })).toBeTruthy()
      expect((await ui.find({ type: 'Text', text: /세션 \d+개/ }))?.text).toBeDefined()
    }
    await ui.unmount()
  }
})

test('앱(SDK) 세션처럼 isInteractive 가 false 여도 패널을 열고, 명령은 그려지는 패널만 닫는다', async ($, on) => {
  let opens = 0
  let closes = 0
  let panes: any[] = []
  on('env.get', () => ({ value: 'C:/home' }))
  on('session.cwd', () => ({ value: 'C:/work/p' }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('store.get', () => ({ value: undefined }))
  on('fs.write', () => ({ value: undefined }) as any)
  on('fs.list', () => ({ value: [] }) as any)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: false } } // 화면이 아직 안 붙었거나 창이 좁다
  })
  on('ui.close', () => {
    closes += 1
    return { value: undefined } as any
  })
  on('ui.panes', () => ({ value: panes }) as any)
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: null, isInteractive: false } as any)
  expect(opens).toBe(1)

  // 아직 못 그리는 패널이면 닫지 않고 사용자가 시킨 열기로 다시 연다
  panes = [{ id: 'session-board', isPlaced: false }]
  await $.command.run({ command: 'session_board', args: '' } as any)
  expect([opens, closes]).toEqual([2, 0])

  // 그려지고 있으면 닫는다
  panes = [{ id: 'session-board', isPlaced: true }]
  await $.command.run({ command: 'session_board', args: '' } as any)
  expect([opens, closes]).toEqual([2, 1])
})

test('Orca 터미널에서는 패널을 자동으로 열지 않고, 명령으로는 연다', async ($, on) => {
  let opens = 0
  on('env.get', (_, e: any) => ({ value: e.name === 'ORCA_TERMINAL_HANDLE' ? 'term_abc' : 'C:/home' }) as any)
  on('session.cwd', () => ({ value: 'C:/work/p' }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('store.get', () => ({ value: undefined }))
  on('fs.write', () => ({ value: undefined }) as any)
  on('fs.list', () => ({ value: [] }) as any)
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }) as any)
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as any)
  expect(opens).toBe(0)
  await $.command.run({ command: 'session_board', args: '' } as any)
  expect(opens).toBe(1)
})

test('세션을 열면 패널이 같이 열리고, 접기 단추는 없다 (개수는 입력창 위 띠가 보인다)', async ($, on) => {
  const opens: any[] = []
  const waiting = JSON.stringify(rec({ id: 'w', name: '대기 중', state: 'waiting', waitFor: '답변', since: Date.now(), updatedAt: Date.now() }))
  on('env.get', () => ({ value: 'C:/home' }))
  on('session.cwd', () => ({ value: 'C:/work/p' }))
  on('session.id', () => ({ value: 'me' }))
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('store.get', () => ({ value: undefined }))
  on('ui.open', (_, e: any) => {
    opens.push(e)
    return { value: { isPlaced: true } }
  })
  on('fs.write', () => ({ value: undefined }) as any)
  on('fs.list', () => ({ value: [{ name: 'w.json', kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false }] }) as any)
  on('fs.read', () => ({ value: waiting }) as any)
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opens.length).toBe(1)
  expect(opens[0].columns).toBe(40) // 줄 하나가 들어가는 너비를 바란다(상한은 걸 수 없다)

  const props = { title: '세션', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'Pane', requestId: 'session-board', props, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Svg' })).toBeTruthy() // 펼친 데스크톱 패널은 카드 이미지
  expect((await ui.find({ type: 'Text', text: /세션 \d+개/ }))?.text).toBeDefined()
  expect(await ui.find({ key: 'fold-btn' })).toBeFalsy() // 접기 단추는 없다
  await ui.unmount()
})

// ---- 결재함 기능 이식 ----------------------------------------------------------------
type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]
const PANE = { title: '세션', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }
const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const LIVE = () => Date.now()
const file = (id: string, p: Partial<Rec> = {}) => JSON.stringify(rec({ id, name: `세션-${id}`, updatedAt: LIVE(), since: LIVE(), appId: 'local_ab-12', ...p }))

// 가짜 기록 폴더: 파일 내용과 수정 시각을 바꾸는 쓰기, 실행한 명령과 알림을 모은다
// ageMs: 처음 파일들의 나이. 10초보다 어리면 "쓰는 중"으로 보고, 하루보다 늙으면 정리 대상이 된다
function fakeBoard(on: On, files: Record<string, string>, ageMs = 60_000) {
  let clock = 1
  const t0 = Date.now()
  const mtimes: Record<string, number> = Object.fromEntries(Object.keys(files).map(f => [f, t0 - ageMs]))
  const seen = { ran: [] as string[][], toasts: [] as string[], opens: 0, env: { parent: undefined as string | undefined, orca: undefined as string | undefined }, messages: [] as unknown[], during: undefined as any, tooBig: new Set<string>(), scripts: [] as string[], psOut: '' }
  const base = (p: unknown) => String(p).replaceAll('\\', '/').split('/').pop() ?? ''
  on('env.get', (_, e: any) => ({ value: e.name === 'CLAUDE_CODE_HOST_SESSION_ID' ? 'local_me-1' : e.name === 'CLAUDE_CODE_SESSION_ID' ? seen.env.parent : e.name === 'ORCA_TERMINAL_HANDLE' ? seen.env.orca : 'C:/home' }) as any)
  on('session.cwd', () => ({ value: 'C:/work/p' }))
  on('session.id', () => ({ value: 'me' }))
  on('session.root', () => ({ value: 'C:/work/p' }))
  on('session.messages', () => ({ value: seen.messages }) as any)
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: {} }) as any)
  on('command.register', () => ({ value: { command: 'session_board' } }))
  on('store.get', () => ({ value: undefined }))
  on('ui.open', () => {
    seen.opens += 1
    return { value: { isPlaced: true } }
  })
  on('ui.toast', (_, e: any) => {
    seen.toasts.push(e.text)
    return { value: {} } as any
  })
  on('fs.list', () => ({ value: Object.keys(files).map(f => ({ name: f, kind: 'file', size: 1, mtimeMs: mtimes[f] ?? 0, isLink: false })) }) as any)
  on('fs.read', (_, e: any) => {
    if (seen.tooBig.has(base(e.path))) throw new Error('over 4 MiB') // 엔진은 4 MiB 가 넘는 파일을 거절한다
    return { value: files[base(e.path)] } as any
  })
  on('fs.write', (_, e: any) => {
    files[base(e.path)] = e.text
    mtimes[base(e.path)] = t0 + ++clock
    return { value: undefined } as any
  })
  on('process.run', (_, e: any) => {
    if (e.argv[0] === 'rundll32' || e.argv[0] === 'cmd') seen.ran.push([...e.argv])
    if (e.argv[0] === 'powershell') seen.scripts.push(e.argv.at(-1))
    return { value: { exitCode: 0, stdout: e.argv[0] === 'powershell' ? seen.psOut : '', stderr: '' } } as any
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => {
    seen.during = files['me.json'] === undefined ? undefined : JSON.parse(files['me.json']) // 도구가 도는 동안의 내 기록
    return { result: {} }
  })
  on('prompt.submit', (_, e: any) => ({ text: e.text }))
  on('turn.complete', (_, e: any) => ({ text: e.answer }))
  return seen
}

const turnOf = ($: any) => (answer: string) => $.turn.complete({ answer, reason: 'answer', durationMs: 1, isAborted: false, turnId: 't' } as any)
const mount = ($: any, surface: 'desktop' | 'terminal' = 'desktop') => $.ui.mount({ plugin: 'session-board', component: 'Pane', requestId: 'session-board', props: PANE, surface } as any)

test('턴 끝 판정: 결재·알림이 이 세션의 기록이 되고, 신호 없는 사용자 턴은 닫는다', async ($, on) => {
  const files: Record<string, string> = {}
  fakeBoard(on, files)
  await $.session.start(START)
  const turn = turnOf($)
  const mine = () => JSON.parse(files['me.json'] ?? '{}')

  await turn('보고.\n결재: DB를 바꾼다\n결재: 표가 3개다')
  expect(mine()).toMatchObject({ state: 'idle', ask: { kind: 'request', question: 'DB를 바꾼다', background: ['표가 3개다'] }, appId: 'local_me-1' })

  await $.prompt.submit({ text: '바꿔', origin: { kind: 'composer' } } as any)
  await turn('알림: 노력 수준을 high로 바꾼다')
  expect(mine().ask).toMatchObject({ kind: 'notice' })

  await $.prompt.submit({ text: '바꿨다', origin: { kind: 'composer' } } as any)
  await turn('확인: 시험 통과\n끝냈다.')
  expect(mine().ask).toBeNull() // 신호 없이 끝난 사용자 턴은 닫는다
  expect(mine().report).toMatchObject({ lines: ['시험 통과'] }) // 확인은 눌러야 닫힌다

  // 작업 알림이 낀 턴은 사용자의 답이 아니다: 칸을 닫지 않는다
  await turn('결재: 또 묻는다')
  await $.prompt.submit({ text: '작업 알림', origin: { kind: 'task-notification' } } as any)
  await turn('진행했다.')
  expect(mine().ask).toMatchObject({ question: '또 묻는다' })
})

test('이름을 누르면 펴지고, 이동 단추는 결재함 방식(rundll32)으로 그 세션을 연다', async ($, on) => {
  const files = { 'other.json': file('other', { ask: { kind: 'request', question: '방식을 고르는가?', background: ['배경 1', '배경 2', '배경 3'], options: ['A', 'B'], at: LIVE() } }) }
  const seen = fakeBoard(on, files)
  await $.session.start(START)
  const ui = await mount($)
  expect(await ui.find({ key: 'go:other' })).toBeFalsy() // 접힌 줄에는 이동 단추가 없다
  await ui.press({ key: 'nm:other' })
  expect((await ui.find({ type: 'Text', text: /방식을 고르는가/ }))?.text).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /배경 2/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /배경 3/ })).toBeFalsy() // 배경은 2줄까지
  expect((await ui.find({ type: 'Text', text: /① A {2}② B/ }))?.text).toBeDefined() // 선택지 1줄
  await ui.press({ key: 'go:other' })
  expect(seen.ran).toEqual([['rundll32', 'url.dll,FileProtocolHandler', 'claude://claude.ai/epitaxy/local_ab-12']])
  await ui.press({ key: 'nm:other' }) // 같은 줄을 다시 누르면 접힌다
  expect(await ui.find({ key: 'go:other' })).toBeFalsy()
  await ui.unmount()
})

test('앱 번호 모양이 틀리면 이동 단추를 두지 않는다 (명령 주입 방지)', async ($, on) => {
  const seen = fakeBoard(on, { 'bad.json': file('bad', { appId: 'local_x & calc', ask: { kind: 'notice', question: 'q', background: [], options: [], at: LIVE() } }) })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'nm:bad' })
  expect(await ui.find({ key: 'go:bad' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /이동이 안 된다/ }))?.text).toBeDefined()
  expect(seen.ran).toEqual([])
  await ui.unmount()
})

test('닫기: 알림·낡은 결재·끝난 세션에 있고, 살아 있는 새 결재에는 없다. 누르면 닫은 시각을 쓴다', async ($, on) => {
  const at = LIVE()
  const day = 24 * 60 * 60 * 1000
  const files: Record<string, string> = {
    'fresh.json': file('fresh', { ask: { kind: 'request', question: '새 결재', background: [], options: [], at } }),
    'old.json': file('old', { ask: { kind: 'request', question: '낡은 결재', background: [], options: [], at: at - day - 1000 } }),
    'dead.json': file('dead', { state: 'ended', ask: { kind: 'request', question: '끝난 세션의 결재', background: [], options: [], at } }),
    'note.json': file('note', { ask: { kind: 'notice', question: '알림', background: [], options: [], at } }),
  }
  fakeBoard(on, files)
  await $.session.start(START)
  const ui = await mount($)
  for (const id of ['fresh', 'old', 'dead', 'note']) await ui.press({ key: `nm:${id}` }) // 줄마다 따로 펴려면 하나씩 펴고 확인한다
  // 한 번에 하나만 펴진다: 마지막으로 편 note 만 보인다
  expect(await ui.find({ key: 'close:note' })).toBeTruthy()
  for (const [id, hasClose] of [['fresh', false], ['old', true], ['dead', true]] as const) {
    await ui.press({ key: `nm:${id}` })
    expect([id, !!(await ui.find({ key: `close:${id}` }))]).toEqual([id, hasClose])
  }
  await ui.press({ key: 'close:dead' })
  expect(JSON.parse(files['dead.json']!).askClosedAt).toBeGreaterThanOrEqual(at)
  expect(await ui.find({ type: 'Text', text: /끝난 세션의 결재/ })).toBeFalsy() // 닫으면 칸이 사라진다
  await ui.unmount()
})

test('확인(초록)을 누르면 확인 칸만 닫는다. 2개 이상이면 모두 확인이 있다', async ($, on) => {
  const at = LIVE()
  const files: Record<string, string> = {
    'r1.json': file('r1', { report: { lines: ['a 끝'], at } }),
    'r2.json': file('r2', { report: { lines: ['b 끝'], at } }),
    'r3.json': file('r3', { report: { lines: ['c 끝'], at }, ask: { kind: 'notice', question: '같이 있는 알림', background: [], options: [], at } }),
  }
  fakeBoard(on, files)
  await $.session.start(START)
  const ui = await mount($)
  expect(await ui.find({ type: 'Button', text: /2개 모두 확인/ })).toBeTruthy()
  await ui.press({ key: 'nm:r2' })
  await ui.press({ key: 'ack:r2' })
  expect(JSON.parse(files['r2.json']!).reportClosedAt).toBeGreaterThanOrEqual(at)
  await ui.press({ key: 'nm:r3' })
  await ui.press({ key: 'ack:r3' })
  expect(JSON.parse(files['r3.json']!)).toMatchObject({ ask: { question: '같이 있는 알림' } }) // 알림은 그대로
  expect(JSON.parse(files['r3.json']!).reportClosedAt).toBeGreaterThan(0)
  expect(JSON.parse(files['r3.json']!).askClosedAt).toBe(0)
  await ui.unmount()
})

test('같은 프로젝트의 새 결재가 오면 패널을 열고 토스트로 알린다. 같은 결재는 한 번만이다', async ($, on) => {
  const at = LIVE()
  const files: Record<string, string> = { 'a.json': file('a', { root: 'c:/work/p', ask: { kind: 'request', question: '결재', background: [], options: [], at } }), 'z.json': file('z', { root: 'c:/other', ask: { kind: 'request', question: '다른 프로젝트', background: [], options: [], at } }) }
  const seen = fakeBoard(on, files)
  await $.session.start(START)
  await new Promise(r => setTimeout(r, 10)) // 토스트는 기다리지 않고 부른다
  expect(seen.toasts).toEqual(['세션 보드에 결재·알림 1개가 왔다']) // 다른 프로젝트는 알리지 않는다
  const opens = seen.opens
  await $.session.start(START) // 다시 읽어도 같은 결재로 또 열지 않는다
  await new Promise(r => setTimeout(r, 10))
  expect(seen.toasts.length).toBe(1)
  expect(seen.opens).toBe(opens + 1) // 시작 때의 열기 1번만
})

test('Orca 터미널은 결재함을 끈다: 새 결재가 와도 패널·토스트가 없고, 띠에 개수와 여닫기 단추가 없다', async ($, on) => {
  const at = LIVE()
  const files: Record<string, string> = { 'a.json': file('a', { root: 'c:/work/p', ask: { kind: 'request', question: '결재', background: [], options: [], at } }) }
  const seen = fakeBoard(on, files)
  seen.env.orca = 'term_abc'
  on('agent.list', () => ({ value: [] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'ponytail 띠' }))
  await $.session.start({ ...START, surface: 'terminal' } as any)
  await new Promise(r => setTimeout(r, 10))
  expect(seen.toasts).toEqual([])
  expect(seen.opens).toBe(0) // 시작 때도, 새 결재 때도 열지 않는다
  await turnOf($)('끝냈다.') // 다른 띠 시험처럼 턴을 끝내 기록을 읽게 한다 (Orca 밖이면 여기서 개수가 생긴다)
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: BAND_PROPS, surface: 'terminal' } as any)
  expect(await ui.find({ type: 'Text', text: /결재 1/ })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /세션 [▸◂]/ } as any)).toBeFalsy()
  await ui.unmount()
  seen.env.orca = undefined // 다음 시험에 남기지 않는다
})

test('내 기록을 다시 쓸 때 다른 세션의 패널이 쓴 닫은 시각을 잃지 않는다', async ($, on) => {
  const files: Record<string, string> = {}
  fakeBoard(on, files)
  await $.session.start(START)
  files['me.json'] = JSON.stringify({ ...JSON.parse(files['me.json']!), askClosedAt: 777, reportClosedAt: 555 })
  await $.tool.call({ tool: 'TodoWrite', todos: [] } as any)
  expect(JSON.parse(files['me.json']!)).toMatchObject({ askClosedAt: 777, reportClosedAt: 555 })
})

test('세션 끝: 사용자가 끝내면 결재·알림을 닫고, 앱 종료는 칸을 남긴다', async ($, on) => {
  const files: Record<string, string> = {}
  fakeBoard(on, files)
  on('session.end', (_, e: any) => ({ sessionId: e.sessionId }))
  await $.session.start(START)
  await turnOf($)('결재: 남는가?\n확인: 끝')
  await $.session.end({ sessionId: 'me', reason: 'other' } as any)
  expect(JSON.parse(files['me.json']!)).toMatchObject({ state: 'ended', ask: { question: '남는가?' } })
  await $.session.start(START) // 다시 열면 칸을 이어받는다
  expect(JSON.parse(files['me.json']!)).toMatchObject({ ask: { question: '남는가?' }, report: { lines: ['끝'] } })
  await $.session.end({ sessionId: 'me', reason: 'prompt_input_exit' } as any)
  expect(JSON.parse(files['me.json']!)).toMatchObject({ state: 'ended', ask: null, report: { lines: ['끝'] } }) // 확인은 눌러야 닫힌다
})

test('읽지 못한 기록 파일은 오류 줄로 보이고 닫기로 지운다', async ($, on) => {
  const seen = fakeBoard(on, { 'broken.json': '{ not json' })
  await $.session.start(START)
  const ui = await mount($)
  expect((await ui.find({ type: 'Text', text: /읽지 못했다: broken\.json/ }))?.text).toBeDefined()
  await ui.press({ key: 'x:broken.json' })
  expect(seen.ran.at(-1)?.slice(0, 3)).toEqual(['cmd', '/c', 'del'])
  await ui.unmount()
})

test('줄 이름은 앱 사이드바의 세션 제목이다. 제목을 모르면 첫 요청의 첫 줄, 그것도 없으면 폴더 이름이다', async ($, on) => {
  expect(titleOf('\n## `인계.md` 를 읽고\n단계 2를 해 줘')).toBe('인계.md 를 읽고')
  expect(titleOf('가'.repeat(41))).toBe(`${'가'.repeat(40)}…`)
  expect(titleOf('  \n ')).toBe('')
  const files: Record<string, string> = {}
  const seen = fakeBoard(on, files)
  await $.session.start(START)
  expect(JSON.parse(files['me.json']!).title).toBe('') // 아직 요청이 없다
  await $.prompt.submit({ text: '세션 보드 고치기\n자세한 내용', origin: { kind: 'composer' } } as any)
  await $.prompt.submit({ text: '두 번째 요청', origin: { kind: 'composer' } } as any)
  expect(JSON.parse(files['me.json']!).title).toBe('세션 보드 고치기')
  // 다시 연 세션은 대화의 첫 요청에서 이름을 다시 만든다
  seen.messages = [{ role: 'user', text: '처음 요청', toolUses: [], toolResults: [] }, { role: 'assistant', text: '네', toolUses: [] }]
  await $.session.start(START)
  expect(JSON.parse(files['me.json']!).title).toBe('처음 요청')
  // 앱이 대화 기록에 제목을 쓰면 턴 끝에 그 이름이 이긴다. 다시 시작해도 첫 요청으로 돌아가지 않는다
  const line = (t: string) => JSON.stringify({ type: 'custom-title', customTitle: t, sessionId: 'me' })
  files['me.jsonl'] = [line('Untitled session'), '{"type":"user"}', line('단계 2: 세션 보드'), '{"type":"assistant"}'].join('\n')
  await turnOf($)('끝냈다.')
  await new Promise(r => setTimeout(r, 10)) // 턴 끝의 제목 읽기는 기다리지 않고 돈다
  expect(JSON.parse(files['me.json']!).title).toBe('단계 2: 세션 보드')
  await $.session.start(START)
  expect(JSON.parse(files['me.json']!).title).toBe('단계 2: 세션 보드')
})

test('4MB 가 넘어 읽지 못한 기록은 PowerShell 로 제목 줄만 읽는다',async ($, on) => {
  const files: Record<string, string> = {}
  const seen = fakeBoard(on, files)
  seen.tooBig.add('me.jsonl')
  seen.psOut = '{"type":"custom-title","customTitle":"큰 세션"}\r\n'
  await $.session.start(START)
  expect(JSON.parse(files['me.json']!).title).toBe('큰 세션')
  expect(seen.scripts[0]).toContain(String.raw`'C:\home\.claude\projects\C--work-p\me.jsonl'`)
})

test('대화 기록에서 앱의 마지막 세션 제목을 꺼낸다. 제목 전(Untitled session)이나 깨진 줄은 쓰지 않는다', () => {
  const line = (t: string) => JSON.stringify({ type: 'custom-title', customTitle: t })
  expect(transcriptTitle([line('옛 제목'), '{"type":"user"}', line('새 제목')].join('\n'))).toBe('새 제목')
  expect(transcriptTitle(line('끝 줄바꿈 없음'))).toBe('끝 줄바꿈 없음')
  expect(transcriptTitle(`${line('Untitled session')}\n`)).toBe('')
  expect(transcriptTitle('{"type":"custom-title","customTitle":')).toBe('')
  expect(transcriptTitle('')).toBe('')
  expect(projectSlug(String.raw`C:\Users\PC14\나만의 플러그인 모드 만들기`)).toBe('C--Users-PC14----------------')
})

test('펼칠 것이 없는 줄(진행 중·쉬는 중)은 이름을 누르면 바로 그 세션으로 간다. 결재가 있는 줄은 펼친다', async ($, on) => {
  const seen = fakeBoard(on, {
    'run.json': file('run', { state: 'running' }),
    'ask.json': file('ask', { ask: OPEN_ASK('request') }),
  })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'nm:run' })
  expect(seen.ran).toEqual([['rundll32', 'url.dll,FileProtocolHandler', 'claude://claude.ai/epitaxy/local_ab-12']])
  await ui.press({ key: 'nm:ask' })
  expect(seen.ran.length).toBe(1) // 결재 줄은 이동하지 않고 펼친다
  expect(await ui.find({ key: 'go:ask' })).toBeTruthy()
  await ui.unmount()
})

test('이름 폭은 패널 폭을 따라 넓어지고, 상태 글자는 오른쪽 끝에 맞춘다', () => {
  expect(nameWidth(40)).toBe(190) // 이름은 머리글 아래 줄을 혼자 쓴다
  expect(nameWidth(60)).toBe(350)
  expect(nameWidth(10)).toBe(70) // 아주 좁아도 이름 자리는 남긴다
  expect(nameWidth(undefined)).toBe(190)
})

test('패널을 닫으면 입력창 위에 여는 단추가 생기고, 누르면 패널이 열리며 단추가 사라진다. 아래 띠는 가리지 않는다', async ($, on) => {
  const seen = fakeBoard(on, {})
  on('ui.close', () => ({ value: undefined }) as any)
  on('ui.panes', () => ({ value: [{ id: 'session-board', isPlaced: true }] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: '아래 띠' }))
  await $.session.start(START)
  const props = { hasSurvey: false, bodyColumns: 80, isWorking: false }
  const band = () => $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props, surface: 'desktop' } as any)
  let ui = await band()
  expect(await ui.find({ key: 'open-board' })).toBeFalsy() // 열려 있으면 단추가 없다
  await ui.unmount()
  await $.command.run({ command: 'session_board', args: '' } as any) // 닫는다
  ui = await band()
  expect(await ui.find({ key: 'open-board' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /아래 띠/ }))?.text).toBe('아래 띠')
  const opens = seen.opens
  await ui.press({ key: 'open-board' })
  expect(seen.opens).toBe(opens + 1)
  await ui.unmount()
  ui = await band()
  expect(await ui.find({ key: 'open-board' })).toBeFalsy()
  await ui.unmount()
})

test('기다리는 칸이 있으면 "세션 ▸" 를 그리지 않는다 (개수 단추는 relay-band 고양이 옆에 있다). /session_board open 은 열려 있어도 닫지 않는다', async ($, on) => {
  const seen = fakeBoard(on, { 'n.json': file('n', { ask: OPEN_ASK('notice') }) })
  let closes = 0
  on('ui.close', () => {
    closes += 1
    return { value: undefined } as any
  })
  on('ui.panes', () => ({ value: [{ id: 'session-board', isPlaced: true }] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: '아래 띠' }))
  await $.session.start(START)
  await $.command.run({ command: 'session_board', args: '' } as any) // 닫는다
  expect(closes).toBe(1)
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80, isWorking: false }, surface: 'desktop' } as any)
  expect(await ui.find({ key: 'open-board' })).toBeFalsy()
  await ui.unmount()
  const opens = seen.opens
  expect((await $.command.run({ command: 'session_board', args: 'open' } as any)).text).toBeUndefined() // 대화에 결과 글을 남기지 않는다
  await $.command.run({ command: 'session_board', args: 'open' } as any) // 두 번 불러도 닫히지 않는다
  expect([seen.opens - opens, closes]).toEqual([2, 1])
})

test('한 창: 하위 에이전트가 생기면 세션 보드 아래에 에이전트 칸이 붙고, 없으면 세션 보드만이다', async ($, on) => {
  const seen = fakeBoard(on, {})
  on('agent.spawn', () => ({ agentId: 'a1', model: 'x' }) as any)
  await $.session.start(START)
  let ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /하위 에이전트/ })).toBeFalsy()
  await ui.unmount()

  const opens = seen.opens
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: '코드 탐색', subagentType: 'Explore' } as any)
  expect(seen.opens).toBe(opens + 1) // 첫 에이전트가 시작하면 패널을 연다
  await $.tool.call({ tool: 'Grep', agentId: 'a1' } as any)
  await $.tool.call({ tool: 'Read', agentId: 'a1' } as any)
  ui = await mount($)
  expect((await ui.find({ type: 'Text', text: /표시할 세션이 없습니다/ }))?.text).toBeDefined() // 위: 세션 보드 (쉬는 세션은 보이지 않는다)
  expect((await ui.find({ type: 'Text', text: /^하위 에이전트 1 · 호출 2회$/ }))?.text).toBeDefined() // 아래: 에이전트 묶음
  expect((await ui.find({ type: 'Text', text: /● 실행 중/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^코드 탐색$/ }))?.text).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Explore · 호출 2회 · Read/ }))?.text).toBeDefined()
  await ui.unmount()
})

const BAND_PROPS = { hasSurvey: false, isCollapsed: false, isWorking: false, bodyColumns: 120, maxRows: 10 }

test('띠: 데스크톱은 고양이 옆에 개수 단추(점과 숫자)를 두고, 누르면 명령 없이 패널을 직접 연다. 아래 띠를 가리지 않는다', async ($, on) => {
  const seen = fakeBoard(on, { 'n.json': file('n', { ask: OPEN_ASK('notice') }) })
  const commands: any[] = []
  on('command.run', (_: any, e: any) => {
    commands.push(e)
    return { text: '' } as any
  })
  on('agent.list', () => ({ value: [] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'ponytail 띠' }))
  await $.session.start(START)
  await turnOf($)('끝냈다.') // 띠는 턴 끝(tick)에 개수를 다시 센다
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: BAND_PROPS, surface: 'desktop' } as any)
  expect(await ui.find({ key: 'catb' })).toBeTruthy()
  expect(await ui.find({ key: 'open-asks' })).toBeTruthy() // 알약 옆의 "▸" 여는 단추
  expect(await ui.find({ type: 'Svg', alt: /알림 1/ } as any)).toBeTruthy() // 띠와 같은 그림 알약(점과 숫자)
  expect((await ui.find({ type: 'Text', text: /ponytail 띠/ }))?.text).toBe('ponytail 띠')
  const opens = seen.opens
  await ui.press({ key: 'open-asks' })
  expect(seen.opens).toBe(opens + 1)
  expect(commands).toEqual([]) // 명령을 거치지 않는다: 대화에 명령 줄이 남지 않는다
  await ui.unmount()
})

test('띠: 터미널은 그림 없이 글자 칸으로 그리고 개수도 글자로 넣는다', async ($, on) => {
  fakeBoard(on, { 'n.json': file('n', { ask: OPEN_ASK('notice') }) })
  on('agent.list', () => ({ value: [] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'ponytail 띠' }))
  await $.session.start({ ...START, surface: 'terminal' } as any)
  await turnOf($)('끝냈다.')
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: BAND_PROPS, surface: 'terminal' } as any)
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /하위 0/ }))?.text).toBe('하위 0')
  expect((await ui.find({ type: 'Text', text: /알림 1/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('띠: 터미널에서 패널이 열려 있으면 "세션 ◂" 로 닫고, 닫힌 뒤에는 "세션 ▸" 가 보인다', async ($, on) => {
  const seen = fakeBoard(on, {})
  let closes = 0
  on('ui.close', () => {
    closes += 1
    return { value: undefined } as any
  })
  on('agent.list', () => ({ value: [] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'ponytail 띠' }))
  await $.session.start({ ...START, surface: 'terminal' } as any) // Orca 밖의 터미널: 시작 때 패널을 연다
  expect(seen.opens).toBe(1)
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: BAND_PROPS, surface: 'terminal' } as any)
  expect(await ui.find({ type: 'Button', text: /세션 ◂/ } as any)).toBeTruthy()
  await ui.press({ key: 'close-board' })
  expect(closes).toBe(1)
  expect(await ui.find({ type: 'Button', text: /세션 ▸/ } as any)).toBeTruthy() // 세션 보드도 닫힌 것을 안다
  await ui.unmount()
})

test('띠: 인계 단추는 /handoff 명령을 부르고 바로 토스트로 알린다. 실패하면 이유를 알리고 단추를 되살린다', async ($, on) => {
  const seen = fakeBoard(on, {})
  on('session.usage', () => ({ value: { context: { tokens: 60, window: 100 } } }) as any) // 컨텍스트 60%: 인계 단추가 보인다
  on('agent.list', () => ({ value: [] }) as any)
  let installed = false // relay-skills 가 없으면 보내기에 실패한다
  const ran: string[] = []
  on('command.list', () => ({ value: [{ name: 'session_board' }, ...(installed ? [{ name: 'relay-skills:handoff' }] : [])] }) as any)
  on('command.run', { command: 'relay-skills:handoff' } as any, (_: any, e: any) => {
    ran.push(e.command)
    return { text: undefined } as any
  })
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'ponytail 띠' }))
  await $.session.start({ ...START, surface: 'terminal' } as any)
  const ui = await $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: BAND_PROPS, surface: 'terminal' } as any)
  // 실패: 이유를 알리고 다시 누를 수 있다
  await ui.press({ key: 'f1handoff' })
  await new Promise(r => setTimeout(r, 10))
  expect(seen.toasts[0]).toMatch(/^인계를 보냈다/)
  expect(seen.toasts[1]).toMatch(/^인계를 보내지 못했다: handoff 명령이 없다/)
  expect(await ui.find({ type: 'Button', text: /인계/ } as any)).toBeTruthy()
  installed = true // 성공: 명령을 부르고 단추를 숨긴다
  await ui.press({ key: 'f1handoff' })
  await new Promise(r => setTimeout(r, 10))
  expect(ran).toEqual(['relay-skills:handoff'])
  expect(seen.toasts.length).toBe(3)
  expect(await ui.find({ type: 'Button', text: /인계/ } as any)).toBeFalsy()
  await ui.unmount()
})

// 한 창(세션 보드 아래의 확인 카드)은 시험 도구로 그릴 수 없다: 도구 호출이 붙잡혀 있는 동안 패널 그리기가 그 호출을 기다린다. 앱에서 확인한다

// ---- 검토 고침 -------------------------------------------------------------------------
const OPEN_ASK = (kind: 'request' | 'notice', at = LIVE()) => ({ kind, question: `${kind} 질문`, background: [], options: [], at })

test('검토 고침: 방금 바뀐 파일은 읽기에 실패해도 오류 줄로 보이지 않는다 (쓰는 중일 수 있다)', async ($, on) => {
  fakeBoard(on, { 'half.json': '{"id":"half","na' }, 1_000)
  await $.session.start(START)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /읽지 못했다/ })).toBeFalsy()
  await ui.unmount()
})

test('검토 고침: 파일 이름과 id 가 다른 기록은 오류 줄이다. 닫기가 엉뚱한 파일을 고치지 않는다', async ($, on) => {
  const files: Record<string, string> = { 'a.json': file('../../x', { ask: OPEN_ASK('notice') }) }
  fakeBoard(on, files)
  await $.session.start(START)
  const ui = await mount($)
  expect((await ui.find({ type: 'Text', text: /읽지 못했다: a\.json/ }))?.text).toBeDefined()
  expect(await ui.find({ key: 'nm:../../x' })).toBeFalsy()
  expect(Object.keys(files).sort()).toEqual(['a.json', 'me.json'])
  await ui.unmount()
})

test('검토 고침: 기록만 끊긴 세션의 새 결재는 "응답 없음"이고 닫기가 없다. 끝낸 세션은 "세션 끝남"이고 닫기가 있다', async ($, on) => {
  const old = LIVE() - 10 * 60_000 // 절전에서 깨어난 직후처럼 10분 동안 박동이 없었다
  fakeBoard(on, {
    'sleep.json': file('sleep', { updatedAt: old, ask: OPEN_ASK('request') }),
    'gone.json': file('gone', { updatedAt: old, state: 'ended', ask: OPEN_ASK('request') }),
  })
  await $.session.start(START)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'nm:sleep' })
  expect(await ui.find({ key: 'close:sleep' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /응답 없음/ })).toBeTruthy()
  await ui.press({ key: 'nm:gone' })
  expect(await ui.find({ key: 'close:gone' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /세션 끝남/ })).toBeTruthy()
  await ui.unmount()
})

test('검토 고침: 세션을 다시 열어도 이미 확인한 확인 줄은 되살아나지 않는다. 기다리는 결재는 다시 생긴다', async ($, on) => {
  const files: Record<string, string> = { 'me.json': file('me', { report: { lines: ['시험 통과'], at: 10 }, reportClosedAt: 20 }) }
  const seen = fakeBoard(on, files)
  seen.messages = [
    { role: 'user', text: '해', toolUses: [], toolResults: [] },
    { role: 'assistant', text: '확인: 시험 통과\n결재: 푸시하는가?', toolUses: [] },
  ]
  await $.session.start(START)
  const mine = JSON.parse(files['me.json']!)
  expect(mine.ask).toMatchObject({ kind: 'request', question: '푸시하는가?' })
  expect(mine.report).toEqual({ lines: ['시험 통과'], at: 10 }) // 닫힌 그대로다
})

test('점검 고침: cmd 의 del 에는 안전한 글자로만 된 경로만 넘긴다 (명령 주입 방지)', () => {
  expect(delPath('C:/home/.claude/session-board', 'abc-1.json')).toBe(String.raw`C:\home\.claude\session-board\abc-1.json`)
  expect(delPath('C:/home/.claude/session-board', 'x&calc.json')).toBeNull()
  expect(delPath('C:/home/.claude/session-board', 'a|b.json')).toBeNull()
  expect(delPath('C:/home/.claude/session-board', 'a%PATH%.json')).toBeNull()
  expect(delPath('C:/home/.claude/session-board', 'a.txt')).toBeNull() // 기록 파일(.json)만
  expect(delPath('C:/ho&me/.claude/session-board', 'a.json')).toBeNull() // 폴더 경로도 본다
})

test('점검 고침: 하루 넘은 정리도 위험한 글자가 든 이름은 지우지 않는다', async ($, on) => {
  const day = 24 * 60 * 60 * 1000
  const seen = fakeBoard(on, { 'x&calc.json': '{ broken', 'ok.json': '{ broken' }, 2 * day)
  await $.session.start(START)
  const deleted = seen.ran.filter(a => a[2] === 'del').map(a => a.at(-1)!.split('\\').pop())
  expect(deleted).toEqual(['ok.json'])
})

test('검토 고침: 하루 넘은 파일 정리는 열린 결재·확인이 있는 파일을 7일까지 남긴다', async ($, on) => {
  const day = 24 * 60 * 60 * 1000
  const seen = fakeBoard(on, {
    'plain.json': file('plain', { updatedAt: LIVE() - 2 * day }),
    'open.json': file('open', { updatedAt: LIVE() - 2 * day, report: { lines: ['아직 안 봄'], at: 1 } }),
  }, 2 * day)
  await $.session.start(START)
  const deleted = seen.ran.filter(a => a[2] === 'del').map(a => a.at(-1)!.split('\\').pop())
  expect(deleted).toEqual(['plain.json'])
})

test('검토 고침: 터미널 세션과 다른 세션 안에서 띄운 세션은 물려받은 앱 번호를 쓰지 않는다', async ($, on) => {
  const files: Record<string, string> = {}
  const seen = fakeBoard(on, files)
  await $.session.start({ ...START, surface: 'terminal' } as any)
  expect(JSON.parse(files['me.json']!).appId).toBeNull()
  seen.env.parent = 'parent-session' // 부모가 물려준 자기 번호. 이 세션의 번호(me)와 다르다
  await $.session.start(START)
  expect(JSON.parse(files['me.json']!).appId).toBeNull()
  seen.env.parent = undefined // 앱이 연 세션에는 이 값이 없다
  await $.session.start(START)
  expect(JSON.parse(files['me.json']!).appId).toBe('local_me-1')
})

test('검토 고침: 선택 카드가 뜨면 알림 칸이 생기고, 답한 뒤 신호 없이 끝난 턴은 칸을 닫는다', async ($, on) => {
  const files: Record<string, string> = {}
  const seen = fakeBoard(on, files)
  await $.session.start(START)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: '어느 쪽인가?', options: [{ label: 'A' }, { label: 'B' }] }] } as any)
  expect(seen.during).toMatchObject({ state: 'waiting', ask: { kind: 'notice', question: '어느 쪽인가?', options: ['A', 'B'] } })
  seen.messages = [{ role: 'assistant', text: 'A로 했다.', toolUses: [] }]
  await turnOf($)('A로 했다.')
  expect(JSON.parse(files['me.json']!).ask).toBeNull()
})

test('검토 고침: 같은 앱 세션의 옛 번호에 남은 결재는 이 세션의 판정 때 닫는다', async ($, on) => {
  const files: Record<string, string> = { 'old1.json': file('old1', { appId: 'local_me-1', ask: OPEN_ASK('request') }), 'else.json': file('else', { appId: 'local_zz', ask: OPEN_ASK('request') }) }
  fakeBoard(on, files)
  await $.session.start(START) // 시작 때는 아직 폴더를 읽기 전이라 다음 판정에서 닫는다
  await turnOf($)('끝냈다.')
  expect(JSON.parse(files['old1.json']!).askClosedAt).toBeGreaterThan(0)
  expect(JSON.parse(files['else.json']!).askClosedAt).toBe(0)
})
