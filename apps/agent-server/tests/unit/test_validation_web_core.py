"""validation/components.py + refs.py: web_core's component rules and Zod strip mode (A3-04, A3-05, A3-07).

The four payloads of the A3 renderer proof (WORKFLOW/review attack/renderer/cases.json): the renderer throws and
shows a blank surface on each, Node's ``validatePayload`` rejects each, and the server returned ``ok`` for each.
"""

import unittest

from agentic_ui_server.resources import read_data_json
from agentic_ui_server.validation import validate_payload

CATALOG_ID = read_data_json("catalog.json")["catalogId"]


def surface(*components: dict) -> list:
    return [
        {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": CATALOG_ID}},
        {"version": "v0.9", "updateComponents": {"surfaceId": "s", "components": list(components)}},
    ]


def button(context: dict) -> list:
    return surface(
        {"id": "root", "component": "Flex", "direction": "column", "children": ["title", "go"]},
        {"id": "title", "component": "Heading", "text": "Отчёт"},
        {"id": "go", "component": "Button", "label": "Экспорт", "action": {"event": {"name": "x", "context": context}}},
    )


def texts(payload: list) -> list[str]:
    return [e.message for e in validate_payload(payload)]


class NestedFunctionsTest(unittest.TestCase):
    def test_context_key_function_or_call_is_a_call(self) -> None:
        """[SV-C7] A3-04: an event-context key named ``function``/``call`` is a call web_core validates; an unknown
        name is ``Unrecognized function`` (the server said ok, the renderer threw)."""
        self.assertIn("Unrecognized function 'csv'", texts(button({"function": "csv"})))
        self.assertIn("Unrecognized function 'Анна'", texts(button({"call": "Анна", "phone": "+7 900"})))

    def test_known_nested_call_args_are_checked(self) -> None:
        """[SV-C7] A3-04: a known call anywhere is checked against its args schema; missing args count as {}."""
        self.assertTrue(texts(button({"rows": {"call": "and", "args": {"value": True}}})))
        self.assertTrue(texts(button({"ok": {"call": "required"}})))
        self.assertEqual(texts(button({"ok": {"call": "not", "args": {"value": True}}})), [])

    def test_call_under_a_path_key_and_in_call_args(self) -> None:
        """[SV-C7] A3-04: fuzz f3247/f2780: a call object under ``path`` or inside another call's args."""
        nested = {"call": "not", "args": {"value": {"path": {"call": "http://x"}}}}
        self.assertIn("Unrecognized function 'http://x'", texts(button({"v": nested})))

    def test_empty_or_null_call_name_is_data(self) -> None:
        """[SV-C7] A3-04: JavaScript ``call ?? function``: an empty name is skipped, a null ``call`` falls through."""
        self.assertEqual(texts(button({"call": ""})), [])
        self.assertIn("Unrecognized function 'z'", texts(button({"call": None, "function": "z"})))

    def test_metadata_is_never_walked(self) -> None:
        """[SV-C7] A3-05: ``metadata`` is a stripped envelope key: any value, no call check (as Node)."""
        text = {"id": "root", "component": "Text", "text": "x", "metadata": {"call": "z"}}
        self.assertEqual(texts(surface(text)), [])


class ComponentIdTest(unittest.TestCase):
    MISSING = "Component 'Text' is missing an 'id'; entries require a valid string 'id'."

    def test_only_empty_id_components(self) -> None:
        """[SV-C7] A3-07: empty-id-only: Node's id text and the missing root (the tree check ran on nothing)."""
        problems = texts(surface({"id": "", "component": "Text", "text": "Привет"}))
        self.assertIn(self.MISSING, problems)
        self.assertIn("Missing root component: No component has id='root'", problems)

    def test_stray_empty_id_component(self) -> None:
        """[SV-C7] A3-07: empty-id-stray: a valid tree plus one ``id: ""`` component is invalid."""
        payload = surface(
            {"id": "root", "component": "Flex", "direction": "column", "children": ["a"]},
            {"id": "a", "component": "Text", "text": "Итого: 3500"},
            {"id": "", "component": "Text", "text": "x"},
        )
        self.assertEqual(texts(payload), [self.MISSING])

    def test_missing_and_non_string_id(self) -> None:
        """[SV-C7] A3-07: a missing or numeric id gets Node's text too (with the schema's own problem)."""
        self.assertIn(self.MISSING, texts(surface({"component": "Text", "text": "x"})))
        self.assertIn(self.MISSING, texts(surface({"id": 5, "component": "Text", "text": "x"})))

    def test_create_without_components_needs_no_root(self) -> None:
        """[SV-C7] A3-07: a created surface that received no components yet is valid (Node: create-only)."""
        self.assertEqual(texts(surface()[:1]), [])


class StripModeTest(unittest.TestCase):
    def test_nested_catalog_objects_strip_unknown_keys(self) -> None:
        """[SV-C7] A3-05: fuzz f703/f1288/f1514: an extra key on an option item or a function call is accepted
        (Zod strip); a component's own extra key and an extra key on a binding stay errors (Zod strict)."""
        radio = {"id": "root", "component": "RadioGroup", "label": "L", "value": {"path": "/v"}}
        self.assertEqual(texts(surface({**radio, "options": [{"label": "a", "value": "a", "args": 1}]})), [])
        call = {"call": "formatString", "args": {"value": "a"}, "variant": "x", "path": "/p"}
        self.assertEqual(texts(surface({"id": "root", "component": "Text", "text": call})), [])
        self.assertTrue(texts(surface({"id": "root", "component": "Text", "text": "x", "bogus": 1})))
        self.assertTrue(texts(surface({"id": "root", "component": "Text", "text": {"path": "/x", "bogus": 1}})))

    def test_json_only_function_keywords_are_not_checked(self) -> None:
        """[SV-C7] A3-05: fuzz seed 12/13: ``numeric``/``length`` without min/max, ``openUrl`` any string (Zod)."""
        text = {"id": "root", "component": "Text", "text": {"call": "numeric", "args": {"value": 3.0}}}
        self.assertNotIn("missing required property 'min'", " ".join(texts(surface(text))))

    def test_component_catalog_id(self) -> None:
        """[SV-C7] A3-05: a component's non-string catalogId is stripped; another catalog's id is not found."""
        text = {"id": "root", "component": "Text", "text": "x"}
        self.assertEqual(texts(surface({**text, "catalogId": 5})), [])
        self.assertEqual(texts(surface({**text, "catalogId": CATALOG_ID})), [])
        self.assertEqual(texts(surface({**text, "catalogId": "urn:other"})), ["Catalog not found: urn:other"])


if __name__ == "__main__":
    unittest.main()
