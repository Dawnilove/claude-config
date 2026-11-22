// 띠의 계산. 입출력이 없는 순수 함수만 둔다 (worker.ts 가 이벤트를 받아 부르고 상태 표시줄에 쓴다).
// Orca 의 상태 값: working = 일하는 중, blocked = 권한 승인이 필요함, waiting = 에이전트가 사용자의 답을 기다림, done = 턴이 끝남.

export type AgentState = 'working' | 'blocked' | 'waiting' | 'done'
export type Entry = { state: Exclude<AgentState, 'done'>; title: string; at: number }
export type Board = Map<string, Entry>
export type Change = { paneKey: string; title?: string; state: AgentState; receivedAt: number }
export type Tone = 'neutral' | 'warning'

// 이벤트가 끊긴 칸을 정리한다. 앱을 닫거나 창을 닫으면 done 이 안 올 수 있다.
// 상태가 바뀔 때만 이벤트가 오므로 긴 작업(빌드, 긴 추론)은 한참 조용하다. 너무 짧으면 일하는 칸이 사라진다.
export const WORKING_STALE_MS = 4 * 60 * 60 * 1000 // 4시간 넘게 소식이 없는 "진행 중"은 죽은 칸으로 본다
export const WAITING_STALE_MS = 24 * 60 * 60 * 1000 // 사용자를 기다리는 칸은 하루까지 둔다

/** 이벤트 하나를 칸에 반영한다. done 은 칸을 지운다 (끝난 세션은 띠에 두지 않는다). */
export function apply(board: Board, change: Change): void {
  if (change.state === 'done') {
    board.delete(change.paneKey)
    return
  }
  board.set(change.paneKey, { state: change.state, title: change.title ?? board.get(change.paneKey)?.title ?? '', at: change.receivedAt })
}

export function prune(board: Board, now: number): void {
  for (const [key, e] of board) {
    const limit = e.state === 'working' ? WORKING_STALE_MS : WAITING_STALE_MS
    if (now - e.at > limit) board.delete(key)
  }
}

export type Counts = { working: number; blocked: number; waiting: number }

export function count(board: Board): Counts {
  const n: Counts = { working: 0, blocked: 0, waiting: 0 }
  for (const e of board.values()) n[e.state] += 1
  return n
}

/** 상태 표시줄 글자. 사용자를 기다리는 칸(승인 + 답변)이 있으면 경고색이다. */
export function agentsLabel(c: Counts): { text: string; tone: Tone } {
  const waits = c.blocked + c.waiting
  if (c.working + waits === 0) return { text: '에이전트 없음', tone: 'neutral' }
  const parts = [c.working > 0 ? `진행 ${c.working}` : '', waits > 0 ? `대기 ${waits}` : ''].filter(Boolean)
  return { text: parts.join(' · '), tone: waits > 0 ? 'warning' : 'neutral' }
}

const STATE_LABEL: Record<Entry['state'], string> = { working: '진행', blocked: '승인 대기', waiting: '답변 대기' }

/** 눌렀을 때 보이는 목록. 사용자를 기다리는 칸을 위에 둔다. */
export function listing(board: Board, now: number): string {
  if (board.size === 0) return '진행 중이거나 기다리는 에이전트가 없다.'
  const order: Record<Entry['state'], number> = { blocked: 0, waiting: 1, working: 2 }
  return [...board.values()]
    .sort((a, b) => order[a.state] - order[b.state] || b.at - a.at)
    .map(e => `${STATE_LABEL[e.state]} · ${e.title || '(이름 없음)'} · ${minutes(now - e.at)}`)
    .join('\n')
}

const minutes = (ms: number): string => (ms < 60_000 ? '방금' : `${Math.floor(ms / 60_000)}분 전`)

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1_000) return String(Math.round(n))
  // 반올림한 값이 1000K 이상이면 M 으로 쓴다 (999,700 → "1000K" 가 아니라 "1.0M")
  return Math.round(n / 1_000) >= 1_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1_000)}K`
}

type Session = { updatedAt: number; totalTokens: number }

/**
 * 오늘(로컬 자정 이후) 갱신된 세션의 토큰 합. totalTokens 는 그 세션의 누적 전체라서,
 * 며칠 전에 시작한 세션을 오늘 이어 쓰면 그 누적이 모두 들어간다 (오늘 늘어난 양이 아니다).
 * 숫자가 아닌 값은 0 으로 센다.
 */
export function todayTokens(sessions: readonly Session[], now: number): number {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return sessions
    .filter(s => s.updatedAt >= midnight.getTime())
    .reduce((sum, s) => sum + (Number.isFinite(s.totalTokens) ? s.totalTokens : 0), 0)
}
