# HERO scenarios

- `data/`: 실제 게임에서 사용하는 검증 대상 JSON
- `schema/`: `pnpm schema:scenario`로 생성하는 JSON Schema

검증:

```bash
pnpm validate:scenario
pnpm validate:scenario scenarios/data/S00_tutorial.json
```

JSON Schema 생성:

```bash
pnpm schema:scenario
```

시나리오의 `actionId`는 표시 순서와 독립적인 안정적 식별자이며, 통계·세션 재실행에 사용하므로 배포 후 의미 없이 변경하지 않습니다.
