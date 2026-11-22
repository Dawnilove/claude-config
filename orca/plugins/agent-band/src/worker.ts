// 띠: Orca 아래쪽 상태 표시줄에 "진행 n · 대기 n"과 오늘 토큰을 보인다.
// Claude 데스크톱 앱의 입력창 띠와 결재함 개수를 Orca 로 옮긴 것이다. 카드와 단추는 못 옮긴다 (상태 표시줄은 글자뿐이다).
// 5시간·주간 사용량은 Orca 가 자기 상태 표시줄(사용량 칩)에 이미 보이므로 다시 만들지 않는다.
// 항목마다 Settings 에서 끌 수 있다. 플러그인 전체를 끄려면 Orca 의 Settings > Plugins 에서 끈다.
import type { OrcaWorkerApi } from 'orca/worker'
import { agentsLabel, apply, count, fmtTokens, listing, prune, todayTokens, type Board } from './board'

export type Flags = { showAgents: boolean; showTokens: boolean }
const DEFAULT_FLAGS: Flags = { showAgents: true, showTokens: false }

const POLL_MS = 60_000 // 토큰 합과 낡은 칸 정리는 1분마다 한다
const SESSION_LIMIT = 200

let timer: ReturnType<typeof setInterval> | undefined

const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

async function readFlags(orca: OrcaWorkerApi): Promise<Flags> {
  const [showAgents, showTokens] = await Promise.all([orca.settings.get('showAgents'), orca.settings.get('showTokens')])
  return { showAgents: flag(showAgents, DEFAULT_FLAGS.showAgents), showTokens: flag(showTokens, DEFAULT_FLAGS.showTokens) }
}

export default function activate(orca: OrcaWorkerApi): void {
  const board: Board = new Map()
  let flags: Flags = DEFAULT_FLAGS

  const update = async (params: Parameters<typeof orca.host.call<'statusBar.update'>>[1]) => {
    await orca.host.call('statusBar.update', params)
  }

  // 낡은 칸 정리는 띠를 끈 때도 돈다: band.list 가 죽은 에이전트를 "진행"으로 보이면 안 된다.
  const tidy = () => prune(board, Date.now())

  const drawAgents = async () => {
    if (!flags.showAgents) return update({ id: 'agents', visible: false })
    const { text, tone } = agentsLabel(count(board))
    return update({ id: 'agents', text, tone, visible: true })
  }

  const drawTokens = async () => {
    if (!flags.showTokens) return update({ id: 'tokens', visible: false }) // 꺼져 있으면 세션 목록을 읽지 않는다
    const { sessions, truncated } = await orca.host.call('agent.listSessions', { limit: SESSION_LIMIT })
    // 세션이 한도보다 많으면 일부를 못 센 것이라 "+"를 붙인다. 값은 오늘 갱신된 세션의 누적 토큰이다 (board.ts).
    const text = `오늘 갱신 세션 ${fmtTokens(todayTokens(sessions, Date.now()))}${truncated ? '+' : ''} 토큰`
    return update({ id: 'tokens', text, visible: true })
  }

  // 표시줄 갱신이 실패해도 에이전트 일을 막지 않는다. 기록만 남긴다.
  const safe = (what: string, run: () => Promise<void>) => run().catch(error => orca.log(`${what} failed: ${String(error)}`))
  const drawAll = () => {
    tidy()
    return Promise.all([safe('agents', drawAgents), safe('tokens', drawTokens)]).then(() => undefined)
  }
  const refresh = () =>
    readFlags(orca).then(
      next => { flags = next },
      error => orca.log(`settings read failed: ${String(error)}`)
    )

  orca.events.on('agent.status.changed', change => {
    apply(board, change)
    tidy()
    return safe('agents', drawAgents)
  })
  orca.commands.register('band.list', () => {
    tidy()
    return listing(board, Date.now())
  })
  orca.settings.onDidChange(() => void refresh().then(drawAll))

  void refresh().then(drawAll)
  timer = setInterval(() => void drawAll(), POLL_MS)
}

export function deactivate(): void {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}
