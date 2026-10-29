import { client } from './client'
import { isLocalPreview } from './storage'
import { CONFIG_KEY } from './starCommentsConfig'

// ────────────────────────────────────────────────────────────────────────
// 연결 점검 — 이 화면과 팬 화면이 쓰는 API가 지금 응답하는지 운영자가 바로 본다.
// 어드민 키(MANAGEMENT)로 부를 수 있는 API만 확실하게 점검한다. 팬 화면이 쓰는 공개 API(스타 목록 · 스타 스토리 피드)는
// 어드민 키로는 막혀 있을 수 있어서, 시도해 보고 안 되면 "확인할 수 없음"으로 알려 준다(실패로 단정하지 않는다).
//   ok          정상
//   info        정상 동작이지만 알아둘 점(예: 라운지가 없는 스테이지)
//   fail        실패 — 응답이 오류
//   unavailable 어드민 키로는 확인할 수 없음 — 팬 화면 ?curate=1 점검 줄에서 확인한다
// ────────────────────────────────────────────────────────────────────────

export type CheckState = 'ok' | 'info' | 'fail' | 'unavailable'

export interface CheckResult {
  name: string
  state: CheckState
  status: number | null
  note: string
  ms: number
}

interface CheckSpec {
  name: string
  path: string
  params?: Record<string, string | number>
  pathParams?: Record<string, string>
  /** 어드민 키로 부를 수 없을 수 있는 팬 쪽 공개 API */
  publicApi?: boolean
  judge: (status: number | null) => { state: CheckState; note: string }
}

const okOnly = (okNote: string) => (status: number | null) =>
  status !== null && status >= 200 && status < 300
    ? { state: 'ok' as const, note: okNote }
    : { state: 'fail' as const, note: status === null ? '응답이 없어요' : `HTTP ${status} — 응답이 오류예요` }

const CHECKS: CheckSpec[] = [
  {
    name: '설정 저장소',
    path: '/home/v1/custom-template-data/{displayKey}',
    pathParams: { displayKey: CONFIG_KEY },
    judge: (status) =>
      status === 404
        ? { state: 'info', note: '아직 저장된 설정이 없어요(처음 저장하면 만들어져요)' }
        : okOnly('설정을 읽을 수 있어요')(status),
  },
  { name: '콘텐츠 홈 · 큐레이션', path: '/home/v1/home/content', judge: okOnly('큐레이션 섹션을 읽을 수 있어요') },
  {
    name: '라운지 홈',
    path: '/home/v1/pages/lounge-index',
    judge: (status) =>
      status === 400 || status === 404
        ? { state: 'info', note: '라운지가 없는 스테이지로 보여요 — 라운지 자리는 숨겨져요' }
        : okOnly('라운지 홈이 있어요')(status),
  },
  {
    name: '스타 목록 (팬 공개 API)',
    path: '/home/v1/star-home/stars',
    publicApi: true,
    judge: okOnly('정상이에요'),
  },
  {
    name: '스타 스토리 피드 (팬 공개 API)',
    path: '/home/v1/star-home/feeds',
    params: { page: 1, pageSize: 1 },
    publicApi: true,
    judge: okOnly('정상이에요'),
  },
]

function statusOf(err: unknown): number | null {
  const status = typeof err === 'object' && err !== null ? (err as { status?: number }).status : undefined
  return typeof status === 'number' ? status : null
}

async function runCheck(spec: CheckSpec): Promise<CheckResult> {
  const started = Date.now()
  let status: number | null = null
  try {
    await client.get<unknown>(spec.path, { path: spec.pathParams, params: spec.params })
    status = 200
  } catch (err) {
    status = statusOf(err)
  }
  const ms = Date.now() - started
  const ok = status !== null && status >= 200 && status < 300
  if (spec.publicApi && !ok) {
    return {
      name: spec.name,
      state: 'unavailable',
      status,
      ms,
      note: `어드민 키로는 확인할 수 없어요(${status === null ? '응답 없음' : `HTTP ${status}`}). 팬 화면 주소 끝에 ?curate=1 을 붙여 확인하세요`,
    }
  }
  return { name: spec.name, status, ms, ...spec.judge(status) }
}

/** 모든 점검을 동시에 실행한다. 로컬 미리보기에는 어드민 호출이 없어서 null을 돌려준다. */
export async function runConnectionChecks(): Promise<CheckResult[] | null> {
  if (isLocalPreview()) return null
  return Promise.all(CHECKS.map(runCheck))
}
