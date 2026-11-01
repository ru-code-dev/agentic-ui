"""tests/support/tiers.py: an enabled tier never turns into a silent skip under pnpm check (SV-C13)."""

import os
import unittest
from pathlib import Path
from unittest import mock

from ..support.tiers import require

MISSING = Path("/nonexistent/agentic-ui/fake-acp-server.ts")


class RequireTest(unittest.TestCase):
    def test_strict_missing_prerequisite_fails(self) -> None:
        """[SV-C13] AGENTIC_UI_TEST_STRICT=1 (server-tests.sh): an enabled tier without its prerequisite fails."""
        strict = {"AGENTIC_UI_TEST_STRICT": "1", "AGENTIC_UI_TEST_TIERS": "1,2,3"}
        with mock.patch.dict(os.environ, strict), self.assertRaisesRegex(AssertionError, "prerequisite missing"):
            require(2, MISSING)

    def test_not_strict_skips_and_disabled_tier_always_skips(self) -> None:
        """[SV-C13] without strict a missing prerequisite skips; a tier that is off skips even when strict."""
        lax = {"AGENTIC_UI_TEST_STRICT": "0", "AGENTIC_UI_TEST_TIERS": "1,2,3"}
        with mock.patch.dict(os.environ, lax), self.assertRaises(unittest.SkipTest):
            require(2, MISSING)
        strict = {"AGENTIC_UI_TEST_STRICT": "1", "AGENTIC_UI_TEST_TIERS": "1,2,3"}
        with mock.patch.dict(os.environ, strict), self.assertRaisesRegex(unittest.SkipTest, "tier 4 not in"):
            require(4, MISSING)

    def test_server_tests_script_is_strict_by_default(self) -> None:
        """[SV-C13] pnpm check's server run sets AGENTIC_UI_TEST_STRICT=1 unless the caller overrides it."""
        script = Path(__file__).resolve().parents[4] / "scripts/server-tests.sh"
        self.assertIn('AGENTIC_UI_TEST_STRICT="${AGENTIC_UI_TEST_STRICT:-1}"', script.read_text(encoding="utf-8"))
