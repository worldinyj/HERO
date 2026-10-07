# HERO 설계 문서

원전 인적오류 예방 시뮬레이션 게임 **HERO : Human Error Risk Operations** 설계 문서입니다.

**Baseline: v1.3 · 2026-10-07**

| 순서 | 문서 | 내용 |
|---|---|---|
| 1 | [01_PRD.md](01_PRD.md) | 제품 요구사항 — 비전, 권한, 게임/학습 원칙, 리더보드·OPIS 콘텐츠, KPI |
| 2 | [02_TRD.md](02_TRD.md) | 기술 요구사항 — Supabase + Cloudflare Pages, DB·RLS, 초대, 시나리오 스키마, 엔진·점수 무결성 |
| 3 | [03_UXUI.md](03_UXUI.md) | UX/UI — 모바일 우선 흐름, 공명전식 전술 비주얼노벨, 인과 회고, 관리자/담당자 화면 |
| 4 | [04_TASKLIST.md](04_TASKLIST.md) | 구현 작업 — Phase 0~7(MVP), Release 2/3 백로그, 완료 기준 |
| 5 | [05_TRACEABILITY.md](05_TRACEABILITY.md) | 문서 간 추적성 — 공통 계약, 요구사항군→설계/화면/작업 매핑, 릴리스 경계 |
| 6 | [06_AUDIO_ASSET_GUIDE.md](06_AUDIO_ASSET_GUIDE.md) | BGM/SFX 제작·검수·파일명·manifest·웹 재생 정책 |\n| 7 | [07_TERMS_PRIVACY_DRAFT.md](07_TERMS_PRIVACY_DRAFT.md) | 이용약관·개인정보 처리방침 검토 초안, 확정 필요 항목 체크리스트 |
| 8 | [08_HP_BALANCE_REPORT.md](08_HP_BALANCE_REPORT.md) | HP Point 밸런스, 파밍·리플레이 남용 검토 및 자동 검증 기준 |\n| 9 | [09_DEPLOYMENT_BOOTSTRAP.md](09_DEPLOYMENT_BOOTSTRAP.md) | 최초 admin 부트스트랩 및 배포 준비 |\n| 10 | [10_MVP_READINESS.md](10_MVP_READINESS.md) | MVP 출시 준비 상태, 자동 게이트와 사람/외부 승인 blocker |

원본 기획서: 원전 인적오류 예방 시뮬레이션 게임 기획서 v0.1

## v1.3 정합성 리뷰 핵심 변경

1. **Just Culture 정렬**: “당신이 사고를 낸 순간” 표현을 제거하고, 여러 조건·방어막의 누적을 보는 `CausalReflection`으로 통일.
2. **리더보드 공정성**: MVP는 모든 사용자가 동일한 3개 시나리오·고정 관점으로 플레이. 조직 직무는 랭킹 필터이며 다중 관점은 후속 릴리스.
3. **점수 계약 단일화**: 시즌 점수는 시나리오별 최고 HP의 합. 같은 시즌·시나리오의 simulation seed를 동일하게 하여 운 차이를 제거.
4. **프라이버시 강화**: 발전소담당자는 개인 점수·선택·엔딩·5대 지표를 볼 수 없고 참여현황과 익명 집계만 열람.
5. **용어 분리**: 조직 직무 `job_role`과 게임 내 관점 `perspective_role`을 명확히 구분.
6. **기술 최신화**: Vite 8.x, React 19.3+, WCAG 2.2 AA 기준. Cloudflare Pages는 정적 SPA 용도로 유지하되 Workers 전환 가능 구조.
7. **OPIS 활용 원칙**: “작업자 실수”에서 분석을 끝내지 않고 PSF·절차·감독·설계·조직조건·방어막까지 포함.
8. **오디오 파이프라인 추가**: Google Flow Music/Lyria 계열로 BGM을 제작하고, SFX/foley는 승인된 Google Flow 오디오 도구 또는 동급 생성도구를 사용. 생성물은 검수 후 `public/audio/`에 저장하며 manifest로 출처·프롬프트·버전을 추적. 실제 원전 경보음과 혼동되는 SFX는 금지.
\n- [09_DEPLOYMENT_BOOTSTRAP.md](09_DEPLOYMENT_BOOTSTRAP.md) — 최초 admin 부트스트랩 및 배포 준비\n