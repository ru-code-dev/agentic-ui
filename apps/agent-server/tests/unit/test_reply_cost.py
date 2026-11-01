"""Cost of checking one agent reply (A3-02, A3-22): linear lexer, size cap, one extraction, off the agent loop.

A3-02: one reply of Markdown fence lines + a stray ``</a2ui-json>`` (48 KB) took 26 s in the lexer on the one agent
loop, so /health, /progress and /cancel of every chat hung (WORKFLOW/review attack/test_loop_freeze.py,
attack/perf_extract.py). A3-22: every valid reply was lexed twice (attack/count_extract.py).
"""

import random
import sys
import threading
import time
import unittest
from unittest import mock

from agentic_ui_server.a2ui import close_scan
from agentic_ui_server.a2ui.extract import extract
from agentic_ui_server.a2ui.lexer import tokenize
from agentic_ui_server.conversation import check as reply_check
from agentic_ui_server.conversation import repair

from ..support.http_client import call, stub_app
from ..support.stub_session import example, reply

F, CT = "```", "</a2ui-json>"
HOSTILE = {
    "fences+stray-close": f"{F}\nx\n" * 16000 + CT,
    "fences+quote+stray-close": f"{F}\n'\n" * 16000 + CT,
    "fence+space-body": f"{F}\n" + " " * 96000 + f"x\n{CT}",
    "whitespace-run": "a" + " " * 96000 + "b",
    "open-tags-without-gt": "<a2ui-json " * 9000,
}
PIECES = ["'", '"', "'''", '"""', "\\", "\\'", CT, "</A2UI-json  >", "x", "\n", F]


class LinearLexerTest(unittest.TestCase):
    def test_hostile_replies_lex_in_linear_time(self) -> None:
        """[SV-C7, SV-C6] A3-02: ~100 KB of each shape the review timed (quadratic before: 48 KB = 26 s; and the
        trailing-fence / open-tag regexes backtracked on space runs and on open tags without ``>``) in < 0.5 s."""
        for name, text in HOSTILE.items():
            with self.subTest(name):
                started = time.perf_counter()
                tokenize(text)
                self.assertLess(time.perf_counter() - started, 0.5, f"{name}: {len(text)} chars")

    def test_close_finder_equals_the_forward_scan(self) -> None:
        """[SV-C7] A3-02: the backward tables answer ``scan_block(text, p, len(text))`` for every start ``p``
        (random texts of quotes, escapes, close tags, fences); Node agreement: tests/agreement a3-* vectors."""
        rng = random.Random(7)
        for _ in range(400):
            text = "".join(rng.choice(PIECES) for _ in range(rng.randrange(1, 30)))
            finder = close_scan.CloseFinder(text)
            for start in range(len(text) + 1):
                self.assertEqual(finder(start), close_scan.scan_block(text, start, len(text)), (text, start))


class ReplyCheckTest(unittest.TestCase):
    def test_reply_over_the_cap_is_invalid_unread(self) -> None:
        """[SV-C8] A3-02: a reply over MAX_REPLY_CHARS is a problem sent back for repair; it is never lexed."""
        with mock.patch.object(reply_check, "extract", side_effect=AssertionError("lexed")):
            check = repair.reply_problems("x" * (repair.MAX_REPLY_CHARS + 1))
        self.assertEqual(len(check.problems), 1)
        self.assertIn("too long", check.problems[0])
        self.assertIsNotNone(check.prompt)

    def test_valid_reply_is_extracted_once(self) -> None:
        """[SV-C6] A3-22: one extraction per reply: the Outcome's prose comes from the same check."""
        app, _ = stub_app(self, {"one": [reply(example(), "Вот форма.")]})
        with mock.patch.object(reply_check, "extract", wraps=extract) as counted:
            status, outcome, _ = call(app.url, "/prompt", {"chatId": "one", "text": "x"})
        self.assertEqual((status, outcome["status"], outcome["text"]), (200, "ok", "Вот форма."))
        self.assertEqual(counted.call_count, 1)


class AgentLoopTest(unittest.TestCase):
    def test_health_answers_while_a_reply_is_checked(self) -> None:
        """[SV-C6, SV-C11] A3-02: the reply check runs in a worker thread: while one chat's check takes 2 s,
        /health and /cancel of the server answer at once (before: blocked for the whole check)."""
        real = repair.reply_problems

        def slow(text: str) -> repair.ReplyCheck:
            time.sleep(2)  # blocks whichever thread runs the check
            return real(text)

        sets = {"repair__max_attempts": "0", "agent__bin": sys.executable}  # an existing binary: /health is 200
        app, _ = stub_app(self, {"slow": [HOSTILE["fences+stray-close"]]}, **sets)
        with mock.patch.object(repair, "reply_problems", slow):
            result: list = []
            thread = threading.Thread(
                target=lambda: result.append(call(app.url, "/prompt", {"chatId": "slow", "text": "x"}))
            )
            thread.start()
            time.sleep(0.5)
            started = time.monotonic()
            self.assertEqual(call(app.url, "/health")[0], 200)
            self.assertEqual(call(app.url, "/cancel", {"chatId": "other"})[0], 200)
            waited = time.monotonic() - started
            thread.join(10)
        self.assertLess(waited, 1.0)
        self.assertEqual(result[0][1]["status"], "fallback")


if __name__ == "__main__":
    unittest.main()
