import { useAudio } from "./AudioContext";

export function AudioSettings() {
  const { settings, manager, updateSettings } = useAudio();

  function wakeAudio() {
    manager.unlock();
  }

  return (
    <section className="panel profile-section audio-settings">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audio</p>
          <h3>소리 설정</h3>
        </div>
        <span className="count-badge">
          {settings.bgmMuted && settings.sfxMuted ? "무음" : "사용"}
        </span>
      </div>

      <p className="muted mini-copy">
        BGM과 효과음은 학습을 돕는 보조 요소입니다. 소리를 끄더라도 모든
        판단정보와 피드백은 화면에서 동일하게 제공됩니다.
      </p>

      <div className="audio-setting-row">
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={!settings.bgmMuted}
            onChange={(event) => {
              wakeAudio();
              updateSettings({
                initialized: true,
                bgmMuted: !event.target.checked,
              });
            }}
          />
          <span>BGM</span>
        </label>
        <input
          aria-label="BGM 볼륨"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.bgmVolume}
          onChange={(event) => {
            wakeAudio();
            updateSettings({
              initialized: true,
              bgmVolume: Number(event.target.value),
            });
          }}
        />
      </div>

      <div className="audio-setting-row">
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={!settings.sfxMuted}
            onChange={(event) => {
              wakeAudio();
              updateSettings({
                initialized: true,
                sfxMuted: !event.target.checked,
              });
            }}
          />
          <span>효과음</span>
        </label>
        <input
          aria-label="효과음 볼륨"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.sfxVolume}
          onChange={(event) => {
            wakeAudio();
            updateSettings({
              initialized: true,
              sfxVolume: Number(event.target.value),
            });
          }}
        />
      </div>

      <label className="audio-sensory-toggle">
        <input
          type="checkbox"
          checked={settings.reducedSensory}
          onChange={(event) =>
            updateSettings({ reducedSensory: event.target.checked })
          }
        />
        <span>
          <strong>부드러운 연출</strong>
          <small>
            효과음 피크와 BGM 강도를 낮춰 감각 자극을 줄입니다.
          </small>
        </span>
      </label>
    </section>
  );
}
