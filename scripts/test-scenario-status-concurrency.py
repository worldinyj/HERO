#!/usr/bin/env python3
"""Real two-connection publication races; only an isolated local test DB.
HERO_TEST_DATABASE_URL=postgresql://supabase_admin:postgres@127.0.0.1:55322/hero_scenario_atomic_20261011 python3 scripts/test-scenario-status-concurrency.py
Fixtures and immutable audits are committed. Drop the disposable test DB afterwards.
"""
import os
import subprocess
import time
from urllib.parse import urlsplit
from uuid import uuid4

url = os.environ.get('HERO_TEST_DATABASE_URL', '')
p = urlsplit(url)
if (p.scheme not in ('postgres', 'postgresql') or p.hostname != '127.0.0.1'
        or p.port != 55322 or not p.path.startswith('/hero_scenario_atomic_')
        or p.username != 'supabase_admin' or p.query or p.fragment):
    raise SystemExit('Only the isolated local HERO scenario test database is allowed')
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
base = ['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']

def sql(query):
    r = subprocess.run(base, input=query, text=True, capture_output=True, env=env, timeout=15)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

def worker(name):
    return subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env={**env, 'PGAPPNAME': name})

def race(same_version):
    actor, other, parent, old, first, second = [str(uuid4()) for _ in range(6)]
    content = "'{\"id\":\"s00_tutorial\"}'::jsonb"
    sql(f"""insert into auth.users(id,email) values ('{actor}','{actor}@hero.test'),('{other}','{other}@hero.test');
    insert into public.profiles(id,role,real_name,nickname) values
    ('{actor}','admin','Race admin','A{actor[:7]}'),('{other}','admin','Race other','B{other[:7]}');
    insert into public.scenarios(id,slug,title,is_competitive) values ('{parent}','race_{parent.replace('-', '')}','Race',false);
    insert into public.scenario_versions(id,scenario_id,version,status,default_perspective_role,content) values
    ('{old}','{parent}',1,'published','worker',{content}),('{first}','{parent}',2,'approved','worker',{content}),
    ('{second}','{parent}',3,'approved','worker',{content});""")
    def publish(who, version):
        return f"select public.set_scenario_status_atomic('{who}','{version}','approved','published',{content});"
    a = worker('hero_scenario_race_first')
    b = None
    try:
        a.stdin.write('begin; set local role service_role; ' + publish(actor, first) + " select 'LOCK_HELD';\n")
        a.stdin.flush()
        # psql output confirms the transaction acquired the parent lock.
        while True:
            line = a.stdout.readline()
            if not line:
                raise RuntimeError('first transaction failed: ' + a.stderr.read())
            if line.strip() == 'LOCK_HELD':
                break
        b = worker('hero_scenario_race_second')
        b.stdin.write('set role service_role; ' + publish(other, first if same_version else second) + '\n')
        b.stdin.close()
        b.stdin = None
        deadline = time.monotonic() + 5
        while sql("select count(*) from pg_stat_activity where application_name='hero_scenario_race_second' and wait_event_type='Lock';") != '1':
            if time.monotonic() > deadline or b.poll() is not None:
                raise RuntimeError('second transaction did not wait on publication lock')
            time.sleep(.05)
        a.stdin.write('commit;\n')
        a.stdin.close()
        a.stdin = None
        _, aerr = a.communicate(timeout=10)
        bout, berr = b.communicate(timeout=10)
        if a.returncode:
            raise RuntimeError(aerr)
        if same_version:
            assert b.returncode and 'scenario_status_conflict' in berr, berr
        else:
            assert b.returncode == 0, berr
            assert 'published' in bout
        winner = first if same_version else second
        assert sql(f"select id from public.scenario_versions where scenario_id='{parent}' and status='published';") == winner
        expected_audits = '2' if same_version else '4'
        assert sql(f"select count(*) from public.audit_logs where entity_id in ('{old}','{first}','{second}');") == expected_audits
        print(('STALE_SAME_VERSION' if same_version else 'DIFFERENT_VERSIONS') + '_CONCURRENCY_PASS', flush=True)
    finally:
        for proc in (a, b):
            if proc and proc.poll() is None:
                proc.kill()
                proc.wait()

race(False)
race(True)
