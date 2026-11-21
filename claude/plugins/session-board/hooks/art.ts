// session-board 의 그림과 머리글: 색, 고양이 아바타, 칸 머리글. 입출력이 없는 순수 함수만 둔다.

import { OLD_ASK_MS, deadLabel, isDead, openAsk, openReport } from './asks'
import type { Group } from './asks'
import { catSymbol } from './cat'
import type { Rec } from './register'

// 색은 이 저장소(plugins/)의 다른 모드와 같다. 앱 테마는 읽을 수 없어 고정 색을 쓴다.
const C = { ink: '#14172B', dim: '#5B6080', line: '#E3E6F2', soft: '#EEF0F8', white: '#FFFFFF', indigo: '#4F6BFF', amber: '#FBBF24' }

export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}초`
  if (s < 3600) return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`
  return `${Math.floor(s / 3600)}시간 ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}분`
}

export const KIND_LABEL = { request: '결재', notice: '알림' } as const

export function barSvg(done: number, total: number, color: string, w = 160): string {
  const fill = total > 0 ? Math.round((w * Math.min(done, total)) / total) : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 6"><rect width="${w}" height="6" rx="3" fill="${C.line}"/>${fill > 0 ? `<rect width="${fill}" height="6" rx="3" fill="${color}"/>` : ''}</svg>`
}

// 고양이는 cat.ts 에 있다. 여기서는 상태 셋(달리는 / 깃발 든 / 조는)만 고른다.
const P = { indigoText: '#3F5BEF', amberText: '#92400E' }
// 그림 글자의 폭(px) 어림. 띠(band.ts)도 이것을 쓴다
export const isWide = (ch: string) => /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch)
export const tw = (s: string, size: number, mono = false, bold = false) => [...s].reduce((n, ch) => n + (isWide(ch) ? size : size * (mono ? 0.6 : 0.56)) * (bold && !mono ? 1.05 : 1), 0)
/** 폭을 넘으면 끝을 줄이고 …을 붙인다. */
function clip(s: string, max: number, size: number): string {
  if (tw(s, size) <= max) return s
  let o = s
  while (o.length > 1 && tw(`${o}…`, size) > max) o = o.slice(0, -1)
  return `${o}…`
}

type Mood = Exclude<Group, 'hidden'>
type Skin = { bubble: string; text: string; bead: string; cat: 'run' | 'flag' | 'zz'; alt: string }
// 묶음마다 파스텔 한 벌: 카드 바탕·테두리, 아바타 동그라미, 알약, 구슬 색. 결재는 빨강, 알림은 호박색, 확인은 초록 (결재함의 색 규칙)
const SKIN: Record<Mood, Skin> = {
  running: { bubble: '#E4E9FF', text: P.indigoText, bead: C.indigo, cat: 'run', alt: '달리는' },
  request: { bubble: '#FFE4E8', text: '#BE123C', bead: '#F43F5E', cat: 'flag', alt: '깃발 든' },
  notice: { bubble: '#FEF3C7', text: P.amberText, bead: C.amber, cat: 'flag', alt: '깃발 든' },
  report: { bubble: '#DEF5ED', text: '#047857', bead: '#10B981', cat: 'flag', alt: '깃발 든' },
}

/** 상태에 맞는 고양이가 파스텔 동그라미 안에 있는 36x36 아바타. 필요한 고양이 하나만 담는다. phaseMs 는 이 세션 고양이의 위상(상태 시작 시각 + id 해시)이다. */
export function avatarSvg(g: Mood, phaseMs = 0): string {
  const s = SKIN[g]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><defs>${catSymbol(s.cat, phaseMs)}</defs><circle cx="18" cy="18" r="17" fill="${s.bubble}"/><use href="#${s.cat}" x="4" y="5" width="28" height="28"/></svg>`
}

/** 세션 칸 머리글: 상태 글자, 뜻 색, 시간. 색은 앱 테마의 뜻 색이라 어두운 테마도 따라간다 (결재함 틀, 2026-11-16 사용자 결정 B안). */
export type Head = { label: string; color: 'error' | 'warning' | 'success' | 'suggestion' | undefined; time: string; dim: boolean }

/** 칸의 머리글을 정한다. 작업 목록이 있으면 시간 뒤에 단계(3/7 단계)를 붙인다. */
export function headOf(r: Rec, g: Mood, now: number): Head {
  const ask = openAsk(r)
  const report = openReport(r)
  const dur = (at: number) => fmtDur(now - at)
  const steps = r.total > 0 ? ` · ${r.done}/${r.total} 단계` : ''
  if (isDead(r, now)) return { label: deadLabel(r), color: undefined, time: ask || report ? dur((ask ?? report)!.at) : '', dim: true }
  if (g === 'request' || g === 'notice') {
    const color = g === 'request' ? 'error' : 'warning'
    if (r.state === 'waiting') return { label: `${r.waitFor ?? '응답'} 대기`, color, time: dur(r.since) + steps, dim: false }
    return { label: `${KIND_LABEL[g]}${ask && now - ask.at > OLD_ASK_MS ? ' 낡음' : ''}`, color, time: dur(ask?.at ?? r.since) + steps, dim: false }
  }
  if (g === 'report') return { label: '확인', color: 'success', time: dur(report?.at ?? r.since) + steps, dim: false }
  return { label: '작업 중', color: 'suggestion', time: (r.turnStartedAt !== null ? dur(r.turnStartedAt) : '') + steps, dim: false }
}

export { C, SKIN, clip }
export type { Mood }
