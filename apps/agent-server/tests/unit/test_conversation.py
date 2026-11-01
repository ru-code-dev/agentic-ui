"""conversation/prompts.py, fallback.py, repair.py: turn texts, the fallback constant, the repair loop."""

import asyncio
import json
import unittest

from agentic_ui_server.agent.errors import AgentCrashed, TurnTimeout
from agentic_ui_server.conversation.fallback import FALLBACK, FILE, fallback_json
from agentic_ui_server.conversation.progress import Progress
from agentic_ui_server.conversation.prompts import NO_QUESTIONS, action_prompt, repair_prompt, user_prompt
from agentic_ui_server.conversation.repair import converse
from agentic_ui_server.validation import validate_payload

from ..support.stub_session import StubSession, broken, example, reply


class PromptsTest(unittest.TestCase):
    def test_turn_texts(self) -> None:
        """[P5-prompts] user text + reply rule; action as JSON; repair lists every error and asks for the full block."""
        self.assertTrue(user_prompt(" a,b\n1,2\nТаблица ").startswith("a,b\n1,2\nТаблица\n\n"))
        self.assertIn(NO_QUESTIONS, user_prompt("x"))
        action = action_prompt("s1", {"name": "save", "context": {"id": 1}}, {"form": {"a": 1}})
        payload = json.loads(action[action.index("{") : action.rindex("}") + 1])
        self.assertEqual(
            payload,
            {
                "action": {
                    "surfaceId": "s1",
                    "event": {"name": "save", "context": {"id": 1}},
                    "dataModel": {"form": {"a": 1}},
                }
            },
        )
        repair = repair_prompt(["p1: e1", "p2: e2"])
        self.assertIn("- p1: e1\n- p2: e2", repair)
        self.assertIn("complete corrected <a2ui-json> block", repair)


class FallbackTest(unittest.TestCase):
    def test_fallback_is_valid_russian_and_retries(self) -> None:
        """[SV-C9] the constant validates in Python, says it in Russian and its button sends agent.retry."""
        self.assertEqual(validate_payload(FALLBACK), [])
        components = next(m for m in FALLBACK if "updateComponents" in m)["updateComponents"]["components"]
        texts = [c.get("text") for c in components]
        self.assertIn("Не удалось построить интерфейс", texts)  # literals, not the module constants
        self.assertIn("Агент не смог подготовить корректный интерфейс. Попробуйте ещё раз.", texts)
        button = next(c for c in components if c["component"] == "Button")
        self.assertEqual((button["label"], button["action"]), ("Повторить", {"event": {"name": "agent.retry"}}))
        self.assertEqual(next(c for c in components if c["component"] == "Icon")["name"], "warning")

    def test_fallback_json_is_fresh(self) -> None:
        """[SV-C9, SV-C23] apps/agent-server/fallback.json equals the constant."""
        self.assertEqual(FILE.read_text(encoding="utf-8"), fallback_json())


class RepairLoopTest(unittest.IsolatedAsyncioTestCase):
    async def run_loop(self, steps: list, max_repairs: int = 3):
        session = StubSession("c", steps)
        progress = Progress("c", max_repairs + 1)
        with self.assertLogs("agentic_ui_server", level="INFO") as logs:
            outcome = await converse(session, "first", max_repairs=max_repairs, progress=progress, label="c")
        return outcome, session, progress, "\n".join(logs.output)

    async def test_valid_first_try(self) -> None:
        """[SV-C8, P5-service] a valid first reply is returned as is, one attempt."""
        outcome, _, _, _ = await self.run_loop([reply(example())])
        self.assertEqual(
            (outcome.status, outcome.attempts, outcome.messages, outcome.text), ("ok", 1, example(), "Готово.")
        )

    async def test_invalid_then_repaired_with_exact_errors(self) -> None:
        """[SV-C8, P5-service] the repair turn quotes every problem of the invalid reply; the fixed reply wins."""
        outcome, session, _, logs = await self.run_loop([reply(broken()), reply(example())])
        self.assertEqual((outcome.status, outcome.attempts), ("ok", 2))
        self.assertIn("messages[2].updateComponents.components[0].bogus: unknown property 'bogus'", session.prompts[1])
        self.assertIn("attempt 1 of 4 invalid: 1 problem(s)", logs)
        self.assertIn("sending repair 1 of 3", logs)

    async def test_attempts_used_up_give_the_fallback_with_last_errors(self) -> None:
        """[SV-C8, SV-C9, P5-service] 1 reply + max_attempts repairs, all invalid → fallback with the last errors."""
        outcome, session, progress, logs = await self.run_loop(
            [reply(broken({"x1": 1}))] * 3 + [reply(broken({"x4": 1}))]
        )
        self.assertEqual(
            (outcome.status, outcome.reason, outcome.attempts, len(session.prompts)), ("fallback", "invalid", 4, 4)
        )
        self.assertEqual(outcome.messages, FALLBACK)
        self.assertTrue(outcome.fallback and "x4" in outcome.errors[0])
        self.assertIn("WARNING:agentic_ui_server.conversation.repair:[c] fallback (invalid) after 4 attempt(s)", logs)
        self.assertEqual((progress.attempt, progress.last_errors), (4, outcome.errors))

    async def test_question_without_ui_gets_no_questions_then_fallback(self) -> None:
        """[SV-C14] a text question → "Do not ask questions…" repair; still no UI after the attempts → fallback."""
        outcome, session, _, _ = await self.run_loop(["Какие колонки показать?"] * 4)
        self.assertEqual(session.prompts[1:], [NO_QUESTIONS] * 3)
        self.assertEqual((outcome.status, outcome.reason), ("fallback", "invalid"))
        self.assertIn("a question", outcome.errors[0])

    async def test_question_then_ui(self) -> None:
        """[SV-C14] after the no-questions order a UI reply is accepted."""
        outcome, session, _, _ = await self.run_loop(["Уточните формат?", reply(example())])
        self.assertEqual((outcome.status, session.prompts[1]), ("ok", NO_QUESTIONS))

    async def test_unreadable_block_is_repaired(self) -> None:
        """[SV-C8] a block that is not JSON is sent back with the parse error."""
        outcome, session, _, _ = await self.run_loop(["<a2ui-json>[{oops</a2ui-json>", reply(example())])
        self.assertEqual(outcome.status, "ok")
        self.assertIn("block: The direct JSON block is not JSON", session.prompts[1])

    async def test_agent_failures_give_the_fallback(self) -> None:
        """[SV-C9, SV-C16] turn timeout, crash → fallback with the reason, no further turns; the log line names
        the chat."""
        for exc, reason in ((TurnTimeout("turn exceeded 1s"), "timeout"), (AgentCrashed(4, "boom"), "crash")):
            with self.subTest(reason):
                outcome, session, _, logs = await self.run_loop([exc, reply(example())])
                self.assertEqual((outcome.status, outcome.reason, len(session.prompts)), ("fallback", reason, 1))
                self.assertIn(f"[c] fallback ({reason}) after 1 attempt(s)", logs)

    async def test_cancelled_turn_is_not_a_fallback(self) -> None:
        """[P5-service] a cancelled turn ends the request as cancelled."""
        session = StubSession("c", [("hang", 5)])
        progress = Progress("c", 4)
        task = asyncio.create_task(converse(session, "x", max_repairs=3, progress=progress, label="c"))
        await asyncio.sleep(0.05)
        await session.cancel()
        outcome = await task
        self.assertEqual((outcome.status, outcome.messages), ("cancelled", []))


if __name__ == "__main__":
    unittest.main()
