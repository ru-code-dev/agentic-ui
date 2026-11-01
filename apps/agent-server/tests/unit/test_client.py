"""acp/client.py against the scripted agent over real pipes (AgentProcess + build_spawn)."""

import asyncio
import unittest

from agentic_ui_server.acp.client import AcpClient, AcpProtocolError
from agentic_ui_server.acp.jsonrpc import RpcError
from agentic_ui_server.agent.process import AgentProcess
from agentic_ui_server.agent.spawn import build_spawn
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import read_record, scripted_settings, temp_dir

QUESTION_CALL = {
    "toolCallId": "q1",
    "title": "Ask user 1 question",
    "kind": "think",
    "_meta": {"toolName": "ask_user_question", "qwenInteractionKind": "user_question"},
}
QUESTION_OPTIONS = [
    {"optionId": "proceed_once", "name": "Submit", "kind": "allow_once"},
    {"optionId": "cancel", "name": "Cancel", "kind": "reject_once"},
]


class ClientTest(unittest.IsolatedAsyncioTestCase):
    async def connect(self, script: dict) -> AcpClient:
        tmp = temp_dir(self)
        settings, self.record = scripted_settings(tmp, script)
        (tmp / "cwd").mkdir()
        self.proc = await AgentProcess.start(
            build_spawn(settings, cwd=str(tmp / "cwd"), files=AgentFiles()), settings.limits
        )
        self.client = AcpClient(
            self.proc.stdout, self.proc.stdin, client_name="agentic-ui-server", client_version="0.1.0", rpc_timeout=5
        )
        self.updates: list[dict] = []
        self.client.on_update = lambda _sid, update: self.updates.append(update)
        self.reader = asyncio.create_task(self.client.run())
        self.addAsyncCleanup(self.cleanup)
        return self.client

    async def cleanup(self) -> None:
        await self.proc.terminate(1)
        await self.client.close()
        await asyncio.wait({self.reader}, timeout=1)

    def sent(self, method: str) -> list[dict]:
        return [entry for entry in read_record(self.record) if entry.get("method") == method]

    def events(self, name: str) -> list[dict]:
        return [entry for entry in read_record(self.record) if entry.get("event") == name]

    async def test_initialize_payload_exact(self) -> None:
        client = await self.connect({})
        result = await client.initialize(5)
        self.assertEqual(
            self.sent("initialize")[0],
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": 1,
                    "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False},
                    "clientInfo": {"name": "agentic-ui-server", "version": "0.1.0"},
                },
            },
        )
        self.assertEqual(result["protocolVersion"], 1)
        self.assertEqual(client.agent_info["name"], "scripted-agent")
        self.assertEqual(client.auth_methods[0]["id"], "openai")
        self.assertTrue(client.can_load_session)

    async def test_protocol_version_mismatch(self) -> None:
        client = await self.connect({"methods": {"initialize": {"result": {"protocolVersion": 2}}}})
        with self.assertRaisesRegex(AcpProtocolError, "protocolVersion 2"):
            await client.initialize(5)

    async def test_authenticate_is_optional(self) -> None:
        client = await self.connect({})
        await client.initialize(5)
        session = await client.new_session("/tmp/x")
        self.assertRegex(session["sessionId"], r"^scripted-\d+-[0-9a-f]{6}$", "an id unique to the process")
        self.assertEqual(self.sent("authenticate"), [])
        self.assertEqual(self.sent("session/new")[0]["params"], {"cwd": "/tmp/x", "mcpServers": []})
        await client.authenticate("openai")
        self.assertEqual(self.sent("authenticate")[0]["params"], {"methodId": "openai"})

    async def test_set_mode_falls_back_to_set_config_option(self) -> None:
        client = await self.connect({"methods": {"session/set_mode": {"error": [-32601, "Method not found"]}}})
        await client.initialize(5)
        await client.set_mode("scripted-1", "auto-edit")
        self.assertEqual(self.sent("session/set_mode")[0]["params"], {"sessionId": "scripted-1", "modeId": "auto-edit"})
        self.assertEqual(
            self.sent("session/set_config_option")[0]["params"],
            {"sessionId": "scripted-1", "configId": "mode", "value": "auto-edit"},
        )

    async def test_set_mode_other_errors_propagate(self) -> None:
        client = await self.connect({"methods": {"session/set_mode": {"error": [-32602, "unknown mode"]}}})
        with self.assertRaises(RpcError):
            await client.set_mode("scripted-1", "nope")
        self.assertEqual(self.sent("session/set_config_option"), [])

    async def test_prompt_returns_stop_reason_and_streams_updates(self) -> None:
        client = await self.connect({"id_quirk": True, "prompts": [[{"chunk": "Hi"}, {"stop": "max_tokens"}]]})
        await client.initialize(5)
        stop = await client.prompt("scripted-1", [{"type": "text", "text": "hello"}], timeout=5)
        self.assertEqual(stop, "max_tokens")
        self.assertEqual(self.updates[0]["content"]["text"], "Hi")
        self.assertEqual(
            self.sent("session/prompt")[0]["params"],
            {"sessionId": "scripted-1", "prompt": [{"type": "text", "text": "hello"}]},
        )

    async def test_permission_request_auto_answered_allow_always(self) -> None:
        client = await self.connect(
            {"prompts": [[{"permission": {"toolCall": {"toolCallId": "t1", "title": "Write"}}}, {"chunk": "done"}]]}
        )
        seen: list[tuple[dict, dict]] = []
        client.on_permission = lambda params, decision: seen.append((params, decision))
        await client.initialize(5)
        self.assertEqual(await client.prompt("scripted-1", [{"type": "text", "text": "go"}], timeout=5), "end_turn")
        reply = self.events("permission_reply")[0]["reply"]
        self.assertEqual(reply["result"], {"outcome": {"outcome": "selected", "optionId": "proceed_always_project"}})
        self.assertEqual(seen[0][0]["toolCall"]["toolCallId"], "t1")

    async def test_question_permission_rejected_and_turn_completes(self) -> None:
        client = await self.connect(
            {
                "prompts": [
                    [{"permission": {"options": QUESTION_OPTIONS, "toolCall": QUESTION_CALL}}, {"chunk": "assumed"}]
                ]
            }
        )
        await client.initialize(5)
        self.assertEqual(await client.prompt("scripted-1", [{"type": "text", "text": "go"}], timeout=5), "end_turn")
        reply = self.events("permission_reply")[0]["reply"]
        self.assertEqual(reply["result"], {"outcome": {"outcome": "selected", "optionId": "cancel"}})

    async def test_unknown_client_requests_get_32601_and_turn_completes(self) -> None:
        """[SV-C14, SV-C5] an agent→client request we do not implement (a mid-turn question channel, a terminal)
        gets -32601 and the turn still completes: the agent can never wait on the user."""
        steps = [
            {"client_request": "craft/drainMidTurnQueue"},
            {"client_request": "fs/read_text_file"},
            {"client_request": "terminal/create"},
            {"chunk": "still here"},
        ]
        client = await self.connect({"prompts": [steps]})
        await client.initialize(5)
        self.assertEqual(await client.prompt("scripted-1", [{"type": "text", "text": "go"}], timeout=5), "end_turn")
        replies = self.events("client_request_reply")
        self.assertEqual([r["reply"]["error"]["code"] for r in replies], [-32601, -32601, -32601])
        self.assertEqual(self.updates[-1]["content"]["text"], "still here")

    async def test_suppress_updates(self) -> None:
        client = await self.connect({"methods": {"session/load": {"replay": ["old 1", "old 2"]}}})
        await client.initialize(5)
        sid = (await client.new_session("/tmp/x"))["sessionId"]
        client.suppress_updates = True
        await client.load_session(sid, "/tmp/x")
        client.suppress_updates = False
        self.assertEqual(self.updates, [])
        self.assertEqual(self.sent("session/load")[0]["params"], {"sessionId": sid, "cwd": "/tmp/x", "mcpServers": []})

    async def test_cancel_is_a_notification(self) -> None:
        client = await self.connect({})
        await client.initialize(5)
        await client.cancel("scripted-1")
        await client.new_session("/tmp/x")  # round trip: the cancel line was read before this request
        cancel = self.sent("session/cancel")[0]
        self.assertNotIn("id", cancel)
        self.assertEqual(cancel["params"], {"sessionId": "scripted-1"})


if __name__ == "__main__":
    unittest.main()
