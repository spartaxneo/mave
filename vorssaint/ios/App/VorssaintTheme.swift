// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint
// Shared iOS & iPadOS Theme tokens matching macOS Theme.swift

import SwiftUI

public enum VorssaintTheme {
    public static let spaceGradient = LinearGradient(
        colors: [Color(white: 0.10), Color(white: 0.04), Color.black],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    public static let cyanAccent = Color(red: 0.02, green: 0.52, blue: 0.78)
    public static let cardBackground = Color.white.opacity(0.075)
    public static let controlBackground = Color.white.opacity(0.085)
    public static let subtleBorder = Color.white.opacity(0.12)
    public static let textPrimary = Color.white
    public static let textSecondary = Color(white: 0.95)
    public static let textMuted = Color(white: 0.55)
}
