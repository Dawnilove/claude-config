import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { agentsLabel, apply, count, fmtTokens, listing, prune, todayTokens, WAITING_STALE_MS, WORKING_STALE_MS, type Board } from './board'
import * as main from './worker'

const NOW = new Date(2026, 10, 21, 15, 0, 0).getTime()
const change = (paneKey: string, state: 'working' | 'blocked' | 'waiting' | 'done', title = paneKey, receivedAt = NOW) => ({ paneKey, state, title, receivedAt })

test('이벤트를 칸에 반영한다: done 은 칸을 지우고, 같은 칸의 새 상태는 덮어쓴다', () => {
  const board: Board = new Map()
  apply(board, change('a', 'working'))
  apply(board, change('b', 'blocked'))
  apply(board, change('c', 'waiting'))
  assert.deepEqual(count(board), { working: 1, blocked: 1, waiting: 1 })
  apply(board, change('a', 'blocked'))
  apply(board, change('b', 'done'))
  assert.deepEqual(count(board), { working: 0, blocked: 1, waiting: 1 })
  apply(board, { paneKey: 'a', state: 'working', receivedAt: NOW + 1 }) // 제목이 없는 이벤트는 앞 제목을 지킨다
  assert.equal(board.get('a')?.title, 'a')
})

test('띠 글자: 비면 "에이전트 없음", 사용자를 기다리는 칸(승인+답변)이 있으면 경고색', () => {
  assert.deepEqual(agentsLabel({ working: 0, blocked: 0, waiting: 0 }), { text: '에이전트 없음', tone: 'neutral' })
  assert.deepEqual(agentsLabel({ working: 2, blocked: 0, waiting: 0 }), { text: '진행 2', tone: 'neutral' })
  assert.deepEqual(agentsLabel({ working: 2, blocked: 1, waiting: 1 }), { text: '진행 2 · 대기 2', tone: 'warning' })
  assert.deepEqual(agentsLabel({ working: 0, blocked: 0, waiting: 1 }), { text: '대기 1', tone: 'warning' })
})

test('낡은 칸을 정리한다: 진행 중은 30분, 기다리는 칸은 하루', () => {
  const board: Board = new Map()
  apply(board, change('w', 'working', 'w', NOW - WORKING_STALE_MS - 1))
  apply(board, change('w2', 'working', 'w2', NOW - WORKING_STALE_MS))
  apply(board, change('b', 'blocked', 'b', NOW - WAITING_STALE_MS))
  apply(board, change('b2', 'blocked', 'b2', NOW - WAITING_STALE_MS - 1))
  prune(board, NOW)
  assert.deepEqual([...board.keys()].sort(), ['b', 'w2'])
})

test('목록은 기다리는 칸을 위에 두고, 빈 판은 안내문을 쓴다', () => {
  assert.match(listing(new Map(), NOW), /없다/)
  const board: Board = new Map()
  apply(board, change('w', 'working', '빌드', NOW - 5 * 60_000))
  apply(board, change('b', 'blocked', 'Orca 번역', NOW - 30_000))
  const lines = listing(board, NOW).split('\n')
  assert.equal(lines[0], '승인 대기 · Orca 번역 · 방금')
  assert.equal(lines[1], '진행 · 빌드 · 5분 전')
})

test('토큰: 오늘 자정 이후 세션만 더하고 K·M 으로 줄여 쓴다', () => {
  const midnight = new Date(2026, 10, 21, 0, 0, 0).getTime()
  const sessions = [
    { updatedAt: midnight, totalTokens: 1_200_000 },
    { updatedAt: midnight - 1, totalTokens: 9_000_000 },
    { updatedAt: NOW, totalTokens: 300 },
  ]
  assert.equal(todayTokens(sessions, NOW), 1_200_300)
  assert.equal(todayTokens([], NOW), 0)
  assert.equal(fmtTokens(999), '999')
  assert.equal(fmtTokens(1_500), '2K')
  assert.equal(fmtTokens(1_200_300), '1.2M')
  assert.equal(fmtTokens(999_700), '1.0M') // 반올림하면 1000K 가 되는 경계
  assert.equal(fmtTokens(999_400), '999K')
  // 숫자가 아닌 토큰 수는 0 으로 센다 (오늘 NaN 토큰이 뜨면 안 된다)
  assert.equal(todayTokens([{ updatedAt: NOW, totalTokens: null as unknown as number }, { updatedAt: NOW, totalTokens: 5 }], NOW), 5)
  assert.equal(fmtTokens(Number.NaN), '0')
})

