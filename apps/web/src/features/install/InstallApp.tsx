import { useEffect, useRef, useState } from "react";
import { promptPwaInstall, saveHeroShortcut, usePwaInstall } from "../../lib/pwaInstall";

type Device = "desktop" | "android" | "ios";
function currentDevice(): Device {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/i.test(navigator.userAgent) ? "android" : "desktop";
}

function InstallGuide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [device, setDevice] = useState<Device>(currentDevice);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="install-dialog panel" aria-labelledby="install-guide-title" onCancel={onClose}>
    <h2 id="install-guide-title">HERO를 아이콘으로 열기</h2>
    <p>사용하는 기기에 맞춰 앱을 추가해주세요.</p>
    <div className="install-device-options" aria-label="설치할 기기">
      {([ ["desktop", "컴퓨터"], ["android", "Android"], ["ios", "iPhone·iPad"] ] as const).map(([value, label]) =>
        <button type="button" className="secondary-button" aria-pressed={device === value} key={value} onClick={() => setDevice(value)}>{label}</button>)}
    </div>
    {device === "desktop" ? <>
      <ul>
        <li><strong>Chrome·Edge:</strong> 주소창의 설치 아이콘이나 브라우저 메뉴의 앱 설치를 선택하세요. 바탕화면 바로가기 옵션이 있으면 함께 선택하세요.</li>
        <li><strong>Mac Safari:</strong> 공유 메뉴 또는 파일 메뉴에서 ‘Dock에 추가’를 선택하세요.</li>
      </ul>
      <button type="button" className="secondary-button" onClick={() => { saveHeroShortcut(); setSaved(true); }}>바탕화면 바로가기 파일 저장</button>
      <p className="muted">다운로드한 HERO 바로가기 파일을 바탕화면으로 옮겨주세요. 이 파일은 기본 브라우저로 HERO를 엽니다.</p>
      {saved ? <p role="status">다운로드 폴더에서 HERO 바로가기 파일을 확인해주세요.</p> : null}
    </> : <ol>
      <li>HERO를 {device === "ios" ? "Safari" : "Chrome 또는 Samsung Internet"}에서 여세요.</li>
      <li>{device === "ios" ? "공유 메뉴 → 홈 화면에 추가 → 추가를 선택하세요." : "브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택하세요."}</li>
      <li>홈 화면의 HERO 아이콘으로 다시 접속하세요.</li>
    </ol>}
    <p className="muted">카카오톡 등 앱 안의 브라우저에서는 메뉴에서 외부 브라우저로 열기를 먼저 선택해주세요. 설치 후 처음 실행할 때 로그인이 필요할 수 있습니다.</p>
    <button type="button" className="primary-button" onClick={onClose}>닫기</button>
  </dialog>;
}

export function InstallApp() {
  const { available, installed, pending } = usePwaInstall();
  const [guide, setGuide] = useState(false);
  const [message, setMessage] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  function closeGuide() {
    setGuide(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }
  if (installed) return null;
  async function install() {
    if (!available) { setGuide(true); return; }
    setMessage("");
    try {
      const outcome = await promptPwaInstall();
      if (outcome === "accepted") setMessage("브라우저에서 설치를 마무리한 뒤 HERO 아이콘으로 열어주세요.");
      else if (outcome === "dismissed") setMessage("설치를 취소했습니다. 나중에 설치 안내에서 다시 확인할 수 있습니다.");
      else setGuide(true);
    } catch {
      setMessage("설치 창을 열지 못했습니다. 기기별 안내를 확인해주세요.");
      setGuide(true);
    }
  }
  return <>
    <section className="install-app" aria-label="HERO 앱 설치">
      <img src="/pwa-icon-192.png" alt="" width="40" height="40" />
      <div><strong>HERO를 아이콘으로 열기</strong><p>바탕화면·홈 화면에서 빠르게 접속</p></div>
      <button ref={trigger} type="button" className="secondary-button" disabled={pending} onClick={() => void install()}>{pending ? "설치 중…" : available ? "앱 설치" : "설치 안내"}</button>
    </section>
    {message ? <p className="install-status" role="status">{message}</p> : null}
    {guide ? <InstallGuide onClose={closeGuide} /> : null}
  </>;
}
