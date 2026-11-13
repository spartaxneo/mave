#!/usr/bin/env python3
"""
MAVE Linux Native Input & Automation Bridge (X11 & Wayland).
Contract-compatible with MAVE line-protocol:
  Request:  <id>|<command>|<arg1>|<arg2>...
  Reply:    <id>|ok|<result>  or  <id>|err|<message>
"""

import sys
import os
import subprocess
import base64
import time

IS_WAYLAND = os.environ.get('XDG_SESSION_TYPE') == 'wayland' or bool(os.environ.get('WAYLAND_DISPLAY'))

def run_cmd(cmd_args):
    try:
        res = subprocess.run(cmd_args, capture_output=True, text=True, timeout=5)
        return res.returncode == 0
    except Exception:
        return False

def execute_command(cmd, parts):
    if cmd == "move":
        x, y = parts[2], parts[3]
        if IS_WAYLAND:
            run_cmd(["ydotool", "mousemove", "-a", x, y])
        else:
            run_cmd(["xdotool", "mousemove", x, y])
        return ""

    elif cmd == "click":
        btn_str = parts[2]
        count = int(parts[3]) if len(parts) > 3 else 1
        btn = "1"
        if btn_str == "right": btn = "3"
        elif btn_str == "middle": btn = "2"

        if IS_WAYLAND:
            for _ in range(count):
                run_cmd(["ydotool", "click", f"0x11{btn}"])
                time.sleep(0.05)
        else:
            run_cmd(["xdotool", "click", "--repeat", str(count), btn])
        return ""

    elif cmd == "down":
        btn_str = parts[2]
        btn = "1" if btn_str != "right" else "3"
        if IS_WAYLAND:
            run_cmd(["ydotool", "mousedown", btn])
        else:
            run_cmd(["xdotool", "mousedown", btn])
        return ""

    elif cmd == "up":
        btn_str = parts[2]
        btn = "1" if btn_str != "right" else "3"
        if IS_WAYLAND:
            run_cmd(["ydotool", "mouseup", btn])
        else:
            run_cmd(["xdotool", "mouseup", btn])
        return ""

    elif cmd == "scroll":
        dx, dy = int(parts[2]), int(parts[3])
        if not IS_WAYLAND:
            if dy > 0: run_cmd(["xdotool", "click", "4"])
            elif dy < 0: run_cmd(["xdotool", "click", "5"])
        return ""

    elif cmd == "type":
        b64_str = parts[2]
        text = base64.b64decode(b64_str).decode('utf-8', errors='replace')
        if IS_WAYLAND:
            run_cmd(["ydotool", "type", text])
        else:
            run_cmd(["xdotool", "type", "--clearmodifiers", text])
        return ""

    elif cmd == "title":
        if not IS_WAYLAND:
            try:
                out = subprocess.check_output(["xdotool", "getactivewindow", "getwindowname"], text=True).strip()
                return base64.b64encode(out.encode('utf-8')).decode('utf-8')
            except Exception:
                return ""
        return ""

    elif cmd == "activate":
        return "1"

    return ""

def main():
    sys.stderr.write("LinuxInputHelper ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) < 2:
            continue

        req_id = parts[0]
        cmd = parts[1]

        try:
            result = execute_command(cmd, parts)
            sys.stdout.write(f"{req_id}|ok|{result}\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(f"{req_id}|err|{str(e)}\n")
            sys.stdout.flush()

if __name__ == '__main__':
    main()
