// band (옛 relay-band): 입력창 위의 통합 띠 한 줄. 맨 왼쪽 고양이 옆에 결재·알림·확인 개수 단추가 온다.
//   검증 │ 하위 N │ 컨텍스트 % │ 주 % · 오늘 x/y │ 턴 │ 비용 │ 캐시 │ 날씨·추이 │ 페이스
// 창이 좁으면 우선순위가 낮은 칸(번호가 큰 것)부터 숨긴다.
// 호스트가 소스에서 on(...) 과 $.noun.method(...) 를 읽으므로 literal 로 쓰고, $ 를 받는 도우미는 최상위 함수로 둔다.

import type { Register } from 'claude-code'

import { CAT, fmtDur } from './art'
import { BAND_LEVEL, GROUP_NAMES, MIN_CELL_W, askPillSvg, bandStats, bandSvg, catAvatar, panelHead, panelPics, sizeOf, svgDoc } from './band-ui'
import type { Pic, Rich, Tone } from './band-ui'
import { GAP, HOST, color, hostButtonPx, hostTextPx } from './tokens'

export { askPillSvg, bandSvg } from './band-ui' // 시험이 이 모듈에서 읽는다

const DAY = 86_400_000
// ponytail 줄의 안쪽 여백에 맞추는 들여쓰기 칸 수(데스크톱 화면만). 화면에서 보고 어긋나면 이 값만 바꾼다.
// 0: 바와 격자가 띠 틀 폭을 꽉 채운다. 띠는 플러그인마다 따로 묻는 줄이라 ponytail 줄과 한 상자에 있지 않다
const INDENT = 0
// shortcut: ponytail 띠가 이미 비용을 보여줘서 뺐다. ponytail 없이 쓰면 true 로 바꾼다.
const SHOW_COST = false
const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const CACHE_MINUTES = 60
const TSC_TIMEOUT_MS = 45_000
// shortcut: 쉬는 날 가중치를 상수로 박았다. 사람마다 다르면 userConfig 로 올린다.
const WEIGHT_WEEKEND = 0.3

type Verify = { state: 'ok' | 'fail' | 'skip'; text: string } | null
// level: 이상 없음은 비우고, 이상은 warn/err, 진행 중은 info, 흐리게 둘 값은 mute.
type Level = 'info' | 'warn' | 'err' | 'ok' | 'mute'
// bar: 0~100 사용률이면 값 앞에 6칸 게이지를 그린다.
type Seg = { prio: number; label?: string; bar?: number; value: string; level?: Level }
const LEVEL_COLOR: Record<string, string> = { ok: 'success', info: 'suggestion', warn: 'warning', err: 'error' }
const GAUGE = 6
export const gauge = (p: number): [string, string] => {
  const n = Math.max(0, Math.min(GAUGE, Math.round((p / 100) * GAUGE)))
  return ['▰'.repeat(n), '▱'.repeat(GAUGE - n)]
}
const segText = (s: Seg) => [s.label, s.bar === undefined ? '' : gauge(s.bar).join(''), s.value].filter(Boolean).join(' ')
const isAlert = (s: Seg) => s.level === 'warn' || s.level === 'err'
// 색만으로 말하지 않도록 이상 값 앞에 기호를 붙인다.
const mark = (level: Level | undefined, v: string) => (level === 'err' ? `✗ ${v}` : level === 'warn' ? `⚠ ${v}` : v)

let verify: Verify = null
let verifying = false
let edited = new Set<string>()
let turnStartedAt = 0
let lastTurnSec: number | null = null
let lastAnswerAt = 0
let children = 0
// 사용자를 기다리는 세션 수(결재·알림·확인). 띠의 고양이 옆에 단추로 보인다
const NO_ASKS = { request: 0, notice: 0, report: 0 }
let asks = NO_ASKS
// 고양이 옆 개수 단추: 급한 순서, 테마의 뜻 색. 누르면 세션 보드 패널을 연다
const ASK_KINDS = [
  { key: 'request', label: '결재', color: 'error', level: 'err' },
  { key: 'notice', label: '알림', color: 'warning', level: 'warn' },
  { key: 'report', label: '확인', color: 'success', level: 'ok' },
] as const
let context: { percent: number; tokens: number; window: number } | null = null
let costUsd: number | null = null
let week: { percent: number; resetsAt?: string } | null = null
let dayBase: { date: string; reset: string; percent: number } | null = null
let history: number[] = []
let ticker: { cancel: () => void } | null = null
let lastUsageAt = 0
let limitKinds: string[] = [] // 진단용: 엔진이 알려 준 한도 창의 종류
let showDetail = false // "세부 ▾" 펼침 상태
let animateNext = false // 펼친 뒤 첫 그리기에서만 칸이 들어온다. 5초 갱신·측정으로 다시 그려도 반복하지 않는다
// 펼친 격자는 바와 한 상자다. 묶음 탭(앱 단추) 5개 중 하나를 고르면 그 묶음 칸을 보인다.
// 쪽 넘김과 휠(ui.scroll)은 쓰지 않는다: 실제 화면에서 휠은 한쪽으로만 넘어갔다. 탭은 눈에 보이는 단추라 늘 된다
let panelGroup = 0 // 고른 묶음 (한도·토큰·비용·시간·작업·품질)
// 작업·품질 묶음의 항목 (모드가 로드된 뒤부터 센다. /reload-plugins 뒤에는 0 부터)
let tools = { calls: 0, errors: 0, denies: 0, by: {} as Record<string, number> } // tool.call: 도구 이름, 결과 isError·deny (하위 에이전트 포함)
let edits = { files: new Set<string>(), added: 0, removed: 0 } // Edit·Write·MultiEdit 입력의 줄 수 (Write 는 쓴 줄만 셈)
let compacts = { auto: 0, manual: 0 } // session.compact 의 trigger
let asked = 0 // tool.check 결정이 ask 인 수 (사용자에게 승인을 물음)
let modelNow: string | null = null // turn.step 의 model (본 에이전트)
let aborted = 0 // turn.complete 의 isAborted (본 에이전트)
let subTokens = 0 // 하위 에이전트 turn.complete 의 usage 합 (새 입력 + 캐시 쓰기 + 출력)
// OpenSpec 진행률(그 작업이 몇 퍼센트 끝났는지):
// <세션 cwd>/openspec/changes/*/tasks.md (archive 제외)의 체크 수 / 전체 체크 수. 세션 시작, 본 에이전트 턴 끝, 30초마다 읽는다.
// worktree 세션은 자기 브랜치의 openspec/ 을 본다(main 과 다를 수 있다): 그래서 브랜치를 함께 보인다
let spec: SpecState | null = null
let specTicks = 0
const SPEC_EVERY = 6 // tick(5초) x 6 = 30초
const SPEC_MAX_BYTES = 256 * 1024 // 이보다 큰 tasks.md 는 읽지 않는다
// 펼친 격자의 항목과 원천. 원천이 값을 주지 않으면 칸은 빈 상태("아직 값 없음")로 남는다
let five: { percent: number; resetsAt?: string } | null = null // 5시간 한도: $.session.usage().rateLimits 의 five_hour
let startedAt = 0 // 세션 시작: $.session.usage().startedAt
let turnCount: number | null = null // 턴 수: $.session.turns()
let hits: number[] = [] // 캐시 적중률: turn.complete 의 usage (cache_read / (input + cache_read + cache_creation))
let turnTokens: TurnTokens[] = [] // 턴 토큰: turn.complete 의 usage (새 입력 · 캐시 읽기 · 캐시 쓰기 · 출력)
let costs: number[] = [] // 턴 비용: $.session.usage().cost.usd 의 턴 사이 차이
let lastCost: number | null = null
let secs: number[] = [] // 턴 시간: prompt.submit ~ turn.complete 의 $.clock.now() 차이
let verifies: ('ok' | 'warn' | 'err')[] = [] // 검증: runVerify 결과
let agentCounts: { running: number; waiting: number; done: number; failed: number } | null = null // 하위 에이전트: $.agent.list() 의 상태별 수
// rulegate(명령 판정 훅) 관찰: 이 세션의 decisions.jsonl. 상태 폴더 설정(userConfig rulegateStateDir)이 비었거나 이 세션 기록이 없으면 null 이고 칸은 나오지 않는다
let rules: { block: number; ask: number; warn: number } | null = null
let sessionId = ''
let rulegateDir = '' // <폴더>/<session_id>/decisions.jsonl 을 읽는다. 비어 있으면 읽지 않는다
// 노력 수준 제안. 띠는 제안만 한다. 수준은 사용자가 바꾼다
let effortNow: string | undefined // 이 세션 본 에이전트의 지금 수준 (turn.step)
let effortNeed: string | null = null // Claude 가 답에서 말한 필요한 수준. 새로 말할 때까지 남긴다
// 컨텍스트가 이만큼 차면 띠에 "인계 ▸" 단추를 둔다. 세션을 짧게 끊고 HANDOFF.md 로 넘기는 규칙을 지키기 쉽게
const HANDOFF_AT = 50
let handoff: 'idle' | 'sent' | 'running' = 'idle' // 인계 단추가 보낸 /handoff 의 진행
const showHandoff = () => handoff === 'idle' && (context?.percent ?? 0) >= HANDOFF_AT

