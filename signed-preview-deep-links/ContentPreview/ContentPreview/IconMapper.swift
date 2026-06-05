//
//  IconMapper.swift
//  ContentPreview
//
//  Translates the icon identifiers used in the JSON definition into SF Symbol
//  names. Unknown identifiers fall back to a generic glyph so the UI degrades
//  gracefully rather than rendering nothing.
//

import Foundation

enum IconMapper {
    private static let symbols: [String: String] = [
        "account": "creditcard.fill",
        "applications": "doc.text.fill",
        "atm": "banknote.fill",
        "discs-fines": "car.fill",
        "home-loans": "house.fill",
        "insure": "shield.fill",
        "latest": "newspaper.fill",
        "offers": "tag.fill",
        "pay-me": "arrow.down.circle.fill",
        "quick-pay": "bolt.fill",
        "rewards": "gift.fill",
        "shapid": "person.text.rectangle.fill",
        "shop": "cart.fill",
        "statements": "doc.plaintext.fill",
        // Invest / Trade
        "investment": "chart.bar.fill",
        "stock": "chart.xyaxis.line",
        "etf": "chart.pie.fill",
        "fund": "dollarsign.circle.fill",
        "chart": "chart.line.uptrend.xyaxis",
        "news": "newspaper.fill",
        "watchlist": "star.fill",
        "buy": "cart.badge.plus",
        "sell": "cart.badge.minus",
        "top-up": "arrow.up.circle.fill",
        "withdraw": "arrow.down.circle.fill",
        "new-investment": "plus.circle.fill",
    ]

    static func symbol(for icon: String?) -> String {
        guard let icon, let name = symbols[icon] else { return "square.grid.2x2.fill" }
        return name
    }
}
