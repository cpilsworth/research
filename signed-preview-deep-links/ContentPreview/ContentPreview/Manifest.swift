//
//  Manifest.swift
//  ContentPreview
//
//  Models for the manifest document, which lists the app's main screens. Each
//  screen is loaded on demand by its `path` and rendered with `PageView`.
//

import Foundation

struct ManifestResponse: Decodable {
    let metadata: PageMetadata?
    let data: ManifestData
}

struct ManifestData: Decodable {
    let screens: [ScreenRef]
}

/// A single entry in the manifest: an id plus the content path to load.
struct ScreenRef: Decodable, Identifiable, Equatable {
    let id: String
    let path: String

    /// Human-friendly tab label derived from the id ("invest" -> "Invest").
    var title: String {
        id.replacingOccurrences(of: "-", with: " ").capitalized
    }

    /// SF Symbol used for the tab item.
    var tabSymbol: String {
        switch id {
        case "home": "house.fill"
        case "invest": "chart.line.uptrend.xyaxis"
        case "trade": "arrow.left.arrow.right"
        case "accounts": "creditcard.fill"
        default: "square.fill"
        }
    }
}