const LEVELS = 'low|medium|high|xhigh|max'
// "~ medium이 맞다", "~ medium이 필요하다", "필요 수준: medium". 지금 수준만 말한 문장("노력 수준은 low다")은 읽지 않는다
const NEED = new RegExp(`(?:\\b(${LEVELS})\\b\\s*(?:이|가)?\\s*(?:맞다|필요하다))|(?:필요 수준\\s*[:은는]?\\s*(${LEVELS})\\b)`, 'g')
/** 답변에서 Claude 가 말한 필요한 노력 수준. 여럿이면 마지막(가장 최근 제안). 말하지 않았으면 null. */
export function neededEffort(answer: string): string | null {
  const m = [...answer.replace(/\*/g, '').matchAll(NEED)].at(-1)
  return m ? (m[1] ?? m[2]) : null
}
/** 필요 수준과 지금 수준이 다를 때만 알약 글자. */
export function effortHint(need: string | null, now: string | undefined): string | null {
  return need !== null && now !== undefined && need !== now ? `⚠ 수준 ${now}→${need}` : null
}

// 세션 보드 플러그인의 모듈이다. 다른 플러그인이면 띠 단추가 패널을 직접 못 열고 명령을 거쳐서 대화에 명령 줄이 남았다 (2026-11-16 사용자 보고)
// 한 모듈은 같은 이벤트를 조건 없이 두 번 걸 수 없다. 그래서 session.start·prompt.submit·agent.spawn·turn.complete 의 일은 아래 함수로 두고 세션 보드 훅이 부른다

// 결재·알림·확인 개수. 세션 보드(register.ts)가 메모리의 기록으로 센 값을 준다(예전처럼 기록 파일을 따로 읽어 같은 판정을 다시 하지 않는다)
let askCounter: () => { request: number; notice: number; report: number } = () => NO_ASKS
// 세션 보드 패널이 닫혀 있는가. 닫혀 있으면 띠 안에 여는 단추를 둔다(예전에는 세션 보드가 띠 위에 따로 한 줄을 그렸다)
let isBoardClosed: () => boolean = () => false
// 띠가 패널을 연 뒤 세션 보드에 알린다. 알리지 않으면 세션 보드는 계속 닫힌 줄 알아 "세션 ▸" 가 남는다
let markBoardOpen: () => void = () => undefined
export function setAskCounter(count: () => { request: number; notice: number; report: number }, closed: () => boolean, opened: () => void) {
  askCounter = count
  isBoardClosed = closed
  markBoardOpen = opened
}

/** 세션이 시작할 때: 5초 타이머를 걸고 사용량을 읽는다. */
export async function bandStart($: any) {
  ticker?.cancel()
  ticker = $.clock.every(5000, () => tick($))
  try {
    applyUsage(await $.session.usage())
    lastCost = costUsd // 턴 비용은 이 값과의 차이로 센다
    await trackDay($)
  } catch {
    // 사용량을 아직 못 읽어도 띠는 나머지 칸으로 뜬다
  }
  await refreshSpec($) // OpenSpec 진행률: 세션 시작
  $.ui.invalidate('ui.render')
}

/** 사용자가 입력했다: 턴 시간을 재기 시작한다. 인계 단추가 보낸 /handoff 가 시작되면 표시한다. */
export async function bandPrompt($: any, e?: any) {
  turnStartedAt = await $.clock.now()
  // 엔진이 명령을 펼쳐 넘겨도 알아보게, 플러그인이 보낸 프롬프트도 인정한다 (펼친 글은 /handoff 로 시작하지 않을 수 있다)
  if (handoff === 'sent' && (e?.origin?.kind === 'plugin' || String(e?.text ?? '').trim().startsWith('/handoff'))) handoff = 'running'
}

/** 인계 단추: 한 번 누르면 그 /handoff 턴이 끝날 때까지 숨긴다. 작업 중에 누르면 줄을 서서 반응이 늦어 다시 누르기 쉽다 */
function sendHandoff($: any) {
  handoff = 'sent'
  $.ui.invalidate('ui.render')
  $.prompt.submit({ text: '/handoff' }).catch(() => {
    handoff = 'idle'
    $.ui.invalidate('ui.render')
  })
}

/** 하위 에이전트가 시작했다: 하위 수를 다시 센다. */
export async function bandTick($: any) {
  await tick($)
}

/** 턴이 끝났다: 턴 시간·캐시를 적고, 고친 파일을 검증한다. 하위 에이전트의 턴은 건너뛴다. */
export async function bandTurnDone($: any, e: any) {
  if (e.agentId) return
  effortNeed = neededEffort(String(e.answer ?? '')) ?? effortNeed
  if (handoff === 'running') handoff = 'idle'
  const now = await $.clock.now()
  lastTurnSec = Math.round((now - turnStartedAt) / 1000)
  lastAnswerAt = now
  if (context) history = [...history, context.percent].slice(-HISTORY)
  if (turnStartedAt > 0) secs = [...secs, lastTurnSec].slice(-HISTORY)
  if (e?.isAborted === true) aborted += 1
  const u = turnUsage(e.usage)
  if (u) {
    turnTokens = [...turnTokens, { fresh: u.fresh, read: u.read, write: u.write, output: u.output }].slice(-HISTORY)
    if (u.hit !== null) hits = [...hits, u.hit].slice(-HISTORY)
  }
  try {
    applyUsage(await $.session.usage())
    if (costUsd !== null && lastCost !== null) costs = [...costs, Math.max(0, costUsd - lastCost)].slice(-HISTORY)
    lastCost = costUsd
  } catch {
    // 사용량을 못 읽으면 이번 턴 비용은 빼고 넘어간다
  }
  const files = [...edited].filter(f => f !== '')
  edited = new Set()
  if (files.length > 0) {
    verifying = true
    $.ui.invalidate('ui.render')
    try {
      verify = await runVerify($, files)
    } finally {
      verifying = false
    }
    if (verify) verifies = [...verifies, verify.state === 'ok' ? ('ok' as const) : verify.state === 'fail' ? ('err' as const) : ('warn' as const)].slice(-HISTORY)
  } else {
    verify = null
  }
  await refreshSpec($) // OpenSpec 진행률: 본 에이전트 턴 끝 (턴에서 tasks.md 를 고쳤을 수 있다)
  await tick($)
}

export type TurnTokens = { fresh: number; read: number; write: number; output: number }
/**
 * 턴 하나의 토큰 (turn.complete 의 usage): 새 입력(input_tokens) · 캐시 읽기 · 캐시 쓰기 · 출력을 나눈다.
 * 캐시 읽기를 입력에 더하면 값이 부푼다(949.8k 처럼). 적중률은 입력 전체 중 캐시 읽기 몫(%). usage 가 없으면 null.
 */
export function turnUsage(u: any): (TurnTokens & { hit: number | null }) | null {
  if (!u || typeof u !== 'object') return null
  const t = { fresh: Number(u.input_tokens) || 0, read: Number(u.cache_read_input_tokens) || 0, write: Number(u.cache_creation_input_tokens) || 0, output: Number(u.output_tokens) || 0 }
  const input = t.fresh + t.read + t.write
  return { ...t, hit: input > 0 ? (100 * t.read) / input : null }
}

/** 하위 에이전트 상태별 수 ($.agent.list()). 실행 = running·pending, 대기 = 그 밖의 살아 있는 상태, 완료 = completed, 실패 = failed·killed. */
export function countAgents(list: { status?: string }[]): { running: number; waiting: number; done: number; failed: number } {
  const c = { running: 0, waiting: 0, done: 0, failed: 0 }
  for (const a of list) {
    const s = String(a.status ?? '')
    if (s === 'running' || s === 'pending') c.running += 1
    else if (s === 'completed') c.done += 1
    else if (s === 'failed' || s === 'killed') c.failed += 1
    else c.waiting += 1
  }
  return c
}

/** rulegate 판정 수 (decisions.jsonl 한 줄 = 판정 하나). 막음 = deny·held, 물음 = ask·ask-shadowed, 경고 = warn. 조각 주입(inject)은 세지 않는다. */
export function countRules(text: string): { block: number; ask: number; warn: number } {
  const r = { block: 0, ask: 0, warn: 0 }
  for (const line of text.split('\n')) {
    const d = /"decision":"([a-z-]+)"/.exec(line)?.[1]
    if (d === 'deny' || d === 'held') r.block += 1
    else if (d === 'ask' || d === 'ask-shadowed') r.ask += 1
    else if (d === 'warn') r.warn += 1
  }
  return r
}

/** 이 세션의 rulegate 판정을 읽는다. 폴더 설정이 없거나 이 세션 기록이 없으면 rules 는 null 이고 칸은 나오지 않는다. */
async function readRules($: any) {
  try {
    if (!rulegateDir) {
      rules = null
      return
    }
    if (!sessionId) sessionId = await $.session.id()
    rules = countRules(await $.fs.read(`${rulegateDir}/${sessionId}/decisions.jsonl`))
  } catch {
    rules = null
  }
}

/** 띠 안쪽 폭(px): bodyColumns 와 테두리 상자의 안쪽 여백을 HOST 보정값으로 바꾼다 */
export const innerPx = (bodyColumns: number) => bodyColumns * HOST.colPx - HOST.framePadX * 2

/**
 * 묶음 칸의 폭(px): 격자 폭(안쪽 폭 - 좌우 묶음 간격)을 n 칸과 칸 사이 묶음 간격으로 나눈다. 칸 줄은 양쪽정렬(space-between)이라
 * 이 어림이 실제보다 조금 작아도 남는 폭은 칸 사이로만 가고 양 끝은 맞는다. 넘치지 않게 SAFETY 만큼 작게 잡는다
 */
const SAFETY = 8
export const cellWidth = (bodyColumns: number, n: number) => Math.floor((innerPx(bodyColumns) - GAP.group * 2 - GAP.group * (n - 1) - SAFETY) / n)

