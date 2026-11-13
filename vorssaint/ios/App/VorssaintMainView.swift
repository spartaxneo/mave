// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint
// Authentic macOS Vorssaint experience on iOS (iPhone & iPadOS)

import SwiftUI
import ActivityKit

public struct VorssaintMainView: View {
    @State private var selectedTab: String = "mixer"
    @State private var volume: Double = 65
    @State private var brightness: Double = 70
    @State private var boostPercent: Double = 120
    @State private var keepAwakeActive: Bool = false
    @State private var currentMoment: String = "Resting"
    @State private var isLiveActivityStarted: Bool = false

    // iPadOS split navigation support
    @Environment(\.horizontalSizeClass) var horizontalSizeClass

    public init() {}

    public var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                // iPadOS Split Screen / Multi-column layout
                NavigationSplitView {
                    sidebarList
                        .navigationTitle("Vorssaint")
                } detail: {
                    detailContent
                }
            } else {
                // iPhone compact layout
                ZStack {
                    VorssaintTheme.spaceGradient.ignoresSafeArea()
                    VStack(spacing: 0) {
                        headerBar
                        tabSelector
                        ScrollView {
                            detailContent
                                .padding(.horizontal, 16)
                                .padding(.top, 12)
                                .padding(.bottom, 32)
                        }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var headerBar: some View {
        HStack {
            HStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 24, height: 24)
                    HStack(spacing: 3) {
                        Capsule().fill(Color.black).frame(width: 3.5, height: 8)
                        Capsule().fill(Color.black).frame(width: 3.5, height: 8)
                    }
                }
                Text("Vorssaint")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(VorssaintTheme.textPrimary)
            }
            Spacer()
            HStack(spacing: 12) {
                Button(action: toggleKeepAwake) {
                    Text(keepAwakeActive ? "☕ Active" : "☕")
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(keepAwakeActive ? VorssaintTheme.cyanAccent : VorssaintTheme.controlBackground)
                        .cornerRadius(12)
                        .foregroundColor(.white)
                }
                Button(action: startLiveActivity) {
                    Image(systemName: "circle.circle")
                        .font(.system(size: 14))
                        .foregroundColor(isLiveActivityStarted ? .green : .secondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.4))
    }

    private var tabSelector: some View {
        HStack(spacing: 4) {
            tabButton("Mixer", id: "mixer", icon: "speaker.wave.2")
            tabButton("System", id: "system", icon: "cpu")
            tabButton("Island", id: "island", icon: "sparkles")
            tabButton("Tools", id: "tools", icon: "wrench.and.screwdriver")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(VorssaintTheme.cardBackground)
    }

    private func tabButton(_ title: String, id: String, icon: String) -> some View {
        Button(action: { selectedTab = id }) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 11))
                Text(title).font(.system(size: 11, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(selectedTab == id ? VorssaintTheme.controlBackground : Color.clear)
            .cornerRadius(8)
            .foregroundColor(selectedTab == id ? .white : VorssaintTheme.textMuted)
        }
    }

    @ViewBuilder
    private var detailContent: some View {
        switch selectedTab {
        case "mixer":
            mixerSection
        case "system":
            systemSection
        case "island":
            islandSection
        case "tools":
            toolsSection
        default:
            mixerSection
        }
    }

    private var mixerSection: some View {
        VStack(spacing: 14) {
            cardWrapper(title: "Master Volume") {
                VStack(spacing: 8) {
                    HStack {
                        Image(systemName: "speaker.fill")
                        Slider(value: $volume, in: 0...100)
                            .tint(.white)
                        Image(systemName: "speaker.wave.3.fill")
                        Text("\(Int(volume))%")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .frame(width: 42, alignment: .trailing)
                    }
                }
            }

            cardWrapper(title: "Per-App Audio & 100%+ Boost") {
                VStack(spacing: 12) {
                    appVolumeRow(name: "Spotify", icon: "music.note", pct: 120, boosted: true)
                    appVolumeRow(name: "YouTube / Safari", icon: "safari", pct: 85, boosted: false)
                    appVolumeRow(name: "System Alerts", icon: "bell", pct: 50, boosted: false)
                }
            }
        }
    }

    private var systemSection: some View {
        VStack(spacing: 14) {
            cardWrapper(title: "Hardware Telemetry") {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    metricBox("CPU Utilization", val: "12%", sub: "Apple Silicon A17 / M4")
                    metricBox("Memory Pressure", val: "34%", sub: "Unified LPDDR5X")
                    metricBox("Battery Health", val: "100%", sub: "Optimal Cycle Condition")
                    metricBox("Network Speed", val: "14.2 MB/s", sub: "Wi-Fi 6E Low Latency")
                }
            }
        }
    }

    private var islandSection: some View {
        VStack(spacing: 14) {
            cardWrapper(title: "Companion Mascot Moments") {
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(Color.white)
                                .frame(width: 44, height: 44)
                            HStack(spacing: 5) {
                                Capsule().fill(Color.black).frame(width: 5, height: 12)
                                Capsule().fill(Color.black).frame(width: 5, height: 12)
                            }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Pearl Mascot").font(.system(size: 15, weight: .bold))
                            Text(currentMoment).font(.system(size: 12)).foregroundColor(.secondary)
                        }
                        Spacer()
                    }

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        momentButton("🐰 Hop", moment: "Hopping")
                        momentButton("💖 Love", moment: "Loving")
                        momentButton("🧠 Think", moment: "Thinking")
                        momentButton("🎵 Groove", moment: "Grooving")
                        momentButton("😴 Sleep", moment: "Sleeping")
                        momentButton("😉 Wink", moment: "Winking")
                    }
                }
            }
        }
    }

    private var toolsSection: some View {
        VStack(spacing: 14) {
            cardWrapper(title: "Utilities & Port Manager") {
                VStack(spacing: 10) {
                    HStack {
                        Text("Keep Awake Duration")
                        Spacer()
                        Text("1 Hour").foregroundColor(.secondary)
                    }
                    Divider().background(Color.white.opacity(0.1))
                    HStack {
                        Text("Clipboard Token Masking")
                        Spacer()
                        Text("Active").foregroundColor(.green)
                    }
                    Divider().background(Color.white.opacity(0.1))
                    HStack {
                        Text("Active Listening Ports")
                        Spacer()
                        Text(":4040, :4045").font(.system(.body, design: .monospaced)).foregroundColor(.cyan)
                    }
                }
            }
        }
    }

    private func cardWrapper<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(VorssaintTheme.textMuted)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VorssaintTheme.cardBackground)
        .cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(VorssaintTheme.subtleBorder, lineWidth: 1))
    }

    private func metricBox(_ title: String, val: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 10, weight: .semibold)).foregroundColor(.secondary)
            Text(val).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundColor(.white)
            Text(sub).font(.system(size: 9)).foregroundColor(VorssaintTheme.textMuted)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.04))
        .cornerRadius(8)
    }

    private func appVolumeRow(name: String, icon: String, pct: Int, boosted: Bool) -> some View {
        HStack {
            Image(systemName: icon).frame(width: 20)
            Text(name).font(.system(size: 13, weight: .medium))
            Spacer()
            Text("\(pct)%")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(boosted ? .cyan : .white)
        }
    }

    private func momentButton(_ label: String, moment: String) -> some View {
        Button(action: { currentMoment = moment }) {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.06))
                .cornerRadius(8)
                .foregroundColor(.white)
        }
    }

    private var sidebarList: some View {
        List {
            Section("Menu Panel") {
                Button("Mixer") { selectedTab = "mixer" }
                Button("System") { selectedTab = "system" }
                Button("Dynamic Island") { selectedTab = "island" }
                Button("Utilities") { selectedTab = "tools" }
            }
        }
        .listStyle(.sidebar)
    }

    private func toggleKeepAwake() {
        keepAwakeActive.toggle()
    }

    private func startLiveActivity() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = VorssaintIslandAttributes()
        let initialContentState = VorssaintIslandAttributes.ContentState(
            trackTitle: "Vorssaint",
            artistName: "macOS Companion Active",
            isPlaying: true,
            volumePercent: Int(volume),
            brightnessPercent: Int(brightness),
            keepAwakeActive: keepAwakeActive
        )
        do {
            _ = try Activity<VorssaintIslandAttributes>.request(
                attributes: attributes,
                contentState: initialContentState,
                pushType: nil
            )
            isLiveActivityStarted = true
        } catch {
            print("Failed to start Live Activity: \(error.localizedDescription)")
        }
    }
}
