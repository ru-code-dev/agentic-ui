"""P4 validator agreement: the Python verdict == ``@a2ui/agent`` ``validatePayload`` on examples + mutants."""

import collections
import unittest

from agentic_ui_server.validation import checker
from agentic_ui_server.validation.refs import JSON_ONLY_KEYWORDS

from .mutate import MUTATIONS, NODE_ACCEPTS
from .validator_cases import CASES_FILE, bundle_text, corpus, judge


class ValidatorAgreementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.node, cls.judged = judge(corpus())

    def test_every_verdict_matches_node(self) -> None:
        """[P4-agreement, SV-C7] Node's verdict for every example and mutant; never accepts what Node rejects."""
        wrong = [c for c in self.judged if c["node_valid"] != (not c["python_errors"])]
        print(f"\nvalidator agreement: {len(self.judged) - len(wrong)}/{len(self.judged)} verdicts agree")
        details = [f"{c['id']}: node={c['node_error']!r} python={c['python_errors'][:2]}" for c in wrong[:5]]
        self.assertEqual(wrong, [], "\n".join(details))

    def test_corpus_covers_every_mutation(self) -> None:
        """[P4-agreement] all examples are valid in both, every mutation applies to at least one example."""
        valid = [c for c in self.judged if c["mutation"] is None]
        self.assertGreaterEqual(len(valid), 48)
        self.assertTrue(all(c["node_valid"] and not c["python_errors"] for c in valid))
        used = collections.Counter(c["mutation"] for c in self.judged if c["mutation"])
        self.assertEqual(set(used), set(MUTATIONS), "every mutation produced a case")
        rejected = {c["mutation"] for c in self.judged if c["mutation"] and not c["node_valid"]}
        self.assertEqual(rejected, set(MUTATIONS) - NODE_ACCEPTS, "every other mutation breaks something")

    def test_v091_and_return_types_match_node(self) -> None:
        """[SV-C7, P4-agreement] v0.9.1 / mixed v0.9 + v0.9.1 messages and any enum returnType are accepted as by
        Node; v0.9.2, a numeric version, an unknown or non-string returnType are rejected as by Node (A2-M1)."""
        kinds = {m for m in MUTATIONS if m.startswith(("version-", "mixed-", "return-type-"))}
        judged = [c for c in self.judged if c["mutation"] in kinds]
        self.assertEqual({c["mutation"] for c in judged}, kinds, "every v0.9.1/returnType mutation produced a case")
        for case in judged:
            accepted = case["mutation"] in NODE_ACCEPTS
            self.assertEqual(case["node_valid"], accepted, case["id"])
            self.assertEqual(not case["python_errors"], accepted, f"{case['id']}: {case['python_errors'][:2]}")

    def test_child_reference_map_equals_nodes(self) -> None:
        """[P4-validator] the reference fields derived from catalog.json equal web_core's componentRefMap."""
        mine = {
            name: {
                "single": sorted(r.single),
                "lists": sorted(r.lists),
                "nested": {k: sorted(v) for k, v in r.nested.items()},
            }
            for name, r in checker().refs.items()
        }
        self.assertEqual(mine, self.node["refMap"])

    def test_json_only_keywords_equal_nodes(self) -> None:
        """[SV-C7] A3-05: the function keywords the registry drops are exactly those web_core's spec() annotation
        adds to the JSON schema without a Zod check (a new annotated keyword fails here, not in production)."""
        mine = {name: {k: list(v) for k, v in fields.items()} for name, fields in JSON_ONLY_KEYWORDS.items()}
        self.assertEqual(mine, self.node["jsonOnly"])

    def test_validator_cases_bundle_is_fresh(self) -> None:
        """[SV-C23, P4-agreement] the committed validator-cases/cases.json equals a fresh generation."""
        self.assertTrue(CASES_FILE.is_file(), "run: python -m tests.agreement.validator_cases --write")
        fresh = bundle_text(self.judged)
        self.assertEqual(
            CASES_FILE.read_text(encoding="utf-8"), fresh, "stale: python -m tests.agreement.validator_cases --write"
        )


if __name__ == "__main__":
    unittest.main()
