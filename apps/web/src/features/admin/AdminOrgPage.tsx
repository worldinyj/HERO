import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";

interface PlantRow {
  id: string;
  code: string;
  name: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

interface ManagerRow {
  id: string;
  plant_id: string | null;
  real_name: string;
  nickname: string;
  is_active: boolean;
  plants:
    | { display_name: string; code: string }
    | Array<{ display_name: string; code: string }>
    | null;
}

interface InviteResult {
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
  plantDisplayName: string;
}

function normalizePlantCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "")
    .slice(0, 20);
}

function managerPlantLabel(row: ManagerRow): string {
  const plant = Array.isArray(row.plants) ? row.plants[0] : row.plants;
  return plant ? `${plant.display_name} · ${plant.code}` : "발전소 미지정";
}

export function AdminOrgPage() {
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plantCode, setPlantCode] = useState("");
  const [plantName, setPlantName] = useState("");
  const [plantDisplayName, setPlantDisplayName] = useState("");
  const [creatingPlant, setCreatingPlant] = useState(false);

  const [invitePlantId, setInvitePlantId] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();

      const [plantResult, managerResult] = await Promise.all([
        supabase
          .from("plants")
          .select("id, code, name, display_name, is_active, created_at")
          .order("display_name", { ascending: true }),
        supabase
          .from("profiles")
          .select("id, plant_id, real_name, nickname, is_active, plants(display_name, code)")
          .eq("role", "plant_manager")
          .order("real_name", { ascending: true }),
      ]);

      if (plantResult.error) throw plantResult.error;
      if (managerResult.error) throw managerResult.error;

      setPlants((plantResult.data ?? []) as PlantRow[]);
      setManagers((managerResult.data ?? []) as unknown as ManagerRow[]);

      if (!invitePlantId) {
        const firstActive = (plantResult.data ?? []).find((plant) => plant.is_active);
        if (firstActive) setInvitePlantId(firstActive.id);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "관리자 조직 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const managerCountByPlant = useMemo(() => {
    const counts = new Map<string, number>();
    for (const manager of managers) {
      if (!manager.plant_id || !manager.is_active) continue;
      counts.set(manager.plant_id, (counts.get(manager.plant_id) ?? 0) + 1);
    }
    return counts;
  }, [managers]);

  async function handleCreatePlant() {
    const code = normalizePlantCode(plantCode);
    const name = plantName.trim();
    const displayName = plantDisplayName.trim();

    if (!code || !name || !displayName) {
      setError("발전소 코드·정식명·표시명을 모두 입력해주세요.");
      return;
    }

    try {
      setCreatingPlant(true);
      setError(null);
      const supabase = getSupabase();
      const { error: insertError } = await supabase.from("plants").insert({
        code,
        name,
        display_name: displayName,
        is_active: true,
      });

      if (insertError) throw insertError;

      setPlantCode("");
      setPlantName("");
      setPlantDisplayName("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "발전소를 생성하지 못했습니다.",
      );
    } finally {
      setCreatingPlant(false);
    }
  }

  async function handleTogglePlant(plant: PlantRow) {
    try {
      setError(null);
      const supabase = getSupabase();
      const { error: updateError } = await supabase
        .from("plants")
        .update({ is_active: !plant.is_active })
        .eq("id", plant.id);

      if (updateError) throw updateError;
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "발전소 상태를 변경하지 못했습니다.",
      );
    }
  }

  async function handleCreateManagerInvite() {
    if (!invitePlantId || !inviteeName.trim()) {
      setError("발전소와 담당자 이름을 입력해주세요.");
      return;
    }

    try {
      setCreatingInvite(true);
      setError(null);
      setInviteResult(null);
      setCopied(false);

      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "create-invite",
        {
          body: {
            plantId: invitePlantId,
            targetRole: "plant_manager",
            inviteeName: inviteeName.trim(),
          },
        },
      );

      if (invokeError) throw invokeError;

      const result = data as InviteResult & { error?: string };
      if (!result.inviteUrl) {
        throw new Error(result.error ?? "담당자 초대 링크 생성에 실패했습니다.");
      }

      setInviteResult(result);
      setInviteeName("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "담당자 초대를 생성하지 못했습니다.",
      );
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteResult?.inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("클립보드 복사에 실패했습니다. 링크를 직접 선택해 복사해주세요.");
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">관리자 조직 정보를 불러오고 있습니다…</p>
      </section>
    );
  }

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <header className="panel admin-header">
        <p className="eyebrow">Super Admin</p>
        <h2 id="admin-title">조직 관리</h2>
        <p className="muted">
          발전소를 생성하고 각 발전소의 교육담당자 초대 링크를 발급합니다.
        </p>
      </header>

      {error ? (
        <section className="panel">
          <p className="error-text" role="alert">{error}</p>
        </section>
      ) : null}

      <section className="panel admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Plants</p>
            <h3>발전소</h3>
          </div>
          <span className="count-badge">{plants.length}</span>
        </div>

        <div className="admin-form-grid">
          <label>
            <span>코드</span>
            <input
              value={plantCode}
              onChange={(event) => setPlantCode(normalizePlantCode(event.target.value))}
              placeholder="예: HANUL"
              maxLength={20}
            />
          </label>
          <label>
            <span>정식명</span>
            <input
              value={plantName}
              onChange={(event) => setPlantName(event.target.value)}
              placeholder="예: 한울원자력본부"
            />
          </label>
          <label>
            <span>표시명</span>
            <input
              value={plantDisplayName}
              onChange={(event) => setPlantDisplayName(event.target.value)}
              placeholder="예: 한울"
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={creatingPlant}
            onClick={handleCreatePlant}
          >
            {creatingPlant ? "생성 중…" : "발전소 생성"}
          </button>
        </div>

        <div className="admin-list">
          {plants.map((plant) => (
            <article key={plant.id} className="admin-row">
              <div>
                <strong>{plant.display_name}</strong>
                <span>{plant.name} · {plant.code}</span>
              </div>
              <div className="admin-row-actions">
                <span className={plant.is_active ? "status-pill status-pill--active" : "status-pill"}>
                  {plant.is_active ? "운영중" : "중지"}
                </span>
                <span className="muted mini-copy">
                  담당자 {managerCountByPlant.get(plant.id) ?? 0}명
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void handleTogglePlant(plant)}
                >
                  {plant.is_active ? "운영 중지" : "다시 활성화"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Plant Manager</p>
            <h3>담당자 초대</h3>
          </div>
          <span className="count-badge">{managers.filter((row) => row.is_active).length}</span>
        </div>

        <div className="admin-form-grid">
          <label>
            <span>발전소</span>
            <select
              value={invitePlantId}
              onChange={(event) => setInvitePlantId(event.target.value)}
            >
              <option value="">선택</option>
              {plants.filter((plant) => plant.is_active).map((plant) => (
                <option key={plant.id} value={plant.id}>
                  {plant.display_name} · {plant.code}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>담당자 이름</span>
            <input
              value={inviteeName}
              onChange={(event) => setInviteeName(event.target.value)}
              placeholder="예: 홍길동"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            disabled={creatingInvite || !invitePlantId}
            onClick={handleCreateManagerInvite}
          >
            {creatingInvite ? "초대 생성 중…" : "담당자 초대 링크 생성"}
          </button>
        </div>

        {inviteResult ? (
          <div className="invite-result-box">
            <strong>{inviteResult.plantDisplayName} 담당자 초대 링크</strong>
            <code>{inviteResult.inviteUrl}</code>
            <button type="button" className="secondary-button" onClick={handleCopyInvite}>
              {copied ? "복사 완료" : "링크 복사"}
            </button>
          </div>
        ) : null}

        <div className="admin-list">
          {managers.length === 0 ? (
            <p className="muted">등록된 발전소담당자가 없습니다.</p>
          ) : (
            managers.map((manager) => (
              <article key={manager.id} className="admin-row">
                <div>
                  <strong>{manager.real_name}</strong>
                  <span>{manager.nickname} · {managerPlantLabel(manager)}</span>
                </div>
                <span className={manager.is_active ? "status-pill status-pill--active" : "status-pill"}>
                  {manager.is_active ? "활성" : "비활성"}
                </span>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
