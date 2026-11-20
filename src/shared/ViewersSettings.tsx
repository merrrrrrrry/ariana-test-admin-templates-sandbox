import { useEffect, useState, type CSSProperties } from 'react'
import { color, textStyle } from '@bstage-sdk/design/admin'
import { isLocalPreview, readViewersConfig, writeViewersConfig, type StoredViewersConfig } from './viewersStorage'
import { MIN_WATCHING_LIMIT, clampMinWatching } from './viewersConfig'

// 어드민 "실시간 뷰어 수" 설정 — 팬 홈의 "지금 N명이 보는 중" 캡슐을 사람이 어느 정도 모였을 때만 보여 줄지 정한다.
// 저장 위치: custom-template-data (displayKey ariana-viewers). 팬 화면(heidi 홈 위젯 안의 캡슐)이 같은 키를 읽어 반영한다.

const SAMPLE_COUNTS = [1, 2, 3, 5, 10]

const cardStyle: CSSProperties = {
  background: color.bg.base,
  border: `1px solid ${color.border['divider-a']}`,
  borderRadius: 12,
  padding: 24,
  marginTop: 16,
}

const inputStyle: CSSProperties = {
  ...textStyle('13/body/reg'),
  width: 96,
  boxSizing: 'border-box',
  padding: '9px 12px',
  borderRadius: 8,
  border: `1px solid ${color.border['default-a']}`,
  background: color.surface['form-weak-a'],
  color: color.text.primary,
}

function buttonStyle(kind: 'primary' | 'secondary', disabled: boolean): CSSProperties {
  return {
    ...textStyle('13/body/med'),
    padding: '9px 16px',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    border: kind === 'primary' ? 'none' : `1px solid ${color.border['default-a']}`,
    background: kind === 'primary' ? `var(--button-color, ${color.surface['form-bstage']})` : color.bg.base,
    color: kind === 'primary' ? color.bg.base : color.text.primary,
  }
}

/** 팬 화면과 같은 규칙: 기준이 0 이하면 항상 보이고, 아니면 보는 사람이 기준 이상일 때만 보인다. */
function shows(watching: number, min: number): boolean {
  return min <= 0 || watching >= min
}

