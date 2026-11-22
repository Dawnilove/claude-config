// secret-guard 규칙: 비밀 파일(.env, .credentials.json, 개인 키)을 읽는 경로와 명령을 찾는다. 읽기만 막는다.
// 입출력이 없는 순수 함수다. 원본: claude/plugins/session-board/hooks/secrets.ts (규칙을 고치면 두 파일을 같이 고친다).

const SECRET_NAME = /^(\.env(\..+)?|\.credentials\.json|id_(rsa|dsa|ecdsa|ed25519)|.+\.(pem|key|p12|pfx))$/i
const SAFE_SUFFIX = /\.(example|sample|template|dist|pub)$/i
// 파일 내용을 출력하는 명령. 이 명령이 있을 때만 셸 명령을 막는다
const READ_VERB = /(^|[\s;|&(])(cat|type|gc|get-content|head|tail|less|more|bat|select-string|grep|rg|base64|xxd|od|strings)(\.exe)?(?=[\s]|$)/i

export function secretPath(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? ''
  if (name === '' || SAFE_SUFFIX.test(name)) return null
  return SECRET_NAME.test(name) ? name : null
}

export function secretInCommand(command: string): string | null {
  if (!READ_VERB.test(command)) return null
  for (const token of command.split(/[\s;|&()<>]+/)) {
    const word = token.replace(/^['"]|['"]$/g, '')
    // 백슬래시 1개로 시작하면 검색 패턴의 정규식(\.env)이다. 경로는 C:\, .\, \\server(UNC)로 시작한다
    if (/^\\(?!\\)/.test(word)) continue
    const hit = secretPath(word)
    if (hit !== null) return hit
  }
  return null
}
