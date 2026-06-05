//
//  PageView.swift
//  ContentPreview
//
//  Assembles a full screen from a `PageDefinition` by mapping each section to
//  the appropriate SwiftUI layout. Tapping any call-to-action surfaces its
//  deep-link value through the `onAction` callback.
//

import SwiftUI

/// Renders a decoded page: a vertically scrolling stack of sections.
struct PageView: View {
    let page: PageDefinition
    /// Invoked with a `CTAAction` when an item is tapped.
    var onAction: (CTAAction) -> Void = { _ in }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                ForEach(page.sections) { section in
                    SectionView(section: section, onAction: onAction)
                }
            }
            .padding(.vertical, 16)
        }
    }
}

/// Chooses a layout based on the section's `type`.
struct SectionView: View {
    let section: Section
    var onAction: (CTAAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Hero renders its own title/subtitle; every other layout gets the
            // shared section header.
            if section.type != .hero, let title = section.title, !title.isEmpty {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .padding(.horizontal, 16)
            }

            switch section.type {
            case .hero:
                HeroSectionView(
                    title: section.title,
                    subtitle: section.subtitle,
                    items: section.items
                )
            case .list:
                ListSectionView(items: section.items, onAction: onAction)
            case .promo:
                PromoSectionView(items: section.items, onAction: onAction)
            case .cardList:
                CardListSectionView(items: section.items, onAction: onAction)
            case .unknown(let raw):
                UnsupportedSectionView(rawType: raw, items: section.items)
            }
        }
    }
}

// MARK: - hero

/// Prominent header: a label, a large headline value (`subtitle`), and a row
/// of read-only `info` stats. Used for portfolio / account summaries.
private struct HeroSectionView: View {
    let title: String?
    let subtitle: String?
    let items: [PageItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                if let title, !title.isEmpty {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.largeTitle.weight(.bold))
                        .foregroundStyle(.white)
                }
            }

            let stats = items.filter { $0.type == .info }
            if !stats.isEmpty {
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(stats.enumerated()), id: \.element.id) { index, stat in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(stat.title)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.8))
                            if let value = stat.description {
                                Text(value)
                                    .font(.headline)
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        if index < stats.count - 1 {
                            Divider()
                                .frame(height: 32)
                                .overlay(.white.opacity(0.3))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            LinearGradient.brand,
            in: RoundedRectangle(cornerRadius: 16)
        )
        .padding(.horizontal, 16)
    }
}

// MARK: - list

/// Vertical rows: icon, title + description, chevron. Good for accounts.
private struct ListSectionView: View {
    let items: [PageItem]
    var onAction: (CTAAction) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                Button { item.ctaAction.map(onAction) } label: {
                    HStack(spacing: 14) {
                        IconBadge(icon: item.icon)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(.body.weight(.medium))
                                .foregroundStyle(.primary)
                            if let description = item.description {
                                Text(description)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 16)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if index < items.count - 1 {
                    Divider().padding(.leading, 70)
                }
            }
        }
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
    }
}

// MARK: - promo

/// A single promo renders as a full-width featured card; multiple promos
/// render as a horizontal carousel.
private struct PromoSectionView: View {
    let items: [PageItem]
    var onAction: (CTAAction) -> Void

    var body: some View {
        if items.count == 1, let item = items.first {
            PromoCard(item: item, onAction: onAction)
                .padding(.horizontal, 16)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(items) { item in
                        PromoCard(item: item, onAction: onAction)
                            .frame(width: 260)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

private struct PromoCard: View {
    let item: PageItem
    var onAction: (CTAAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                if item.icon != nil {
                    IconBadge(icon: item.icon)
                }
                if let description = item.description {
                    Text(description.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
            Text(item.title)
                .font(.headline)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            if let label = item.ctaLabel, let action = item.ctaAction {
                Button { onAction(action) } label: {
                    Text(label)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(.white, in: Capsule())
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            LinearGradient.brand,
            in: RoundedRectangle(cornerRadius: 16)
        )
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .onTapGesture { item.ctaAction.map(onAction) }
    }
}

// MARK: - cardList

/// A grid of tappable icon cards. Good for a "widgets" launcher.
private struct CardListSectionView: View {
    let items: [PageItem]
    var onAction: (CTAAction) -> Void

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: 12)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(items) { item in
                Button { item.ctaAction.map(onAction) } label: {
                    VStack(spacing: 8) {
                        IconBadge(icon: item.icon, size: 44)
                        Text(item.title)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - fallback

private struct UnsupportedSectionView: View {
    let rawType: String
    let items: [PageItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Unsupported section “\(rawType)”", systemImage: "questionmark.square.dashed")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("\(items.count) item(s) not shown")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
    }
}

// MARK: - shared

/// Rounded square holding an SF Symbol mapped from the JSON icon identifier.
private struct IconBadge: View {
    let icon: String?
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: IconMapper.symbol(for: icon))
            .font(.system(size: size * 0.45))
            .foregroundStyle(Color.accentColor)
            .frame(width: size, height: size)
            .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: size * 0.28))
    }
}
