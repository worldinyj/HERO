import { useState } from "react";

type SuriPose = "welcome" | "check" | "reflect";

export function SuriIllustration({
  pose = "welcome",
  eager = false,
}: {
  pose?: SuriPose;
  eager?: boolean;
}) {
  const [failedPose, setFailedPose] = useState<SuriPose | null>(null);

  return (
    <div className="suri-illustration" aria-hidden="true">
      <img
        src={`/images/mascot/suri-${pose}-v1.webp`}
        alt=""
        width="640"
        height="640"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        hidden={failedPose === pose}
        onError={() => setFailedPose(pose)}
      />
    </div>
  );
}
