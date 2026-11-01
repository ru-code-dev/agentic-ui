"""A4-10: the /health answer DEPLOY.md §7 shows the owner (after every restart) lists exactly the route's fields."""

import json
import re
import unittest

from agentic_ui_server.http.contract import ROUTES

from ..support.node import REPO


class DeployDocTest(unittest.TestCase):
    def test_health_example_has_every_field_of_the_route(self) -> None:
        """[A4-10, DEC-056] the commented JSON example after `curl …/health` parses and its keys are the documented
        response fields of GET /health (contractVersion included)."""
        text = (REPO / "docs" / "server" / "DEPLOY.md").read_text(encoding="utf-8")
        examples = [json.loads(m) for m in re.findall(r'^# (\{"status".*\})$', text, re.MULTILINE)]
        self.assertTrue(examples, "no /health example found in DEPLOY.md")
        route = next(r for r in ROUTES if r.path == "/health")
        for example in examples:
            self.assertEqual(set(example), {f.name for f in route.response})


if __name__ == "__main__":
    unittest.main()
