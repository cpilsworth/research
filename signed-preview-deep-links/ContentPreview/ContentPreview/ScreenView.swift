//
//  ScreenView.swift
//  ContentPreview
//
//  Loads a single screen by its manifest `path` and renders it. The content
//  service may return a full page (with `sections`) or, for screens that have
//  no authored page yet, a placeholder document — both are handled.
//

import SwiftUI
import Combine

/// A document fetched for a screen path. We only need `sections` to render a
/// page; everything else is optional so a page or a placeholder both decode.
private struct DocumentEnvelope: Decodable {
    let data: DocumentData

    struct DocumentData: Decodable {
        let title: String?
        let theme: PageTheme?
        let sections: [Section]?
    }
}

@MainActor
final class ScreenViewModel: ObservableObject {
    @Published var page: PageDefinition? = nil
    @Published var loadState: LoadState = .idle

    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case empty          // valid document, but no renderable sections
        case failed(String)
    }

    func load(path: String, preview: Bool) async {
        guard let url = ContentEndpoint.url(path: path, preview: preview) else {
            loadState = .failed("Invalid URL for \(path)")
            return
        }
        loadState = .loading
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let doc = try JSONDecoder().decode(DocumentEnvelope.self, from: data)
            if let sections = doc.data.sections, !sections.isEmpty {
                page = PageDefinition(
                    pageId: nil,
                    title: doc.data.title ?? "",
                    theme: doc.data.theme,
                    version: nil,
                    sections: sections
                )
                loadState = .loaded
            } else {
                page = nil
                loadState = .empty
            }
        } catch {
            loadState = .failed(error.localizedDescription)
            print("Failed to load screen \(path): \(error)")
        }
    }
}

/// Renders one manifest screen, reloading whenever its path or the preview
/// flag changes. Tapped deep links are forwarded to `onAction`.
struct ScreenView: View {
    let screen: ScreenRef
    let preview: Bool
    var onAction: (CTAAction) -> Void

    @StateObject private var viewModel = ScreenViewModel()

    var body: some View {
        Group {
            switch viewModel.loadState {
            case .idle, .loading:
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn’t load \(screen.title)", systemImage: "wifi.slash")
                } description: {
                    Text(message)
                } actions: {
                    Button("Retry") { Task { await reload() } }
                }
            case .empty:
                ContentUnavailableView(
                    "No content yet",
                    systemImage: "doc.text.magnifyingglass",
                    description: Text("“\(screen.title)” has no authored page at \(screen.path).")
                )
            case .loaded:
                if let page = viewModel.page {
                    PageView(page: page, onAction: onAction)
                }
            }
        }
        .task(id: "\(screen.path)|\(preview)") { await reload() }
    }

    private func reload() async {
        await viewModel.load(path: screen.path, preview: preview)
    }
}
