"""SV-C7 differential fuzz: Python verdict == Node ``validatePayload`` on random mutants (A3-04, A3-05, A3-07).

The A3 review's seeds 3, 11, 12, 13 (48 disagreements on 867c5dc). ``AGENTIC_UI_FUZZ_CASES`` per seed (default
1000 in ``pnpm check``; the A3F proof runs 4000, the review's size: ``python -m tests.agreement.fuzz``).
"""

import os
import unittest

from .fuzz import disagreements, generate

SEEDS = (3, 11, 12, 13)


class ValidatorFuzzTest(unittest.TestCase):
    def test_review_seeds_agree_with_node(self) -> None:
        """[SV-C7, P4-agreement] A3-04/A3-05/A3-07: every fuzz mutant of the review's seeds gets Node's verdict, in
        both directions (never accepts what Node rejects, never rejects what Node accepts)."""
        count = int(os.environ.get("AGENTIC_UI_FUZZ_CASES", "1000"))
        for seed in SEEDS:
            with self.subTest(seed=seed):
                bad = disagreements(generate(count, seed))
                print(f"\nvalidator fuzz: seed={seed} cases={count} disagreements={len(bad)}")
                details = [f"{c['id']} {c['ops']} node={c['node_error']!r} python={c['python']}" for c in bad[:5]]
                self.assertEqual(len(bad), 0, "\n".join(details))


if __name__ == "__main__":
    unittest.main()