/** 묶음 칸의 열 수: 칸 4개가 최소 폭(MIN_CELL_W) 이상이면 4열 1줄, 아니면 2열 2줄 */
export const gridCols = (bodyColumns: number) => (cellWidth(bodyColumns, 4) >= MIN_CELL_W ? 4 : 2)

// 세부 단추의 글자: 짧게 두고 상태를 말한다 (긴 "세부 지표 접기" 는 띠 밖으로 넘쳤다)
export const DETAIL_TEXT = { closed: '세부 ▾', open: '접기 ▴' } as const
const NBSP = ' '
export const HEAD_MIN = 200 // 탭과 한 줄일 때 머리글("세션 지표" + 값의 나이)이 들어갈 최소 폭
export const TABS_H = HOST.buttonH // 탭 줄의 높이 (단추)
export const TAB_GAP = GAP.item * 2 // 탭 단추 사이 8px: 칸 사이(묶음 12)보다 작다
/** 탭 글자: 고른 탭만 "● " 를 붙인다 (색 없이도 고른 탭이 드러난다) */
export const tabLabelsFor = (selected: number) => GROUP_NAMES.map((name, i) => (i === selected ? `● ${name}` : name))

export type BarOpts = { kinds: { level: 'err' | 'warn' | 'ok'; n: number; label: string }[]; open: string; hint: string | null; handoff: boolean; detail: string }
export type BarPlan = {
  inner: number
  left: number
  right: number
  pills: { svg: string; w: number; h: number; alt: string }[]
  open: string
  hint: string | null
  handoff: boolean
  handoffLabel: string
  detail: string
  band: { svg: string; w: number; hidden: number; level: number } | null
  twoLine: boolean // 여러 줄: 첫 줄 = 고양이 + 지표 그림, 다음 줄 = (경고 칩 줄) + 배지·단추
  chips: { svg: string; w: number } | null // 경고 칩이 첫 줄에 안 들어가 따로 한 줄로 내린 그림 (여러 줄일 때만)
  rows: number[] // 줄마다 쓴 폭(px). 모두 inner 이하여야 한다 (배치 불변식 시험)
}
export const HANDOFF_TEXT = { full: '인계 ▸', short: '인계' } as const
const CAT_W = GAP.group + 36 + GAP.item * 2 // 앞 여백 + 고양이 + 고양이 뒤 간격
const PILLS = new Map<string, ReturnType<typeof askPillSvg>>() // 배지 그림: 종류·개수가 같으면 다시 만들지 않는다 (barPlan 이 여러 번 잰다)
const pillOf = (level: 'err' | 'warn' | 'ok', n: number) => {
  const key = `${level}:${n}`
  let p = PILLS.get(key)
  if (!p) PILLS.set(key, (p = askPillSvg(level, n)))
  return p
}
/**
 * 접힌 바의 배치(px, HOST 보정값). 시작 구역 = 고양이 + 배지 + 여는 단추, 가운데 = 지표 그림, 끝 구역 = 노력 힌트 + 인계 + 세부.
 * 필수 세 항목(컨텍스트·주간·작업)은 어떤 폭에서도 빼지 않는다. 줄이는 순서:
 * 1) 가운데의 덜 중요한 칸: 오늘 → 턴 → 캐시 → 검증(통과)  2) 끝 구역: 노력 힌트 → 배지 합치기 → 인계 글자 줄이기
 * 3) 필수 세 항목 짧게(bandSvg 5~9)  4) 그래도 모자라면 두 줄: 첫 줄에 고양이와 지표, 둘째 줄에 배지와 단추.
 */
export function barPlan(bodyColumns: number, d: Rich, o: BarOpts): BarPlan {
  const inner = innerPx(bodyColumns)
  const sides = [
    { hint: true, merge: false, short: false },
    { hint: false, merge: false, short: false },
    { hint: false, merge: true, short: false },
    { hint: false, merge: true, short: true },
  ]
  const order = { err: 0, warn: 1, ok: 2 } as const
  const sideOf = (s: (typeof sides)[number], withCat: boolean) => {
    const kinds = s.merge && o.kinds.length > 1 ? [{ level: [...o.kinds].sort((p, q) => order[p.level] - order[q.level])[0]!.level, n: o.kinds.reduce((t, k) => t + k.n, 0), label: o.kinds.map(k => `${k.label} ${k.n}`).join(' · ') }] : o.kinds
    const pills = kinds.map(k => ({ ...pillOf(k.level, k.n), alt: s.merge && o.kinds.length > 1 ? k.label : `${k.label} ${k.n}` }))
    const hint = s.hint ? o.hint : null
    const handoffLabel = s.short ? HANDOFF_TEXT.short : HANDOFF_TEXT.full
    const left = (withCat ? CAT_W : GAP.group) + pills.reduce((t, p) => t + p.w + GAP.item, 0) + (o.open ? hostButtonPx(o.open) + GAP.item * 2 : 0)
    const right = (hint ? Math.ceil(hostTextPx(hint)) + GAP.group : 0) + (o.handoff ? hostButtonPx(handoffLabel) + GAP.item * 2 : 0) + hostButtonPx(o.detail) + GAP.group
    return { pills, hint, handoffLabel, left, right }
  }
  const plan = (s: ReturnType<typeof sideOf>, band: BarPlan['band'], twoLine: boolean, rows: number[], chips: BarPlan['chips'] = null): BarPlan => ({ inner, left: s.left, right: s.right, pills: s.pills, open: o.open, hint: s.hint, handoff: o.handoff, handoffLabel: s.handoffLabel, detail: o.detail, band, twoLine, chips, rows })
  // 배치를 고를 때는 폭만 재고(measure), 고른 단계의 그림만 만든다
  const draw = (m: { level: number }, maxW: number, part: 'all' | 'metrics' | 'chips' = 'all') => bandSvg(d, maxW, true, [m.level, m.level], part)
  // 한 줄: (덜 중요한 칸 줄이기, 끝 구역 그대로) → (끝 구역 줄이기) → (필수 세 항목 짧게)
  const tries: [number, [number, number]][] = [[0, [0, BAND_LEVEL.othersLast]], [1, [BAND_LEVEL.othersLast, BAND_LEVEL.othersLast]], [2, [BAND_LEVEL.othersLast, BAND_LEVEL.othersLast]], [3, [BAND_LEVEL.othersLast, BAND_LEVEL.othersLast]], [3, [BAND_LEVEL.othersLast + 1, BAND_LEVEL.last]]]
  for (const [si, range] of tries) {
    const s = sideOf(sides[si]!, true)
    const room = inner - s.left - s.right - GAP.group // 가운데 그림과 끝 구역 사이도 묶음 간격 이상
    const m = bandSvg(d, room, true, range, 'all', true)
    if (m.fits) {
      const band = draw(m, room)
      return plan(s, band, false, [s.left + band.w + GAP.group + s.right])
    }
  }
  // 여러 줄: 첫 줄은 고양이 + 지표 그림(빈 자리가 넓어 다시 0 단계부터), 다음 줄은 배지·단추(끝 구역도 다시 처음부터 줄인다).
  // 경고 칩이 첫 줄에 안 들어가면 칩만 따로 한 줄로 내린다(경고 칩은 어떤 폭에서도 빼지 않는다)
  const room1 = inner - CAT_W - GAP.group
  const whole = bandSvg(d, room1, true, [0, BAND_LEVEL.last], 'all', true)
  const band = whole.fits ? draw(whole, room1) : draw(bandSvg(d, room1, true, [0, BAND_LEVEL.last], 'metrics', true), room1, 'metrics')
  const chipM = whole.fits ? null : bandSvg(d, inner - GAP.group * 2, true, [0, BAND_LEVEL.last], 'chips', true)
  const chipRow = chipM && chipM.w > GAP.group + SPACE_MIN ? draw(chipM, inner - GAP.group * 2, 'chips') : null
  const chips = chipRow ? { svg: chipRow.svg, w: chipRow.w } : null
  for (const si of [0, 1, 2, 3]) {
    const s = sideOf(sides[si]!, false)
    if (s.left + s.right <= inner || si === 3) return plan(s, band, true, [CAT_W + band.w + GAP.group, ...(chips ? [GAP.group + chips.w + GAP.group] : []), s.left + s.right], chips)
  }
  throw new Error('unreachable')
}
const SPACE_MIN = 8 // 칩이 하나도 없을 때의 빈 그림 폭(앞 여백 12 + 뒤 8) 을 넘어야 칩 줄을 만든다

/** 펼친 줄 수(Edit·MultiEdit 는 바꾼 글의 줄, Write 는 쓴 줄). 늘어난 줄 = 새 글, 줄어든 줄 = 옛 글 (근사: 같은 줄을 다시 쓰면 둘 다 센다) */
export function editLines(tool: string, input: any): { added: number; removed: number } {
  const lines = (s: unknown) => (typeof s === 'string' && s !== '' ? s.split('\n').length : 0)
  if (tool === 'Write') return { added: lines(input?.content), removed: 0 }
  const list: any[] = tool === 'MultiEdit' ? (Array.isArray(input?.edits) ? input.edits : []) : [input]
  return list.reduce((n, x) => ({ added: n.added + lines(x?.new_string), removed: n.removed + lines(x?.old_string) }), { added: 0, removed: 0 })
}

/**
 * 주간 한도의 리셋 때 예상(%): 이번 주에 지금까지 쓴 속도로 리셋까지 이어 긋는다(추정, 화면에 "약").
 * 주의 시작 = 리셋 - 7일. 지난 시간이 12시간 미만이면 흔들려서 내지 않는다. 100 을 넘으면 100 이 아니라 그대로 보인다(넘침을 말한다).
 */
