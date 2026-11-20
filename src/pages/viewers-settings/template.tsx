import { createTemplate } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/admin'
import ViewersSettings from '../../shared/ViewersSettings'

// 어드민 설정 화면 — 팬 홈의 "지금 N명이 보는 중" 캡슐을 사람이 몇 명 이상일 때 보여 줄지 코드 수정 없이 정한다.
// 저장은 custom-template-data(displayKey ariana-viewers). 팬 화면(heidi 레포 홈 위젯)이 같은 키를 읽는다.
// 메뉴 위치는 코드가 아니라 포털 페이지 설정의 GNB 메뉴에서 정한다.
export default function ViewersSettingsPage() {
  return (
    <div style={{ minHeight: '100vh', background: color.bg['grouped-default'] }}>
      <ViewersSettings />
    </div>
  )
}

createTemplate(ViewersSettingsPage, {
  name: 'merry-viewers-settings',
})
