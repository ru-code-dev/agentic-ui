"""SERVER-CONTRACT.md (SV-C23 hand-over): generated from the route table and agrees with what the API returns."""

import re
import unittest

from agentic_ui_server.conversation.fallback import FALLBACK
from agentic_ui_server.http.contract import ROUTES, STATUS_TEXT
from agentic_ui_server.http.contract_doc import FILE, render
from agentic_ui_server.http.contract_examples import examples, ok_messages
from agentic_ui_server.validation import validate_payload


class ServerContractTest(unittest.TestCase):
    def test_contract_doc_is_fresh(self) -> None:
        """[SV-C23, P6-http] apps/agent-server/SERVER-CONTRACT.md == render() (regenerate with --write)."""
        self.assertEqual(
            FILE.read_text(encoding="utf-8"),
            render(),
            "stale: PYTHONPATH=src python -m agentic_ui_server.http.contract_doc --write",
        )

    def test_documented_fields_are_what_the_api_returns(self) -> None:
        """[SV-C23, P6-http] every route's example went through Api.handle: 200, exactly the documented response
        fields, the documented request fields, and only documented status codes."""
        seen = set()
        for route, body, _query, response in examples():
            with self.subTest(route=route.path):
                seen.add((route.method, route.path))
                self.assertEqual(response.status, 200, response.body)
                documented = {f.name for f in route.response}
                self.assertTrue({f.name for f in route.response if f.required} <= set(response.body))
                self.assertLessEqual(set(response.body), documented)
                if body is not None:
                    self.assertLessEqual(set(body), {f.name for f in route.request})
                self.assertLessEqual(set(route.statuses), set(STATUS_TEXT))
        self.assertEqual(seen, {(r.method, r.path) for r in ROUTES})

    def test_doc_lists_every_endpoint_and_the_semantics(self) -> None:
        """[SV-C23, SV-C20, SV-C25] endpoints (progress/models OPTIONAL), repair loop count, cancel, fallback."""
        text = render()
        for route in ROUTES:
            self.assertIn(f"### `{route.method} {{base}}{route.path}`{' (OPTIONAL)' if route.optional else ''}", text)
        self.assertIn("up to `repair.max_attempts` (default 3) repair turns", text)
        self.assertIn("at most 4 replies", text)
        self.assertIn("`status: cancelled`", text)
        self.assertIn("`agent.retry`", text)
        self.assertRegex(text, re.escape('"surfaceId": "agent-fallback"'))

    def test_examples_are_valid_ui(self) -> None:
        """[SV-C23, SV-C7] the documented ok example validates; the documented fallback is the constant."""
        self.assertEqual(validate_payload(ok_messages()), [])
        action = next(resp for route, _b, _q, resp in examples() if route.handler == "action")
        self.assertEqual(action.body["messages"], FALLBACK)


if __name__ == "__main__":
    unittest.main()
