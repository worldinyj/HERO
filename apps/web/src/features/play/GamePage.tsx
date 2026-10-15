import { lazy } from "react";
import { useParams } from "react-router";
import { loadCompetitiveGamePageModule, loadTutorialGamePageModule } from "../../app/routeModules";

const TutorialGamePage = lazy(() => loadTutorialGamePageModule().then(module => ({ default: module.TutorialGamePage })));
const CompetitiveGamePage = lazy(() => loadCompetitiveGamePageModule().then(module => ({ default: module.CompetitiveGamePage })));

/** The surrounding route Suspense and error boundary also cover mode loading. */
export function GamePage() {
  const { scenarioId = "" } = useParams();
  return scenarioId === "s00_tutorial"
    ? <TutorialGamePage />
    : <CompetitiveGamePage key={scenarioId} scenarioId={scenarioId} />;
}
