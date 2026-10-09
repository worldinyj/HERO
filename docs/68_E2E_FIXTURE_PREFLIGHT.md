# HERO — 모바일 E2E fixture 사전 충돌검사 / 독립 시즌 (2026-10-08)

Mac `6d572c8a` 전체 `qa --deep --with-deno --with-db` 성공. 단 `full_mobile_flow=NOT_RUN`.

## 변경 이유
`e2e/setup-local.ts`는 고정 Auth ID/이메일, 발전소, 초대, 시나리오, 시즌을 만든다. 이전에는 잔존 fixture가 있으면 중간에 데이터 생성 오류가 발생할 수 있고, DB 마이그레이션이 만든 실제 월간 `open` 시즌을 재사용해 테스트 시나리오가 결합될 수 있었다.

## 수정
- 기존 `e2e/localTargetGuard.mjs`의 loopback `127.0.0.1:55321`/명시적 쓰기 승인 차단은 유지.
- 신규 `assertFreshLocalE2eNamespace`: 서비스 키로 Auth 사용자 ID·이메일, 테이블의 고정 ID, 발전소 `E2E` 코드, 시나리오 slug 및 `e2e-season` 충돌을 **첫 createUser/insert 전에 읽기 전용 검사**. DB 읽기 실패·재실행 충돌은 보수적으로 실패.
- 테스트용 season은 `e2e-season`으로 **항상 별도 생성**하며 기존 월간 시즌을 사용하지 않는다.
- Node 회귀시험 2개 추가. `pnpm e2e:setup` 스크립트는 기존에 존재함을 재확인했으며 건드리지 않았다.

## 제한
- 사전검사와 실제 쓰기 사이 경합은 완전히 막지 못한다.
- 첫 쓰기 이후 중단되면 fixture가 일부 남을 수 있다. 자동 cleanup/DB reset은 하지 않는다.
- 기존 전체 로컬 QA PASS와 이 커밋의 로컬 검증은 구분한다.
- 새 코드가 통과하면 다음 별도 단계에서 Mac 로컬 Edge serve 및 모바일 360px/390px E2E 검증을 준비한다.

## Mac 재검증
```bash
git pull --ff-only origin work/actions-paused-batch-20261008
node --test scripts/hero-local.test.mjs
node scripts/hero-local.mjs qa --deep --with-deno --with-db
```

기존 운영 `main`, Actions, Cloudflare, 원격 DB에는 아무 변경도 하지 않는다.
