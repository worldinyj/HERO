import type { ReactNode } from "react";
import { SuriIllustration, type SuriPose } from "./SuriIllustration";

export function CompanionHeading({
  eyebrow,
  title,
  titleId,
  pose = "check",
}: {
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  pose?: SuriPose;
}) {
  return (
    <div className="learning-mascot-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
      <SuriIllustration pose={pose} eager />
    </div>
  );
}
