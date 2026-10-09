/** KHNP headquarters / station names, manually verified 2026-10-09.
 * This is an input suggestion catalog, NOT a database seeding operation.
 * Creation still requires an explicit Admin action and server authorization.
 */
export interface PlantSuggestion {
  code: string;
  name: string;
  displayName: string;
  group: string;
  source: string;
}

export const KHNP_PLANT_CATALOG: readonly PlantSuggestion[] = [
  {
    "code": "KORI1",
    "name": "고리원자력본부 제1발전소",
    "displayName": "고리1발",
    "group": "고리",
    "source": "https://www.khnp.co.kr/kori/contents.do?key=1145"
  },
  {
    "code": "KORI2",
    "name": "고리원자력본부 제2발전소",
    "displayName": "고리2발",
    "group": "고리",
    "source": "https://www.khnp.co.kr/kori/contents.do?key=1145"
  },
  {
    "code": "KORI3",
    "name": "고리원자력본부 제3발전소",
    "displayName": "고리3발",
    "group": "고리",
    "source": "https://www.khnp.co.kr/kori/contents.do?key=1145"
  },
  {
    "code": "HANBIT1",
    "name": "한빛원자력본부 제1발전소",
    "displayName": "한빛1발",
    "group": "한빛",
    "source": "https://www.khnp.co.kr/hanbit/contents.do?key=1644"
  },
  {
    "code": "HANBIT2",
    "name": "한빛원자력본부 제2발전소",
    "displayName": "한빛2발",
    "group": "한빛",
    "source": "https://www.khnp.co.kr/hanbit/contents.do?key=1644"
  },
  {
    "code": "HANBIT3",
    "name": "한빛원자력본부 제3발전소",
    "displayName": "한빛3발",
    "group": "한빛",
    "source": "https://www.khnp.co.kr/hanbit/contents.do?key=1644"
  },
  {
    "code": "WOLSONG1",
    "name": "월성원자력본부 제1발전소",
    "displayName": "월성1발",
    "group": "월성",
    "source": "https://kori.khnp.co.kr/wolsong/contents.do?key=1690"
  },
  {
    "code": "WOLSONG2",
    "name": "월성원자력본부 제2발전소",
    "displayName": "월성2발",
    "group": "월성",
    "source": "https://kori.khnp.co.kr/wolsong/contents.do?key=1690"
  },
  {
    "code": "WOLSONG3",
    "name": "월성원자력본부 제3발전소",
    "displayName": "월성3발",
    "group": "월성",
    "source": "https://kori.khnp.co.kr/wolsong/contents.do?key=1690"
  },
  {
    "code": "HANUL1",
    "name": "한울원자력본부 제1발전소",
    "displayName": "한울1발",
    "group": "한울",
    "source": "https://m.khnp.co.kr/hanul/contents.do?key=1743"
  },
  {
    "code": "HANUL2",
    "name": "한울원자력본부 제2발전소",
    "displayName": "한울2발",
    "group": "한울",
    "source": "https://m.khnp.co.kr/hanul/contents.do?key=1743"
  },
  {
    "code": "HANUL3",
    "name": "한울원자력본부 제3발전소",
    "displayName": "한울3발",
    "group": "한울",
    "source": "https://m.khnp.co.kr/hanul/contents.do?key=1743"
  },
  {
    "code": "SAEUL1",
    "name": "새울원자력본부 제1발전소",
    "displayName": "새울1발",
    "group": "새울",
    "source": "https://khnp.co.kr/saeul/contents.do?key=1781"
  },
  {
    "code": "SAEUL2",
    "name": "새울원자력본부 제2발전소",
    "displayName": "새울2발",
    "group": "새울",
    "source": "https://khnp.co.kr/saeul/contents.do?key=1781"
  },
  {
    "code": "SHINHANUL1",
    "name": "한울원자력본부 신한울제1발전소",
    "displayName": "신한울1발",
    "group": "한울",
    "source": "https://m.khnp.co.kr/hanul/contents.do?key=1743"
  }
];

export function availablePlantSuggestions(existingCodes: Iterable<string>): PlantSuggestion[] {
  const codes = new Set(Array.from(existingCodes, code => code.toUpperCase()));
  return KHNP_PLANT_CATALOG.filter(plant => !codes.has(plant.code));
}

export const KHNP_HEADQUARTERS = ["고리", "한빛", "월성", "한울", "새울"] as const;

export function groupedPlantSuggestions(existingCodes: Iterable<string>) {
  const codes = new Set(Array.from(existingCodes, code => code.trim().toUpperCase()));
  return KHNP_HEADQUARTERS.map(group => ({
    group,
    plants: KHNP_PLANT_CATALOG.filter(plant => plant.group === group).map(plant => ({
      ...plant,
      registered: codes.has(plant.code),
    })),
  }));
}
