import { cachedLoader } from "../lib/cachedLoader";

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
  void loadGamePageModule().catch(() => {
    // A speculative fetch must not break the current page. Retry on navigation.
  });
}

export function preloadBriefingRoute(): void {
  void loadBriefingPageModule().catch(() => {
    // A speculative fetch must not break the current page. Retry on navigation.
  });
}

export const loadAdminAuditPageModule = cachedLoader(
  () => import("../features/admin/AdminAuditPage"),
);

export const loadAdminOverviewPageModule = cachedLoader(
  () => import("../features/admin/AdminOverviewPage"),
);
