"""Tier 4 (opt-in): ChatService end to end on real qwen-code + the machine's test LLM endpoint (2-3 model calls).

prompt (pasted data + instruction) → valid UI (a repair only if the model needs one) → an action turn on that
surface → valid update. Same isolation as ``test_real_qwen_llm.py``: temp qwen home copy, key only in the child env,
provider flags composed from ``WORKFLOW/llm.env``. Run it alone:
``AGENTIC_UI_TEST_TIERS=4 "$WORKFLOW_PYTHON" -m unittest tests.integration.test_service_llm -v``.
"""

import json
import sys
import unittest

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import agent_files
from agentic_ui_server.validation import validate_payload

from ..support.tiers import make_settings, temp_dir
from .test_real_qwen_llm import PASSTHROUGH, QWEN_CLI, require_llm, tier4_environ

PASTE = (
    "Имя,Отдел,Сумма\nАнна,Продажи,1200\nБорис,Склад,800\nВера,Продажи,1500\n\nПокажи это таблицей с итоговой суммой."
)


class ServiceLlmTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.llm = require_llm()
        self.tmp = temp_dir(self)
        environ = tier4_environ(self.tmp, self.llm)
        sets = {
            "agent.bin": str(QWEN_CLI),
            "agent.env_passthrough": PASSTHROUGH,
            "timeouts.turn_s": "180",
            "timeouts.start_s": "60",
        }
        self.settings = make_settings(self.tmp, sets, environ)
        self.assertIn(self.llm["AGENTIC_UI_LLM_DEFAULT"], self.settings.agent.extra_args, "flags from llm.env")

    async def test_prompt_to_valid_ui_then_action(self) -> None:
        """[P5-service, SV-C7, SV-C8, SV-C25] real model: models listed, pasted data -> valid UI, action -> update."""
        manager = SessionManager(self.settings, files=agent_files(self.settings.agent))
        self.addAsyncCleanup(manager.shutdown)
        service = ChatService(self.settings, manager)
        offered = await service.models()
        ids = [m["id"] for m in offered["models"]]
        self.assertTrue(ids, ids)

        first = await service.prompt("chat-tier4-service", PASTE)
        report = {"models": offered, "prompt": {k: v for k, v in first.to_dict().items() if k != "messages"}}
        report["prompt"]["messageCount"] = len(first.messages)
        print(f"\n[tier4-service] {json.dumps(report, ensure_ascii=False)}", file=sys.stderr)
        self.assertEqual(first.status, "ok", first.errors)
        self.assertEqual(validate_payload(first.messages), [])
        surface = next(m["createSurface"]["surfaceId"] for m in first.messages if "createSurface" in m)

        second = await service.action(
            "chat-tier4-service", surface, {"name": "sort", "context": {"by": "Сумма"}}, {"sortBy": "Сумма"}
        )
        summary = {k: v for k, v in second.to_dict().items() if k != "messages"} | {
            "messageCount": len(second.messages)
        }
        print(f"[tier4-service] action {json.dumps(summary, ensure_ascii=False)}", file=sys.stderr)
        print(f"[tier4-service] progress {service.progress('chat-tier4-service')}", file=sys.stderr)
        self.assertEqual(second.status, "ok", second.errors)


if __name__ == "__main__":
    unittest.main()
