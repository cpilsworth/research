import Testing
import Foundation
@testable import ContentPreview

// Integration tests that exercise live endpoints.
// Skipped by default — set the INTEGRATION environment variable to run:
//   INTEGRATION=1 xcodebuild test -scheme ContentPreview ...
@Suite("Integration", .enabled(if: ProcessInfo.processInfo.environment["INTEGRATION"] != nil))
struct IntegrationTests {

    let workerBase = URL(string: "https://preview-proxy-worker.cpilsworth.workers.dev")!

    @Test func healthz_returns200() async throws {
        let (_, response) = try await URLSession.shared.data(from: workerBase.appending(path: "healthz"))
        #expect((response as? HTTPURLResponse)?.statusCode == 200)
    }

    @Test func jwks_containsEC256Key() async throws {
        let url = workerBase.appending(path: ".well-known/jwks.json")
        let (data, _) = try await URLSession.shared.data(from: url)
        let json = try JSONDecoder().decode(JWKSResponse.self, from: data)
        let key = try #require(json.keys.first)
        #expect(key.kty == "EC")
        #expect(key.crv == "P-256")
        #expect(key.use == "sig")
        #expect(key.kid == "preview-v1")
    }

    @Test func aasa_containsAppBundleId() async throws {
        let url = workerBase.appending(path: ".well-known/apple-app-site-association")
        let (data, _) = try await URLSession.shared.data(from: url)
        let json = try JSONDecoder().decode(AASAResponse.self, from: data)
        let detail = try #require(json.applinks.details.first)
        #expect(detail.appIDs.contains("7F8YB87KXW.chrisp.ContentPreview"))
    }

    @Test func sign_withoutAuth_returns401() async throws {
        var request = URLRequest(url: workerBase.appending(path: "api/sign"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["path": "/digi2/home", "ttlMinutes": 60])
        let (_, response) = try await URLSession.shared.data(for: request)
        #expect((response as? HTTPURLResponse)?.statusCode == 401)
    }
}

// Minimal Decodable stubs for integration test assertions

private struct JWKSResponse: Decodable {
    struct JWK: Decodable {
        let kty: String
        let crv: String
        let use: String
        let kid: String
    }
    let keys: [JWK]
}

private struct AASAResponse: Decodable {
    struct Applinks: Decodable {
        struct Detail: Decodable {
            let appIDs: [String]
        }
        let details: [Detail]
    }
    let applinks: Applinks
}
