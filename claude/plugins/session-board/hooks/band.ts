// band (옛 relay-band): 입력창 위의 통합 띠 한 줄. 맨 왼쪽 고양이 옆에 결재·알림·확인 개수 단추가 온다.
//   검증 │ 하위 N │ 컨텍스트 % │ 주 % · 오늘 x/y │ 턴 │ 비용 │ 캐시 │ 날씨·추이 │ 페이스
// 창이 좁으면 우선순위가 낮은 칸(번호가 큰 것)부터 숨긴다.
// 호스트가 소스에서 on(...) 과 $.noun.method(...) 를 읽으므로 literal 로 쓰고, $ 를 받는 도우미는 최상위 함수로 둔다.

import type { Register } from 'claude-code'

import { CAT, fmtDur, isWide, tw } from './art'

const DAY = 86_400_000
// ponytail 줄의 안쪽 여백에 맞추는 들여쓰기 칸 수(데스크톱 화면만). 화면에서 보고 어긋나면 이 값만 바꾼다.
const INDENT = 1
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
let showDetail = false // "상세 ▾" 펼침 상태
// 노력 수준 제안 (생각은 effortless 에서, 2026-11-18 사용자 결정: 흡수). 띠는 제안만 한다. 수준은 사용자가 바꾼다
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
// 띠가 패널을 닫은 뒤 세션 보드에 알린다
let markBoardClosed: () => void = () => undefined
// 결재함을 끈 곳(Orca 터미널)인가. 켜져 있으면 띠에 결재·알림·확인 개수와 패널 여닫기 단추를 두지 않는다
let boardHidden: () => boolean = () => false
export function setAskCounter(
  count: () => { request: number; notice: number; report: number },
  closed: () => boolean,
  opened: () => void,
  shut: () => void = () => undefined,
  hidden: () => boolean = () => false,
) {
  askCounter = count
  isBoardClosed = closed
  markBoardOpen = opened
  markBoardClosed = shut
  boardHidden = hidden
}

/** 세션이 시작할 때: 5초 타이머를 걸고 사용량을 읽는다. */
export async function bandStart($: any) {
  ticker?.cancel()
  ticker = $.clock.every(5000, () => tick($))
  try {
    applyUsage(await $.session.usage())
    await trackDay($)
  } catch {
    // 사용량을 아직 못 읽어도 띠는 나머지 칸으로 뜬다
  }
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
  } else {
    verify = null
  }
  await tick($)
}

