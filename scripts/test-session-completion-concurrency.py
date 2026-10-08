#!/usr/bin/env python3
"""Two-connection session completion race probe. LOCAL DISPOSABLE SUPABASE ONLY.

Run after local "supabase start" and migration setup:
  HERO_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
    python3 scripts/test-session-completion-concurrency.py --ack-local-disposable

This probe COMMITs a new fixture: audit logs are immutable and cannot be cleaned.
Run "supabase db reset" on the disposable local database afterwards.
"""
from __future__ import annotations
import argparse
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
from uuid import uuid4

ACK = "LOCAL_DISPOSABLE_ONLY"


def validate_connection(dsn: str, ack: str | None) -> None:
    parsed = urlsplit(dsn)
    if parsed.scheme not in ("postgres", "postgresql") or parsed.hostname not in (
        "127.0.0.1", "localhost", "::1"
    ):
        raise ValueError("Only a loopback PostgreSQL URL is allowed")
    if parsed.port != 54322 or parsed.path != "/postgres":
        raise ValueError("Only the local Supabase DB at port 54322/postgres is allowed")
    if ack != ACK:
        raise ValueError("Explicit --ack-local-disposable is required")


def ensure_local_supabase(dsn: str) -> None:
    """Do not mistake a localhost SSH tunnel to production for local Supabase."""
    cli = shutil.which("supabase")
    if not cli:
        raise RuntimeError("local Supabase CLI is required")
    status = subprocess.run([cli, "status", "--output", "json"],
                            capture_output=True, text=True, timeout=20)
    if status.returncode:
        raise RuntimeError("supabase status failed: local stack is not running")
    try:
        data = json.loads(status.stdout)
        local_url = data.get("DB_URL") or data.get("db_url")
        current = urlsplit(dsn)
        detected = urlsplit(local_url)
        if detected.hostname not in ("127.0.0.1", "localhost", "::1") or (
            detected.port != current.port or detected.path != current.path
        ):
            raise ValueError("local Supabase DB_URL does not match probe target")
    except (TypeError, ValueError, AttributeError) as err:
        raise RuntimeError("could not validate local Supabase DB target") from err


def call_sql(session: str, user: str, hp: int, clock: int) -> str:
    return ("select public.complete_play_session_atomic("
            f"'{session}'::uuid,'{user}'::uuid,'safe_complete',"
            f"'{{\"safety\":{hp}}}'::jsonb,{hp},'race-test-v1',"
            f"'{{\"ending\":\"safe_complete\",\"hpPoint\":{hp}}}'::jsonb,"
            "'[{\"seq\":0,\"node_id\":\"start\",\"action_type\":\"continue\","
            f"\"action_id\":\"\",\"clock_before\":0,\"clock_after\":{clock}}}]'::jsonb)::text;")


def args(dsn: str) -> list[str]:
    return ["psql", "--no-psqlrc", "--no-align", "--tuples-only", "--quiet",
            "--set=ON_ERROR_STOP=1", "--dbname", dsn]


def sql(dsn: str, command: str, label: str, timeout: int = 25) -> str:
    result = subprocess.run(args(dsn) + ["--command", command],
                            env=dict(os.environ, PGAPPNAME="hero_race_" + label),
                            capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"{label} psql error: {result.stderr[-500:]}")
    return result.stdout.strip()


def receipt(output: str) -> dict:
    for line in output.splitlines():
        if line.strip().startswith("{"):
            value = json.loads(line)
            if isinstance(value, dict) and "already_completed" in value:
                return value
    raise ValueError("no committed server receipt returned")


def fixture(ids: dict[str, str], token: str) -> str:
    u, plant, season, scenario, version, play = (ids[key] for key in (
        "user", "plant", "season", "scenario", "version", "session"))
    return f"""
    begin;
    insert into auth.users(id,email) values ('{u}','race-{token}@hero.test');
    insert into public.plants(id,code,name,display_name)
      values ('{plant}','RC{token}','Local Race','Local Race');
    insert into public.profiles(id,plant_id,role,job_role,real_name,nickname,is_active)
      values ('{u}','{plant}','player','worker','Race','R{token[:9]}',true);
    insert into public.seasons(id,season_key,title,starts_at,ends_at,status)
      values ('{season}','race-{token}','Local Race',now()-interval '1 day',
              now()+interval '1 day','open');
    insert into public.scenarios(id,slug,title,is_competitive,is_active)
      values ('{scenario}','race_{token}','Local Race',true,true);
    insert into public.scenario_versions
      (id,scenario_id,version,status,default_perspective_role,content)
      values ('{version}','{scenario}',1,'published','worker','{{}}'::jsonb);
    insert into public.play_sessions
      (id,user_id,plant_id,player_job_role,perspective_role,season_id,
       scenario_version_id,simulation_seed,presentation_seed,status)
      values ('{play}','{u}','{plant}','worker','worker','{season}',
              '{version}','race-simulation-seed','race-presentation-seed','in_progress');
    commit;
    """


