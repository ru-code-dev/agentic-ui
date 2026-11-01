"""validation/: validate_payload reports every problem at once with Node's texts (SV-C7, CF-I4)."""

import copy
import json
import unittest

from agentic_ui_server.resources import read_data_json
from agentic_ui_server.validation import format_errors, validate_payload

from ..support.node import CATALOG_PKG

CATALOG_ID = read_data_json("catalog.json")["catalogId"]


def login() -> list:
    return json.loads((CATALOG_PKG / "examples" / "compositions" / "01-login.json").read_text(encoding="utf-8"))[
        "messages"
    ]


def messages(*components: dict) -> list:
    return [
        {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": CATALOG_ID}},
        {"version": "v0.9", "updateComponents": {"surfaceId": "s", "components": list(components)}},
    ]


def texts(payload: list) -> list[str]:
    return [e.message for e in validate_payload(payload)]


class ValidatePayloadTest(unittest.TestCase):
    def test_examples_are_valid(self) -> None:
        """[P4-validator, SV-C7] every bundled example validates."""
        for path in sorted((CATALOG_PKG / "examples").glob("*/*.json")):
            with self.subTest(path.name):
                self.assertEqual(validate_payload(json.loads(path.read_text(encoding="utf-8"))["messages"]), [])

    def test_all_errors_in_one_pass(self) -> None:
        """[P4-validator] dangling, orphaned, duplicate and per-component problems are all reported together (CF-I4)."""
        payload = messages(
            {"id": "root", "component": "Flex", "children": ["a", "ghost1", "ghost2"]},
            {"id": "a", "component": "Text", "text": "x", "bogus": 1},
            {"id": "a", "component": "Text", "text": "dup"},
            {"id": "lost1", "component": "Text", "text": "o"},
            {"id": "lost2", "component": "Heading", "text": "o", "size": "giant"},
            {"id": "w", "component": "Widget"},
        )
        found = "\n".join(texts(payload))
        for needle in (
            "'ghost1'",
            "'ghost2'",
            "unknown property 'bogus'",
            "Duplicate component ID: 'a'",
            "'lost1' is not reachable",
            "'lost2' is not reachable",
            '"giant"',
            "Unknown component type 'Widget'",
        ):
            self.assertIn(needle, found)

    def test_node_texts_for_envelope_problems(self) -> None:
        """[P4-validator] message-level texts follow @a2ui/agent (version, envelope, object)."""
        good = login()
        self.assertEqual(texts([{"createSurface": {}}]), ["Message 0 states no version, which v0.9 messages require."])
        self.assertIn("states version 'v0.8', but the catalogs target v0.9", texts([{**good[0], "version": "v0.8"}])[0])
        self.assertEqual(texts(["x"]), ["Message 0 is not a JSON object."])
        self.assertIn(
            "unknown message type in envelope. Present keys: [version, nope]",
            texts([{"version": "v0.9", "nope": {}}])[0],
        )

    def test_surface_rules(self) -> None:
        """[P4-validator] unknown catalog, surface created twice, update before create, assumed surfaces."""
        good = login()
        self.assertIn(
            "Catalog not found: urn:x",
            texts([{**good[0], "createSurface": {**good[0]["createSurface"], "catalogId": "urn:x"}}, *good[1:]])[0],
        )
        self.assertIn("already exists", " ".join(texts([*good, copy.deepcopy(good[0])])))
        self.assertIn("Surface not found for message", " ".join(texts([*good[1:], good[0]])))
        self.assertEqual(
            texts(good[1:]), [], "updates to a surface the payload never creates are assumed (not tree-checked)"
        )

    def test_cycles_on_created_and_assumed_surfaces(self) -> None:
        """[P4-validator] self-references and cycles are rejected even on assumed surfaces."""
        cyc = messages(
            {"id": "root", "component": "Flex", "children": ["a"]},
            {"id": "a", "component": "Flex", "children": ["root"]},
        )
        self.assertIn("Circular reference detected involving component 'root'", texts(cyc))
        self.assertTrue(
            any(
                "references itself" in t
                for t in texts(
                    [
                        cyc[1]
                        | {
                            "updateComponents": {
                                "surfaceId": "z",
                                "components": [{"id": "root", "component": "Flex", "children": ["root"]}],
                            }
                        }
                    ]
                )
            )
        )

    def test_style_props_take_tokens_only(self) -> None:
        """[P4-validator, SV-C7] a style prop bound to data or given an unknown token is rejected (SV-C21)."""
        bound = texts(messages({"id": "root", "component": "Text", "text": "x", "colorScheme": {"path": "/c"}}))
        self.assertTrue(bound and all("colorScheme" in e or "Text" in e or "expected" in e for e in bound))

    def test_format_errors(self) -> None:
        """[P4-validator] one line per problem with its path, for the repair message."""
        errors = validate_payload(messages({"id": "root", "component": "Text"}))
        self.assertEqual(
            format_errors(errors), "- messages[1].updateComponents.components[0]: missing required property 'text'"
        )


if __name__ == "__main__":
    unittest.main()
