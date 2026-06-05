//
//  ContentView.swift
//  ContentPreview
//
//  Created by Chris Pilsworth on 04/06/2026.
//

import SwiftUI
import Combine

struct ResponseData: Decodable {
    let data: PageData
}

struct PageData: Decodable {
    let title: String
}

@MainActor
class ContentViewModel: ObservableObject {
    @Published var title: String = ""
    @Published var currentSource: ContentSource = .live
    @Published var tokenError: String? = nil

    enum ContentSource: String {
        case live
        case page

        var url: URL? {
            switch self {
            case .live:
                return URL(string: "https://da-sc.adobeaem.workers.dev/live/cpilsworth/nedp/digi2/home")
            case .page:
                return URL(string: "https://da-sc.adobeaem.workers.dev/page/cpilsworth/nedp/digi2/home")
            }
        }
    }

    func fetchTitle() async {
        guard let url = currentSource.url else { return }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let decoded = try JSONDecoder().decode(ResponseData.self, from: data)
            self.title = decoded.data.title
        } catch {
            print("Failed to fetch or decode data: \(error)")
        }
    }
}

struct ContentView: View {
    @StateObject private var viewModel = ContentViewModel()

    var body: some View {
        VStack(spacing: 12) {
            Text(viewModel.currentSource == .page ? viewModel.title.uppercased() : viewModel.title)
                .padding()

            if viewModel.currentSource == .page {
                Label("Preview mode", systemImage: "eye.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let error = viewModel.tokenError {
                Label(error, systemImage: "lock.slash")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
                    .multilineTextAlignment(.center)
            }
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        .task {
            await viewModel.fetchTitle()
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
            return
        }

        do {
            _ = try JWTVerifier.verify(token, expectedPath: "/digi2/home")
            viewModel.tokenError = nil
            viewModel.currentSource = .page
            Task { await viewModel.fetchTitle() }
        } catch {
            viewModel.tokenError = error.localizedDescription
        }
    }
}

#Preview {
    ContentView()
}
