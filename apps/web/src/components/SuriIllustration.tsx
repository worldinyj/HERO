import { useState } from "react";

export type SuriPose = "welcome" | "check" | "reflect";

export function SuriIllustration({
  pose = "welcome",
  eager = false,
  priority = "auto",
}: {
  pose?: SuriPose;
  eager?: boolean;
  priority?: "high" | "auto";
}) {
  const [failedPose, setFailedPose] = useState<SuriPose | null>(null);
  const [loadedPose, setLoadedPose] = useState<SuriPose | null>(null);

  return (
    <div className="suri-illustration" aria-hidden="true" data-ready={loadedPose === pose}>
      <img
        key={pose}
        src={`/images/mascot/suri-${pose}-v1.webp`}
        alt=""
        width="640"
        height="640"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={priority}
        decoding="async"
        hidden={failedPose === pose}
        onLoad={() => {
          setLoadedPose(pose);
          setFailedPose(null);
        }}
        onError={() => setFailedPose(pose)}
      />
    </div>
  );
}
