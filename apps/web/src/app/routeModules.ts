type ModuleLoader<T> = () => Promise<T>;

function cachedLoader<T>(loader: ModuleLoader<T>): ModuleLoader<T> {
  let promise: Promise<T> | null = null;

  return () => {
    promise ??= loader();
    return promise;
  };
}

export const loadGamePageModule = cachedLoader(
  () => import("../features/play/GamePage"),
);

export const loadBriefingPageModule = cachedLoader(
  () => import("../features/play/CompetitiveBriefingPage"),
);

export const loadLeaderboardPageModule = cachedLoader(
  () => import("../features/leaderboard/LeaderboardPage"),
);

export const loadProfilePageModule = cachedLoader(
  () => import("../features/profile/ProfilePage"),
);

export const loadManagerPageModule = cachedLoader(
  () => import("../features/manager/ManagerDashboardPage"),
);

export const loadAdminOrgPageModule = cachedLoader(
  () => import("../features/admin/AdminOrgPage"),
);

export const loadAdminScenarioPageModule = cachedLoader(
  () => import("../features/admin/AdminScenarioPage"),
);

export function preloadGameRoute(): void {
  void loadGamePageModule();
}

export function preloadBriefingRoute(): void {
  void loadBriefingPageModule();
}