export default function ViewersSettings() {
  const [stored, setStored] = useState<StoredViewersConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('0')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // 처음 열 때와 "다시 불러오기"를 누를 때(reloadKey가 바뀔 때) 저장된 값을 읽는다.
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    readViewersConfig()
      .then((next) => {
        if (cancelled) return
        setLoadError(null)
        setStored(next)
        setDraft(String(next.config.minWatching))
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '설정을 불러오지 못했어요')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const parsed = clampMinWatching(draft)
  const valid = parsed !== null && String(parsed) === draft.trim()
  const savedValue = stored ? stored.config.minWatching : null
  const changed = valid && parsed !== savedValue

  async function onSave() {
    if (!valid || parsed === null) return
    setSaving(true)
    setSaveError(null)
    try {
      await writeViewersConfig({ version: 1, minWatching: parsed })
      setStored({ config: { version: 1, minWatching: parsed }, exists: true })
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요')
    } finally {
      setSaving(false)
    }
  }

  const minForExplain = valid && parsed !== null ? parsed : savedValue ?? 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 48px' }}>
      <h1 style={{ ...textStyle('16/title/bold'), color: color.text.primary, margin: 0 }}>실시간 뷰어 수</h1>
      <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '6px 0 0', lineHeight: 1.55 }}>
        팬 홈 위쪽의 "지금 N명이 보는 중" 캡슐을 언제 보여 줄지 정해요. 사람이 너무 적을 때는 오히려 썰렁해 보일 수 있어서, 보는 사람이
        기준 이상 모였을 때만 보이게 할 수 있어요.
      </p>

      {isLocalPreview() && (
        <p style={{ ...textStyle('12/body/reg'), color: color.text.red, margin: '12px 0 0' }}>
          로컬 미리보기예요. 저장해도 이 브라우저에만 남고 팬 화면에는 닿지 않아요.
        </p>
      )}

      <div style={cardStyle}>
        {loadError ? (
          <div>
            <p style={{ ...textStyle('13/body/reg'), color: color.text.red, margin: '0 0 12px' }}>{loadError}</p>
            <button
              type="button"
              style={buttonStyle('secondary', false)}
              onClick={() => {
                setLoadError(null)
                setReloadKey((key) => key + 1)
              }}
            >
              다시 불러오기
            </button>
          </div>
        ) : !stored ? (
          <p style={{ ...textStyle('13/body/reg'), color: color.text['sub-a'], margin: 0 }}>불러오는 중…</p>
        ) : (
          <>
            <label htmlFor="viewers-min-watching" style={{ ...textStyle('13/body/med'), color: color.text.primary, display: 'block' }}>
              최소 인원
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                id="viewers-min-watching"
                type="number"
                inputMode="numeric"
                min={0}
                max={MIN_WATCHING_LIMIT}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={inputStyle}
              />
              <span style={{ ...textStyle('13/body/reg'), color: color.text.secondary }}>명 (0~{MIN_WATCHING_LIMIT})</span>
            </div>
            {!valid && (
              <p style={{ ...textStyle('12/body/reg'), color: color.text.red, margin: '6px 0 0' }}>
                0부터 {MIN_WATCHING_LIMIT}까지의 정수로 적어 주세요.
              </p>
            )}
            <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '8px 0 0', lineHeight: 1.55 }}>
              {minForExplain <= 0
                ? '0이면 사람이 적어도 항상 보여요. (아직 저장한 적이 없을 때의 기본값이에요)'
                : `지금 보는 사람이 ${minForExplain}명 이상일 때만 보여요. 보는 사람에는 본인도 들어가서, ${minForExplain}명이면 다른 팬이 ${minForExplain - 1}명 이상 있을 때 보이는 셈이에요.`}
            </p>

            <div style={{ marginTop: 20 }}>
              <div style={{ ...textStyle('13/body/med'), color: color.text.primary, marginBottom: 8 }}>이 기준이면</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SAMPLE_COUNTS.map((n) => {
                  const visible = shows(n, minForExplain)
                  return (
                    <li
                      key={n}
                      style={{
                        ...textStyle('12/body/med'),
                        padding: '6px 12px',
                        borderRadius: 999,
                        background: visible ? color.bg['grouped-default'] : 'transparent',
                        border: `1px ${visible ? 'solid' : 'dashed'} ${color.border['default-a']}`,
                        color: visible ? color.text.primary : color.text['sub-a'],
                      }}
                    >
                      지금 {n}명 → {visible ? '보여요' : '숨겨요'}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
              <button type="button" style={buttonStyle('primary', !changed || saving)} disabled={!changed || saving} onClick={() => void onSave()}>
                {saving ? '저장하는 중…' : '저장'}
              </button>
              <button
                type="button"
                style={buttonStyle('secondary', !stored || saving || draft === String(savedValue))}
                disabled={!stored || saving || draft === String(savedValue)}
                onClick={() => {
                  setDraft(String(savedValue ?? 0))
                  setSaveError(null)
                }}
              >
                되돌리기
              </button>
              <span style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'] }}>
                {stored.exists ? `지금 저장된 값: ${savedValue}명` : '아직 저장한 값이 없어요 (항상 보임)'}
              </span>
            </div>

            {saveError && <p style={{ ...textStyle('12/body/reg'), color: color.text.red, margin: '12px 0 0' }}>{saveError}</p>}
            {savedAt && !saveError && (
              <p style={{ ...textStyle('12/body/reg'), color: color.text.secondary, margin: '12px 0 0' }}>
                저장했어요. 팬 화면에는 보통 1분 안에 반영돼요(이미 열려 있는 화면은 새로고침해야 바뀌어요).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
