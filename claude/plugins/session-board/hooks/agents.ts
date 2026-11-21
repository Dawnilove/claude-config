// agent-panel: 하위 에이전트를 세션 보드 패널 아래에 칸 하나씩 보여 준다. 실행 중인 것이 위다.
//   칸: 고양이 | ● 상태 · 시간 / 이름 / 유형 · 호출 수 · 마지막 도구
// Svg 요소가 있는 화면(데스크톱 등)에서는 칸마다 우주비행사 고양이를 그리고, 없는 화면(터미널)은 글자 얼굴을 쓴다.
// 패널을 못 그리는 좁은 창에서는 아무것도 그리지 않는다(relay-band 의 "하위 N" 칸이 대신한다).
// 호스트가 소스에서 on(...) 과 $.noun.method(...) 를 읽으므로 literal 로 쓰고, $ 를 받는 도우미는 최상위 함수로 둔다.
// 세션 보드 플러그인의 모듈이다. 오른쪽 패널을 하나로 쓰려고 옮겼다 (2026-11-16 사용자 결정)

import type { Register } from 'claude-code'

import { fmtDur } from './art'
import { bandTick } from './band'
import { catMotionSvg, catSvg, hashMs } from './cat'
import type { CatState } from './cat'

export type { CatState }

// 세션 보드와 같은 패널을 쓴다
const PANE_ID = 'session-board'
// 고양이 프레임 간격. 설계는 140ms 였지만 갱신 비용을 아직 못 재서 250ms 로 시작한다. 부드러우면 줄이고, 버거우면 늘린다.
const FRAME_MS = 250
const LIST_EVERY = 20 // 프레임 20개마다(5초) 목록을 다시 읽는다
const KEEP = 20 // shortcut: 끝난 에이전트는 최근 20개만 남긴다
const HIDE_MS = 5 * 60 * 1000 // 끝난 지 5분이 지난 에이전트는 패널에 그리지 않는다 (2026-11-16 사용자 결정)

/** 패널에 그릴 에이전트인가. 지우지 않고 숨긴다: 목록 읽기(syncList)가 지운 에이전트를 다시 넣기 때문이다. */
export const isShown = (endedAt: number | null, now: number): boolean => endedAt === null || now - endedAt < HIDE_MS
// 24칸 도트를 정확히 2배로 그린다. 36px(1.5배)는 선 굵기가 고르지 않고 표정이 뭉개졌다.
const CAT_PX = 48

type A = {
  id: string
  name: string
  type: string
  status: string
  startedAt: number
  endedAt: number | null
  calls: number
  lastTool: string
}

const agents = new Map<string, A>()
let frame = 0
let ticker: { cancel: () => void } | null = null
let autoOpened = false

// 유형마다 표정 순서가 다르다. 한 글자(한 코드포인트)이고 동아시아 모호 폭이 아닌 글자만 쓴다(ö ô õ o).
// ò ó 는 한국어 터미널에서 두 칸이 될 수 있어 뺐다.
export const FRAMES: Record<string, string[]> = {
  Explore: ['õ', 'ö', 'ô', 'ö'], // 두리번
  Plan: ['õ', 'õ', 'ö', 'ô'], // 골똘
  'general-purpose': ['ö', 'ö', 'ö', 'o'], // 깜빡
}
export const DEFAULT_FRAMES = ['ö', 'ö', 'o', 'o']

const LABEL: Record<string, string> = {
  pending: '준비',
  running: '실행 중',
  waiting: '대기',
  idle: '대기',
  completed: '완료',
  failed: '실패',
  killed: '중단',
}
const isLive = (status: string) => status === 'running' || status === 'pending'
// 상태는 기호(윗줄)와 단어(아랫줄)와 색, 세 가지로 말한다. 테마 색 이름을 쓴다.
const COLOR: Record<string, string> = { running: 'suggestion', pending: 'suggestion', completed: 'success', failed: 'error', killed: 'warning' }

// 고양이 그림과 움직임은 cat.ts 에 있다.

/** 에이전트 상태를 고양이 상태로 옮긴다. 대기·중단 같은 그 밖의 상태도 빠짐없이 받는다. */
export function catState(status: string): CatState {
  return isLive(status) ? 'run' : status === 'completed' ? 'done' : status === 'failed' || status === 'killed' ? 'fail' : 'idle'
}

/** 고양이를 움직이는 타이머를 건다. 세션 보드의 session.start 가 부른다(한 모듈은 같은 이벤트를 조건 없이 두 번 걸 수 없다). */
export function startAgentTicker($: any) {
  ticker?.cancel()
  ticker = $.clock.every(FRAME_MS, () => step($))
}

/** 하위 에이전트의 도구 호출만 센다. 호출은 막지도 바꾸지도 않는다. 세션 보드의 tool.call 이 부른다. */
export function countAgentCall(e: any) {
  const id = e.agentId as string | undefined
  const a = id ? agents.get(id) : undefined
  // 하위 에이전트가 결과를 돌려주는 내부 호출은 작업으로 세지 않는다.
  if (a && e.tool !== 'SubagentHandback') {
    a.calls += 1
    a.lastTool = String(e.tool ?? '-')
  }
}

