"""log.py: secret redaction in records and surfaced text; wire logger truncation; level from settings."""

import io
import logging
import unittest

from agentic_ui_server import log
from agentic_ui_server.settings import LogSettings

SECRET = "sk-test-0123456789abcdef-test-only"


class LogTest(unittest.TestCase):
    def setUp(self) -> None:
        self.stream = io.StringIO()
        self.logger = log.setup_logging(LogSettings(level="DEBUG", acp_wire=True), stream=self.stream)
        self.addCleanup(self.restore)

    def restore(self) -> None:
        for handler in list(self.logger.handlers):
            self.logger.removeHandler(handler)
        self.logger.addHandler(logging.NullHandler())

    def test_env_secrets_redacted_in_records(self) -> None:
        log.register_env_secrets({"AGENTIC_UI_LLM_KEY": SECRET, "PATH": "/usr/bin:/bin", "QWEN_HOME": "/home/x"})
        log.get_logger("t").info("key=%s path=%s", SECRET, "/usr/bin:/bin")
        out = self.stream.getvalue()
        self.assertNotIn(SECRET, out)
        self.assertIn("key=***", out)
        self.assertIn("/usr/bin:/bin", out, "non-secret names are not redacted")

    def test_redact_text_and_short_values_ignored(self) -> None:
        log.register_secret(SECRET)
        log.register_secret("abc")
        self.assertEqual(log.redact(f"tail: {SECRET} abc"), "tail: *** abc")

    def test_wire_logger(self) -> None:
        log.register_secret(SECRET)
        wire = log.make_wire_logger(True)
        wire("->", '{"k":"' + SECRET + '","pad":"' + "x" * 5000 + '"}')
        out = self.stream.getvalue()
        self.assertIn("-> {", out)
        self.assertNotIn(SECRET, out)
        self.assertIn("chars)", out, "long frames are truncated")
        self.assertIsNone(log.make_wire_logger(False))

    def test_level(self) -> None:
        logger = log.setup_logging(LogSettings(level="warning"), stream=self.stream)
        self.assertEqual(logger.level, logging.WARNING)


if __name__ == "__main__":
    unittest.main()
