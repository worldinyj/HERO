import { describe, expect, it } from "vitest";
import { buildKakaoInviteTemplate } from "./kakaoShare";

describe("Kakao invite share template", () => {
  it("builds a text template that keeps the one-time invite URL intact", () => {
    const template = buildKakaoInviteTemplate({
      inviteUrl: "https://hero.example/i/abc123",
      plantDisplayName: "한울",
      inviteeName: "홍길동",
    });

    expect(template.objectType).toBe("text");
    expect(template.text).toContain("홍길동님");
    expect(template.text).toContain("한울 HERO 교육 초대장");
    expect(template.link.mobileWebUrl).toBe(
      "https://hero.example/i/abc123",
    );
    expect(template.link.webUrl).toBe(
      "https://hero.example/i/abc123",
    );
    expect(template.buttonTitle).toBe("HERO 초대 열기");
  });

  it("does not invent a recipient when sharing a generic invite", () => {
    const template = buildKakaoInviteTemplate({
      inviteUrl: "https://hero.example/i/xyz789",
      plantDisplayName: "한빛",
    });

    expect(template.text.startsWith("한빛 HERO")).toBe(true);
  });
});