test('워커: 시작하면 표시줄 두 항목을 그리고, 이벤트가 오면 띠를 고치고, 명령은 목록을 돌려준다', async () => {
  const host = mockHost({
    settings: { showTokens: true },
    results: {
      'statusBar.update': { ok: true },
      'agent.listSessions': { sessions: [{ sessionId: 's', agent: 'claude', title: 't', workspaceId: null, hostId: 'local', branch: null, createdAt: null, updatedAt: Date.now(), messageCount: 1, totalTokens: 2_500_000, running: false }], truncated: false },
    },
  })
  const worker = await mountWorker(main, { host })
  await new Promise(resolve => setTimeout(resolve, 20)) // 시작 때 부른 표시줄 갱신이 끝나기를 기다린다
  const updates = () => host.callsOf('statusBar.update') as { id: string; text?: string; tone?: string }[]
  assert.ok(updates().some(u => u.id === 'agents' && u.text === '에이전트 없음'))
  assert.ok(updates().some(u => u.id === 'tokens' && u.text === '오늘 갱신 세션 2.5M 토큰'))

  await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'p1', title: 'Orca 번역', state: 'blocked', receivedAt: Date.now() })
  const last = updates().filter(u => u.id === 'agents').at(-1)
  assert.equal(last?.text, '대기 1')
  assert.equal(last?.tone, 'warning')
  assert.match(String(await worker.command('band.list')), /^승인 대기 · Orca 번역/)

  await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'p1', state: 'done', receivedAt: Date.now() })
  assert.equal(updates().filter(u => u.id === 'agents').at(-1)?.text, '에이전트 없음')
  await worker.deactivate()
})

test('워커: 표시줄 갱신이 실패해도 던지지 않고 기록만 남긴다', async () => {
  const host = mockHost({ results: { 'statusBar.update': () => { throw new Error('boom') }, 'agent.listSessions': { sessions: [], truncated: false } } })
  const worker = await mountWorker(main, { host })
  await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'p', state: 'working', receivedAt: Date.now() })
  assert.ok(worker.logs.some(line => line.includes('failed')))
  await worker.deactivate()
})

const sessionsAnswer = { sessions: [], truncated: false }
const updatesOf = (host: ReturnType<typeof mockHost>) => host.callsOf('statusBar.update') as { id: string; text?: string; visible?: boolean }[]
const lastOf = (host: ReturnType<typeof mockHost>, id: string) => updatesOf(host).filter(u => u.id === id).at(-1)

test('설정: 기본은 에이전트 띠만 켜고 토큰은 끄며, 꺼진 토큰은 세션 목록을 읽지 않는다', async () => {
  const host = mockHost({ results: { 'statusBar.update': { ok: true }, 'agent.listSessions': sessionsAnswer } })
  const worker = await mountWorker(main, { host })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(lastOf(host, 'agents')?.visible, true)
  assert.equal(lastOf(host, 'tokens')?.visible, false)
  assert.equal(host.callsOf('agent.listSessions').length, 0)
  await worker.deactivate()
})

test('설정: 에이전트 띠를 끄면 숨기고, 이벤트가 와도 다시 보이지 않는다', async () => {
  const host = mockHost({ settings: { showAgents: false }, results: { 'statusBar.update': { ok: true }, 'agent.listSessions': sessionsAnswer } })
  const worker = await mountWorker(main, { host })
  await new Promise(resolve => setTimeout(resolve, 20))
  await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'p', state: 'blocked', receivedAt: Date.now() })
  assert.equal(lastOf(host, 'agents')?.visible, false)
  // 띠는 숨겼어도 칸은 계속 센다: 다시 켜면 바로 맞는 값이 나온다
  assert.match(String(await worker.command('band.list')), /승인 대기/)
  await worker.deactivate()
})

test('띠를 꺼도 낡은 칸은 정리되어 band.list 에 죽은 에이전트가 남지 않는다. 긴 작업(4시간 안)은 남는다', async () => {
  const host = mockHost({ settings: { showAgents: false }, results: { 'statusBar.update': { ok: true }, 'agent.listSessions': sessionsAnswer } })
  const worker = await mountWorker(main, { host })
  await new Promise(resolve => setTimeout(resolve, 20))
  const ago = (ms: number) => Date.now() - ms
  await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'long', title: '긴 빌드', state: 'working', receivedAt: ago(WORKING_STALE_MS - 60_000) })
  await worker.emit('agent.status.changed', { workspaceId: null, paneKey: 'dead', title: '죽은 칸', state: 'working', receivedAt: ago(WORKING_STALE_MS + 60_000) })
  const text = String(await worker.command('band.list'))
  assert.match(text, /긴 빌드/)
  assert.doesNotMatch(text, /죽은 칸/)
  await worker.deactivate()
})

test('세션이 한도보다 많으면 토큰 글자에 + 를 붙인다', async () => {
  const host = mockHost({
    settings: { showTokens: true },
    results: { 'statusBar.update': { ok: true }, 'agent.listSessions': { sessions: [{ sessionId: 's', agent: 'claude', title: 't', workspaceId: null, hostId: 'local', branch: null, createdAt: null, updatedAt: Date.now(), messageCount: 1, totalTokens: 1_200, running: false }], truncated: true } },
  })
  const worker = await mountWorker(main, { host })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(lastOf(host, 'tokens')?.text, '오늘 갱신 세션 1K+ 토큰')
  await worker.deactivate()
})

test('설정을 못 읽으면 기본값을 쓴다', async () => {
  const host = mockHost({ results: { 'settings.get': () => { throw new Error('unavailable') }, 'statusBar.update': { ok: true }, 'agent.listSessions': sessionsAnswer } })
  const worker = await mountWorker(main, { host })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(lastOf(host, 'agents')?.visible, true)
  assert.ok(worker.logs.some(line => line.includes('settings read failed')))
  await worker.deactivate()
})