export function weekProjection(percent: number, resetMs: number, now: number): number | null {
  if (!Number.isFinite(resetMs)) return null
  const elapsed = now - (resetMs - 7 * DAY)
  if (elapsed < DAY / 2 || resetMs <= now) return null
  return Math.round((percent * 7 * DAY) / elapsed)
}

export type SpecState = { changes: { name: string; done: number; total: number }[]; branch: string | null; root: string }
/** tasks.md 한 개의 체크 수: `- [x]`(또는 `* [X]`) 는 끝남, `- [ ]` 는 남음. 들여쓴 하위 항목도 센다 */
export function countTasks(text: string): { done: number; total: number } {
  const done = text.match(/^\s*[-*] \[[xX]\]/gm)?.length ?? 0
  return { done, total: done + (text.match(/^\s*[-*] \[ \]/gm)?.length ?? 0) }
}
/** git 브랜치 이름: .git/HEAD 의 "ref: refs/heads/x". worktree 는 .git 파일의 "gitdir: <경로>" 를 따라간다. 모르면 null */
async function branchOf($: any, root: string): Promise<string | null> {
  const head = async (gitDir: string) => /^ref: refs\/heads\/(.+)$/m.exec(await $.fs.read(`${gitDir}/HEAD`))?.[1]?.trim() ?? null
  try {
    return await head(`${root}/.git`)
  } catch {
    try {
      const dir = /^gitdir: (.+)$/m.exec(await $.fs.read(`${root}/.git`))?.[1]?.trim()
      return dir ? await head(dir) : null
    } catch {
      return null
    }
  }
}
/**
 * 진행 중인 OpenSpec change 들을 읽는다. tasks.md 에 체크 항목이 하나도 없으면 그 change 는 뺀다. change 가 없으면 spec = null:
 * 접힌 바의 "작업" 은 숨기고, 세부 칸에는 이유를 쓴다(specEmpty): 폴더에 OpenSpec 이 없는지, 진행 중 change 가 없는지
 * (숨김이 "기능이 사라졌다" 로 보이지 않게)
 */
export async function refreshSpec($: any): Promise<SpecState | null> {
  await readSpec($)
  return spec
}
/** spec 이 null 인 이유 (세부 칸 근거) */
export const specEmptyReason = () => specEmpty
let specEmpty = '아직 값 없음'
async function readSpec($: any): Promise<void> {
  try {
    const root = String(await $.session.cwd()).replace(/\\/g, '/')
    const dir = `${root}/openspec/changes`
    const changes: SpecState['changes'] = []
    const entries: any[] | null = await $.fs.list(dir).catch(() => null)
    specEmpty = entries === null ? `이 폴더에 OpenSpec 없음 (${root})` : '진행 중 change 없음'
    for (const entry of entries ?? []) {
      if (entry.kind !== 'dir' || entry.name === 'archive') continue
      const file = `${dir}/${entry.name}/tasks.md`
      const size = await $.fs.stat(file).then((s: any) => Number(s?.size ?? 0)).catch(() => -1)
      if (size < 0 || size > SPEC_MAX_BYTES) continue
      const c = countTasks(await $.fs.read(file).catch(() => ''))
      if (c.total > 0) changes.push({ name: entry.name, ...c })
    }
    spec = changes.length > 0 ? { changes: changes.sort((p, q) => p.name.localeCompare(q.name)), branch: await branchOf($, root), root } : null
  } catch {
    spec = null
    specEmpty = 'OpenSpec 을 읽지 못함'
  }
}

// 아래 셋은 register.ts 의 훅이 부른다: 한 모드에는 matcher 없는 같은 이벤트 훅을 하나만 둘 수 있다 (엔진 규칙)
/** 작업 묶음: 도구 호출 하나가 끝났다(하위 에이전트 포함). 이름·실패·거부, 편집한 파일과 줄 수를 센다 */
export function bandToolDone(e: any, ran: any) {
  const name = String(e?.tool ?? '')
  tools.calls += 1
  tools.by[name] = (tools.by[name] ?? 0) + 1
  if (ran?.deny !== undefined) tools.denies += 1
  else if (ran?.isError === true) tools.errors += 1
  else if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') {
    const l = editLines(name, e)
    edits.files.add(String(e?.file_path ?? ''))
    edits.added += l.added
    edits.removed += l.removed
  }
}
/** 품질 묶음: 사용자에게 승인을 물은 도구 호출 (tool.check 결정 ask). 승인이 끝난 때를 알리는 이벤트가 없어 대기 시간은 재지 않는다 */
export function bandToolCheck(result: any) {
  if (result?.decision === 'ask') asked += 1
}
/** 작업 묶음: 하위 에이전트의 턴이 끝났다. 쓴 토큰(새 입력 + 캐시 쓰기 + 출력)을 더한다 */
export function bandSubTurn(e: any) {
  const u = turnUsage(e?.usage)
  if (u) subTokens += u.fresh + u.write + u.output
}

/** "세부 ▾" 단추: 펼치면 그 순간에만 칸이 들어오는 움직임을 주고, 펼친 동안 쓰는 값(판정 수, 턴 수)을 곧바로 읽는다. */
function toggleDetail($: any) {
  showDetail = !showDetail
  animateNext = showDetail
  $.ui.invalidate('ui.render')
  if (showDetail) void tick($)
}

