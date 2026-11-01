"""Surface state of a chat and the message-by-message merge of a reply into it (SV-C28; port of ``@a2ui/agent``
``RendererState``, which applies messages with web_core's ``MessageProcessor``, the renderer's own state).

``SurfaceState``: surfaceId → ``Surface`` (catalog, components by id with their type, data model). A reply is merged
into a copy, message by message, the way the renderer applies it: ``createSurface`` of a shown surface is
``Surface <id> already exists.``; ``deleteSurface`` removes it and is never an error (an unknown one is a no-op,
A4-28), so delete-then-create recreates it; an update of a surface neither shown nor created earlier in the reply is
``Surface not found for message: <id>`` (A4-25) — only without a state (stateless ``validate_payload``, the hand-over
examples) such a surface is assumed to exist, as ``validatePayload`` assumes it; a component update replaces the
component (an update without ``component`` keeps the shown type) and, as web_core checks every candidate,
self-references, cycles and depth are checked after each such message; ``updateDataModel`` writes through
``datamodel.set_value`` (A4-24). An empty or blank ``surfaceId`` is refused (A4-30: the renderer ignores updates
of it and shows a surface created with it as a permanent loading state). ``finish`` checks the WHOLE merged tree of
every surface the reply touched (``topology.check_tree``: root, dangling, cycles, depth, orphans among the
components the reply changed) and the bound values (``bindings.check_bindings``).
"""

import copy
from dataclasses import dataclass, field
from typing import Any

from . import datamodel
from .bindings import BindingKinds, check_bindings
from .schema import Issue
from .topology import RefFields, check_cycles, check_tree

CREATE, DELETE, COMPONENTS, DATA = "createSurface", "deleteSurface", "updateComponents", "updateDataModel"
ACTIONS = (CREATE, COMPONENTS, DATA, DELETE)
JS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680" + "".join(map(chr, range(0x2000, 0x200B))) + "\u2028\u2029\u202f\u205f\u3000\ufeff"
)
"""What JavaScript's ``String.prototype.trim`` removes (the page's blank check), not Python's wider ``str.strip``."""


@dataclass
class Surface:
    catalog_id: str
    components: dict[str, dict] = field(default_factory=dict)
    """id → the component as the renderer holds it (``component`` = its type)."""
    data: Any = field(default_factory=dict)
    assumed: bool = False
    """Stateless check only: a surface the payload updates without creating (its tree is not checked)."""


@dataclass
class SurfaceState:
    """What the page shows in one chat: surfaceId → Surface (SV-C28). Never changed in place by a check."""

    surfaces: dict[str, Surface] = field(default_factory=dict)

    def copy(self) -> "SurfaceState":
        return copy.deepcopy(self)

    def to_json(self) -> dict[str, Any]:
        """``{surfaceId: {components: {id: component}, data}}`` (compared with the Node referee's renderer state)."""
        return {
            sid: {"components": copy.deepcopy(s.components), "data": datamodel.to_json(s.data)}
            for sid, s in self.surfaces.items()
        }

    def with_data(self, surface_id: str, data: Any) -> "SurfaceState":
        """A copy whose surface holds ``data`` (the data model an action sends: the page's truth, inputs included)."""
        out = self.copy()
        if surface_id in out.surfaces:
            out.surfaces[surface_id].data = copy.deepcopy(data)
        return out


def target(message: Any) -> tuple[str | None, str | None]:
    """``(surfaceId, action)`` of a message with exactly one action and a string surfaceId."""
    if not isinstance(message, dict):
        return None, None
    actions = [a for a in ACTIONS if a in message]
    body = message[actions[0]] if len(actions) == 1 else None
    if isinstance(body, dict) and isinstance(body.get("surfaceId"), str):
        return body["surfaceId"], actions[0]
    return None, None


