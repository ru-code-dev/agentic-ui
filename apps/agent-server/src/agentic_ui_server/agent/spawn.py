"""Build the agent CLI argv/env/cwd from settings: the ru-code ``buildCliSpawn`` + ``buildCliEnv`` equivalent.

argv (RESEARCH §A.1/§A.2, ru-code ``qwen/src/spawn.ts:45-67``): ``.js/.mjs/.cjs`` → ``[node, bin, …]``;
``.ts`` → ``[node, --experimental-strip-types, bin, …]`` (the ru-code fake); anything else runs directly
(no shell). An absolute JS/TS entry is passed by its real path: qwen-code started through a symlinked path
(e.g. ``/opt/custom-qwen/current/cli.js``) exits 0 without a word, its entry-module check compares real paths.
Then ``base_args + extra_args + [acp_flag]`` (an empty ``acp_flag`` is omitted).

env (RESEARCH §A.3): base = inherited env (or only ``env_passthrough`` names when ``inherit_env`` is false)
+ ``agent.env`` + ``extra_env`` + the registry rows written **last** so they win: ``no_relaunch=true``,
``home`` (when set), ``system_prompt`` and ``system_settings`` paths, ``NODE_TLS_REJECT_UNAUTHORIZED=0`` when
``tls_insecure``.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from ..log import mask_args
from ..resources import AgentFiles
from ..settings import Settings

JS_SUFFIXES = (".js", ".mjs", ".cjs")
TS_SUFFIXES = (".ts", ".mts")


@dataclass(frozen=True)
class SpawnSpec:
    argv: tuple[str, ...]
    env: Mapping[str, str]
    cwd: str

    def __repr__(self) -> str:  # never print env values or secret flag values
        return f"SpawnSpec(argv={tuple(mask_args(self.argv))!r}, cwd={self.cwd!r}, env_keys={sorted(self.env)!r})"


def command_prefix(bin_path: str, node: str) -> list[str]:
    suffix = Path(bin_path).suffix.lower()
    if suffix in JS_SUFFIXES + TS_SUFFIXES and os.path.isabs(bin_path):
        bin_path = os.path.realpath(bin_path)
    if suffix in JS_SUFFIXES:
        return [node, bin_path]
    if suffix in TS_SUFFIXES:
        return [node, "--experimental-strip-types", bin_path]
    return [bin_path]


def build_env(settings: Settings, *, files: AgentFiles, extra_env: Mapping[str, str] | None = None) -> dict[str, str]:
    agent = settings.agent
    if agent.inherit_env:
        env = dict(settings.environ)
    else:
        env = {name: settings.environ[name] for name in agent.env_passthrough if name in settings.environ}
    env.update(agent.env)
    env.update(extra_env or {})
    names = agent.env_names
    for name in names.no_relaunch:
        env[name] = "true"
    if agent.home:
        for name in names.home:
            env[name] = agent.home
    for names_row, path in ((names.system_prompt, files.system_prompt), (names.system_settings, files.system_settings)):
        for name in names_row if path else ():
            env[name] = path
    if agent.tls_insecure:
        env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
    return env


def build_spawn(
    settings: Settings, *, cwd: str, files: AgentFiles, extra_env: Mapping[str, str] | None = None
) -> SpawnSpec:
    agent = settings.agent
    argv = command_prefix(agent.bin, agent.node) + list(agent.base_args) + list(agent.extra_args)
    if agent.acp_flag:
        argv.append(agent.acp_flag)
    return SpawnSpec(tuple(argv), build_env(settings, files=files, extra_env=extra_env), cwd)
