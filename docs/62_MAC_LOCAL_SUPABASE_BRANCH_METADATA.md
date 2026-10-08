# HERO Mac 로컬 Supabase QA — 브랜치 메타데이터와 인증정보 로그 보호

2026-10-08, work/actions-paused-batch-20261008

## 실제 검증 결과

- Supabase 로컬 PostgreSQL에서 **17개 pgTAP 파일, 417개 테스트가 모두 통과**: `All tests successful. Files=17, Tests=417, Result: PASS`.
- 다음 실행 `node scripts/hero-local.mjs qa --with-db`에서 테스트 전 `checkClean()` 단계가 중단됨: `?? supabase/.branches/_current_branch`.
- 이 파일은 Supabase CLI 로컬 브랜치 메타데이터이고, 제품 소스 수정이나 DB 실패가 아니다.

## 수정

1. `.gitignore`에서 `supabase/.branches/`를 제외해 CLI 로컬 정보를 보존하면서 Git 청결성 검사를 유지한다. `supabase/.temp/` 제외도 유지한다.
2. `scripts/hero-local.test.mjs`에 `git check-ignore --no-index --quiet -- supabase/.branches/_current_branch` 회귀시험을 추가한다. 다른 추적 파일 수정이나 예기치 않은 미추적 파일은 계속 QA 차단 대상이다.
3. `qa --with-db` 내 `supabase status --output json`은 서비스 키를 출력할 수 있어, 실행·종료 코드만 검증하고 원문을 QA 터미널에 표시하지 않도록 변경한다.

## Mac 재실행

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
git status --short
node scripts/hero-local.mjs qa --with-db
```

로컬 Supabase는 이미 실행 중이므로 별도 `supabase start` 불필요. pgTAP은 앞서 417/417 PASS이나, 새로운 SHA에서 전체 QA `db=tested`는 **아직 재실행 전**이다.

`supabase db reset`, `supabase db push`, `supabase stop`, 컨테이너 삭제, 원격 Supabase 수정, GitHub Actions, Cloudflare 배포 없음.
