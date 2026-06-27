import Testing
import Foundation
@testable import ContentPreview

@Suite("Page model decoding")
struct PageModelsTests {

    // MARK: SectionType

    @Test func knownSectionTypes_decodeCorrectly() throws {
        let cases: [(String, SectionType)] = [
            ("hero",     .hero),
            ("list",     .list),
            ("promo",    .promo),
            ("cardList", .cardList),
        ]
        for (raw, expected) in cases {
            let json = #""\#(raw)""#.data(using: .utf8)!
            let decoded = try JSONDecoder().decode(SectionType.self, from: json)
            #expect(decoded == expected, "'\(raw)' should decode to \(expected)")
        }
    }

    @Test func unknownSectionType_decodesWithRawValue() throws {
        let json = #""bannerCarousel""#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(SectionType.self, from: json)
        #expect(decoded == .unknown("bannerCarousel"))
    }

    // MARK: ItemType

    @Test func knownItemTypes_decodeCorrectly() throws {
        let cases: [(String, ItemType)] = [
            ("navigation", .navigation),
            ("action",     .action),
            ("info",       .info),
            ("promo",      .promo),
        ]
        for (raw, expected) in cases {
            let json = #""\#(raw)""#.data(using: .utf8)!
            let decoded = try JSONDecoder().decode(ItemType.self, from: json)
            #expect(decoded == expected)
        }
    }

    @Test func unknownItemType_decodesWithRawValue() throws {
        let json = #""video""#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(ItemType.self, from: json)
        #expect(decoded == .unknown("video"))
    }

    // MARK: PageResponse

    @Test func fullPageResponse_decodesCorrectly() throws {
        let json = """
        {
            "metadata": { "schemaName": "page", "title": "Home" },
            "data": {
                "pageId": "home-v2",
                "title": "Home",
                "theme": "dark",
                "version": 3,
                "sections": [
                    {
                        "sectionId": "s1",
                        "type": "hero",
                        "title": "Welcome",
                        "subtitle": null,
                        "items": [
                            {
                                "itemId": "i1",
                                "type": "info",
                                "title": "Balance",
                                "description": "£12,345",
                                "icon": null,
                                "ctaLabel": null,
                                "ctaAction": null
                            }
                        ]
                    }
                ]
            }
        }
        """.data(using: .utf8)!

        let page = try JSONDecoder().decode(PageResponse.self, from: json)
        #expect(page.metadata?.title == "Home")
        #expect(page.data.title == "Home")
        #expect(page.data.theme == .dark)
        #expect(page.data.sections.count == 1)

        let section = try #require(page.data.sections.first)
        #expect(section.sectionId == "s1")
        #expect(section.type == .hero)
        #expect(section.items.count == 1)

        let item = try #require(section.items.first)
        #expect(item.title == "Balance")
        #expect(item.type == .info)
        #expect(item.ctaAction == nil)
    }

    @Test func pageItem_withCTAAction_decodesCorrectly() throws {
        let json = """
        {
            "itemId": "nav1",
            "type": "navigation",
            "title": "My Goals",
            "ctaAction": { "type": "deeplink", "value": "/digi2/accounts/goals" }
        }
        """.data(using: .utf8)!

        let item = try JSONDecoder().decode(PageItem.self, from: json)
        #expect(item.ctaAction?.type == "deeplink")
        #expect(item.ctaAction?.value == "/digi2/accounts/goals")
    }

    @Test func pageTheme_light_mapsToLightScheme() {
        #expect(PageTheme.light.colorScheme == .light)
    }

    @Test func pageTheme_dark_mapsToDarkScheme() {
        #expect(PageTheme.dark.colorScheme == .dark)
    }
}

// MARK: Manifest decoding

@Suite("Manifest decoding")
struct ManifestTests {

    @Test func manifestResponse_decodesScreens() throws {
        let json = """
        {
            "data": {
                "screens": [
                    { "id": "home",    "path": "/digi2/home" },
                    { "id": "invest",  "path": "/digi2/invest" },
                    { "id": "trade",   "path": "/digi2/trade" },
                    { "id": "accounts","path": "/digi2/accounts" }
                ]
            }
        }
        """.data(using: .utf8)!

        let manifest = try JSONDecoder().decode(ManifestResponse.self, from: json)
        #expect(manifest.data.screens.count == 4)
        #expect(manifest.data.screens[0].id == "home")
        #expect(manifest.data.screens[0].path == "/digi2/home")
    }

    @Test func screenRef_titleCapitalisesId() {
        #expect(ScreenRef(id: "home", path: "/digi2/home").title == "Home")
        #expect(ScreenRef(id: "my-goals", path: "/digi2/goals").title == "My Goals")
    }

    @Test func screenRef_tabSymbol_knownIds() {
        let cases: [(String, String)] = [
            ("home",     "house.fill"),
            ("invest",   "chart.line.uptrend.xyaxis"),
            ("trade",    "arrow.left.arrow.right"),
            ("accounts", "creditcard.fill"),
            ("unknown",  "square.fill"),
        ]
        for (id, expected) in cases {
            #expect(ScreenRef(id: id, path: "/").tabSymbol == expected, "id '\(id)'")
        }
    }
}
