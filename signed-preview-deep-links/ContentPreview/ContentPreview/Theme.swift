//
//  Theme.swift
//  ContentPreview
//
//  Brand palette. The primary green (#005941) is also set as the
//  asset-catalog AccentColor, so system controls (tab bar, links, buttons)
//  pick it up automatically; these named colours are for custom surfaces
//  such as the hero and promo gradients.
//

import SwiftUI

extension Color {
    /// Primary brand green — a dark green (#005941).
    static let brandGreen = Color(red: 0.000, green: 0.349, blue: 0.255)

    /// Brighter brand green used for gradient highlights (#00A06B).
    static let brandGreenLight = Color(red: 0.000, green: 0.627, blue: 0.420)

    /// Amber wash painted behind the page while in preview mode, so it is
    /// unmistakably distinct from the live app.
    static let previewWash = Color(red: 1.000, green: 0.760, blue: 0.000).opacity(0.16)

    /// Amber used for the preview indicator in the navigation bar.
    static let previewAccent = Color(red: 0.720, green: 0.450, blue: 0.000)
}

extension LinearGradient {
    /// Standard brand green gradient used for prominent cards.
    static let brand = LinearGradient(
        colors: [.brandGreen, .brandGreenLight],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}
