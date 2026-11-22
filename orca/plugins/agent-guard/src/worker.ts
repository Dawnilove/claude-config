// 가드: Orca 터미널의 에이전트가 도구를 쓰기 전에 이 워커가 먼저 본다 (agent.tool.before).
// Claude Code 는 답을 기다리므로 { deny } 가 도구 호출을 막는다. 다른 에이전트는 호출을 알리기만 해서 거부가 무시된다.
// session-board 의 edit-guard 와 secret-guard 를 Orca 로 옮긴 것이다 (거부 문구도 같다).
// 가드마다 Settings 에서 끌 수 있다. 플러그인 전체를 끄려면 Orca 의 Settings > Plugins 에서 끈다.
import type { OrcaWorkerApi } from 'orca/worker'
import { corruptReason } from './edit-rules'
import { secretInCommand, secretPath } from './secret-rules'

export type Flags = { editGuard: boolean; secretGuard: boolean }
const DEFAULT_FLAGS: Flags = { editGuard: true, secretGuard: true }

const SHELLS = new Set(['Bash', 'PowerShell'])

const field = (input: unknown, key: string): string => {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined
  return typeof value === 'string' ? value : ''
}

const editDeny = (reason: string) =>
  `✗ edit-guard 막음 · ${reason}\n이유   파일을 조용히 깨뜨릴 수 있는 명령입니다\n대신   Edit 또는 Write 도구로 수정한 뒤 결과를 확인하세요\n재시도 사용자가 이 방식을 직접 요청한 경우에만 다시 시도하세요`

const secretDeny = (name: string) =>
  `✗ secret-guard 막음 · ${name}\n이유   비밀 파일의 내용이 대화와 기록에 남습니다\n대신   필요한 값의 이름만 사용자에게 묻거나, .example 파일을 읽으세요\n재시도 사용자가 이 파일을 읽으라고 직접 요청한 경우에만 사용자에게 직접 열어 보라고 안내하세요`

/** 거부할 이유(한국어 사유 전체). 막을 것이 없거나 그 가드가 꺼져 있으면 null. 입출력이 없다. */
export function denyReason(tool: string, input: unknown, flags: Flags = DEFAULT_FLAGS): string | null {
  if (tool === 'Read') {
    if (!flags.secretGuard) return null
    const hit = secretPath(field(input, 'file_path'))
    return hit === null ? null : secretDeny(hit)
  }
  if (!SHELLS.has(tool)) return null
  const command = field(input, 'command')
  if (flags.editGuard) {
    const corrupt = corruptReason(command, tool as 'Bash' | 'PowerShell')
    if (corrupt !== null) return editDeny(corrupt)
  }
  if (!flags.secretGuard) return null
  const secret = secretInCommand(command)
  return secret === null ? null : secretDeny(secret)
}

/** 값이 boolean 이 아니면(설정을 못 읽음 포함) 기본값을 쓴다: 못 읽어서 가드가 꺼지면 안 된다. */
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

async function readFlags(orca: OrcaWorkerApi): Promise<Flags> {
  const [editGuard, secretGuard] = await Promise.all([orca.settings.get('editGuard'), orca.settings.get('secretGuard')])
  return { editGuard: flag(editGuard, DEFAULT_FLAGS.editGuard), secretGuard: flag(secretGuard, DEFAULT_FLAGS.secretGuard) }
}

export default function activate(orca: OrcaWorkerApi): void {
  // 훅은 바로 답해야 하므로 설정은 메모리에 두고, 바뀔 때만 다시 읽는다. 읽기 전에는 기본값(둘 다 켬)이다.
  let flags: Flags = DEFAULT_FLAGS
  const refresh = () => readFlags(orca).then(next => { flags = next }, error => orca.log(`settings read failed: ${String(error)}`))
  void refresh()
  orca.settings.onDidChange(() => void refresh())

  orca.hooks.on('agent.tool.before', (event) => {
    // 먼저 정한다: 돌려주기 전에 await 가 실패하거나 늦으면 그대로 통과한다.
    const reason = denyReason(event.tool, event.input, flags)
    if (reason === null) return undefined
    // 명령 내용은 기록하지 않는다 (비밀 값이 섞일 수 있다). 도구 이름만 남긴다.
    orca.log(`denied ${event.tool} in ${event.terminalId ?? 'unknown terminal'}`)
    return { deny: reason }
  })
}
