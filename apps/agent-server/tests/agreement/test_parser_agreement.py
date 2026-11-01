"""P3 parser agreement: ``agentic_ui_server.a2ui`` == ``@a2ui/agent`` ``DirectJsonParser`` on the whole corpus.

Compared per case: the lexer parts (kind, cleaned text / raw block, final flag) and, per block, the compiled
messages (JSON value equality) or the exact ``ParseError`` text. Referee: ``parser-referee.mjs``.
"""

import unittest
from typing import Any

from agentic_ui_server.a2ui.extract import compile_block
from agentic_ui_server.a2ui.lexer import tokenize

from ..support.node import run_referee, same_json
from .parser_corpus import VECTORS, build_corpus, example_variants, real_replies


def python_result(text: str) -> dict[str, Any]:
    parts = [
        {"kind": "text", "text": p.text} if p.kind == "text" else {"kind": "a2ui", "raw": p.raw, "final": p.final}
        for p in tokenize(text)
    ]
    blocks = []
    for part in parts:
        if part["kind"] != "a2ui":
            continue
        try:
            blocks.append({"messages": compile_block(part["raw"], part["final"])})
        except ValueError as exc:
            blocks.append({"error": str(exc)})
    return {"parts": parts, "blocks": blocks}


class ParserAgreementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = build_corpus()
        cls.node = {item["id"]: item for item in run_referee("parser-referee.mjs", cls.corpus)}

    def test_corpus_covers_vectors_real_replies_and_examples(self) -> None:
        """[P3-parser-agreement] the corpus holds the ported vectors, every real reply and every example twice."""
        self.assertEqual(len(self.corpus), len(VECTORS) + len(real_replies()) + len(example_variants()))
        self.assertGreaterEqual(len(real_replies()), 100)
        self.assertGreaterEqual(len(example_variants()), 2 * 48)
        self.assertEqual(len({item["id"] for item in self.corpus}), len(self.corpus), "ids are unique")
        kinds = [b for r in self.node.values() for b in r["blocks"]]
        self.assertTrue(any("error" in b for b in kinds) and any("messages" in b for b in kinds))

    def test_every_case_matches_node(self) -> None:
        """[P3-parser-agreement, P3-extract] same parts, messages and error texts as Node on 100 % of the corpus."""
        mismatches = []
        for item in self.corpus:
            mine, theirs = python_result(item["text"]), self.node[item["id"]]
            if not (same_json(mine["parts"], theirs["parts"]) and same_json(mine["blocks"], theirs["blocks"])):
                mismatches.append(f"{item['id']}:\n  python {mine}\n  node   {theirs}")
        print(f"\nparser agreement: {len(self.corpus) - len(mismatches)}/{len(self.corpus)} cases agree")
        self.assertEqual(mismatches, [], "\n".join(mismatches[:5]))

    def test_node_lexer_state_leak_is_neutralized(self) -> None:
        """[P3-parser-agreement] Node's module-global OPEN_FENCE_RE leaks into the next reply; the referee resets it."""
        pair = [
            {"id": i, "text": t} for i, t in VECTORS if i in ("stray-close-nested-fence-last", "after-nested-fence")
        ]
        leaked = {r["id"]: r for r in run_referee("parser-referee.mjs", pair, "--no-reset")}["after-nested-fence"]
        fresh = python_result(pair[1]["text"])
        self.assertEqual(fresh["blocks"], [{"messages": [7]}], "a fresh lexer recovers the fenced block")
        self.assertEqual(leaked["blocks"], [], "after the leak Node skips the fence and finds no block")
        node = self.node["after-nested-fence"]
        self.assertTrue(
            same_json(fresh, {"parts": node["parts"], "blocks": node["blocks"]}), "with the reset Node agrees"
        )


if __name__ == "__main__":
    unittest.main()