def totals_sql(play: str) -> str:
    return ("select jsonb_build_object("
            f"'status',(select status::text from public.play_sessions where id='{play}'),"
            f"'hp',(select hp_point from public.play_sessions where id='{play}'),"
            f"'decisions',(select count(*) from public.session_decisions where session_id='{play}'),"
            "'audits',(select count(*) from public.audit_logs where action='play_session.completed'"
            f" and entity_id='{play}'),"
            "'clock',(select clock_after from public.session_decisions"
            f" where session_id='{play}' and seq=0))::text;")


def probe(dsn: str) -> None:
    token = uuid4().hex[:12]
    ids = {key: str(uuid4()) for key in (
        "user", "plant", "season", "scenario", "version", "session")}
    sql(dsn, fixture(ids, token), "fixture")
    print("PASS disposable local fixture committed", flush=True)
    first = second = None
    try:
        first = subprocess.Popen(args(dsn), stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, bufsize=1,
                                 env=dict(os.environ, PGAPPNAME="hero_race_first"))
        assert first.stdin and first.stdout
        first.stdin.write("begin;\nset local role service_role;\n" +
                          call_sql(ids["session"], ids["user"], 245, 1) +
                          "\n\\echo FIRST_LOCK_HELD\n")
        first.stdin.flush()
        output: queue.Queue[str | None] = queue.Queue()
        def reader() -> None:
            assert first is not None and first.stdout is not None
            for line in first.stdout:
                output.put(line.strip())
            output.put(None)
        threading.Thread(target=reader, daemon=True).start()
        lines = []
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            try:
                line = output.get(timeout=0.2)
            except queue.Empty:
                continue
            if line is None:
                break
            lines.append(line)
            if line == "FIRST_LOCK_HELD":
                break
        if "FIRST_LOCK_HELD" not in lines:
            raise RuntimeError("first completion never acquired its row lock")
        if receipt("\n".join(lines)).get("already_completed") is not False:
            raise AssertionError("first call should complete new session")
        print("PASS first connection completed row but still holds COMMIT", flush=True)

        # A multi-statement `psql --command` often exposes only the final
        # COMMIT result; send commands over stdin to retain the SELECT receipt.
        query = ("begin;\nset local role service_role;\n" +
                 call_sql(ids["session"], ids["user"], 1, 9) + "\ncommit;\n")
        second = subprocess.Popen(args(dsn),
                                  stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, env=dict(os.environ,
                                  PGAPPNAME="hero_race_second"))
        assert second.stdin is not None
        second.stdin.write(query)
        second.stdin.flush()
        waiting = False
        for _ in range(60):
            if second.poll() is not None:
                raise AssertionError("second caller finished before first COMMIT")
            count = sql(dsn, "select count(*) from pg_stat_activity where "
                        "application_name='hero_race_second' and wait_event_type='Lock';",
                        "observer", timeout=5)
            if count == "1":
                waiting = True
                break
            time.sleep(0.1)
        if not waiting:
            raise AssertionError("second connection was not observed waiting on row lock")
        print("PASS competing connection is waiting for a PostgreSQL lock", flush=True)

        first.stdin.write("commit;\n")
        first.stdin.close()
        first.wait(timeout=15)
        if first.returncode:
            raise RuntimeError("first commit failed")
        output2, error2 = second.communicate(timeout=15)
        if second.returncode:
            raise RuntimeError(f"second submit failed: {error2[-500:]}")
        winner = receipt(output2)
        if winner.get("already_completed") is not True or winner.get("hp_point") != 245:
            raise AssertionError("second RPC did not return authoritative first completion")
        print("PASS competing connection receives original receipt", flush=True)

        state = json.loads(sql(dsn, totals_sql(ids["session"]), "totals"))
        expected = {"status": "completed", "hp": 245, "decisions": 1,
                    "audits": 1, "clock": 1}
        if any(state.get(k) != value for k, value in expected.items()):
            raise AssertionError(f"unexpected database completion totals: {state!r}")
        print("PASS exactly one authoritative score, decision and audit", flush=True)
    finally:
        # No DELETE: audit logs are immutable. Reset only the local DB.
        for proc in (first, second):
            if proc and proc.poll() is None:
                proc.kill()
                proc.communicate(timeout=5)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ack-local-disposable", action="store_true")
    flags = parser.parse_args()
    try:
        dsn = os.environ.get("HERO_TEST_DATABASE_URL", "")
        validate_connection(dsn, ACK if flags.ack_local_disposable else None)
        if not shutil.which("psql"):
            raise RuntimeError("psql is required")
        ensure_local_supabase(dsn)
        probe(dsn)
        print("PASS real two-connection idempotency. Reset your LOCAL Supabase DB.")
        return 0
    except (ValueError, RuntimeError, AssertionError, subprocess.TimeoutExpired) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
