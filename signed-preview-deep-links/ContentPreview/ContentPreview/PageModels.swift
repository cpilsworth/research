//
//  PageModels.swift
//  ContentPreview
//
//  Codable models describing a screen that is assembled dynamically from a
//  JSON definition fetched at runtime. The JSON shape is:
//
//  { "metadata": { ... }, "data": { "sections": [ { "items": [ ... ] } ] } }
//

import Foundation

/// Top-level response envelope returned by the content service.
struct PageResponse: Decodable {
    let metadata: PageMetadata?
    let data: PageDefinition
}

struct PageMetadata: Decodable {
    let schemaName: String?
    let title: String?
}

/// The page itself: an ordered list of sections plus presentation hints.
struct PageDefinition: Decodable {
    let pageId: String?
    let title: String
    let theme: PageTheme?
    let version: Int?
    let sections: [Section]
}

enum PageTheme: String, Decodable {
    case light
    case dark

    /// Map to an explicit SwiftUI colour scheme; `nil` means follow the system.
    var colorScheme: ColorSchemePreference {
        switch self {
        case .light: .light
        case .dark: .dark
        }
    }
}

enum ColorSchemePreference {
    case light
    case dark
}

/// A group of items rendered with a layout chosen by `type`.
struct Section: Decodable, Identifiable {
    let sectionId: String
    let type: SectionType
    let title: String?
    let subtitle: String?
    let items: [PageItem]

    var id: String { sectionId }
}

/// Known layouts. Unknown values decode to `.unknown` so new server-side
/// section types never crash an older client.
enum SectionType: Decodable, Equatable {
    case hero      // prominent header with a value + stat row
    case list      // vertical rows
    case promo     // featured card / horizontal carousel
    case cardList  // grid of icon cards
    case unknown(String)

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw {
        case "hero": self = .hero
        case "list": self = .list
        case "promo": self = .promo
        case "cardList": self = .cardList
        default: self = .unknown(raw)
        }
    }
}

/// A single piece of content inside a section.
struct PageItem: Decodable, Identifiable {
    let itemId: String
    let type: ItemType
    let title: String
    let description: String?
    let icon: String?
    let ctaLabel: String?
    let ctaAction: CTAAction?

    var id: String { itemId }
}

enum ItemType: Decodable, Equatable {
    case navigation  // tappable row/tile that routes onward
    case action      // tappable quick-action tile
    case info        // read-only stat (label + value)
    case promo
    case unknown(String)

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw {
        case "navigation": self = .navigation
        case "action": self = .action
        case "info": self = .info
        case "promo": self = .promo
        default: self = .unknown(raw)
        }
    }
}

/// What happens when an item's call-to-action is tapped.
struct CTAAction: Decodable, Equatable {
    let type: String   // e.g. "deeplink"
    let value: String  // e.g. "/digi2/accounts/migoals-plus"
}
