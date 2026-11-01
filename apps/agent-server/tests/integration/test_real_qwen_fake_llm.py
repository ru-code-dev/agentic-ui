"""Tier 3: real qwen-code 0.21.1 + the stdlib fake LLM (RESEARCH §D.2, PLAN §3.2).

No ``agent.mode`` is ever set except in the optional yolo test: always-allow must work through permission
answers alone (the production custom Qwen has no yolo mode). Tools are enabled per test only.
"""

import asyncio
import json
import shlex
import subprocess
import sys
import time
import unittest

from agentic_ui_server.agent.session import AgentSession, chat_dir_name
from agentic_ui_server.resources import agent_files, system_prompt_text
from agentic_ui_server.settings import EXCLUDED_TOOLS

from ..support.fake_llm import FakeLlm
from ..support.tiers import QWEN_CLI, SRC_DIR, base_environ, make_settings, require, temp_dir

QUESTION_ARGS = {
    "questions": [
        {
            "question": "Which color?",
            "header": "Color",
            "multiSelect": False,
            "options": [{"label": "Red", "description": "r"}, {"label": "Blue", "description": "b"}],
        }
    ]
}


def system_text(request: dict) -> str:
    content = request["messages"][0]["content"]
    return content if isinstance(content, str) else "".join(part.get("text", "") for part in content)


class RealQwenFakeLlmTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        require(3, QWEN_CLI)
        self.tmp = temp_dir(self)

    def llm(self, replies: list[dict]) -> FakeLlm:
        llm = FakeLlm(replies).start()
        self.addCleanup(llm.stop)
        return llm

    def sets(self, llm: FakeLlm, enable_tool: str | None = None, **extra: str) -> dict[str, str]:
        excluded = ",".join(t for t in EXCLUDED_TOOLS.split(",") if t != enable_tool)
        core = enable_tool if enable_tool and enable_tool != "ask_user_question" else "none"
        return {
            "agent.bin": str(QWEN_CLI),
            "agent.base_args": shlex.join(["--core-tools", core, "--exclude-tools", excluded]),
            "agent.env": f"OPENAI_API_KEY=fake-key,OPENAI_BASE_URL={llm.base_url},OPENAI_MODEL=model-a,"
            "QWEN_SANDBOX=false",
            "timeouts.start_s": "60",
            "timeouts.turn_s": "60",
            **extra,
        }

    def session(self, llm: FakeLlm, enable_tool: str | None = None, **extra: str) -> AgentSession:
        settings = make_settings(self.tmp, self.sets(llm, enable_tool, **extra), base_environ(self.tmp))
        session = AgentSession(settings, "chat-tier3", files=agent_files(settings.agent))
        self.addAsyncCleanup(session.close)
        return session

    async def test_initialize_and_session_shape(self) -> None:
        session = self.session(self.llm([{"content": "x"}]))
        await session.start()
        self.assertEqual(session.agent_info["name"], "qwen-code")
        self.assertIn("openai", [m["id"] for m in session.auth_methods])
        self.assertTrue(session.modes["availableModes"])
        self.assertIsInstance(session.session_id, str)

    async def test_one_turn_lean_prompt_no_tools_no_followup_call(self) -> None:
        llm = self.llm([{"content": "Привет из фейка", "chunks": 3}])
        session = self.session(llm)
        result = await session.run_turn("Say hello")
        self.assertEqual((result.text, result.stop_reason), ("Привет из фейка", "end_turn"))
        self.assertEqual(result.usage["inputTokens"], 11)
        await asyncio.sleep(1.5)  # a follow-up suggestion call would arrive right after the turn
        requests = llm.chat_requests()
        self.assertEqual(len(requests), 1, "one LLM call per turn (follow-up suggestions disabled by the overlay)")
        # qwen appends "--- Context from: ~/.qwen/output-language.md ---" after our prompt (config.ts:1583-1601)
        self.assertTrue(system_text(requests[0]).startswith(system_prompt_text(session.settings.agent)))
        self.assertNotIn("You are Qwen Code", system_text(requests[0]), "QWEN_SYSTEM_MD replaced the built-in prompt")
        self.assertEqual(requests[0].get("tools") or [], [], "lean flags: zero tool schemas")

    async def test_auto_approve_without_any_mode(self) -> None:
        llm = self.llm(
            [
                {
                    "tool_calls": [
                        {
                            "name": "run_shell_command",
                            "args": {"command": "echo hi > proof.txt", "description": "write proof"},
                        }
                    ]
                },
                {"content": "Done."},
            ]
        )
        session = self.session(llm, "run_shell_command")
        result = await session.run_turn("create proof.txt")
        self.assertEqual(session.settings.agent.mode, "")
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertEqual(len(result.permissions), 1, "qwen gated the call behind session/request_permission")
        self.assertIn(
            result.permissions[0].outcome,
            ("proceed_always_project", "proceed_always_user", "proceed_always", "proceed_once"),
        )
        self.assertTrue((self.tmp / "work" / chat_dir_name("chat-tier3") / "proof.txt").is_file(), "the tool ran")
        print(
            f"\n[tier3] mode-less auto-approve: qwen mode={session.modes.get('currentModeId')} "
            f"optionId={result.permissions[0].outcome}",
            file=sys.stderr,
        )

    async def test_auto_approve_picks_allow_always_in_qwen_default_mode(self) -> None:
        llm = self.llm(
            [
                {
                    "tool_calls": [
                        {
                            "name": "run_shell_command",
                            "args": {"command": "echo hi > proof.txt", "description": "write proof"},
                        }
                    ]
                },
                {"content": "Done."},
            ]
        )
        session = self.session(llm, "run_shell_command", **{"agent.extra_args": "--approval-mode default"})
        result = await session.run_turn("create proof.txt")
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertEqual([p.outcome for p in result.permissions], ["proceed_always_project"])
        self.assertEqual(result.tool_calls[result.permissions[0].tool_call_id].status, "completed")

    async def test_question_rejected_turn_completes(self) -> None:
        llm = self.llm(
            [{"tool_calls": [{"name": "ask_user_question", "args": QUESTION_ARGS}]}, {"content": "Assumed."}]
        )
        session = self.session(llm, "ask_user_question")
        result = await asyncio.wait_for(session.run_turn("make a table"), 60)
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertEqual([(p.question, p.outcome) for p in result.permissions], [(True, "cancel")])
        self.assertEqual(result.tool_calls[result.permissions[0].tool_call_id].status, "failed")

    async def test_cancel_during_delayed_reply(self) -> None:
        session = self.session(self.llm([{"content": "late", "delay": 20}]))
        await session.start()
        turn = asyncio.create_task(session.run_turn("slow please"))
        await asyncio.sleep(1.5)
        started = time.monotonic()
        await session.cancel()
        result = await asyncio.wait_for(turn, 5)
        self.assertEqual(result.stop_reason, "cancelled")
        self.assertLess(time.monotonic() - started, 2.0)

    async def test_skipped_authenticate_still_works(self) -> None:
        session = self.session(self.llm([{"content": "no auth call"}]), **{"agent.auth_method": ""})
        self.assertEqual((await session.run_turn("hi")).text, "no auth call")

    async def test_optional_set_mode_yolo(self) -> None:
        llm = self.llm([{"content": "ok"}])
        probe = self.session(llm)
        await probe.start()
        if "yolo" not in [m["id"] for m in probe.modes["availableModes"]]:
            self.skipTest("agent does not advertise a yolo mode")
        await probe.close()
        session = self.session(llm, **{"agent.mode": "yolo"})
        self.assertEqual((await session.run_turn("hi")).stop_reason, "end_turn")

    def test_check_agent_cli(self) -> None:
        llm = self.llm([{"content": "OK"}])
        args = [
            arg
            for key, value in {
                **self.sets(llm),
                "agent.work_root": str(self.tmp / "w"),
                "agent.cache_dir": str(self.tmp / "c"),
                "agent.inherit_env": "false",
            }.items()
            for arg in ("--set", f"{key}={value}")
        ]
        env = {**base_environ(self.tmp), "PYTHONPATH": str(SRC_DIR)}
        proc = subprocess.run(
            [sys.executable, "-m", "agentic_ui_server", "--check-agent", *args],
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        report = json.loads(proc.stdout)
        self.assertEqual(
            (report["agentInfo"]["name"], report["text"], report["stopReason"]), ("qwen-code", "OK", "end_turn")
        )


if __name__ == "__main__":
    unittest.main()
