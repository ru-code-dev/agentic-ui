"""SV-C9: the fallback constant is valid for the Python validator and for the Node referee."""

import unittest

from agentic_ui_server.conversation.fallback import FALLBACK

from .validator_cases import judge


class FallbackAgreementTest(unittest.TestCase):
    def test_fallback_valid_in_python_and_node(self) -> None:
        """[SV-C9, P4-agreement] validatePayload (Node) and validate_payload (Python) both accept the fallback."""
        _, (judged,) = judge([{"id": "fallback", "mutation": None, "messages": FALLBACK}])
        self.assertEqual((judged["node_valid"], judged["node_error"], judged["python_errors"]), (True, None, []))


if __name__ == "__main__":
    unittest.main()