export const register: Register = on => {
  on('agent.spawn', async ($, e, next) => {
    const result: any = await next(e)
    if (result?.agentId) {
      agents.set(result.agentId, {
        id: result.agentId,
        name: String((e as any).description ?? '') || result.agentId,
        type: String((e as any).subagentType ?? ''),
        status: 'running',
        startedAt: await $.clock.now(),
        endedAt: null,
        calls: 0,
        lastTool: '-',
      })
      // 첫 하위 에이전트가 시작하면 세션 보드 패널을 한 번 연다. 이미 열려 있으면 그대로다
      if (!autoOpened) {
        autoOpened = true
        await $.ui.open({ id: PANE_ID, title: '세션' })
      }
      $.ui.invalidate('ui.render')
    }
    await bandTick($) // 띠의 "하위 N" 도 다시 센다 (한 모듈은 agent.spawn 을 조건 없이 두 번 걸 수 없다)
    return result
  })

  // 세션 보드(아래 모듈)를 먼저 그리고 그 아래에 하위 에이전트 묶음을 붙인다. 에이전트가 없으면 세션 보드만이다
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    const board: any = await next(e)
    const now = Date.now()
    const all = [...agents.values()].filter(a => isShown(a.endedAt, now))
    if (all.length === 0) return board
    const t = $.ui.resolve(e) as any
    const { Box, Text } = t
    const anyLive = all.some(a => isLive(a.status))
    // 실행 중을 위에, 그 안에서는 늦게 시작한 것부터. 끝난 것은 늦게 끝난 것부터
    const ordered = [...all.filter(a => isLive(a.status)).sort((a, b) => b.startedAt - a.startedAt), ...all.filter(a => !isLive(a.status)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))]
    const section = Box({
      key: 'agents',
      flexDirection: 'column',
      gap: 'xs',
      children: [
        Text({ key: 'h', dimColor: true, size: 'caption', weight: 'semibold', children: `하위 에이전트 ${all.length} · 호출 ${all.reduce((n, a) => n + a.calls, 0)}회` }),
        ...ordered.map(a => agentSlot(t, a, now, anyLive)),
      ],
    })
    return Box({ flexDirection: 'column', gap: 'md', children: [Box({ key: 'board', flexDirection: 'column', children: [board] }), section] })
  })
}

/**
 * 에이전트 하나의 칸(결재함 틀, 세션 보드 칸과 같은 모양): 고양이 | 머리글(● 상태 · 시간) 위, 이름 가운데, 유형·호출 아래.
 * 색은 테마의 뜻 색이다. Svg 가 없는 화면(터미널)은 고양이 대신 글자 얼굴을 머리글 앞에 둔다.
 */
function agentSlot(t: any, a: A, now: number, animate: boolean) {
  const { Box, Text, Svg } = t
  const time = fmtDur((a.endedAt ?? now) - a.startedAt)
  const set = FRAMES[a.type] ?? DEFAULT_FRAMES
  const face = Svg ? '●' : isLive(a.status) ? set[Math.floor(frame / 2) % set.length] : a.status === 'completed' ? '✓' : a.status === 'failed' ? '✗' : '·'
  const text = Box({
    key: 'text',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    children: [
      Box({
        key: 'head',
        flexDirection: 'row',
        gap: 'sm',
        children: [
          Text({ key: 'st', color: COLOR[a.status], size: 'caption', weight: 'semibold', children: `${face} ${LABEL[a.status] ?? a.status}` }),
          Text({ key: 'tm', size: 'caption', dimColor: true, children: time }),
        ],
      }),
      // 실패한 에이전트는 이름도 오류 색으로 쓴다
      Text({ key: 'nm', color: a.status === 'failed' ? 'error' : undefined, wrap: 'truncate-end', children: a.name }),
      Text({ key: 'sub', size: 'caption', dimColor: true, wrap: 'truncate-end', children: `${a.type || '-'} · ${a.calls === 0 ? '호출 없음' : `호출 ${a.calls}회 · ${a.lastTool}`}` }),
    ],
  })
  const st = catState(a.status)
  // 움직임은 SVG 안(SMIL)에서 돈다. 에이전트마다 위상이 달라 박자가 다르다(지금 - 시작 시각 + id 해시).
  // 아무도 일하지 않으면 정해진 한 프레임으로 멈춘다.
  const kind = FRAMES[a.type] ? a.type : 'default'
  const source = animate ? catMotionSvg(st, kind, now - a.startedAt + hashMs(a.id)) : catSvg(st, 1, kind)
  const cat = Svg ? Box({ key: 'cat', flexShrink: 0, children: [Svg({ source, alt: `우주비행사 고양이 (${LABEL[a.status] ?? a.status})`, width: CAT_PX, height: CAT_PX })] }) : null
  return Box({
    key: a.id,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 'sm',
    borderStyle: 'single',
    borderColor: 'subtle',
    borderDimColor: true,
    paddingX: 'md',
    paddingY: 'sm',
    children: [cat, text],
  })
}

// 한 프레임: 캐릭터를 한 칸 넘기고, 가끔 목록을 읽어 상태를 맞춘다.
async function step($: any) {
  frame += 1
  const anyLive = [...agents.values()].some(a => isLive(a.status))
  if (frame % LIST_EVERY === 0) await syncList($)
  if (anyLive || frame % LIST_EVERY === 0) $.ui.invalidate('ui.render')
}

async function syncList($: any) {
  try {
    const list: any[] = await $.agent.list()
    const now = await $.clock.now()
    for (const info of list) {
      let a = agents.get(info.id)
      if (!a) {
        a = { id: info.id, name: info.description || info.id, type: info.type ?? '', status: info.status, startedAt: now, endedAt: null, calls: 0, lastTool: '-' }
        agents.set(info.id, a)
      }
      a.status = info.status
      if (!isLive(a.status) && a.endedAt === null) a.endedAt = now
    }
    const finished = [...agents.values()].filter(a => a.endedAt !== null).sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0))
    for (const old of finished.slice(KEEP)) agents.delete(old.id)
  } catch {
    // 목록을 못 읽으면 이전 값을 둔다
  }
}
