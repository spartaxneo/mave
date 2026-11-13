// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint
// iOS Dynamic Island & Live Activity Widget for iPhone 14 Pro, 15/16 series

import ActivityKit
import SwiftUI
import WidgetKit

public struct VorssaintIslandAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var trackTitle: String
        public var artistName: String
        public var isPlaying: Bool
        public var volumePercent: Int
        public var brightnessPercent: Int
        public var keepAwakeActive: Bool
    }
}

public struct VorssaintIslandActivityWidget: Widget {
    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: VorssaintIslandAttributes.self) { context in
            // Lock Screen Banner Presentation
            VorssaintLockScreenBanner(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Dynamic Island Card (Screenshot 1)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(white: 0.12))
                            .frame(width: 40, height: 40)
                            .overlay(Text("♫").foregroundColor(.secondary))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.state.trackTitle.isEmpty ? "Nothing playing" : context.state.trackTitle)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                            Text(context.state.artistName.isEmpty ? "Your music appears here." : context.state.artistName)
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.leading, 12)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "speaker.wave.2.fill").font(.system(size: 11))
                            ProgressView(value: Double(context.state.volumePercent), total: 100)
                                .tint(.white)
                                .frame(width: 60)
                            Text("\(context.state.volumePercent)%").font(.system(size: 10)).foregroundColor(.secondary)
                        }
                        HStack(spacing: 6) {
                            Image(systemName: "sun.max.fill").font(.system(size: 11))
                            ProgressView(value: Double(context.state.brightnessPercent), total: 100)
                                .tint(.white)
                                .frame(width: 60)
                            Text("\(context.state.brightnessPercent)%").font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                    .padding(.trailing, 12)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 16) {
                        VStack(spacing: 4) {
                            Circle().fill(Color(white: 0.15)).frame(width: 32, height: 32)
                                .overlay(Image(systemName: "slider.vertical.3").font(.system(size: 13)))
                            Text("Volume mixer").font(.system(size: 9)).foregroundColor(.secondary)
                        }
                        VStack(spacing: 4) {
                            Circle().fill(context.state.keepAwakeActive ? Color.blue : Color(white: 0.15)).frame(width: 32, height: 32)
                                .overlay(Image(systemName: "cup.and.saucer.fill").font(.system(size: 13)))
                            Text("Keep awake").font(.system(size: 9)).foregroundColor(.secondary)
                        }
                        VStack(spacing: 4) {
                            Circle().fill(Color(white: 0.15)).frame(width: 32, height: 32)
                                .overlay(Image(systemName: "stopwatch").font(.system(size: 13)))
                            Text("Timer").font(.system(size: 9)).foregroundColor(.secondary)
                        }
                        VStack(spacing: 4) {
                            Circle().fill(Color(white: 0.15)).frame(width: 32, height: 32)
                                .overlay(Image(systemName: "calendar").font(.system(size: 13)))
                            Text("Calendar").font(.system(size: 9)).foregroundColor(.secondary)
                        }
                    }
                    .padding(.top, 8)
                }

            } compactLeading: {
                // Compact Leading: Pearl Mascot Face (Screenshot 2)
                ZStack {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 20, height: 20)
                    HStack(spacing: 3) {
                        Capsule().fill(Color.black).frame(width: 3, height: 7)
                        Capsule().fill(Color.black).frame(width: 3, height: 7)
                    }
                }
                .padding(.leading, 4)

            } compactTrailing: {
                // Compact Trailing: Equalizer Bars
                HStack(spacing: 2) {
                    RoundedRectangle(cornerRadius: 1).fill(Color.white).frame(width: 2, height: 8)
                    RoundedRectangle(cornerRadius: 1).fill(Color.white).frame(width: 2, height: 12)
                    RoundedRectangle(cornerRadius: 1).fill(Color.white).frame(width: 2, height: 6)
                }
                .padding(.trailing, 4)

            } minimal: {
                // Minimal Dot
                Circle().fill(Color.white).frame(width: 14, height: 14)
            }
        }
    }
}

struct VorssaintLockScreenBanner: View {
    let state: VorssaintIslandAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color.white).frame(width: 32, height: 32)
                HStack(spacing: 4) {
                    Capsule().fill(Color.black).frame(width: 4, height: 10)
                    Capsule().fill(Color.black).frame(width: 4, height: 10)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Vorssaint").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                Text(state.trackTitle.isEmpty ? "Ready • Controls & Audio" : state.trackTitle)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(Color(white: 0.08))
    }
}
