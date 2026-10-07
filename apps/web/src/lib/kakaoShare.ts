const KAKAO_SDK_VERSION = "2.8.2";
const KAKAO_SDK_SRC =
  `https://t1.kakaocdn.net/kakao_js_sdk/${KAKAO_SDK_VERSION}/kakao.min.js`;
const KAKAO_SDK_INTEGRITY =
  "sha384-zt/G7/KfaRQ9dT/QIkS0ujMtzouJqzuSJcXVQu50x0rl/+mD1dc70AeOejVbMD9E";

type KakaoTextTemplate = {
  objectType: "text";
  text: string;
  link: {
    mobileWebUrl: string;
    webUrl: string;
  };
  buttonTitle: string;
};

type KakaoSdk = {
  init: (javascriptKey: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (template: KakaoTextTemplate) => unknown;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

export type InviteShareMethod =
  | "kakao"
  | "native"
  | "clipboard"
  | "canceled";

export interface InviteShareInput {
  inviteUrl: string;
  plantDisplayName: string;
  inviteeName?: string;
}

let sdkPromise: Promise<KakaoSdk | null> | null = null;

function javascriptKey(): string {
  return String(import.meta.env.VITE_KAKAO_JS_KEY ?? "").trim();
}

export function buildKakaoInviteTemplate(
  input: InviteShareInput,
): KakaoTextTemplate {
  const recipient = input.inviteeName?.trim()
    ? `${input.inviteeName.trim()}님, `
    : "";

  return {
    objectType: "text",
    text:
      `${recipient}${input.plantDisplayName} HERO 교육 초대장입니다.\n` +
      "초대 링크는 1회용이며 발급 후 7일간 유효합니다.",
    link: {
      mobileWebUrl: input.inviteUrl,
      webUrl: input.inviteUrl,
    },
    buttonTitle: "HERO 초대 열기",
  };
}

async function loadKakaoSdk(): Promise<KakaoSdk | null> {
  const key = javascriptKey();
  if (!key || typeof window === "undefined") {
    return null;
  }

  if (window.Kakao) {
    if (!window.Kakao.isInitialized()) {
      window.Kakao.init(key);
    }
    return window.Kakao;
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoSdk | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-hero-kakao-sdk="true"]',
    );

    const finish = () => {
      const sdk = window.Kakao;
      if (!sdk) {
        resolve(null);
        return;
      }

      try {
        if (!sdk.isInitialized()) {
          sdk.init(key);
        }
        resolve(sdk);
      } catch {
        resolve(null);
      }
    };

    if (existing) {
      if (window.Kakao) {
        finish();
        return;
      }

      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = KAKAO_SDK_SRC;
    script.integrity = KAKAO_SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.dataset.heroKakaoSdk = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.append(script);
  });

  return sdkPromise;
}

async function tryKakaoShare(input: InviteShareInput): Promise<boolean> {
  const sdk = await loadKakaoSdk();
  if (!sdk) return false;

  try {
    await Promise.resolve(
      sdk.Share.sendDefault(buildKakaoInviteTemplate(input)),
    );
    return true;
  } catch {
    return false;
  }
}

function nativeShareText(input: InviteShareInput): string {
  if (input.inviteeName?.trim()) {
    return `${input.inviteeName.trim()}님, ${input.plantDisplayName} HERO 교육 초대장입니다.`;
  }

  return `${input.plantDisplayName} HERO 교육 초대장입니다.`;
}

export async function shareHeroInvite(
  input: InviteShareInput,
): Promise<InviteShareMethod> {
  if (await tryKakaoShare(input)) {
    return "kakao";
  }

  try {
    if (navigator.share) {
      await navigator.share({
        title: "HERO 초대장",
        text: nativeShareText(input),
        url: input.inviteUrl,
      });
      return "native";
    }
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      return "canceled";
    }
  }

  await navigator.clipboard.writeText(input.inviteUrl);
  return "clipboard";
}
