//
//  ContentView.swift
//  ContentPreview
//
//  Created by Chris Pilsworth on 04/06/2026.
//
//  App shell: loads the manifest, builds a tab per screen, and renders each
//  screen's page on demand. A signed preview deep link switches the matching
//  screen into preview mode and selects its tab.
//

import SwiftUI
import Combine

@MainActor
final class AppViewModel: ObservableObject {
    @Published var screens: [ScreenRef] = []
    @Published var loadState: LoadState = .idle
    @Published var selectedScreenID: String? = nil
    @Published var tokenError: String? = nil
    /// Paths granted preview access by a verified token.
    @Published var previewPaths: Set<String> = []
    /// The most recently tapped deep link, surfaced as a transient banner.
    @Published var lastDeepLink: String? = nil

    // Injected in tests to verify tokens with a custom key pair.
    var tokenVerify: (String) throws -> PreviewToken = JWTVerifier.verify(_:)

    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    func loadManifest() async {
        guard let url = ContentEndpoint.url(path: ContentEndpoint.manifestPath) else { return }
        loadState = .loading
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let decoded = try JSONDecoder().decode(ManifestResponse.self, from: data)
            screens = decoded.data.screens
            if selectedScreenID == nil {
                // Allow launching straight to a screen, e.g. `-initialScreen invest`.
                let requested = UserDefaults.standard.string(forKey: "initialScreen")
                selectedScreenID = screens.first(where: { $0.id == requested })?.id ?? screens.first?.id
            }
            loadState = .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
            print("Failed to load manifest: \(error)")
        }
    }

    func handle(action: CTAAction) {
        guard action.type == "deeplink" else { return }
        lastDeepLink = action.value
    }

    /// Leave preview for a screen, reverting it to published content.
    func exitPreview(path: String) {
        previewPaths.remove(path)
        tokenError = nil
    }

    /// Verify a preview token and, if valid, enable preview + select the screen
    /// whose path matches the token's claim.
    func applyPreviewToken(_ token: String) {
        do {
            let claims = try tokenVerify(token)
            tokenError = nil
            previewPaths.insert(claims.path)
            if let screen = screens.first(where: { $0.path == claims.path }) {
                selectedScreenID = screen.id
            }
        } catch {
            tokenError = error.localizedDescription
        }
    }
}

struct ContentView: View {
    @StateObject private var viewModel = AppViewModel()

    var body: some View {
        content
            .onOpenURL { url in handleDeepLink(url) }
            .task {
                await viewModel.loadManifest()
                #if DEBUG
                // Test affordance: feed a token through the real verification
                // path, e.g. `-previewToken <jwt>` (the deep link's entry point
                // can't be auto-confirmed past the SpringBoard prompt).
                if let token = UserDefaults.standard.string(forKey: "previewToken") {
                    viewModel.applyPreviewToken(token)
                }
                #endif
                // A token may have arrived before the manifest finished loading.
                if !viewModel.previewPaths.isEmpty,
                   viewModel.selectedScreenID == viewModel.screens.first?.id,
                   let path = viewModel.previewPaths.first,
                   let screen = viewModel.screens.first(where: { $0.path == path }) {
                    viewModel.selectedScreenID = screen.id
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.loadState {
        case .idle, .loading:
            ProgressView("Loading…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn’t load app", systemImage: "wifi.slash")
            } description: {
                Text(message)
            } actions: {
                Button("Retry") { Task { await viewModel.loadManifest() } }
            }
        case .loaded:
            tabs
        }
    }

    private var tabs: some View {
        TabView(selection: Binding(
            get: { viewModel.selectedScreenID ?? viewModel.screens.first?.id ?? "" },
            set: { viewModel.selectedScreenID = $0 }
        )) {
            ForEach(viewModel.screens) { screen in
                let isPreview = viewModel.previewPaths.contains(screen.path)
                NavigationStack {
                    ScreenView(screen: screen, preview: isPreview) { action in
                        viewModel.handle(action: action)
                    }
                    // Amber wash makes preview unmistakable without shifting layout.
                    .background((isPreview ? Color.previewWash : Color.clear).ignoresSafeArea())
                    .navigationTitle(screen.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(isPreview ? .visible : .automatic, for: .navigationBar)
                    .toolbarBackground(Color.previewWash, for: .navigationBar)
                    .toolbar {
                        if isPreview {
                            ToolbarItem(placement: .topBarTrailing) {
                                // Lives in the title area, so it never pushes
                                // the page down; tap to leave preview.
                                Button { viewModel.exitPreview(path: screen.path) } label: {
                                    Label("Preview", systemImage: "eye.fill")
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.previewAccent.opacity(0.18), in: Capsule())
                                }
                                .tint(Color.previewAccent)
                            }
                        }
                    }
                }
                .tabItem { Label(screen.title, systemImage: screen.tabSymbol) }
                .tag(screen.id)
            }
        }
        .overlay(alignment: .top) { tokenErrorBanner }
        .overlay(alignment: .bottom) { deepLinkBanner }
    }

    @ViewBuilder
    private var tokenErrorBanner: some View {
        if let error = viewModel.tokenError {
            Label(error, systemImage: "lock.slash")
                .font(.caption.weight(.medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.red, in: Capsule())
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
                .task(id: error) {
                    try? await Task.sleep(for: .seconds(3))
                    withAnimation { viewModel.tokenError = nil }
                }
        }
    }

    @ViewBuilder
    private var deepLinkBanner: some View {
        if let link = viewModel.lastDeepLink {
            Label(link, systemImage: "arrow.up.right.square")
                .font(.footnote.weight(.medium))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.bottom, 60)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task(id: link) {
                    try? await Task.sleep(for: .seconds(2.5))
                    withAnimation { viewModel.lastDeepLink = nil }
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
            return
        }
        viewModel.applyPreviewToken(token)
    }
}

#Preview {
    ContentView()
}
