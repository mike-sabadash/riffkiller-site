import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recovery', ROOT / 'tools/apply_recovery.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.release = json.loads((ROOT / 'data/riffs.json').read_text())

    def test_custom_edits_and_new_lessons_survive(self):
        current = copy.deepcopy(self.release)
        current[0]['dna']['law'] = 'Author edit'
        current[0]['segments'][0]['name'] = 'Author segment'
        current.append({'id': 99, 'song': 'New lesson', 'artist': 'Mike'})
        merged = recovery.merge_catalog(current, self.release)
        self.assertEqual(merged, current)

    def test_recovery_is_idempotent_and_preserves_segment_timings(self):
        current = copy.deepcopy(self.release)
        del current[0]['dna']
        bounds = [(s['start'], s['end']) for s in current[0]['segments']]
        merged = recovery.merge_catalog(current, self.release)
        self.assertIn('dna', merged[0])
        self.assertEqual(bounds, [(s['start'], s['end']) for s in merged[0]['segments']])
        self.assertEqual(merged, recovery.merge_catalog(merged, self.release))

    def test_changed_timings_are_never_annotated_silently(self):
        current = copy.deepcopy(self.release)
        del current[0]['dna']
        current[0]['segments'][0]['end'] = 1.5
        with self.assertRaisesRegex(ValueError, 'timings have changed'):
            recovery.merge_catalog(current, self.release)


if __name__ == '__main__':
    unittest.main()