class Simulation:
    """One reply merged into a copy of a state (``state=None``: stateless, unknown surfaces are assumed)."""

    def __init__(
        self,
        messages: list,
        state: SurfaceState | None,
        catalog_id: str,
        refs: dict[str, RefFields],
        kinds: BindingKinds,
    ) -> None:
        self.stateful = state is not None
        self.state = state.copy() if state is not None else SurfaceState()
        self.catalog_id, self.refs, self.kinds = catalog_id, refs, kinds
        self.targets = [target(m) for m in messages]
        self.named: set[str] = set()
        self.where: dict[str, str] = {}
        self.changed: dict[str, list[str]] = {}
        self.received: set[str] = set()
        self.cycle_texts: set[str] = set()

    def known_types(self, message: Any) -> dict[str, str]:
        """id → shown type of the components of the surface an ``updateComponents`` message targets."""
        sid, action = target(message)
        surface = self.state.surfaces.get(sid) if action == COMPONENTS else None
        return {cid: c["component"] for cid, c in surface.components.items()} if surface else {}

    def apply(self, index: int, message: Any) -> list[Issue]:
        sid, action = self.targets[index]
        if sid is None:
            return []
        path, body = f"messages[{index}]", message[action]
        if not sid.strip(JS_WHITESPACE):
            return [Issue(f"{path}.{action}.surfaceId", "surfaceId must not be empty or blank")]
        surfaces, issues = self.state.surfaces, []
        if action == CREATE:
            if body.get("catalogId") != self.catalog_id:
                issues.append(Issue(f"{path}.createSurface.catalogId", f"Catalog not found: {body.get('catalogId')}"))
            if sid in surfaces:
                issues.append(Issue(path, f"Surface {sid} already exists."))
            surfaces[sid] = Surface(self.catalog_id)
            self.where[sid] = path
            self.changed[sid] = []
            self.received.discard(sid)
        elif action == DELETE:
            surfaces.pop(sid, None)
            self.changed.pop(sid, None)
        else:
            if sid not in surfaces:
                if not (not self.stateful and self._assumes(index, sid)):
                    issues.append(Issue(path, f"Surface not found for message: {sid}"))
                surfaces[sid] = Surface(self.catalog_id, assumed=True)
                self.where[sid] = path
            self.where.setdefault(sid, path)
            if action == COMPONENTS:
                issues += self._components(sid, body.get("components"), path)
                issues += self._cycles(sid, path)
            else:
                issues += self._data(surfaces[sid], body, path)
        self.named.add(sid)
        return issues

    def _assumes(self, index: int, sid: str) -> bool:
        """Node's ``assumes``: no earlier message names the surface and no later one creates it before a delete."""
        if sid in self.named:
            return False
        for later_sid, action in self.targets[index + 1 :]:
            if later_sid == sid and action == CREATE:
                return False
            if later_sid == sid and action == DELETE:
                break
        return True

    def _components(self, sid: str, components: Any, path: str) -> list[Issue]:
        if not isinstance(components, list):
            return []
        surface, changed = self.state.surfaces[sid], self.changed.setdefault(sid, [])
        if components:
            self.received.add(sid)
        issues, seen = [], set()
        for comp in components:
            cid = comp.get("id") if isinstance(comp, dict) else None
            if not isinstance(cid, str) or not cid:
                continue  # reported by components.py with Node's text
            if cid in seen:
                issues.append(Issue(f"{path}.updateComponents", f"Duplicate component ID: '{cid}'"))
            seen.add(cid)
            shown = surface.components.get(cid)
            merged = copy.deepcopy({k: v for k, v in comp.items() if k not in ("catalogId", "metadata")})
            if "component" not in merged and shown is not None:
                merged["component"] = shown["component"]
            surface.components.pop(cid, None)  # a replaced component moves to the end, as web_core re-adds it
            surface.components[cid] = merged
            changed.append(cid)
        return issues

    def _cycles(self, sid: str, path: str) -> list[Issue]:
        """web_core's candidate check after every ``updateComponents``: self-references, cycles and depth over the
        whole surface (dangling ids, the root and orphans wait for the end of the reply)."""
        found = check_cycles(sid, self.state.surfaces[sid].components, self.refs, path)
        self.cycle_texts.update(i.message for i in found)
        return found

    @staticmethod
    def _data(surface: Surface, body: dict, path: str) -> list[Issue]:
        where = body.get("path")
        if where is not None and not isinstance(where, str):
            return []  # reported by the schema
        try:
            surface.data = datamodel.set_value(surface.data, where or "/", body.get("value"))
        except datamodel.DataModelError as exc:
            return [Issue(f"{path}.updateDataModel.path", str(exc))]
        return []

    def finish(self) -> list[Issue]:
        issues: list[Issue] = []
        for sid in dict.fromkeys(s for s, _ in self.targets if s is not None and s in self.state.surfaces):
            surface, where = self.state.surfaces[sid], self.where.get(sid, "messages")
            if surface.assumed:
                continue  # its cycles were checked per message; its tree is not checked
            if surface.components or sid in self.received:
                tree = check_tree(sid, surface.components, self.changed.get(sid, []), self.refs, where)
                issues += [i for i in tree if i.message not in self.cycle_texts]
                issues += check_bindings(sid, surface.components, surface.data, self.refs, self.kinds, where)
        return issues
