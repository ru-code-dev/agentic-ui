"""SV-C28: per-step agreement of the stateful Python validator with the renderer's own state (surface referee)."""

import unittest

from ..support.node import run_referee, same_json
from .sequences import as_chat, bases, fuzz, judge_chats, repair_scenarios, scenarios
from .validator_cases import corpus, examples

FUZZ_SEEDS, FUZZ_CHATS = (1, 2, 3), 160


def _wrong(judged: list[dict]) -> list[str]:
    out = []
    for step in judged:
        node_valid = step["node"]["valid"]
        if node_valid != (not step["python_errors"]):
            out.append(
                f"{step['chat']}#{step['step']}: node={step['node']['error']!r} python={step['python_errors'][:2]}"
            )
        elif node_valid and not same_json(step["node"]["state"], step["python_state"]):
            out.append(f"{step['chat']}#{step['step']}: merged states differ")
    return out


class SurfaceAgreementTest(unittest.TestCase):
    def test_scenarios_agree_per_step(self) -> None:
        """[SV-C28, A4-09, A4-25, A4-28, A4-24, A4-26, A4-30, A4-31, A4b-H2] every hand-written chat: the verdict of
        each reply and the
        merged state after each valid reply equal the renderer state's (RendererState over web_core)."""
        judged = judge_chats(scenarios())
        self.assertEqual(_wrong(judged), [])
        verdicts = {(s["chat"], s["step"]): s["node"]["valid"] for s in judged}
        self.assertFalse(verdicts[("svc28-patch-dangling", 1)], "a follow-up with a dangling child is invalid")
        self.assertFalse(verdicts[("svc28-unknown-surface", 1)], "an update of a surface the chat lacks is invalid")
        self.assertTrue(verdicts[("svc28-delete-then-create", 1)], "delete-then-create recreates the surface")
        self.assertFalse(verdicts[("svc28-update-after-delete", 2)], "an update after the delete is invalid")
        self.assertTrue(verdicts[("svc28-invalid-step-rolls-back", 3)], "a rejected reply leaves the state as it was")
        self.assertTrue(all(verdicts[("svc28-lifecycle", i)] for i in range(5)))

    def test_nested_and_row_bindings_agree(self) -> None:
        """[A5-02, A5-01] a Tabs tab title bound to an object and Table rows bound to an object or an array of strings
        are invalid on the server AND in the page store (createChatSurfaces); a title bound to a number stays valid."""
        chats = {k: v for k, v in scenarios().items() if k.startswith("a5-02-")}
        judged = judge_chats(chats)
        self.assertEqual(_wrong(judged), [])
        verdicts = {s["chat"]: s["node"]["valid"] for s in judged}
        self.assertEqual(
            verdicts,
            {
                "a5-02-tab-title-bound-to-object": False,
                "a5-02-tab-title-bound-to-number": True,
                "a5-02-table-rows-object": False,
                "a5-02-table-rows-strings": False,
            },
        )

    def test_repair_rollback_agrees(self) -> None:
        """[DEC-064] a page-rejected reply undone by its repair's repairOf: the server's ChatSurfaces rollback and the
        referee (the page's surfaces drop the reply) agree per step; the repair is valid only after the rollback."""
        judged = judge_chats(repair_scenarios())
        self.assertEqual(_wrong(judged), [])
        verdicts = {(s["chat"], s["step"]): s["node"]["valid"] for s in judged}
        self.assertTrue(verdicts[("dec064-repair-recreates-the-rejected-surface", 3)], "valid after the rollback")
        self.assertFalse(verdicts[("dec064-control-without-rollback", 2)], "re-creating a shown surface is invalid")
        self.assertFalse(verdicts[("dec064-rollback-of-the-first-reply", 2)], "the first reply undone: nothing shown")
        self.assertTrue(verdicts[("dec064-rollback-after-an-invalid-reply-keeps-the-state", 3)], "BASE still shown")

    def test_every_corpus_payload_agrees_as_a_chat(self) -> None:
        """[SV-C28, P4-agreement] every example and mutant as a chat from an empty state (a follow-up after its base
        composition): Python's per-step verdict equals the referee's."""
        known = bases(examples())
        chats = {c["id"]: as_chat(c["messages"], known) for c in corpus()}
        judged = judge_chats(chats)
        print(f"\nsurface agreement: {len(judged)} steps of {len(chats)} chats")
        self.assertEqual(_wrong(judged)[:5], [])

    def test_fuzzed_follow_ups_agree(self) -> None:
        """[SV-C28] seeded follow-up fuzzing (partial/retyped/relinked components, data writes, rebinding, delete,
        recreate, wrong surface): per-step verdict and merged state agree with the referee."""
        chats = {k: v for seed in FUZZ_SEEDS for k, v in fuzz(examples(), seed, FUZZ_CHATS).items()}
        judged = judge_chats(chats)
        invalid = sum(not s["node"]["valid"] for s in judged)
        print(f"\nfollow-up fuzz: {len(judged)} steps, {invalid} invalid")
        self.assertGreater(invalid, len(judged) // 10, "the fuzz reaches invalid follow-ups")
        self.assertEqual(_wrong(judged)[:5], [])

    def test_renderer_state_rollback_defect(self) -> None:
        """[SV-C28] why the referee replays accepted replies: @a2ui/agent 0.0.2 RendererState loses a component that
        a rejected reply retyped when it rolls the reply back (the page store must not rely on that rollback)."""
        probe = run_referee("rollback-probe.mjs", [])
        self.assertEqual(probe["before"], ["root:Flex", "cta:Text"])
        self.assertEqual(probe["after"], ["root:Flex"], "fixed upstream: the referee may trust the rollback again")


if __name__ == "__main__":
    unittest.main()
