import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.API_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
const PASSWORD_A = process.env.HERO_E2E_PASSWORD_A;
const PASSWORD_B = process.env.HERO_E2E_PASSWORD_B;
const PASSWORD_MANAGER = process.env.HERO_E2E_PASSWORD_MANAGER;

if (
  !SUPABASE_URL ||
  !SERVICE_ROLE_KEY ||
  !PASSWORD_A ||
  !PASSWORD_B ||
  !PASSWORD_MANAGER
) {
  throw new Error("Local Supabase and ephemeral E2E passwords are required.");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const IDS = {
  plant: "71000000-0000-0000-0000-000000000001",
  manager: "70000000-0000-0000-0000-000000000001",
  adminA: "70000000-0000-0000-0000-000000000011",
  adminB: "70000000-0000-0000-0000-000000000012",
  managerCandidateA: "70000000-0000-0000-0000-000000000021",
  managerCandidateB: "70000000-0000-0000-0000-000000000022",
  playerCandidateA: "70000000-0000-0000-0000-000000000031",
  playerCandidateB: "70000000-0000-0000-0000-000000000032",
  playerA: "70000000-0000-0000-0000-000000000101",
  playerB: "70000000-0000-0000-0000-000000000102",
  uninvitedA: "70000000-0000-0000-0000-000000000201",
  uninvitedB: "70000000-0000-0000-0000-000000000202",
  inviteA: "72000000-0000-0000-0000-000000000101",
  inviteB: "72000000-0000-0000-0000-000000000102",
  scenario: "73000000-0000-0000-0000-000000000001",
  version: "73000000-0000-0000-0000-000000000002",
} as const;

const identities = [
  {
    id: IDS.playerA,
    email: "hero-e2e-a@example.test",
    password: PASSWORD_A,
    invitationId: IDS.inviteA,
    inviteeName: "E2E Player A",
    token: "hero-e2e-invite-token-mobile-a-2026",
  },
  {
    id: IDS.playerB,
    email: "hero-e2e-b@example.test",
    password: PASSWORD_B,
    invitationId: IDS.inviteB,
    inviteeName: "E2E Player B",
    token: "hero-e2e-invite-token-mobile-b-2026",
  },
] as const;

const adminIdentities = [
  {
    id: IDS.adminA,
    email: "hero-e2e-admin-a@example.test",
    password: PASSWORD_MANAGER,
    realName: "E2E Admin A",
    nickname: "E2EHQ1",
  },
  {
    id: IDS.adminB,
    email: "hero-e2e-admin-b@example.test",
    password: PASSWORD_MANAGER,
    realName: "E2E Admin B",
    nickname: "E2EHQ2",
  },
] as const;

const managerCandidates = [
  {
    id: IDS.managerCandidateA,
    email: "hero-e2e-manager-candidate-a@example.test",
    password: PASSWORD_A,
  },
  {
    id: IDS.managerCandidateB,
    email: "hero-e2e-manager-candidate-b@example.test",
    password: PASSWORD_B,
  },
] as const;

const playerCandidates = [
  {
    id: IDS.playerCandidateA,
    email: "hero-e2e-player-candidate-a@example.test",
    password: PASSWORD_A,
  },
  {
    id: IDS.playerCandidateB,
    email: "hero-e2e-player-candidate-b@example.test",
    password: PASSWORD_B,
  },
] as const;

const uninvitedIdentities = [
  {
    id: IDS.uninvitedA,
    email: "hero-e2e-uninvited-a@example.test",
    password: PASSWORD_A,
  },
  {
    id: IDS.uninvitedB,
    email: "hero-e2e-uninvited-b@example.test",
    password: PASSWORD_B,
  },
] as const;

async function createUser(input: {
  id: string;
  email: string;
  password: string;
}) {
  const { error } = await admin.auth.admin.createUser({
    id: input.id,
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error) throw error;
}

await createUser({
  id: IDS.manager,
  email: "hero-e2e-manager@example.test",
  password: PASSWORD_MANAGER,
});

for (const identity of [
  ...adminIdentities,
  ...managerCandidates,
  ...playerCandidates,
  ...identities,
  ...uninvitedIdentities,
]) {
  await createUser(identity);
}

const { error: plantError } = await admin.from("plants").insert({
  id: IDS.plant,
  code: "E2E",
  name: "E2E Test Plant",
  display_name: "E2E 발전소",
  is_active: true,
});
if (plantError) throw plantError;

const { error: managerProfileError } = await admin.from("profiles").insert({
  id: IDS.manager,
  plant_id: IDS.plant,
  role: "plant_manager",
  real_name: "E2E Manager",
  nickname: "E2EMANAGER",
  is_active: true,
});
if (managerProfileError) throw managerProfileError;

for (const identity of adminIdentities) {
  const { error } = await admin.from("profiles").insert({
    id: identity.id,
    plant_id: null,
    role: "admin",
    real_name: identity.realName,
    nickname: identity.nickname,
    is_active: true,
  });

  if (error) throw error;
}

for (const identity of identities) {
  const tokenHash = createHash("sha256")
    .update(identity.token)
    .digest("hex");

  const { error } = await admin.from("invitations").insert({
    id: identity.invitationId,
    token_hash: tokenHash,
    plant_id: IDS.plant,
    target_role: "player",
    invitee_name: identity.inviteeName,
    job_role: "worker",
    team_name: "E2E",
    created_by: IDS.manager,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });

  if (error) throw error;
}

const scenario = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "e2e/fixtures/e2e_competitive.json"),
    "utf8",
  ),
);

const { error: scenarioError } = await admin.from("scenarios").insert({
  id: IDS.scenario,
  slug: scenario.id,
  title: scenario.title,
  is_competitive: true,
  is_active: true,
});
if (scenarioError) throw scenarioError;

const { error: versionError } = await admin.from("scenario_versions").insert({
  id: IDS.version,
  scenario_id: IDS.scenario,
  version: scenario.version,
  status: "published",
  default_perspective_role: scenario.defaultPerspectiveRole,
  content: scenario,
  published_at: new Date().toISOString(),
});
if (versionError) throw versionError;

const now = new Date().toISOString();
let { data: season, error: seasonError } = await admin
  .from("seasons")
  .select("id")
  .eq("status", "open")
  .lte("starts_at", now)
  .gt("ends_at", now)
  .order("starts_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (seasonError) throw seasonError;

if (!season) {
  const { data: createdSeason, error } = await admin
    .from("seasons")
    .insert({
      season_key: "e2e-season",
      title: "E2E 시즌",
      starts_at: new Date(Date.now() - 3_600_000).toISOString(),
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: "open",
    })
    .select("id")
    .single();

  if (error) throw error;
  season = createdSeason;
}

const { error: bindingError } = await admin.from("season_scenarios").insert({
  season_id: season.id,
  scenario_version_id: IDS.version,
  simulation_seed: "e2e-simulation-seed-2026-10",
  is_active: true,
});
if (bindingError) throw bindingError;

console.log(
  JSON.stringify(
    {
      ready: true,
      seasonId: season.id,
      scenario: scenario.id,
      users: identities.map(({ email, token }) => ({ email, token })),
      admins: adminIdentities.map(({ email }) => ({ email })),
      managerCandidates: managerCandidates.map(({ email }) => ({ email })),
      playerCandidates: playerCandidates.map(({ email }) => ({ email })),
      uninvitedUsers: uninvitedIdentities.map(({ email }) => ({ email })),
    },
    null,
    2,
  ),
);
