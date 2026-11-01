"""The only module that spawns processes (PLAN §0): the agent child in its own process group.

``start_new_session=True`` makes the child a group leader, so ``terminate``/``kill`` signal the whole group and
also reap grandchildren (MCP servers, a relaunched CLI). stderr is always drained (an unread pipe queues in the
child's memory or blocks it, RESEARCH §C, R4): every line is logged live with the chat label and pid (SV-C16) and
the last lines are kept in a ring buffer for error reports. The spawn log shows argv (secret flag values masked and
registered for redaction) and env KEYS, never values; the exit code is logged when the child ends.
"""

import asyncio
import collections
import logging
import os
import signal

from ..log import get_logger, mask_args, printable, redact, register_arg_secrets, register_env_secrets
from ..settings import LimitSettings
from .spawn import SpawnSpec

_log = get_logger("agent.process")
_stderr_log = get_logger("agent.stderr")


class AgentProcess:
    def __init__(self, proc: asyncio.subprocess.Process, stderr_lines: int, label: str) -> None:
        self._proc, self._label = proc, label
        self._stderr: collections.deque[str] = collections.deque(maxlen=stderr_lines)
        self._killed = False
        loop = asyncio.get_running_loop()
        self._stderr_task = loop.create_task(self._drain_stderr())
        self._exit_task = loop.create_task(self._watch_exit())

    @classmethod
    async def start(cls, spec: SpawnSpec, limits: LimitSettings, label: str = "agent") -> "AgentProcess":
        """Spawn the child (raises ``OSError`` when the binary cannot be executed)."""
        register_env_secrets(spec.env)
        register_arg_secrets(spec.argv)
        _log.info("[%s] spawning argv=%s cwd=%s env_keys=%s", label, mask_args(spec.argv), spec.cwd, sorted(spec.env))
        proc = await asyncio.create_subprocess_exec(
            *spec.argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=spec.cwd,
            env=dict(spec.env),
            limit=limits.max_line_bytes,
            start_new_session=True,
        )
        _log.info("[%s] spawned pid=%s", label, proc.pid)
        return cls(proc, limits.stderr_lines, label)

    @property
    def pid(self) -> int:
        return self._proc.pid

    @property
    def stdout(self) -> asyncio.StreamReader:
        return self._proc.stdout

    @property
    def stdin(self) -> asyncio.StreamWriter:
        return self._proc.stdin

    @property
    def returncode(self) -> int | None:
        return self._proc.returncode

    def stderr_tail(self, lines: int = 20) -> str:
        return redact("\n".join(list(self._stderr)[-lines:]))

    async def wait_exit(self, timeout: float | None = None) -> int | None:
        """Wait for the child to exit; returns its code, or None on timeout."""
        try:
            code = await asyncio.wait_for(asyncio.shield(self._exit_task), timeout)
        except TimeoutError:
            _log.debug("[%s pid=%s] still running after %ss", self._label, self.pid, timeout)
            return None
        try:  # let the stderr drain catch the last lines (bounded, like ru-code CHILD_EXIT_READ_TIMEOUT_MS)
            await asyncio.wait_for(asyncio.shield(self._stderr_task), 0.5)
        except TimeoutError:
            _log.debug("[%s pid=%s] stderr still open after exit (grandchild holds it)", self._label, self.pid)
        return code

    def _signal_group(self, sig: int) -> None:
        try:
            os.killpg(self._proc.pid, sig)
        except ProcessLookupError:
            _log.debug("[%s pid=%s] %s: process group already gone", self._label, self.pid, signal.Signals(sig).name)
        except PermissionError as exc:
            _log.warning("[%s pid=%s] cannot send %s: %s", self._label, self.pid, signal.Signals(sig).name, exc)

    def kill(self) -> None:
        """SIGKILL the process group (immediate)."""
        if self._proc.returncode is None:
            _log.info("[%s pid=%s] SIGKILL process group", self._label, self.pid)
        self._killed = True
        self._signal_group(signal.SIGKILL)

    async def terminate(self, grace: float) -> int | None:
        """SIGTERM the group, then SIGKILL after ``grace`` seconds."""
        if self._proc.returncode is None:
            self._killed = True
            _log.info("[%s pid=%s] SIGTERM process group", self._label, self.pid)
            self._signal_group(signal.SIGTERM)
            if await self.wait_exit(grace) is None:
                _log.warning("[%s pid=%s] ignored SIGTERM for %.1fs", self._label, self.pid, grace)
                self.kill()
        code = await self.wait_exit(grace)
        if self._proc.stdin is not None and not self._proc.stdin.is_closing():
            self._proc.stdin.close()
        return code

    async def _watch_exit(self) -> int:
        code = await self._proc.wait()
        level = logging.INFO if code == 0 or self._killed else logging.WARNING
        _log.log(
            level,
            "[%s pid=%s] exited with code %s%s",
            self._label,
            self.pid,
            code,
            " (stopped by us)" if self._killed else "",
        )
        return code

    async def _drain_stderr(self) -> None:
        reader = self._proc.stderr
        while reader is not None:
            try:
                line = await reader.readline()
            except ValueError as exc:
                _stderr_log.warning("[%s pid=%s] skipped an over-limit stderr line: %s", self._label, self.pid, exc)
                continue
            except (ConnectionError, OSError) as exc:
                _stderr_log.warning("[%s pid=%s] stderr read failed: %s", self._label, self.pid, exc)
                return
            if not line:
                return
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            self._stderr.append(text)
            _stderr_log.info("[%s pid=%s] %s", self._label, self.pid, printable(text))
