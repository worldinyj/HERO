"""Standard-library tests; no database connection or network access."""
import importlib.util
import unittest
from pathlib import Path
from uuid import uuid4

path = Path(__file__).parent / "test-session-completion-concurrency.py"
spec = importlib.util.spec_from_file_location("race", path)
race = importlib.util.module_from_spec(spec)
spec.loader.exec_module(race)

class LocalDbRaceGuards(unittest.TestCase):
    def test_missing_url(self):
        with self.assertRaises(ValueError): race.validate_connection("", race.ACK)
    def test_remote_url(self):
        with self.assertRaises(ValueError):
            race.validate_connection("postgresql://u@db.supabase.co:54322/postgres", race.ACK)
    def test_different_port(self):
        with self.assertRaises(ValueError):
            race.validate_connection("postgresql://u@localhost:5432/postgres", race.ACK)
    def test_different_database(self):
        with self.assertRaises(ValueError):
            race.validate_connection("postgresql://u@localhost:54322/production", race.ACK)
    def test_no_ack(self):
        with self.assertRaises(ValueError):
            race.validate_connection("postgresql://u@localhost:54322/postgres", None)
    def test_local_supabase(self):
        race.validate_connection("postgresql://postgres:postgres@127.0.0.1:54322/postgres",race.ACK)
    def test_receipt_first(self):
        self.assertFalse(race.receipt('{"already_completed":false,"hp_point":245}')['already_completed'])
    def test_receipt_second(self):
        self.assertTrue(race.receipt('{"already_completed":true,"hp_point":245}')['already_completed'])
    def test_missing_receipt(self):
        with self.assertRaises(ValueError): race.receipt("BEGIN\nCOMMIT")
    def test_different_competing_scores(self):
        x, y = str(uuid4()), str(uuid4())
        a, b = race.call_sql(x,y,245,1),race.call_sql(x,y,1,9)
        self.assertNotEqual(a,b)
        self.assertIn('"clock_after":9',b)
    def test_fixture_tables(self):
        ids={k:str(uuid4()) for k in ('user','plant','season','scenario','version','session')}
        s=race.fixture(ids,'1234567890ab')
        for name in ('auth.users','public.plants','public.profiles','public.seasons',
                     'public.scenarios','public.scenario_versions','public.play_sessions'):
            self.assertEqual(s.count('insert into '+name),1)
    def test_final_state_queries(self):
        s=race.totals_sql(str(uuid4()))
        for name in ('hp_point','session_decisions','audit_logs','status'):
            self.assertIn(name,s)

if __name__=='__main__': unittest.main()
