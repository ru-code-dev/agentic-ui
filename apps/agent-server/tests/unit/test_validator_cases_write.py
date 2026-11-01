"""tests/agreement/validator_cases.py --write (A3-25): an invalid example stops the build instead of shipping."""

import tempfile
import unittest
from pathlib import Path

from ..agreement import validator_cases
from ..support.node import REPO


def case(cid: str, mutation: str | None, node_valid: bool, python_errors: list) -> dict:
    return {"id": cid, "mutation": mutation, "messages": [], "node_valid": node_valid, "node_error": None,
            "python_errors": python_errors}  # fmt: skip


class ValidatorCasesWriteTest(unittest.TestCase):
    def test_invalid_example_stops_the_write_and_names_it(self) -> None:
        """[SV-C23] A3-25: a recipe-5 value rename left 10 examples invalid and --write shipped them as
        expected.valid=false while the README said "valid example payloads"; now --write exits naming them."""
        judged = [
            case("components/Tag", None, False, ["x"]),
            case("compositions/01-login", None, True, []),
            case("compositions/01-login~orphan", "orphan", False, []),
        ]
        self.assertEqual(validator_cases.invalid_examples(judged), ["components/Tag"])
        with tempfile.TemporaryDirectory(dir=REPO / "WORKFLOW" / "tmp") as tmp:
            target = Path(tmp) / "cases.json"
            with self.assertRaises(SystemExit) as stop:
                validator_cases.write(judged, target)
            self.assertIn("components/Tag", str(stop.exception.code))
            self.assertFalse(target.exists())
            validator_cases.write(judged[1:], target)
            self.assertTrue(target.exists())


if __name__ == "__main__":
    unittest.main()