export const register: Register = on => {
  on('session.measure', async ($, e, next) => {
    applyUsage(e)
    await trackDay($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // 지금 노력 수준. 사용자가 바꾸면 다음 요청부터 바뀐 값이 온다
  on('turn.step', async function* ($, e, next) {
    if ((e as any).agentId === undefined && typeof e.effort === 'string' && e.effort !== effortNow) {
      effortNow = e.effort
      $.ui.invalidate('ui.render')
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
    // 그림을 그릴 수 있는 화면(데스크톱)은 시안 3번대로 그린다: 흰 카드 안에 밴드 이미지, 오른쪽 끝에 "상세" 버튼, 펼치면 2×2 카드 이미지.
    if (typeof Svg === 'function' && (e as any).surface !== 'terminal') {
      const d = richData(Date.now(), props.isWorking === true)
      // 고양이는 띠 그림에서 떼어 따로 그리고, 그 바로 옆에 누를 수 있는 개수 단추를 둔다 (2026-11-16 사용자 요청: 고양이 옆에 알림 숫자)
      const kinds = ASK_KINDS.filter(k => asks[k.key] > 0)
      const hint = effortHint(effortNeed, effortNow)
      const handoffShown = showHandoff()
      const extraW = (hint ? tw(hint, 13) + 16 : 0) + (handoffShown ? 70 : 0)
      const band = bandSvg(d, Math.max(200, cols * 8 - 140 - indent * 16 - 40 - kinds.length * 45 - (kinds.length > 0 ? 20 : 0) - extraW), true)
      // 앱이 단추 안 글자색을 지운다. 그래서 색 점은 단추 밖의 글자로 둔다
      const askButtons = kinds.map(k => {
        // 띠가 길어지지 않게 글자(결재·알림·확인) 없이 색 점과 숫자만 쓴다. 뜻은 색이 말한다 (2026-11-16 사용자 요청). 고양이와 붙지 않게 왼쪽을 띄운다
        // 알약은 띠와 같은 그림으로 그린다. 단추는 글자만 담고 앱이 그 색을 지워서, 그림 알약 옆에 작은 "▸" 단추를 따로 둔다
        const pill = askPillSvg(k.level, asks[k.key])
        return Box({
          key: `ask-${k.key}`,
          flexShrink: 0,
          alignItems: 'center',
          paddingLeft: 1,
          children: [Svg({ key: 'p', source: pill.svg, alt: `${k.label} ${asks[k.key]}`, width: pill.w, height: pill.h })],
        })
      })
      // 알약이 여러 개여도 여는 단추는 하나다. 한 글자 plain 단추는 글자 자체가 단추로 그려진다
      // 기다리는 칸이 없어도 패널이 닫혀 있으면 같은 자리에 "세션 ▸" 를 둔다: 띠 위에 따로 줄을 만들지 않는다 (2026-11-16 사용자 보고)
      const openLabel = kinds.length > 0 ? '▸' : isBoardClosed() ? '세션 ▸' : ''
      const openButton = openLabel !== '' ? Box({ key: 'ask-open', flexShrink: 0, alignItems: 'center', paddingLeft: kinds.length > 0 ? 0 : 1, children: [Button({ key: kinds.length > 0 ? 'open-asks' : 'open-board', label: openLabel, plain: true, dimColor: true, onPress: () => openBoard($) })] }) : null
      const alt = [d.context && `컨텍스트 ${d.context.percent}%`, d.week && `주간 ${Math.round(d.week.percent)}%`, d.turn && `턴 ${d.turn.text}`, `하위 ${d.children}`].filter(Boolean).join(', ')
      const row = Box({
        key: 'rb',
        alignItems: 'center',
        backgroundColor: B.white,
        borderStyle: 'round',
        borderColor: B.line,
        children: [
          // 폭 계산이 실제 화면보다 넓게 나와도 "상세" 단추가 밀려나지 않게: 그림 칸만 줄어들고 단추 칸은 줄지 않는다
          Box({ key: 'catb', flexShrink: 0, paddingLeft: 1, children: [Svg({ key: 'cat', source: bandCatSvg(d.mood ?? 'zz'), alt: '고양이', width: 36, height: 36 })] }),
          ...askButtons,
          openButton,
          Box({ key: 'bandb', flexShrink: 1, minWidth: 0, children: [Svg({ key: 'band', source: band.svg, alt, ...sizeOf(band.svg) })] }),
          Box({ key: 'fill', flexGrow: 1 }),
          hint ? Box({ key: 'effortb', flexShrink: 0, alignItems: 'center', paddingRight: 1, children: [Text({ key: 'effort', color: 'warning', bold: true, children: hint })] }) : null,
          handoffShown ? Box({ key: 'handoffb', flexShrink: 0, paddingRight: 1, children: [Button({ key: 'handoff', label: '인계 ▸', variant: 'secondary', onPress: () => sendHandoff($) })] }) : null,
          Box({ key: 'detailb', flexShrink: 0, children: [Button({ key: 'detail', label: `상세 ${showDetail ? '▴' : '▾'}`, variant: 'secondary', onPress: () => { showDetail = !showDetail; $.ui.invalidate('ui.render') } })] }),
        ],
      })
      const panel = showDetail ? panelSvg(d) : null
      // 크기를 안 주면 넓은 패널에서 이미지가 폭에 맞춰 커진다. 원래 폭(800)을 넘지 않게, 좁으면 화면 폭에 맞춰 비율대로 줄인다
      const panelW = panel ? Math.min(panel.w, Math.max(320, cols * 8 - 24 - indent * 16)) : 0
      const mineRich = Box({
        key: 'relay',
        flexDirection: 'column',
        gap: 0, // 밴드와 상세 카드 사이 빈 줄을 없애 채팅창 위 막대가 스크롤 없이 들어오게 한다
        paddingLeft: indent,
        paddingRight: indent,
        children: [row, panel ? Svg({ key: 'panel', source: panel.svg, alt: `상세: ${alt}`, width: panelW, height: Math.round((panel.h * panelW) / panel.w) }) : null],
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
      // 터미널: 상세 앞에 패널을 여닫는 단추를 둔다. 패널의 × 는 Orca 같은 터미널 앱의 창 단추와 겹쳐 찾기 어렵다 (2026-11-22 사용자 보고)
      if (boardHidden()) {
        // 결재함을 끈 곳: 여닫기 단추도 두지 않는다
      } else if (isBoardClosed()) children.push(Button({ key: 'open-board', label: '세션 ▸', plain: true, dimColor: true, onPress: () => openBoard($) }))
      else children.push(Button({ key: 'close-board', label: '세션 ◂', plain: true, dimColor: true, onPress: () => closeBoard($) }))
      children.push(
        Button({
          key: `${key}detail`,
          label: `상세 ${showDetail ? '▴' : '▾'}`,
          plain: true,
          dimColor: true,
          onPress: () => {
            showDetail = !showDetail
            $.ui.invalidate('ui.render')
          },
        }),
      )
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

/** 세션 보드 패널을 닫는다. 명령(/session_board)을 거치지 않아 대화에 줄이 남지 않는다. */
async function closeBoard($: any) {
  await $.ui.close({ id: 'session-board' })
  markBoardClosed()
  $.ui.invalidate('ui.render') // "세션 ◂" 를 "세션 ▸" 로 바꾼다
}

async function tick($: any) {
  try {
    const list: any[] = await $.agent.list()
    children = list.filter(a => a.status === 'running').length
  } catch {
    // 목록을 못 읽으면 이전 값을 둔다
  }
  asks = boardHidden() ? NO_ASKS : askCounter() // 세션 보드가 메모리에 가진 개수를 받는다
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
  const limits: any[] = u?.rateLimits ?? []
  limitKinds = limits.map(r => String(r.kind))
  const w = limits.find(r => r.kind === 'seven_day') ?? limits.find(r => String(r.kind).startsWith('seven_day'))
  if (w) week = { percent: w.percentUsed, resetsAt: w.resetsAt }
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
  const waiting = boardHidden() ? null : asksText(asks) // 결재함을 끈 곳(Orca 터미널)은 개수를 쓰지 않는다
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

/** "상세 ▾" 를 펼쳤을 때 보이는 근거. 값을 못 읽은 항목은 줄을 만들지 않는다. */
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

// ---- 데스크톱 밴드: my-own-mods UI UX 리디자인.html 의 3번(상태 밴드와 상세 패널, 화이트) 수치대로 그린다 ----
// 접힌 밴드와 펼친 2×2 카드는 Svg 이미지다. 색·치수는 이 블록에서만 쓴다(규칙 2).
// 시안과 다른 점(규칙 23): 글꼴은 맑은 고딕·Consolas 로 대체, 카드 그림자·글로우는 이미지 밖이라 없음,
// 주간 막대의 권장 눈금은 "오늘 시작 값 + 오늘 권장" 위치(시안은 권장량 숫자 그대로의 위치라 오해를 부른다).
type Tone = 'ok' | 'info' | 'warn' | 'err' | 'mute'
type Rich = {
  verify: { tone: Tone; text: string } | null
  children: number
  context: { percent: number; tokens: number; window: number } | null
  week: { percent: number; mark: number | null; today: string | null; todayTone: Tone; reset: string | null; recommended: number | null; pace: number | null } | null
  turn: { text: string } | null
  cache: { tone: Tone; alert: string | null } | null
  history: number[]
  mood?: 'run' | 'flag' | 'zz' // 밴드 고양이: 일하는 중 / 알릴 일이 있음 / 쉬는 중
}
const B = {
  ink: '#14172B', dim: '#5B6080', line: '#E3E6F2', soft: '#EEF0F8', white: '#FFFFFF',
  accent: '#4F6BFF', accent2: '#8B5CF6', cyan: '#22B8CF', amber: '#F59E0B', orange: '#F97316', rose: '#F43F5E',
  okBg: '#DEF5ED', ok: '#047857', amberBg: '#FEF3C7', amberText: '#92400E', roseBg: '#FFE4E8', roseText: '#BE123C', infoBg: '#E8ECFF', infoText: '#3F5BEF',
}
const SANS = "'Noto Sans KR','Malgun Gothic',system-ui,sans-serif"
const MONO = "'JetBrains Mono',Consolas,monospace"
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
type Run = { t: string; fill: string; weight?: number; mono?: boolean }
// Consolas 에는 한글이 없어 한글이 깨져 보이므로, 숫자용 글꼴 조각 안의 한글은 sans 로 나눠 그린다.
const HANGUL = /([ᄀ-ᇿ가-힣]+)/
const splitMono = (runs: Run[]): Run[] => runs.flatMap(r => (r.mono ? r.t.split(HANGUL).filter(Boolean).map(t => ({ ...r, t, mono: !HANGUL.test(t) })) : [r]))
const rs = (runs: Run[], x: number, y: number, size: number, anchor = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" xml:space="preserve"${anchor ? ` text-anchor="${anchor}"` : ''}>${splitMono(runs).map(r => `<tspan fill="${r.fill}" font-family="${r.mono ? MONO : SANS}" font-weight="${r.weight ?? 400}">${xml(r.t)}</tspan>`).join('')}</text>`
const rsW = (runs: Run[], size: number) => runs.reduce((n, r) => n + tw(r.t, size, r.mono, (r.weight ?? 400) >= 600), 0)
/** 그림의 원래 크기(width·height 속성). Svg 에 그대로 넘겨 패널 폭에 맞춰 커지지 않게 한다. */
const sizeOf = (svg: string): { width?: number; height?: number } => {
  const m = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg)
  return m ? { width: Math.round(Number(m[1])), height: Math.round(Number(m[2])) } : {}
}
const svgDoc = (w: number, h: number, body: string, z = 1, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * z}" height="${h * z}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="gi" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${B.accent}"/><stop offset="1" stop-color="${B.accent2}"/></linearGradient><linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${B.accent}"/><stop offset="1" stop-color="${B.accent2}"/></linearGradient><linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${B.accent}"/><stop offset="1" stop-color="${B.accent2}"/></linearGradient><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${B.accent}" stop-opacity=".45"/><stop offset="1" stop-color="${B.accent}" stop-opacity="0"/></linearGradient>${extra}</defs>${body}</svg>`
/** 컨텍스트 색 눈금(25/50/75/90%): 시안 → 인디고 → 호박 → 주황 → 로즈. 인디고 구간은 그라데이션. */
const levelFill = (p: number, dir: 'h' | 'd' = 'h') => (p < 25 ? B.cyan : p < 50 ? (dir === 'h' ? 'url(#gi)' : 'url(#gd)') : p < 75 ? B.amber : p < 90 ? B.orange : B.rose)
const levelSolid = (p: number) => (p < 25 ? B.cyan : p < 50 ? B.accent : p < 75 ? B.amber : p < 90 ? B.orange : B.rose)
const toneOf = (t: Tone) => (t === 'ok' ? { bg: B.okBg, fg: B.ok } : t === 'warn' ? { bg: B.amberBg, fg: B.amberText } : t === 'err' ? { bg: B.roseBg, fg: B.roseText } : t === 'info' ? { bg: B.infoBg, fg: B.infoText } : { bg: B.soft, fg: B.dim })
const CLOUD = 'M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5a4.2 4.2 0 0 1-.5 8.5H7z'
const MOOD_BG = { run: '#E4E9FF', flag: '#FEF3C7', zz: '#EEF0F8' }
/** 파스텔 동그라미 안의 고양이. 이 그림을 쓰는 이미지는 defs 에 CAT[mood] 를 함께 담아야 한다. */
const catAvatar = (mood: 'run' | 'flag' | 'zz', cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="14" fill="${MOOD_BG[mood]}"/><use href="#${mood}" x="${cx - 11}" y="${cy - 11}" width="22" height="22"/>`
const gaugeBar = (x: number, y: number, w: number, h: number, pct: number, fill: string, mark: number | null) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${B.line}"/><rect x="${x}" y="${y}" width="${Math.max(h, (w * Math.min(100, pct)) / 100)}" height="${h}" rx="${h / 2}" fill="${fill}"/>` +
  (mark === null ? '' : `<rect x="${x + (w * Math.min(100, mark)) / 100 - 1}" y="${y - 3}" width="2" height="${h + 6}" rx="1" fill="${B.ink}"/>`)

/** 접힌 밴드: 시안 3번 1절. 폭이 모자라면 하위 → 턴 → 오늘 권장 순으로 숨긴다(컨텍스트·주간 게이지는 끝까지). */
/** 띠 왼쪽 끝의 고양이 하나(띠와 같은 크기 배율). 띠 그림과 떼어 두어야 그 옆에 단추를 놓을 수 있다. */
export const bandCatSvg = (mood: 'run' | 'flag' | 'zz') => svgDoc(32, 32, catAvatar(mood, 16, 16), 1.12, CAT[mood])

// 개수 알약의 진한 점 색: 결재 로즈, 알림 호박, 확인 초록 (띠의 경고 알약과 같은 한 벌)
const ASK_DOT = { err: B.rose, warn: B.amber, ok: B.ok } as const
/**
 * 고양이 옆 개수 알약: 띠의 경고 알약과 같은 연한 바탕 + 진한 점 + 굵은 숫자. 띠 그림과 같은 글꼴·배율이다.
 * 앱 기본 글자로 그리면 점은 탁하고 숫자는 링크색이라 띠와 어울리지 않았다 (2026-11-16 사용자 보고). 단추로 감싸도 그림의 색은 지워지지 않는다.
 */
export function askPillSvg(level: 'err' | 'warn' | 'ok', n: number): { svg: string; w: number; h: number } {
  const num: Run[] = [{ t: String(n), fill: toneOf(level).fg, weight: 700, mono: true }]
  const w = 9 + 8 + 5 + rsW(num, 12) + 9
  const body = `<rect x="0" y="5" width="${w}" height="22" rx="11" fill="${toneOf(level).bg}"/><circle cx="13" cy="16" r="4" fill="${ASK_DOT[level]}"/>${rs(num, 22, 20, 12)}`
  return { svg: svgDoc(w, 32, body, 1.12), w: Math.round(w * 1.12), h: Math.round(32 * 1.12) }
}

export function bandSvg(d: Rich, maxW: number, noCat = false): { svg: string; w: number; hidden: number } {
  const H = 32 // 얇게 잡고 Z 배로 키워 그린다: 높이는 약 36px, 글씨는 12% 커진다(시안은 52px 에 글씨가 작았다)
  const Z = 1.12
  const cy = 16
  // extra: false 이면 오류가 아닌 검증 칸과 구름 아이콘도 숨긴다 (좁은 창의 마지막 단계)
  const build = (show: { children: boolean; turn: boolean; today: boolean; extra?: boolean }) => {
    const items: { w: number; draw: (x: number) => string }[] = []
    // 알약은 경고·오류만(눈에 띄어야 하는 것). 나머지는 글자만 둬서 차분하게 보인다.
    const chip = (runs: Run[], tone: Tone) => {
      const pill = tone === 'warn' || tone === 'err'
      const w = rsW(runs, 12) + (pill ? 18 : 2)
      items.push({ w, draw: x => `${pill ? `<rect x="${x}" y="${cy - 11}" width="${w}" height="22" rx="11" fill="${toneOf(tone).bg}"/>` : ''}${rs(runs, x + (pill ? 9 : 1), cy + 4, 12)}` })
    }
    if (d.verify && (show.extra !== false || d.verify.tone === 'err')) chip([{ t: d.verify.text, fill: toneOf(d.verify.tone).fg, weight: 700 }], d.verify.tone)
    if (d.context) {
      const c = d.context
      const label: Run[] = [{ t: '컨텍스트', fill: B.dim }]
      const val: Run[] = [{ t: `${c.percent}%`, fill: B.ink, weight: 700, mono: true }]
      const lw = rsW(label, 12) + 8
      items.push({ w: lw + 96 + 8 + rsW(val, 13), draw: x => `${rs(label, x, cy + 4, 12)}${gaugeBar(x + lw, cy - 3, 96, 6, c.percent, levelFill(c.percent), null)}${rs(val, x + lw + 96 + 8, cy + 5, 13)}` })
    }
    if (d.week) {
      const k = d.week
      const label: Run[] = [{ t: '주', fill: B.dim }]
      const val: Run[] = [{ t: `${Math.round(k.percent)}%`, fill: B.ink, weight: 700, mono: true }]
      // Consolas 에는 한글이 없어 "오늘"이 깨지므로 한글은 sans, 숫자만 mono 로 나눠 그린다.
      const todayFill = k.todayTone === 'mute' ? B.dim : toneOf(k.todayTone).fg
      const todayRuns: Run[] = k.today ? [{ t: '오늘 ', fill: todayFill }, { t: k.today, fill: todayFill, mono: true }] : []
      const showToday = show.today && todayRuns.length > 0
      const todayPill = k.todayTone === 'warn' || k.todayTone === 'err' // 한도를 넘긴 때만 알약
      const lw = rsW(label, 12) + 8
      const fillWeek = k.todayTone === 'err' ? B.rose : k.todayTone === 'warn' ? B.amber : 'url(#gi)'
      items.push({
        w: lw + 96 + 8 + rsW(val, 13) + (showToday ? 8 + rsW(todayRuns, 11) + (todayPill ? 16 : 0) : 0),
        draw: x => {
          const vx = x + lw + 96 + 8
          let out = `${rs(label, x, cy + 4, 12)}${gaugeBar(x + lw, cy - 3, 96, 6, k.percent, fillWeek, k.mark)}${rs(val, vx, cy + 5, 13)}`
          if (showToday) {
            const cx = vx + rsW(val, 13) + 8
            out += todayPill ? `<rect x="${cx}" y="${cy - 10}" width="${rsW(todayRuns, 11) + 16}" height="20" rx="10" fill="${toneOf(k.todayTone).bg}"/>${rs(todayRuns, cx + 8, cy + 4, 11)}` : rs(todayRuns, cx, cy + 4, 11)
          }
          return out
        },
      })
    }
    if (show.turn && d.turn) chip([{ t: '턴 ', fill: B.dim }, { t: d.turn.text, fill: B.ink, weight: 700, mono: true }], 'mute')
    if (show.children) chip([{ t: '하위 ', fill: B.dim }, { t: String(d.children), fill: d.children > 0 ? B.infoText : B.ink, weight: 700, mono: true }], 'mute')
    if (d.cache?.alert) chip([{ t: d.cache.alert, fill: toneOf(d.cache.tone).fg, weight: 700 }], d.cache.tone)
    if (d.context && show.extra !== false) items.push({ w: 18, draw: x => `<g transform="translate(${x} ${cy - 9}) scale(0.75)" fill="none" stroke="${levelSolid(d.context!.percent)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${CLOUD}"/></g>` })
    return items
  }
  const shows = [
    { children: true, turn: true, today: true },
    { children: false, turn: true, today: true },
    { children: false, turn: false, today: true },
    { children: false, turn: false, today: false },
    { children: false, turn: false, today: false, extra: false },
  ]
  let pick = shows.length - 1
  for (let i = 0; i < shows.length; i += 1) {
    const list = build(shows[i])
    const total = list.reduce((n, it) => n + it.w, 0) + 18 * Math.max(0, list.length - 1) + 12 + (noCat ? 0 : 28 + 14) + 16
    if (total <= maxW / Z) {
      pick = i
      break
    }
  }
  const items = build(shows[pick])
  const mood = d.mood ?? 'zz'
  let x = 12
  // 고양이는 왼쪽 세로 막대 대신 상태를 말한다. noCat 이면 띠 밖에서 따로 그린다(그 옆에 누를 수 있는 단추를 두려고)
  let body = noCat ? '' : catAvatar(mood, x + 14, cy)
  if (!noCat) x += 28 + 14
  items.forEach(it => {
    body += it.draw(x)
    x += it.w + 18
  })
  const hidden = (shows[pick].children ? 0 : 1) + (d.turn && !shows[pick].turn ? 1 : 0) + (d.week?.today && !shows[pick].today ? 1 : 0) + (shows[pick].extra === false && d.verify && d.verify.tone !== 'err' ? 1 : 0)
  return { svg: svgDoc(x - 18 + 16, H, body, Z, CAT[mood]), w: x - 18 + 16, hidden }
}

// 카드는 흰 바탕에 얇은 테두리로 두고, 경고(페이스가 빠를 때 주간 카드)만 호박색 바탕으로 눈에 띄게 한다. [바탕, 테두리]
const PLAIN = [B.white, B.line] as const
const TINT = { ctx: PLAIN, week: PLAIN, weekWarn: ['#FFFBEB', '#F6D58A'] } as const
const cardBox = (x: number, y: number, w: number, h: number, c: readonly [string, string] = [B.white, B.line]) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="14" fill="${c[0]}" stroke="${c[1]}"/>`
const cardTitle = (x: number, y: number, s: string) => rs([{ t: s, fill: B.dim, weight: 600 }], x, y, 12)
const commaN = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 펼친 상세: 시안 3번 2절의 2×2 카드(컨텍스트, 주간 한도, 캐시, 최근 활동)와 색 눈금 범례. */
export function panelSvg(d: Rich): { svg: string; w: number; h: number } {
  // 시안 3번의 2×2 카드. 채팅창 위 자리가 낮아 스크롤이 생기지 않게 아주 낮게 그리고(약 170px), 카드마다 파스텔 바탕을 입힌다(규칙 23).
  const W = 800
  const cw = 393
  const x1 = cw + 14
  const h1 = 80
  const sw = cw - 36
  const top = 6 // 밴드와 카드 사이 여백: 호스트 빈 줄(약 20px) 대신 이미지 안에서 6px 만 둔다
  const paceWarn = (d.week?.pace ?? 0) > 10
  // 컨텍스트: 도넛 옆에 "토큰 / 전체" 를 한 줄로 둔다(세로로 쌓지 않는다)
  let s = cardBox(0, 0, cw, h1, TINT.ctx) + cardTitle(18, 20, '컨텍스트')
  const hs = d.history
  const gw = 80 // 추이 스파크라인(카드 오른쪽 끝). 점이 둘 미만이면 그리지 않고 비워 둔다.
  const gx = cw - 18 - gw
  if (d.context) {
    const c = d.context
    const r = 17
    const circ = 2 * Math.PI * r
    s += `<circle cx="38" cy="52" r="${r}" fill="none" stroke="${B.white}" stroke-width="6"/><circle cx="38" cy="52" r="${r}" fill="none" stroke="${levelFill(c.percent, 'd')}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${((circ * Math.min(100, c.percent)) / 100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 38 52)"/>`
    s += rs([{ t: `${c.percent}%`, fill: B.ink, weight: 700, mono: true }], 38, 56, 10, 'middle')
    const tok: Run[] = [{ t: commaN(c.tokens), fill: B.ink, weight: 700, mono: true }]
    s += rs(tok, 70, 57, 16) + rs([{ t: ` / ${commaN(c.window)} 토큰`, fill: B.dim, mono: true }], 70 + rsW(tok, 16) + 4, 57, 12)
  } else s += rs([{ t: '아직 값을 읽지 못했습니다', fill: B.dim }], 18, 52, 14)
  if (hs.length >= 2) {
    const lo = Math.min(...hs)
    const hi = Math.max(Math.max(...hs), lo + 10)
    const pts = hs.map((p, i) => [(i / (hs.length - 1)) * gw, 30 - ((p - lo) / (hi - lo)) * 24] as const)
    const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
    s += `<g transform="translate(${gx} 10)"><path d="${line} L${gw} 34 L0 34 Z" fill="url(#gs)"/><path d="${line}" fill="none" stroke="${B.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`
  }
  // 주간 한도: "44%  리셋 11/18 06:00 ······ 빠름 +9%p" 를 한 줄로, 그 아래에 막대
  s += cardBox(x1, 0, cw, h1, paceWarn ? TINT.weekWarn : TINT.week) + cardTitle(x1 + 18, 20, '주간 한도')
  if (d.week) {
    const k = d.week
    const paceTone: Tone = k.pace === null ? 'mute' : k.pace > 10 ? 'warn' : 'ok'
    const big: Run[] = [{ t: `${Math.round(k.percent)}%`, fill: B.ink, weight: 700, mono: true }]
    s += rs(big, x1 + 18, 46, 24)
    const l1: Run[] = k.reset ? [{ t: '리셋 ', fill: B.dim }, { t: k.reset, fill: B.ink, weight: 700, mono: true }] : [{ t: '리셋 시각 모름', fill: B.dim }]
    s += rs(l1, x1 + 18 + rsW(big, 24) + 12, 45, 13)
    if (k.pace !== null) {
      const pt = k.pace > 0 ? `빠름 +${Math.round(k.pace)}%p` : `여유 ${Math.round(k.pace)}%p`
      // 알약 없이 글자만: 빠름은 호박색, 여유는 초록, 그 사이는 회색
      s += rs([{ t: pt, fill: toneOf(paceTone).fg, weight: 700 }], x1 + cw - 18, 44, 13, 'end')
    }
    s += gaugeBar(x1 + 18, 58, sw, 7, k.percent, k.todayTone === 'err' ? B.rose : k.todayTone === 'warn' ? B.amber : 'url(#gi)', k.mark)
    if (k.mark !== null && k.recommended !== null) s += rs([{ t: `오늘 권장 ${k.recommended.toFixed(0)}%p`, fill: B.dim }], x1 + 18 + (sw * Math.min(100, k.mark)) / 100, 77, 11, 'middle')
  } else s += rs([{ t: '주간 한도 값을 읽지 못했습니다', fill: B.dim }], x1 + 18, 52, 14)
  // 캐시·최근 활동 카드는 뺐다: 턴·검증·하위는 상단 바에, 캐시는 만료가 가까워지면 상단 바에 경고로 나온다.
  // 색 눈금 안내 줄은 뺐다: 컨텍스트 색은 25/50/75/90% 에서 바뀌고, 붉을수록 위험하다는 것은 색만 봐도 안다.
  // 하위 에이전트 줄도 뺐다: 목록은 에이전트 패널이 보여 주고, 수는 상단 바의 "하위" 칸에 있다.
  const H = h1 + 2 + top
  return { svg: svgDoc(W, H, `<g transform="translate(0 ${top})">${s}</g>`), w: W, h: H }
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
    week: week ? { percent: week.percent, mark: b && dayBase ? dayBase.percent + b.recommended : null, today: b && used !== null ? `${used.toFixed(0)}/${b.recommended.toFixed(0)}%p` : null, todayTone, reset: Number.isFinite(reset) ? `${md(reset)} ${hm(reset)}` : null, recommended: b ? b.recommended : null, pace: b ? b.pace : null } : null,
    turn: isWorking && turnStartedAt > 0 ? { text: fmtDur(now - turnStartedAt) } : lastTurnSec !== null ? { text: fmtDur(lastTurnSec * 1000) } : null,
    cache:
      lastAnswerAt > 0
        ? { tone: cacheTone, alert: isWorking || left === null ? null : left <= 0 ? '✗ 캐시 만료' : left <= 20 ? `${left <= 10 ? '✗' : '⚠'} 캐시 ${left}분` : null }
        : null,
    history,
    mood: isWorking ? 'run' : alert ? 'flag' : 'zz',
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
