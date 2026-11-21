// 띠(band)의 디자인 토큰: 이름은 여기서만 선언하고, 그림·상자·시험은 모두 여기서 읽는다.
// 규칙: 색·간격·글자 크기를 그림 코드에 숫자로 직접 쓰지 않는다. 글자는 바탕과 4.5:1, 막대·테두리는 3:1 이상 대비를 지킨다(band.test.ts 가 두 모드를 모두 잰다).

// 모드마다 값이 다른 역할은 토큰 하나에 [light, dark] 한 쌍이다. 이름에 -dark/-light 를 붙이지 않는다
export const COLOR = {
  'background-surface': ['#FFFFFF', '#15161B'],
  'background-card': ['#F5F6F9', '#1C1E25'],
  border: ['#DADDE6', '#2F323C'],
  'border-strong': ['#7E8494', '#6E7486'], // 띠·격자 가장자리: 표면과 3:1 이상
  'text-primary': ['#171923', '#ECEEF4'],
  'text-secondary': ['#545A6C', '#A7ACBA'],
  track: ['#E3E6EE', '#2C2F39'],
  accent: ['#3F55E0', '#8C9CFF'],
  'on-accent': ['#FFFFFF', '#101116'],
  success: ['#0E7F55', '#4CD69D'],
  warning: ['#9A6200', '#F2BA4E'],
  error: ['#C42F2F', '#FF7C7C'],
  'data-1': ['#3F55E0', '#8C9CFF'], // 추이 선·이번 턴 막대
  'data-1-muted': ['#7C84B0', '#6A7299'], // 지난 턴 막대: 바탕과 3:1 이상
  'data-2': ['#0A7AB5', '#5CC8FF'], // 실행 중 하위 에이전트
} as const
// 앱(호스트) 단추 색 (실제 스크린샷 픽셀, 다크): secondary = 바탕 위 흰색 약 15% 겹침(#15161B 위 #38393D, #38393D 위 #56575A),
// primary = #EFEFEF 바탕 + 어두운 글자. 단추에는 색·선택·크기 옵션이 없어 모드가 바꿀 수 없다
export type ColorName = keyof typeof COLOR

// 띠는 앱의 모드를 따라가지 못한다(모드를 읽는 API 가 없다). 세션 보드 카드와 같은 밝은 표면이 기본이다.
// 어둡게 보려면 이 값만 'dark' 로 바꾼다 (표면 토큰만 바뀐다)
export const MODE: 'light' | 'dark' = 'light'
export const color = (name: ColorName): string => COLOR[name][MODE === 'light' ? 0 : 1]

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 } as const // spacing-N = N x 4px
// 간격 세 단계 (항목 < 묶음 < 구역). 앱 부품 사이도 이 px 로 둔다: 앱의 gap·padding 단위는 쓰지 않는다
export const GAP = { item: SPACE[1], group: SPACE[3], section: SPACE[4] } as const
export const RADIUS = { inner: 4, element: 8, container: 12, full: 9999 } as const // 안쪽 = 바깥 - 간격
export const TYPE = { xs: 10, sm: 12, body: 14, lg: 17 } as const // 14px 에서 비율 1.2 (14/1.2² ≈ 10, 14/1.2 ≈ 12, 14 x 1.2 ≈ 17)
export const SIZE = { sm: 28, md: 32 } as const // size-element
export const MOTION = { fast: 175 } as const // 들어오기 = fast
export const FONT = { sans: "'Noto Sans KR','Malgun Gothic',system-ui,sans-serif", mono: "'JetBrains Mono',Consolas,monospace" } as const

// 데스크톱 앱(호스트)의 실제 px. 그림(Svg) 밖의 앱 부품 크기는 모드가 알 수 없어 띠의 보정 화면(/session_board 보정)을
// 실제 앱에서 한 장 찍어 잰다. band.ts 의 폭·간격 계산은 이 값만 쓴다 (어림 숫자를 여기저기 쓰면 화면이 깨진다).
// measured 가 false 인 값은 아직 재지 않은 어림이다. 잰 뒤 값과 함께 measured 를 true 로 바꾼다
export const HOST = {
  measured: false,
  colPx: 8, // props.bodyColumns 1 당 px (띠 안쪽 폭 = bodyColumns x colPx)
  spacePx: 8, // Box gap·padding 1 당 px
  rowPx: 20, // Box height 1 당 px
  buttonH: 32, // 단추 높이
  buttonPadX: 12, // 단추 글자 좌우 여백(한쪽)
  latinPx: 7.5, // 단추·Text 의 영문·숫자·기호 1자 폭
  hangulPx: 13, // 단추·Text 의 한글 1자 폭
  framePadX: 10, // 둥근 테두리 상자의 안쪽 좌우 여백(한쪽, 테두리 포함)
  bandMaxPx: 320, // 띠가 잘리지 않고 보이는 높이 (maxRows x rowPx 로 확인)
  nbspPx: 3.6, // 앱 글자의 줄 바꿈 없는 공백(NBSP) 1자 폭. 앱 부품 사이 간격은 이 글자로 만든다
} as const
/** 앱 글자(Text·단추 글자)의 어림 폭: 한글과 그 밖을 따로 센다 */
export const hostTextPx = (s: string) => [...s].reduce((n, ch) => n + (/[ᄀ-ᇿ가-힣]/.test(ch) ? HOST.hangulPx : HOST.latinPx), 0)
/** 앱 단추의 폭: 글자 + 좌우 여백 */
export const hostButtonPx = (label: string) => Math.ceil(hostTextPx(label) + HOST.buttonPadX * 2)

// SVG 이미지 안에서 쓰는 클래스: 색은 var(--color-*) 로만 읽는다. animate 이면 칸이 들어오고, 줄인 움직임에서는 이동 없이 나타나기만 한다
export const CLASS = { t1: 'text-primary', t2: 'text-secondary', acc: 'accent', ok: 'success', warn: 'warning', err: 'error', trk: 'track', d1: 'data-1', d2: 'data-2', mut: 'data-1-muted', onacc: 'on-accent' } as const
export type ClassName = keyof typeof CLASS
export function styleBlock(animate = false): string {
  const vars = (Object.keys(COLOR) as ColorName[]).map(n => `--color-${n}:${color(n)}`).join(';')
  const fills = (Object.entries(CLASS) as [ClassName, ColorName][]).map(([c, n]) => `.${c}{fill:var(--color-${n})}`).join('')
  const enter = animate
    ? `.enter{animation:enter ${MOTION.fast}ms cubic-bezier(0,0,.2,1) both}@keyframes enter{from{opacity:0;transform:translateY(${SPACE[1]}px)}to{opacity:1;transform:none}}` +
      `@media (prefers-reduced-motion: reduce){.enter{animation:fade ${MOTION.fast}ms linear both}@keyframes fade{from{opacity:0}to{opacity:1}}}`
    : ''
  return `<style>svg{${vars}}${fills}.surface{fill:var(--color-background-surface);stroke:var(--color-border-strong)}.card{fill:var(--color-background-card)}.line{fill:none;stroke:var(--color-data-1);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.num{font-variant-numeric:tabular-nums}${enter}</style>`
}