// ---- 보정 화면: 실제 앱의 px 를 한 장의 스크린샷으로 잰다 (/session_board 보정 으로 켜고 끈다) ----
// 눈금 그림(px)과 알려진 부품(간격 1, 안쪽 여백 1, 테두리 상자, 너비 10·높이 3 상자, 단추, 글자)을 같은 왼쪽 끝에서 나란히 그린다.
// 스크린샷의 눈금이 배율을 주므로 화면 배율과 상관없이 CSS px 로 읽힌다. 읽은 값은 tokens.ts 의 HOST 에 둔다
let calibrating = false
export function toggleCalibrate($: any): boolean {
  calibrating = !calibrating
  $.ui.invalidate('ui.render')
  return calibrating
}
const RULER_W = 640
const rulerSvg = () => {
  let s = `<rect width="${RULER_W}" height="30" fill="#000"/>`
  for (let x = 0; x <= RULER_W; x += 10) {
    const h = x % 100 === 0 ? 14 : x % 50 === 0 ? 10 : 5
    s += `<rect x="${x === RULER_W ? x - 1 : x}" y="0" width="1" height="${h}" fill="#fff"/>`
    if (x % 50 === 0 && x < RULER_W) s += `<text x="${x + 2}" y="26" font-size="10" fill="#fff" font-family="Consolas,monospace">${x}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RULER_W}" height="30">${s}</svg>`
}
const markerSvg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="16"><rect width="4" height="16" fill="${fill}"/></svg>`
function calibrationRows(cols: number, props: any, Box: any, Text: any, Button: any, Svg: any, sp: (w: number, k: string) => any): any[] {
  const mark = (k: string, fill = '#ff4d4d') => Svg({ key: k, source: markerSvg(fill), alt: '보정 표지', width: 4, height: 16 })
  const label = (k: string, t: string) => Text({ key: k, dimColor: true, children: t })
  return [
    Box({ key: 'cal0', children: [label('t', `보정 화면 · bodyColumns ${cols} · maxRows ${props.maxRows ?? '?'} · HOST measured ${HOST.measured} · 끄기: /session_board 보정`)] }),
    Box({ key: 'cal1', children: [Svg({ key: 'r', source: rulerSvg(), alt: '보정 눈금 640px', width: RULER_W, height: 30 })] }),
    Box({ key: 'cal2', flexDirection: 'row', children: [mark('a'), mark('b', '#4dd2ff'), sp(40, 's'), label('t', '① 간격 없음')] }),
    Box({ key: 'cal3', flexDirection: 'row', gap: 1, children: [mark('a'), mark('b', '#4dd2ff'), label('t', '② gap 1')] }),
    Box({ key: 'cal4', flexDirection: 'row', children: [Box({ key: 'p', paddingLeft: 1, children: [mark('a')] }), sp(40, 's'), label('t', '③ paddingLeft 1')] }),
    Box({ key: 'cal5', flexDirection: 'row', children: [Box({ key: 'b', borderStyle: 'round', borderColor: '#ffffff', children: [mark('a')] }), sp(40, 's'), label('t', '④ 테두리 상자')] }),
    Box({ key: 'cal6', flexDirection: 'row', children: [Box({ key: 'w', width: 10, height: 3, backgroundColor: '#4dd2ff' }), sp(40, 's'), label('t', '⑤ width 10 · height 3')] }),
    Box({ key: 'cal7', flexDirection: 'row', alignItems: 'center', children: [Button({ key: 'cb1', label: '보정 단추 1', variant: 'primary', children: [Text({ key: 't', children: DETAIL_TEXT.closed })], onPress: () => undefined }), sp(24, 's1'), Button({ key: 'cb2', label: 'ABCDEFGHIJ', variant: 'secondary', onPress: () => undefined }), sp(24, 's2'), Button({ key: 'cb3', label: '가나다라마바사아자차', variant: 'secondary', onPress: () => undefined }), sp(24, 's3'), label('t', '⑥ 단추')] }),
    Box({ key: 'cal8', flexDirection: 'row', children: [Text({ key: 'a', children: 'ABCDEFGHIJ' }), sp(24, 's1'), Text({ key: 'b', children: '가나다라마바사아자차' }), sp(24, 's2'), label('t', '⑦ 글자')] }),
    // ⑧ 줄 바꿈 없는 공백 10자의 폭 (앱 부품 사이 간격을 이 글자로 만든다). ⑥ 첫 단추는 label 과 Text 자식 중 무엇이 그려지는지도 보인다
    Box({ key: 'cal9', flexDirection: 'row', children: [mark('a'), Text({ key: 'n', children: ' '.repeat(10) }), mark('b', '#4dd2ff'), Text({ key: 's', children: '   ' }), label('t', '⑧ 공백(NBSP) 10자')] }),
  ]
}

/** 묶음 탭: 고른 묶음의 칸이 차례로 들어온다(한 번) */
function selectGroup($: any, i: number) {
  if (i === panelGroup) return
  panelGroup = i
  animateNext = true
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  // rulegate 판정 폴더(선택). 비어 있으면 격자에 rulegate 칸이 나오지 않는다
  rulegateDir = String(options?.rulegateStateDir ?? '').trim().replace(/[\\/]+$/, '')
  on('session.measure', async ($, e, next) => {
    applyUsage(e)
    await trackDay($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // 지금 노력 수준·모델. 사용자가 바꾸면 다음 요청부터 바뀐 값이 온다
  on('turn.step', async function* ($, e, next) {
    if ((e as any).agentId === undefined) {
      if (typeof (e as any).model === 'string') modelNow = String((e as any).model).replace(/^claude-/, '')
      if (typeof e.effort === 'string' && e.effort !== effortNow) {
        effortNow = e.effort
        $.ui.invalidate('ui.render')
      }
    }
    return yield* next(e)
  })

  for (const tool of ['Edit', 'Write', 'MultiEdit'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const ran: any = await next(e)
      if (ran.deny === undefined && ran.isError !== true) edited.add(String((e as any).file_path ?? ''))
      return ran
    })
  }

  // 한도 묶음: 압축 횟수 (본 에이전트, 자동·수동)
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    // 자동 = trigger auto, 수동 = 사람(/compact)이나 플러그인이 시킨 것. precompute(미리 계산)와 건너뛴 압축(skip)은 세지 않는다
    if ((e as any).agentId === undefined && (e as any).trigger !== 'precompute' && (r as any)?.skip === undefined) {
      if ((e as any).trigger === 'auto') compacts.auto += 1
      else compacts.manual += 1
    }
    return r
  })


  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const props: any = (e as any).props ?? {}
    if (props.hasSurvey) return next(e)
    const segs = buildSegs(Date.now(), props.isWorking === true)
    if (segs.length === 0) return next(e)
    // 입력창 위 띠는 한 자리라서, 아래 플러그인(예: ponytail)의 띠를 먼저 받아 위에 함께 그린다.
    const beneath: any = await next(e)
    const cols: number = props.bodyColumns ?? 80
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any
    // 데스크톱 화면에서는 ponytail 의 버튼이 안쪽 여백을 두껍게 그려서 그 줄이 오른쪽으로 밀린다. 같은 만큼 들여쓴다.
    const indent = (e as any).surface === 'desktop' ? INDENT : 0
    // 그림을 그릴 수 있는 화면(데스크톱): 한 줄(고양이 · 배지 · 컨텍스트 · 주간 · 세부 단추), 펼치면 지표 격자 그림
    if (typeof Svg === 'function' && (e as any).surface !== 'terminal') {
      const d = richData(Date.now(), props.isWorking === true)
      // 고양이는 띠 그림에서 떼어 따로 그리고, 그 바로 옆에 누를 수 있는 개수 단추를 둔다 (2026-11-16 사용자 요청: 고양이 옆에 알림 숫자)
      // 접힌 띠 = 툴바 한 줄: 시작(고양이·배지) · 가운데(지표 그림) · 끝(노력 힌트·인계·세부). 폭은 barPlan 이 HOST 보정값으로 정한다:
      // 끝 구역의 실제 폭을 먼저 잡고 남는 폭을 가운데 그림에 준다 (어림 숫자로 잡으면 단추가 띠 밖으로 넘친다)
      const plan = barPlan(cols - indent * 2, d, {
        kinds: ASK_KINDS.filter(k => asks[k.key] > 0).map(k => ({ level: k.level, n: asks[k.key], label: k.label })),
        open: ASK_KINDS.some(k => asks[k.key] > 0) ? '▸' : isBoardClosed() ? '세션 ▸' : '',
        hint: effortHint(effortNeed, effortNow),
        handoff: showHandoff(),
        detail: showDetail ? DETAIL_TEXT.open : DETAIL_TEXT.closed,
      })
      // 앱 부품 사이 간격은 줄 바꿈 없는 공백(NBSP) 글자로 둔다. 앱의 gap·padding 1 은 px 가 정해져 있지 않고(실제 화면에서 확인),
      // 대체 글이 빈 투명 그림은 실제 앱에서 그려지지 않았다(탭·단추가 딱 붙음). 글자는 앱이 늘 그린다
      const sp = (w: number, key: string) => Text({ key, children: NBSP.repeat(Math.max(1, Math.round(w / HOST.nbspPx))) })
      const fixed = (key: string, child: any) => Box({ key, flexShrink: 0, alignItems: 'center', children: [child] })
      const alt = [d.context && `컨텍스트 ${d.context.percent}%`, d.week && `주간 ${Math.round(d.week.percent)}%`, ...bandStats(d).map(s => s.runs.map(r => r.t).join(''))].filter(Boolean).join(', ')
      // 테두리·바탕: 접혀 있으면 바가, 펼치면 바와 격자를 함께 담은 바깥 상자가 갖는다
      const FRAME = { backgroundColor: color('background-surface'), borderStyle: 'round', borderColor: color('border-strong') } // 어두운 앱 바탕 위에서도 띠 가장자리가 보이게 표면과 3:1 이상인 테두리
      const cat = [sp(GAP.group, 's0'), fixed('catb', Svg({ key: 'cat', source: bandCatSvg(d.mood ?? 'zz'), alt: '고양이', width: 36, height: 36 })), sp(GAP.item * 2, 's1')]
      // 지표 값이 하나도 없으면(세션 시작 직후) 가운데 그림을 넣지 않는다: 빈 그림과 빈 대체 글은 실제 앱이 그리지 않는다
      const metrics = plan.band && alt ? [fixed('bandb', Svg({ key: 'band', source: plan.band.svg, alt, ...sizeOf(plan.band.svg) }))] : []
      const start = [
        // 배지: 기호 + 숫자 그림 알약 (앱이 단추 안 글자색을 지워서 단추 밖 그림으로 둔다). 좁으면 한 알약으로 합친다
        ...plan.pills.flatMap((p, i) => [fixed(`ask-${i}`, Svg({ key: 'p', source: p.svg, alt: p.alt, width: p.w, height: p.h })), sp(GAP.item, `sp${i}`)]),
        ...(plan.open ? [fixed('ask-open', Button({ key: plan.pills.length > 0 ? 'open-asks' : 'open-board', label: plan.open, plain: true, dimColor: true, onPress: () => openBoard($) })), sp(GAP.item * 2, 's2')] : []),
      ]
      const end = [
        Box({ key: 'fill', flexGrow: 1 }),
        ...(plan.hint ? [fixed('effortb', Text({ key: 'effort', color: 'warning', bold: true, children: plan.hint })), sp(GAP.group, 's3')] : []),
        ...(plan.handoff ? [fixed('handoffb', Button({ key: 'handoff', label: plan.handoffLabel, variant: 'secondary', onPress: () => sendHandoff($) })), sp(GAP.item * 2, 's4')] : []),
        // 띠의 주요 동작 하나. 실제 앱은 label 을 글자로 그리므로(Text 자식이 아니라 label 의 "세부 지표 접기" 가 보였다) label 을 짧게 둔다.
        // "세부 ▾" / "접기 ▴" 글자가 펼침 상태를 말한다 (앱 단추에는 aria-expanded 가 없다)
        fixed('detailb', Button({ key: 'detail', label: plan.detail, variant: 'primary', onPress: () => toggleDetail($) })),
        sp(GAP.group, 's5'),
      ]
      // 한 줄로 안 되면 두 줄: 첫 줄에 고양이와 필수 지표, 둘째 줄에 배지와 단추 (필수 세 항목을 빼지 않으려고)
      const row = Box({
        key: 'rb',
        ...(plan.twoLine ? { flexDirection: 'column' } : { alignItems: 'center' }),
        ...(showDetail ? { backgroundColor: color('background-surface') } : FRAME),
        children: plan.twoLine
          ? [
              Box({ key: 'rb1', alignItems: 'center', children: [...cat, ...metrics] }),
              ...(plan.chips ? [Box({ key: 'rbc', alignItems: 'center', children: [sp(GAP.group, 's0c'), fixed('chipsb', Svg({ key: 'chips', source: plan.chips.svg, alt: bandStats(d).filter(s => s.chip).map(s => s.runs.map(r => r.t).join('')).join(', '), ...sizeOf(plan.chips.svg) }))] })] : []),
              Box({ key: 'rb2', alignItems: 'center', children: [sp(GAP.group, 's0b'), ...start, ...end] }),
            ]
          : [...cat, ...start, ...metrics, ...end],
      })
      // 펼친 지표 격자: 바와 한 상자(테두리 하나)에 담아 높이를 아낀다(아래가 살짝 잘렸다). 줄마다 같은 열 격자:
      // 칸 상자 폭 = 100% / 열 수 라서 마지막 줄도 앞줄의 열에 맞는다. 칸 그림은 고정 크기(글자를 늘이거나 줄이지 않는다)
      const animate = animateNext
      animateNext = false
      const n = gridCols(cols - indent * 2)
      const pic = (p: Pic) => Svg({ source: p.svg, alt: p.alt, width: p.w, height: p.h })
      // 펼친 격자의 간격 (composition 세 단계, 모두 그림 px): 바 ↔ 머리글 = 구역(머리글 그림 위 여백), 머리글 ↔ 탭 = 묶음(머리글 그림 아래 여백),
      // 탭 ↔ 칸 = 묶음(칸 그림 위 여백), 칸 안 줄 사이 = 항목. 좌우 안쪽 여백도 묶음 간격의 투명 그림이다
      const padded = (key: string, child: any) => Box({ key: `${key}w`, flexDirection: 'row', children: [sp(GAP.group, `${key}l`), Box({ key: `${key}c`, flexGrow: 1, flexDirection: 'column', children: [child] }), sp(GAP.group, `${key}r`)] })
      // 묶음 탭: 떨어진 secondary 단추 5개, 사이는 묶음보다 작은 8px(NBSP). 고른 탭은 "● " 표시와 밝은 글자,
      // 나머지는 dimColor(흐린 글자). 앱 단추에는 색·선택 옵션이 없어 primary 채움 대신 이 둘로 구분한다. dimColor 가 데스크톱에서
      // 흐리게 그려지지 않아도 "● " 하나로 고른 탭이 드러난다. 키보드: Tab 이동, Enter 선택
      // 탭은 "세션 지표" 머리글과 한 줄, 오른쪽 끝. 머리글 자리가 HEAD_MIN 보다 작으면 다음 줄에 둔다
      const tabLabels = tabLabelsFor(panelGroup)
      const tabsW = tabLabels.reduce((t, label) => t + hostButtonPx(label), 0) + TAB_GAP * (tabLabels.length - 1)
      const headRoom = plan.inner - GAP.group * 3 - tabsW // 좌우 안쪽 여백 + 머리글 ↔ 탭 묶음 간격
      const inlineTabs = headRoom >= HEAD_MIN
      const tabs = Box({
        key: 'pt',
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: inlineTabs ? 'flex-end' : 'flex-start',
        children: tabLabels.flatMap((label, i) => [...(i > 0 ? [sp(TAB_GAP, `tg${i}`)] : []), Button({ key: `g${i}`, label, variant: 'secondary', dimColor: i !== panelGroup, onPress: () => selectGroup($, i) })]),
      })
      const pics = showDetail ? panelPics(d, animate, panelGroup, cellWidth(cols - indent * 2, n)) : []
      const panelBox = showDetail
        ? Box({
            key: 'pb',
            flexDirection: 'column',
            children: [
              // 머리글은 남는 폭에 맞춰 덜 중요한 항목부터 뺀다
              ...(inlineTabs
                ? [padded('ph', Box({ key: 'phr', flexDirection: 'row', alignItems: 'flex-end', children: [pic(panelHead(d, headRoom, TABS_H, 0)), Box({ key: 'pfill', flexGrow: 1 }), tabs] }))]
                : [padded('ph', pic(panelHead(d, plan.inner - GAP.group * 2))), padded('pt', tabs)]),
              padded(
                'pg',
                Box({
                  key: 'pg',
                  flexDirection: 'column',
                  // 양쪽정렬: 첫 칸은 왼쪽 끝, 마지막 칸은 오른쪽 끝, 사이는 같은 간격 (모든 줄이 칸 n 개라 열도 맞는다)
                  children: Array.from({ length: Math.ceil(pics.length / n) }, (_, r) =>
                    Box({ key: `r${r}`, flexDirection: 'row', justifyContent: 'space-between', children: pics.slice(r * n, r * n + n).map((p, i) => Box({ key: `c${panelGroup}-${r * n + i}`, flexShrink: 0, children: [pic(p)] })) }),
                  ),
                }),
              ),
            ],
          })
        : null
      const mineRich = Box({
        key: 'relay',
        flexDirection: 'column',
        ...(showDetail ? { ...FRAME, overflow: 'hidden' } : {}),
        children: [...(calibrating ? calibrationRows(cols, props, Box, Text, Button, Svg, sp) : []), row, panelBox],
      })
      return beneath ? Box({ flexDirection: 'column', children: [Box({ key: 'beneath', flexDirection: 'column', children: [beneath] }), mineRich] }) : mineRich
    }
    // 시안: 칸은 왼쪽부터 일정한 간격으로 놓고, 오른쪽 끝에 "상세 ▾" 버튼 하나. 폭이 좁으면 번호가 큰 칸부터 뺀다.
    const floor = (key: string, list: Seg[]) => {
      // 오른쪽 끝 버튼 자리(약 12칸)를 빼고 칸을 고른다. 숨긴 칸이 있으면 버튼에 개수를 적어 상세에서 보게 한다.
      const kept = fit(list, cols - indent * 2 - 12)
      const hidden = list.length - kept.length
      // 칸 사이는 구분선 대신 간격으로 가른다. 이름은 흐리게, 값은 또렷하게(흐릴 값만 mute).
      // 이상 값과 검증 결과는 색 알약으로, 사용률은 색 게이지로 그린다. 칸 안에서는 줄을 바꾸지 않고 끝을 줄인다.
      const cells: any[] = kept.map((s, i) => {
        const tone = LEVEL_COLOR[s.level ?? '']
        const pill = isAlert(s) || (!s.label && (s.level === 'ok' || s.level === 'info'))
        const value = pill
          ? Text({ key: 'v', color: 'inverseText', backgroundColor: tone, bold: true, children: ` ${s.value} ` })
          : Text({ key: 'v', color: tone, dimColor: s.level === 'mute', weight: s.bar !== undefined ? 'bold' : undefined, children: s.value })
        const parts: any[] = []
        if (s.label) parts.push(Text({ key: 'l', dimColor: true, children: `${s.label} ` }))
        if (s.bar !== undefined) {
          const [filled, empty] = gauge(s.bar)
          parts.push(Text({ key: 'g', color: tone ?? 'suggestion', children: filled }), Text({ key: 'gb', dimColor: true, children: `${empty} ` }))
        }
        parts.push(value)
        return Text({ key: `${key}s${i}`, wrap: 'truncate-end', children: parts })
      })
      const children: any[] = [Box({ key: `${key}cells`, gap: 3, flexShrink: 1, children: cells })]
      children.push(Box({ key: `${key}fill`, flexGrow: 1 }))
      const hint = effortHint(effortNeed, effortNow)
      if (hint) children.push(Text({ key: `${key}effort`, color: 'warning', bold: true, children: `${hint} ` }))
      if (showHandoff()) children.push(Button({ key: `${key}handoff`, label: '인계 ▸', plain: true, dimColor: true, onPress: () => sendHandoff($) }))
      // 터미널: 패널이 닫혀 있으면 세부 앞에 여는 단추를 둔다
      if (isBoardClosed()) children.push(Button({ key: 'open-board', label: '세션 ▸', plain: true, dimColor: true, onPress: () => openBoard($) }))
      children.push(Button({ key: `${key}detail`, label: `세부 ${showDetail ? '▴' : '▾'}`, plain: true, dimColor: true, onPress: () => toggleDetail($) }))
      return Box({ key, children })
    }
    const shown = SHOW_COST ? segs : segs.filter(s => s.prio !== 6)
    // 상세: 컨텍스트 토큰 수, 한도 리셋, 오늘 권장 계산, 캐시 만료 같은 근거를 한 줄씩.
    const detail = showDetail
      ? Box({
          key: 'detail-rows',
          flexDirection: 'column',
          children: detailRows(Date.now()).map(([k, v], i) =>
            // 라벨 칸 너비를 고정해 값이 한 줄로 정렬되게 한다(가장 긴 라벨 '컨텍스트' 가 8칸).
            Box({ key: `d${i}`, children: [Box({ key: 'k', width: 10, flexShrink: 0, children: [Text({ dimColor: true, children: k })] }), Text({ key: 'v', wrap: 'truncate-end', children: v })] }),
          ),
        })
      : null
    const mine = Box({ key: 'relay', flexDirection: 'column', paddingLeft: indent, paddingRight: indent, children: [floor('f1', shown), detail] })
    return beneath ? Box({ flexDirection: 'column', children: [Box({ key: 'beneath', flexDirection: 'column', children: [beneath] }), mine] }) : mine
  })
}

/** 세션 보드 패널을 연다. 같은 플러그인이라 명령을 거치지 않는다(대화에 명령 줄이 남지 않는다). */
async function openBoard($: any) {
  // 세션 보드(register.ts)의 openPane 과 같은 id·제목·폭이다. 이미 열려 있으면 그대로 둔다
  await $.ui.open({ id: 'session-board', title: '세션', columns: 40 })
  markBoardOpen()
  $.ui.invalidate('ui.render') // "세션 ▸" 를 띠에서 지운다
}

async function tick($: any) {
  try {
    const list: any[] = await $.agent.list()
    children = list.filter(a => a.status === 'running').length
    agentCounts = countAgents(list)
  } catch {
    // 목록을 못 읽으면 이전 값을 둔다
  }
  asks = askCounter() // 세션 보드가 메모리에 가진 개수를 받는다
  specTicks += 1
  if (specTicks % SPEC_EVERY === 0) await refreshSpec($) // OpenSpec 진행률: 30초마다
  // 펼친 동안만 읽는 값: rulegate 판정 수(파일), 턴 수
  if (showDetail) {
    await readRules($)
    try {
      turnCount = await $.session.turns()
    } catch {
      // 턴 수를 못 읽으면 머리글에서 뺀다
    }
  }
  $.ui.invalidate('ui.render')
}

/** 띠에 쓸 글: "결재 1 · 알림 2". 0인 종류는 쓰지 않고, 칸이 없으면 null. */
export function asksText(a: { request: number; notice: number; report: number }): string | null {
  const parts = ([['결재', a.request], ['알림', a.notice], ['확인', a.report]] as const).filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function applyUsage(u: any) {
  lastUsageAt = Date.now()
  const c = u?.context
  if (c?.window) {
    const tokens = c.tokens ?? 0
    context = { tokens, window: c.window, percent: Math.round(c.percent ?? (tokens / c.window) * 100) }
  }
  if (u?.cost) costUsd = u.cost.usd
  if (typeof u?.startedAt === 'number') startedAt = u.startedAt
  const limits: any[] = u?.rateLimits ?? []
  limitKinds = limits.map(r => String(r.kind))
  const w = limits.find(r => r.kind === 'seven_day') ?? limits.find(r => String(r.kind).startsWith('seven_day'))
  if (w) week = { percent: w.percentUsed, resetsAt: w.resetsAt }
  const f = limits.find(r => r.kind === 'five_hour') ?? limits.find(r => String(r.kind).startsWith('five_hour'))
  if (f) five = { percent: f.percentUsed, resetsAt: f.resetsAt }
}

// 오늘 시작 때의 주간 %를 저장해 두고, 현재 값에서 빼서 "오늘 쓴 양"을 계산한다.
// shortcut: 그날 첫 읽기를 시작점으로 삼아서, 하루 중간에 처음 켜면 그 전 사용량은 빠진다.
async function trackDay($: any) {
  if (!week) return
  const date = dateKey(Date.now())
  const reset = week.resetsAt ?? ''
  if (!dayBase) {
    const saved: any = await $.store.get('dayBase')
    if (saved && typeof saved.percent === 'number') dayBase = saved
  }
  if (!dayBase || dayBase.date !== date || dayBase.reset !== reset || week.percent < dayBase.percent) {
    dayBase = { date, reset, percent: week.percent }
    await $.store.set('dayBase', dayBase)
  }
}

function dateKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function weight(day: number): number {
  return day === 0 || day === 6 ? WEIGHT_WEEKEND : 1
}

/** 오늘 권장 사용량(%p)과 페이스(%p, +면 앞서감). 리셋 시각을 모르면 null. */
export function dailyBudget(percent: number, base: number, resetsAt: string | undefined, now: number) {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(reset) || reset <= now) return null
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const today = weight(d.getDay())
  let sum = 0
  while (d.getTime() < reset) {
    // 리셋이 낀 마지막 날은 리셋 시각까지의 몫만 센다.
    sum += weight(d.getDay()) * Math.min(1, (reset - d.getTime()) / DAY)
    d.setDate(d.getDate() + 1)
  }
  if (sum <= 0) return null
  const recommended = ((100 - base) * today) / sum
  const elapsed = 1 - (reset - now) / (7 * DAY)
  return { recommended, pace: percent - elapsed * 100 }
}

function buildSegs(now: number, isWorking: boolean): Seg[] {
  const segs: Seg[] = []
  if (verifying) segs.push({ prio: 1, value: '● 검증 중…', level: 'info' })
  else if (verify) segs.push({ prio: 1, value: verify.text, level: verify.state === 'ok' ? 'ok' : verify.state === 'fail' ? 'err' : 'warn' })

  // 터미널 띠: 그림이 없어 단추 대신 글자 칸으로 쓴다. 이상 칸이라 좁아도 남는다
  const waiting = asksText(asks)
  if (waiting) {
    const level: Level = ASK_KINDS.find(k => asks[k.key] > 0)?.level ?? 'ok'
    segs.push({ prio: 0, value: mark(level, waiting), level })
  }


  segs.push({ prio: 2, label: '하위', value: String(children), level: children > 0 ? 'info' : 'mute' })

  if (context) {
    const p = context.percent
    const level: Level | undefined = p >= 85 ? 'err' : p >= 70 ? 'warn' : undefined
    segs.push({ prio: 3, label: '컨텍스트', bar: p, value: mark(level, `${p}%`), level })
  }

  if (week) {
    const b = dayBase ? dailyBudget(week.percent, dayBase.percent, week.resetsAt, now) : null
    if (b && dayBase) {
      const used = Math.max(0, week.percent - dayBase.percent)
      const level: Level | undefined = used > b.recommended * 1.5 ? 'err' : used > b.recommended ? 'warn' : undefined
      segs.push({ prio: 4, label: '주', bar: week.percent, value: mark(level, `${Math.round(week.percent)}% · 오늘 ${used.toFixed(0)}/${b.recommended.toFixed(0)}%p`), level })
      const pace = Math.round(b.pace)
      segs.push({ prio: 9, label: '페이스', value: pace > 0 ? `${mark(pace > 10 ? 'warn' : undefined, `+${pace}%p`)} 앞섬` : `${pace}%p 여유`, level: pace > 10 ? 'warn' : 'mute' })
    } else {
      segs.push({ prio: 4, label: '주', bar: week.percent, value: `${Math.round(week.percent)}%` })
    }
  }

  if (isWorking && turnStartedAt > 0) segs.push({ prio: 5, label: '턴', value: fmtDur(now - turnStartedAt), level: 'info' })
  else if (lastTurnSec !== null) segs.push({ prio: 5, label: '턴', value: fmtDur(lastTurnSec * 1000), level: 'mute' })

  if (costUsd !== null) segs.push({ prio: 6, value: `$${costUsd.toFixed(2)}` })

  if (!isWorking && lastAnswerAt > 0) {
    const left = CACHE_MINUTES - Math.floor((now - lastAnswerAt) / 60_000)
    if (left <= 0) segs.push({ prio: 7, label: '캐시', value: mark('err', '만료'), level: 'err' })
    else {
      const level: Level = left <= 10 ? 'err' : left <= 20 ? 'warn' : 'mute'
      segs.push({ prio: 7, label: '캐시', value: mark(level, `${left}분`), level })
    }
  }

  if (context && history.length > 0) segs.push({ prio: 8, value: history.length >= 2 ? `${forecast(context.percent)} ${barsOf(history)}` : forecast(context.percent), level: 'mute' })
  return segs
}

export function barsOf(h: number[]): string {
  // 눈금은 실제 0~100% 다(꽉 찬 █ 는 정말 가득 찼다는 뜻). 낮은 값이 바닥 막대(▁)로 눌려 밑줄처럼 보이지 않게 가장 낮은 막대는 ▂ 로 한다.
  return h.map(p => BARS[Math.max(1, Math.min(BARS.length - 1, Math.floor((p / 100) * BARS.length)))]).join('')
}

/** 터미널에서 "세부 ▾" 를 펼쳤을 때 보이는 근거. 값을 못 읽은 항목은 줄을 만들지 않는다. */
export function detailRows(now: number): [string, string][] {
  const rows: [string, string][] = []
  const when = (ms: number) => {
    const d = new Date(ms)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const join = (parts: (string | false)[]) => parts.filter(Boolean).join(' · ')
  if (context) rows.push(['컨텍스트', join([`${commaN(context.tokens)} / ${commaN(context.window)} 토큰`, history.length > 0 && `${barsOf(history)} ${forecast(context.percent)}`])])
  // 띠에는 두지 않는 진단: 주간 한도 칸이 왜 없는지.
  if (!week && lastUsageAt > 0) rows.push(['주간', limitKinds.length > 0 ? `읽지 못함 (엔진이 준 종류: ${limitKinds.join(', ')})` : '엔진이 한도 값을 주지 않았습니다'])
  const reset = week?.resetsAt ? Date.parse(week.resetsAt) : NaN
  const b = week && dayBase ? dailyBudget(week.percent, dayBase.percent, week.resetsAt, now) : null
  const weekly = join([Number.isFinite(reset) && `${when(reset)} 리셋`, b !== null && `오늘 권장 ${b.recommended.toFixed(0)}%p (쉬는 날 ×${WEIGHT_WEEKEND})`, b !== null && `페이스 ${Math.round(b.pace)}%p (+ 빠름)`])
  if (weekly) rows.push(['주간', weekly])
  const turn = join([lastTurnSec !== null && `마지막 턴 ${fmtDur(lastTurnSec * 1000)}`, lastAnswerAt > 0 && `캐시 만료 ${when(lastAnswerAt + CACHE_MINUTES * 60_000)}`])
  if (turn) rows.push(['턴·캐시', turn])
  rows.push(['상태', join([`검증 ${verify ? verify.text : '없음'}`, `하위 ${children}개 실행 중`])])
  // 터미널에도 데스크톱 격자와 같은 원천의 항목을 글자로 둔다
  const fr = five?.resetsAt ? Date.parse(five.resetsAt) : NaN
  if (five) rows.push(['5시간', join([`${Math.round(five.percent)}%`, Number.isFinite(fr) && `${when(fr)} 리셋`])])
  const hit = hits.at(-1)
  const tok = turnTokens.at(-1)
  if (hit !== undefined || tok) rows.push(['캐시·토큰', join([hit !== undefined && `적중 ${Math.round(hit)}%`, tok !== undefined && `새 ${commaN(tok.fresh)} · 읽기 ${commaN(tok.read)} · 쓰기 ${commaN(tok.write)} · 출 ${commaN(tok.output)}`])])
  if (agentCounts) rows.push(['하위', `실행 ${agentCounts.running} · 대기 ${agentCounts.waiting} · 완료 ${agentCounts.done} · 실패 ${agentCounts.failed}`])
  if (rules) rows.push(['rulegate', `막음 ${rules.block} · 물음 ${rules.ask} · 경고 ${rules.warn}`])
  if (tools.calls > 0) rows.push(['작업', `도구 ${tools.calls}회 (실패 ${tools.errors} · 거부 ${tools.denies}) · 편집 ${edits.files.size}파일 +${edits.added} −${edits.removed}줄 · 권한 질문 ${asked} · 압축 ${compacts.auto + compacts.manual}`])
  if (history.length > 0) rows.push(['범례', '☀ 25% 미만 · ☁ 50% · ☂ 75% · ☇ 90% · ↯ 그 이상 (컨텍스트 사용률)'])
  return rows
}

// 단일 폭 기호(이모지 아님): 글꼴이 달라도 줄이 맞는다.
function forecast(p: number): string {
  return p < 25 ? '☀' : p < 50 ? '☁' : p < 75 ? '☂' : p < 90 ? '☇' : '↯'
}

/** 폭에 들어갈 때까지 번호가 가장 큰 칸부터 뺀다. 나머지는 원래 순서를 지킨다. */
export function fit(segs: Seg[], cols: number): Seg[] {
  // 한글·한자는 터미널에서 두 칸을 차지한다.
  const cells = (t: string) => [...t].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch) ? 2 : 1), 0)
  const width = (list: Seg[]) => list.reduce((n, s) => n + cells(segText(s)) + 3, 0) - 3
  let kept = [...segs]
  // 데스크톱 글자 폭이 계산과 달라도 줄이 꺾이지 않도록 여유를 6칸 둔다.
  while (kept.length > 1 && width(kept) > cols - 6) {
    // 이상(warn/err) 칸은 마지막까지 남기고, 정상 칸 중 번호가 큰 것부터 뺀다.
    const quiet = kept.filter(s => !isAlert(s))
    const pool = quiet.length > 0 ? quiet : kept
    const worst = Math.max(...pool.map(s => s.prio))
    kept = kept.filter(s => s.prio !== worst)
  }
  return kept.sort((a, b) => a.prio - b.prio)
}

// ---- 데스크톱 띠 그림은 band-ui.ts (토큰은 tokens.ts) 에 있다. 여기는 데이터와 배치만 둔다 ----
const commaN = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
/** 띠 왼쪽 끝의 고양이 하나. 띠 그림과 떼어 두어야 그 옆에 단추를 놓을 수 있다. */
export const bandCatSvg = (mood: 'run' | 'flag' | 'zz') => svgDoc(36, 36, catAvatar(mood, 18, 18), false, CAT[mood])

/** 5시간 한도 리셋 시각: 오늘이면 "HH:MM", 아니면 "M/D HH:MM". 모르면 null. */
const fiveReset = (resetsAt: string | undefined, now: number, hm: (ms: number) => string, md: (ms: number) => string) => {
  const t = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(t)) return null
  return new Date(t).toDateString() === new Date(now).toDateString() ? hm(t) : `${md(t)} ${hm(t)}`
}

/** 지금 값들을 그림 데이터로 모은다. 띠의 글자 칸(buildSegs)과 같은 규칙으로 판정한다. */
function richData(now: number, isWorking: boolean): Rich {
  const hm = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`
  const md = (ms: number) => `${new Date(ms).getMonth() + 1}/${new Date(ms).getDate()}`
  const b = week && dayBase ? dailyBudget(week.percent, dayBase.percent, week.resetsAt, now) : null
  const used = week && dayBase ? Math.max(0, week.percent - dayBase.percent) : null
  const todayTone: Tone = b && used !== null ? (used > b.recommended * 1.5 ? 'err' : used > b.recommended ? 'warn' : 'mute') : 'mute'
  const reset = week?.resetsAt ? Date.parse(week.resetsAt) : NaN
  const left = lastAnswerAt > 0 ? CACHE_MINUTES - Math.floor((now - lastAnswerAt) / 60_000) : null
  const cacheTone: Tone = left === null ? 'mute' : left <= 10 ? 'err' : left <= 20 ? 'warn' : 'mute'
  // 밴드 고양이: 일하는 중이면 달리고, 알릴 일(컨텍스트 75%↑, 캐시 경고, 검증 실패)이 있으면 깃발을 들고, 아니면 존다
  const alert = (context?.percent ?? 0) >= 75 || (!isWorking && (cacheTone === 'err' || cacheTone === 'warn')) || verify?.state === 'fail' || asks.request + asks.notice > 0
  return {
    verify: verifying ? { tone: 'info', text: '● 검증 중…' } : verify ? { tone: verify.state === 'ok' ? 'ok' : verify.state === 'fail' ? 'err' : 'warn', text: verify.text } : null,
    children,
    context,
    week: week ? { percent: week.percent, mark: b && dayBase ? dayBase.percent + b.recommended : null, today: b && used !== null ? `${used.toFixed(0)}/${b.recommended.toFixed(0)}%p` : null, todayTone, reset: Number.isFinite(reset) ? `${md(reset)} ${hm(reset)}` : null, recommended: b ? b.recommended : null, pace: b ? b.pace : null, projected: weekProjection(week.percent, reset, now) } : null,
    turn: isWorking && turnStartedAt > 0 ? { text: fmtDur(now - turnStartedAt) } : lastTurnSec !== null ? { text: fmtDur(lastTurnSec * 1000) } : null,
    cache:
      lastAnswerAt > 0
        ? // 만료는 마지막 답 뒤 60분이라는 가정값이라 "약"·"(추정)" 을 붙인다
          { tone: cacheTone, alert: isWorking || left === null ? null : left <= 0 ? '✗ 캐시 만료(추정)' : left <= 20 ? `${left <= 10 ? '✗' : '⚠'} 캐시 약 ${left}분` : null, left }
        : null,
    history,
    mood: isWorking ? 'run' : alert ? 'flag' : 'zz',
    five: five ? { percent: five.percent, reset: fiveReset(five.resetsAt, now, hm, md) } : null,
    limits: lastUsageAt > 0 ? limitKinds : null,
    hits,
    turnTokens,
    costs,
    costTotal: costUsd,
    secs,
    agents: agentCounts,
    rules,
    verifies,
    session: startedAt > 0 ? { elapsed: fmtDur(now - startedAt), turns: turnCount, staleMin: lastUsageAt > 0 ? Math.floor((now - lastUsageAt) / 60_000) : null } : null,
    // 시간당 비용: 10분이 지나야 보인다 (그 전은 값이 크게 흔들린다)
    perHour: costUsd !== null && startedAt > 0 && now - startedAt >= 600_000 ? costUsd / ((now - startedAt) / 3_600_000) : null,
    compacts,
    tools: { calls: tools.calls, errors: tools.errors, denies: tools.denies, by: Object.entries(tools.by).sort((p, q) => q[1] - p[1]) },
    edits: { files: [...edits.files].filter(f => f !== '').length, added: edits.added, removed: edits.removed },
    model: modelNow,
    spec,
    specEmpty,
    effort: effortNow ?? null,
    aborted,
    asks: asked,
    subTokens,
  }
}

