"""Offline behavioral tests of the two-process PostgreSQL probe; NO actual database calls."""
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name('test-session-completion-concurrency.py')
spec = importlib.util.spec_from_file_location('hero_completion_race', MODULE_PATH)
race = importlib.util.module_from_spec(spec)
spec.loader.exec_module(race)


class CapturedStdin:
    def __init__(self):
        self.commands = ''
        self.closed = False

    def write(self, data):
        self.commands += data
        return len(data)

    def flush(self):
        pass

    def close(self):
        self.closed = True


class FakePsql:
    def __init__(self, env, mode, second_receipt=None):
        self.env = env
        self.mode = mode
        self.stdin = CapturedStdin()
        self.stdout = iter([
            json.dumps({'already_completed': False, 'hp_point': 245}) + '\n',
            ('FIRST_WILL_ROLLBACK' if 'rollback_first_' in env['PGAPPNAME']
             else 'FIRST_LOCK_HELD') + '\n',
        ])
        self.stderr = None
        self.returncode = None
        self.killed = False
        self.second_receipt = second_receipt

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        assert 'rollback;\n' in self.stdin.commands if 'rollback_first_' in self.env['PGAPPNAME'] else 'commit;\n' in self.stdin.commands
        self.returncode = 0
        return 0

    def communicate(self, timeout=None):
        if self.returncode is None:
            self.returncode = 0
        if self.second_receipt is None:
            return '', ''
        return json.dumps(self.second_receipt) + '\n', ''

    def kill(self):
        self.killed = True
        self.returncode = -9


class RaceFlowTests(unittest.TestCase):
    def setUp(self):
        self.processes = []
        self.will_report_lock = True
        self.force_bad_receipt = False
        self.missing_receipt = False
        self.corrupt_db_totals = False
        self.calls = []

        def fake_popen(*_args, **kwargs):
            label = kwargs['env']['PGAPPNAME']
            is_second = 'second_' in label
            rollback = 'rollback_' in label
            winner = {'already_completed': not rollback,
                      'hp_point': 1 if rollback else 245}
            if self.force_bad_receipt and is_second:
                winner['hp_point'] = 999
            proc = FakePsql(kwargs['env'], label,
                            (None if self.missing_receipt else winner) if is_second else None)
            self.processes.append(proc)
            return proc

        def fake_sql(_dsn, command, label, timeout=25):
            self.calls.append((label, command))
            if label.endswith('fixture'):
                return ''
            if label.endswith('observer'):
                self.assertIn("wait_event_type='Lock'", command)
                self.assertIn(self.processes[-1].env['PGAPPNAME'], command)
                return '1' if self.will_report_lock else '0'
            if label.endswith('totals'):
                rollback = label.startswith('rollback_')
                return json.dumps({'status': 'completed',
                                   'hp': 777 if self.corrupt_db_totals else (1 if rollback else 245),
                                   'decisions': 1, 'audits': 1,
                                   'clock': 9 if rollback else 1})
            self.fail('Unexpected SQL label '+label)

        self.patcher1 = patch.object(race.subprocess, 'Popen', side_effect=fake_popen)
        self.patcher2 = patch.object(race, 'sql', side_effect=fake_sql)
        self.patcher3 = patch.object(race.time, 'sleep', return_value=None)
        self.patcher1.start();self.patcher2.start();self.patcher3.start()
        self.addCleanup(self.patcher1.stop)
        self.addCleanup(self.patcher2.stop)
        self.addCleanup(self.patcher3.stop)

    def test_commit_winner_and_loser_completion_receipt(self):
        race.probe('unused local db')
        self.assertEqual(len(self.processes), 2)
        first, second = self.processes
        self.assertIn('commit;\n', first.stdin.commands)
        self.assertIn('complete_play_session_atomic', second.stdin.commands)
        self.assertIn('245', first.stdin.commands)
        self.assertIn("1,'race-test-v1'", second.stdin.commands)
        self.assertTrue(any(label == 'totals' for label, _ in self.calls))

    def test_first_rollback_promotes_second_submittal(self):
        race.probe_first_rollback('unused local db')
        self.assertEqual(len(self.processes), 2)
        first, second = self.processes
        self.assertIn('rollback;\n', first.stdin.commands)
        self.assertIn("1,'race-test-v1'", second.stdin.commands)
        self.assertTrue(any(label == 'rollback_totals' for label, _ in self.calls))

    def test_rejects_wrong_second_receipt_commit_winner(self):
        self.force_bad_receipt = True
        with self.assertRaisesRegex(AssertionError, 'authoritative first completion'):
            race.probe('unused local db')
        self.assertEqual(len(self.processes), 2)

    def test_rejects_wrong_second_receipt_rollback_winner(self):
        self.force_bad_receipt = True
        with self.assertRaisesRegex(AssertionError, 'rollback winner'):
            race.probe_first_rollback('unused local db')
        self.assertEqual(len(self.processes), 2)

    def test_rejects_missing_server_receipt(self):
        self.missing_receipt = True
        with self.assertRaisesRegex(ValueError, 'no committed server receipt'):
            race.probe('unused local db')
        self.assertEqual(len(self.processes), 2)

    def test_rejects_corrupt_committed_database_totals(self):
        self.corrupt_db_totals = True
        with self.assertRaisesRegex(AssertionError, 'unexpected database completion totals'):
            race.probe('unused local db')
        self.assertTrue(any(label == 'totals' for label, _ in self.calls))

    def test_fails_closed_if_no_row_lock_is_observed(self):
        self.will_report_lock = False
        with self.assertRaisesRegex(AssertionError, 'not observed waiting'):
            race.probe('unused local db')
        self.assertTrue(all(p.killed for p in self.processes))

    def test_fails_closed_if_rollback_has_no_row_lock(self):
        self.will_report_lock = False
        with self.assertRaisesRegex(AssertionError, 'never observed waiting'):
            race.probe_first_rollback('unused local db')
        self.assertTrue(all(p.killed for p in self.processes))


if __name__ == '__main__':
    unittest.main()
