"""The fixed "sorry" surface (SV-C9): returned after the repair attempts are used up or the agent failed.

A constant built from ui-kit-one components with Russian text: a warning Icon, a Heading, a Text and a "Повторить"
Button whose action is the event ``agent.retry`` (the page re-sends the last prompt). It deletes its surface first
(a no-op when absent), so a second fallback in the same chat is valid against the page's surfaces too (SV-C28).
The catalog id comes from the bundled contract. It is validated by the Python validator and by the Node referee in
the test suite, and published as ``apps/agent-server/fallback.json`` for the hand-over bundle (SV-C23; write it with
``python -m agentic_ui_server.conversation.fallback --write``, which refuses an invalid fallback (A3-24);
``check:generated`` compares the committed file with ``--print``).
"""

import copy
import json
import sys
from pathlib import Path
from typing import Any

from ..generated import generator_main
from ..resources import read_data_json

SURFACE_ID = "agent-fallback"
RETRY_EVENT = "agent.retry"
TITLE = "Не удалось построить интерфейс"
BODY = "Агент не смог подготовить корректный интерфейс. Попробуйте ещё раз."
RETRY_LABEL = "Повторить"
VERSION = "v0.9"
FILE = Path(__file__).resolve().parents[3] / "fallback.json"


def fallback_messages() -> list[dict[str, Any]]:
    catalog_id = read_data_json("catalog.json")["catalogId"]
    components = [
        {"id": "root", "component": "Container", "maxW": "container.sm", "py": "8", "children": ["card"]},
        {
            "id": "card",
            "component": "Flex",
            "direction": "column",
            "align": "center",
            "gap": "4",
            "p": "8",
            "children": ["icon", "title", "body", "retry"],
        },
        {"id": "icon", "component": "Icon", "name": "warning", "boxSize": "10"},
        {"id": "title", "component": "Heading", "text": TITLE, "size": "md", "textAlign": "center"},
        {"id": "body", "component": "Text", "text": BODY, "textAlign": "center"},
        {"id": "retry", "component": "Button", "label": RETRY_LABEL, "action": {"event": {"name": RETRY_EVENT}}},
    ]
    return [
        {"version": VERSION, "deleteSurface": {"surfaceId": SURFACE_ID}},  # SV-C28: valid again in the same chat
        {"version": VERSION, "createSurface": {"surfaceId": SURFACE_ID, "catalogId": catalog_id}},
        {"version": VERSION, "updateComponents": {"surfaceId": SURFACE_ID, "components": components}},
    ]


FALLBACK = fallback_messages()


def fallback_payload() -> list[dict[str, Any]]:
    """A fresh copy of the constant (callers may hand it to JSON encoders or renderers)."""
    return copy.deepcopy(FALLBACK)


def fallback_json() -> str:
    return json.dumps(FALLBACK, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    sys.exit(generator_main(sys.argv, FILE, fallback_json, {"the fallback (conversation/fallback.py)": FALLBACK}))
