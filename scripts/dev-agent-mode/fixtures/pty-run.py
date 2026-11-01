"""A4-A04, A4b-D1 terminal double (after the reviewer's pty_run.py): runs `bash -c <command>` in a fresh pty (the
session leader, like a terminal tab), drains its output, prints READY once <ready-regex> appears, then waits for
one line on its own stdin (the test's go, e.g. after a chat turn) and does <action>:
  close  the terminal window closes (pty master closed: the kernel sends SIGHUP to the foreground job)
  ctrlc  Ctrl+C (\\x03: SIGINT to the foreground job)    quit  Ctrl+\\ (\\x1c: SIGQUIT to the foreground job)
Prints "JOB <status>" when bash ended (or "JOB running" after 30 s) and the last output lines, then exits 0.
Usage: python3.13 -I pty-run.py <close|ctrlc|quit> <ready-regex> <command>"""

import os, pty, re, select, sys, time

action, ready, command = sys.argv[1], re.compile(sys.argv[2].encode()), sys.argv[3]
pid, fd = pty.fork()
if pid == 0:
    os.execvp("bash", ["bash", "-c", command])
buf = b""


def drain(seconds):
    global buf
    end = time.time() + seconds
    while fd is not None and time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                return
            if not chunk:
                return
            buf += chunk


deadline = time.time() + 120
while not ready.search(buf):
    if time.time() > deadline:
        print("TIMEOUT", buf.decode(errors="replace")[-3000:], flush=True)
        sys.exit(2)
    drain(0.2)
print("READY", flush=True)
while not select.select([sys.stdin], [], [], 0.2)[0]:
    drain(0.1)
sys.stdin.readline()
if action == "close":
    os.close(fd)
    fd = None
else:
    os.write(fd, b"\x03" if action == "ctrlc" else b"\x1c")
status = "running"
end = time.time() + 30
while time.time() < end:
    drain(0.2) if fd is not None else time.sleep(0.2)
    done, code = os.waitpid(pid, os.WNOHANG)
    if done == pid:
        status = str(code)
        break
drain(0.5)
print(f"JOB {status}", flush=True)
print(buf.decode(errors="replace")[-2000:], flush=True)
