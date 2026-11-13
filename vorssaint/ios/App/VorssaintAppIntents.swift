import AppIntents
import Foundation
import UIKit

/**
 * Vorssaint OS — Apple App Intents & Siri Shortcuts Integration (iOS 16+, iPadOS 16+)
 * Provides native system integration for Siri voice commands, Spotlight search actions,
 * and the Shortcuts app without needing the main UI in the foreground.
 */

@available(iOS 16.0, macOS 13.0, *)
struct CleanURLIntent: AppIntent {
    static var title: LocalizedStringResource = "Clean URL Tracking Parameters"
    static var description = IntentDescription("Strips utm_*, fbclid, gclid, and other surveillance trackers from a link.")

    @Parameter(title: "URL to Clean")
    var inputURL: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Clean tracking parameters from \(\.$inputURL)")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let raw = inputURL ?? UIPasteboard.general.string ?? ""
        let cleaned = cleanTracking(from: raw)
        UIPasteboard.general.string = cleaned
        return .result(value: cleaned, dialog: "URL cleaned and copied to clipboard!")
    }

    private func cleanTracking(from urlString: String) -> String {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)),
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return urlString
        }
        let trackingKeys: Set<String> = [
            "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
            "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_eid", "yclid", "zanpid",
            "si", "igshid", "ref", "source", "feature", "trk", "_hsenc", "_hsmi"
        ]
        components.queryItems = components.queryItems?.filter { !trackingKeys.contains($0.name.lowercased()) }
        if components.queryItems?.isEmpty == true {
            components.queryItems = nil
        }
        return components.url?.absoluteString ?? urlString
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct ToggleKeepAwakeIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Vorssaint Keep Awake"
    static var description = IntentDescription("Prevents the display from auto-locking or sleeping.")

    @Parameter(title: "Enable Keep Awake", default: true)
    var enable: Bool

    func perform() async throws -> some IntentResult & ProvidesDialog {
        Task { @MainActor in
            UIApplication.shared.isIdleTimerDisabled = enable
        }
        let status = enable ? "Active (Display kept on)" : "Disabled"
        return .result(dialog: "Vorssaint Keep Awake is now \(status)")
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct ScratchpadCaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "Capture Scratchpad Note"
    static var description = IntentDescription("Appends a thought, link, or markdown note to the Vorssaint local scratchpad.")

    @Parameter(title: "Note Text")
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let key = "vorssaint_scratchpad_notes"
        var current = UserDefaults.standard.string(forKey: key) ?? ""
        current += "\n\n- [\(Date().formatted(date: .abbreviated, time: .shortened))] \(text)"
        UserDefaults.standard.set(current, forKey: key)
        return .result(dialog: "Note saved to Vorssaint Scratchpad!")
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct VorssaintShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CleanURLIntent(),
            phrases: [
                "Clean URL with \(.applicationName)",
                "Strip tracking link with \(.applicationName)",
                "Clean my link in \(.applicationName)"
            ],
            shortTitle: "Clean URL",
            systemImageName: "link.badge.plus"
        )
        AppShortcut(
            intent: ToggleKeepAwakeIntent(),
            phrases: [
                "Keep screen awake with \(.applicationName)",
                "Caffeinate my \(.applicationName)"
            ],
            shortTitle: "Keep Awake",
            systemImageName: "cup.and.saucer.fill"
        )
    }
}
