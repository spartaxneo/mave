import Foundation
import CoreGraphics
import AppKit
import ApplicationServices

// MAVE macOS Native Input & Accessibility Bridge
// Contract-compatible with MAVE line-protocol:
//   Request:  <id>|<command>|<arg1>|<arg2>...
//   Reply:    <id>|ok|<result>  or  <id>|err|<message>
//   Events:   !|keys|<ctrl>,<alt>,<shift>,<win>

class MacInputHelper {
    private let eventSource = CGEventSource(stateID: .hidSystemState)

    func run() {
        // Signal ready to parent process
        FileHandle.standardError.write("MacInputHelper ready\n".data(using: .utf8)!)

        while let line = readLine() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }

            let parts = trimmed.components(separatedBy: "|")
            if parts.count < 2 { continue }

            let reqId = parts[0]
            let cmd = parts[1]

            do {
                let result = try executeCommand(cmd: cmd, parts: parts)
                print("\(reqId)|ok|\(result)")
                fflush(stdout)
            } catch {
                print("\(reqId)|err|\(error.localizedDescription)")
                fflush(stdout)
            }
        }
    }

    private func executeCommand(cmd: String, parts: [String]) throws -> String {
        switch cmd {
        case "move":
            guard parts.count >= 4, let x = Double(parts[2]), let y = Double(parts[3]) else {
                throw NSError(domain: "InputHelper", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid move args"])
            }
            let pt = CGPoint(x: x, y: y)
            CGWarpMouseCursorPosition(pt)
            if let ev = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: pt, mouseButton: .left) {
                ev.post(tap: .cghidEventTap)
            }
            return ""

        case "click":
            guard parts.count >= 4, let count = Int(parts[3]) else {
                throw NSError(domain: "InputHelper", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid click args"])
            }
            let btn = parts[2]
            let mouseTypeDown: CGEventType = btn == "right" ? .rightMouseDown : .leftMouseDown
            let mouseTypeUp: CGEventType = btn == "right" ? .rightMouseUp : .leftMouseUp
            let mouseBtn: CGMouseButton = btn == "right" ? .right : .left

            let curLocation = CGEvent(source: nil)?.location ?? .zero
            for _ in 0..<max(1, min(count, 3)) {
                let down = CGEvent(mouseEventSource: eventSource, mouseType: mouseTypeDown, mouseCursorPosition: curLocation, mouseButton: mouseBtn)
                let up = CGEvent(mouseEventSource: eventSource, mouseType: mouseTypeUp, mouseCursorPosition: curLocation, mouseButton: mouseBtn)
                down?.post(tap: .cghidEventTap)
                usleep(40000)
                up?.post(tap: .cghidEventTap)
                usleep(40000)
            }
            return ""

        case "down":
            guard parts.count >= 3 else { throw NSError(domain: "InputHelper", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid down args"]) }
            let btn = parts[2]
            let mouseTypeDown: CGEventType = btn == "right" ? .rightMouseDown : .leftMouseDown
            let mouseBtn: CGMouseButton = btn == "right" ? .right : .left
            let curLocation = CGEvent(source: nil)?.location ?? .zero
            let down = CGEvent(mouseEventSource: eventSource, mouseType: mouseTypeDown, mouseCursorPosition: curLocation, mouseButton: mouseBtn)
            down?.post(tap: .cghidEventTap)
            return ""

        case "up":
            guard parts.count >= 3 else { throw NSError(domain: "InputHelper", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid up args"]) }
            let btn = parts[2]
            let mouseTypeUp: CGEventType = btn == "right" ? .rightMouseUp : .leftMouseUp
            let mouseBtn: CGMouseButton = btn == "right" ? .right : .left
            let curLocation = CGEvent(source: nil)?.location ?? .zero
            let up = CGEvent(mouseEventSource: eventSource, mouseType: mouseTypeUp, mouseCursorPosition: curLocation, mouseButton: mouseBtn)
            up?.post(tap: .cghidEventTap)
            return ""

        case "scroll":
            guard parts.count >= 4, let dx = Int32(parts[2]), let dy = Int32(parts[3]) else {
                throw NSError(domain: "InputHelper", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid scroll args"])
            }
            if let ev = CGEvent(scrollWheelEvent2Source: eventSource, units: .line, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0) {
                ev.post(tap: .cghidEventTap)
            }
            return ""

        case "type":
            guard parts.count >= 3, let data = Data(base64Encoded: parts[2]), let text = String(data: data, encoding: .utf8) else {
                throw NSError(domain: "InputHelper", code: 6, userInfo: [NSLocalizedDescriptionKey: "Invalid type base64"])
            }
            for char in text {
                let str = String(char)
                let utf16 = Array(str.utf16)
                if let evDown = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true),
                   let evUp = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false) {
                    evDown.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
                    evUp.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
                    evDown.post(tap: .cghidEventTap)
                    usleep(15000)
                    evUp.post(tap: .cghidEventTap)
                    usleep(15000)
                }
            }
            return ""

        case "title":
            // Get frontmost application title
            if let app = NSWorkspace.shared.frontmostApplication {
                let name = app.localizedName ?? "Finder"
                let b64 = name.data(using: .utf8)?.base64EncodedString() ?? ""
                return b64
            }
            return ""

        case "activate":
            if parts.count >= 3, let pid = pid_t(parts[2]) {
                if let app = NSRunningApplication(processIdentifier: pid) {
                    app.activate(options: .activateIgnoringOtherApps)
                    return "1"
                }
            }
            return "0"

        default:
            return ""
        }
    }
}

let helper = MacInputHelper()
helper.run()