// ---- 검증: 편집한 파일을 확인하고 결과를 띠에 남긴다 --------------------------------

// Windows 의 Python Store 별칭(python.exe)은 Python 이 없을 때도 실행되고 9009 를 돌려준다. 실패가 아니라 "도구 없음"이라 다음 후보로 넘어간다
const NOT_INSTALLED = 9009

export async function runVerify($: any, files: string[]): Promise<Verify> {
  const py = files.filter(f => /\.py$/i.test(f))
  const ts = files.filter(f => /\.(ts|tsx)$/i.test(f))
  if (py.length === 0 && ts.length === 0) return null // 확인 대상이 아닌 파일(문서 등)은 말하지 않는다

  const failed: string[] = []
  let checked = 0
  let skipped = 0

  for (const f of py) {
    const run = await tryRun($, [['python', '-m', 'py_compile', f], ['py', '-m', 'py_compile', f]], undefined, 20_000)
    if (run === null) skipped += 1
    else if (run.exitCode === 0) checked += 1
    else failed.push(base(f))
  }

  const dirs = new Set<string>()
  for (const f of ts) {
    const dir = await findTsconfigDir($, f)
    if (dir === null) skipped += 1
    else dirs.add(dir)
  }
  for (const dir of dirs) {
    const run = await tryRun($, [['npx', '--no-install', 'tsc', '--noEmit', '-p', dir], ['npx.cmd', '--no-install', 'tsc', '--noEmit', '-p', dir]], dir, TSC_TIMEOUT_MS)
    const out = run ? `${run.stdout}${run.stderr}` : ''
    if (run === null || (run.exitCode !== 0 && !/error TS\d+/.test(out))) skipped += 1 // tsc 가 없거나 못 돌았다
    else if (run.exitCode === 0) checked += 1
    else failed.push(`tsc ${base(dir)}`)
  }

  if (failed.length > 0) return { state: 'fail', text: `✗ 검증 실패: ${failed.slice(0, 2).join(', ')}` }
  if (checked === 0) return { state: 'skip', text: '⚠ 검증 못함 (도구 없음)' }
  return { state: 'ok', text: `✓ 검증 ${checked}${skipped > 0 ? ` (못한 것 ${skipped})` : ''}` }
}

function base(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

async function findTsconfigDir($: any, file: string): Promise<string | null> {
  let dir = file.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
  for (let i = 0; i < 8 && dir !== ''; i += 1) {
    if (await $.fs.exists(`${dir}/tsconfig.json`)) return dir
    const up = dir.replace(/\/[^/]*$/, '')
    if (up === dir) break
    dir = up
  }
  return null
}

/** 명령 후보를 차례로 시도해서, 실행 파일을 찾은 첫 결과를 돌려준다. 하나도 못 돌리면 null. */
async function tryRun($: any, candidates: string[][], cwd: string | undefined, timeoutMs: number) {
  for (const argv of candidates) {
    try {
      const run = await $.process.run(argv, { cwd, timeoutMs })
      if (run.exitCode !== NOT_INSTALLED) return run
    } catch {
      // 다음 후보
    }
  }
  return null
}
