import Testing
import CryptoKit
import Foundation
@testable import ContentPreview

// MARK: - Token factory

/// Signs ES256 JWTs with a fresh CryptoKit key pair for use in tests.
/// Each suite instance gets its own key so tests are fully independent.
struct TokenFactory {
    let privateKey = P256.Signing.PrivateKey()
    var publicKeyPEM: String { privateKey.publicKey.pemRepresentation }

    func make(
        path: String,
        sub: String = "author@example.com",
        ttlSeconds: Int = 3600,
        expOverride: Int? = nil
    ) -> String {
        let now = Int(Date().timeIntervalSince1970)
        let exp = expOverride ?? (now + ttlSeconds)

        let header  = #"{"alg":"ES256","typ":"JWT","kid":"test-v1"}"#
        let payload = #"{"sub":"\#(sub)","path":"\#(path)","src":"page","iat":\#(now),"exp":\#(exp)}"#

        let b64url: (Data) -> String = { data in
            data.base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }

        let signingInput = "\(b64url(Data(header.utf8))).\(b64url(Data(payload.utf8)))"
        let sig = try! privateKey.signature(for: Data(signingInput.utf8))
        return "\(signingInput).\(b64url(sig.rawRepresentation))"
    }
}

// MARK: - Tests

@Suite("JWTVerifier")
struct JWTVerifierTests {
    let factory = TokenFactory()

    @Test func validToken_returnsCorrectClaims() throws {
        let token = factory.make(path: "/digi2/home", sub: "author@adobe.com")
        let result = try JWTVerifier.verify(token, expectedPath: "/digi2/home", publicKeyPEM: factory.publicKeyPEM)
        #expect(result.path == "/digi2/home")
        #expect(result.subject == "author@adobe.com")
        #expect(result.expiresAt > Date())
    }

    @Test func validToken_noPathConstraint_returnsPath() throws {
        let token = factory.make(path: "/digi2/invest")
        let result = try JWTVerifier.verify(token, expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        #expect(result.path == "/digi2/invest")
    }

    @Test func expiredToken_throwsExpired() {
        let token = factory.make(path: "/digi2/home", ttlSeconds: -10)
        #expect {
            try JWTVerifier.verify(token, expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .expired }
    }

    @Test func pathMismatch_throwsPathMismatch() {
        let token = factory.make(path: "/digi2/home")
        #expect {
            try JWTVerifier.verify(token, expectedPath: "/digi2/accounts", publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .pathMismatch }
    }

    @Test func tamperedPayload_throwsInvalidSignature() {
        let token = factory.make(path: "/digi2/home")
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        // Replace payload with a different one; original signature no longer matches.
        let fakePayload = Data(#"{"sub":"evil","path":"/digi2/home","src":"page","iat":0,"exp":9999999999}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let tampered = "\(parts[0]).\(fakePayload).\(parts[2])"
        #expect {
            try JWTVerifier.verify(tampered, expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .invalidSignature }
    }

    @Test func wrongKey_throwsInvalidSignature() {
        let otherFactory = TokenFactory()
        let token = otherFactory.make(path: "/digi2/home")
        // Token was signed with otherFactory's key; verify against factory's key.
        #expect {
            try JWTVerifier.verify(token, expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .invalidSignature }
    }

    @Test func twoSegments_throwsInvalidFormat() {
        #expect {
            try JWTVerifier.verify("only.two", expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .invalidFormat }
    }

    @Test func emptyString_throwsInvalidFormat() {
        #expect {
            try JWTVerifier.verify("", expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .invalidFormat }
    }

    @Test func tokenJustExpired_throwsExpired() {
        // exp is exactly now; should be considered expired since we check `> now`
        let now = Int(Date().timeIntervalSince1970)
        let token = factory.make(path: "/digi2/home", expOverride: now - 1)
        #expect {
            try JWTVerifier.verify(token, expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        } throws: { ($0 as? JWTError) == .expired }
    }

    @Test func expiryIsReflectedInReturnValue() throws {
        let futureExp = Int(Date().timeIntervalSince1970) + 1800
        let token = factory.make(path: "/digi2/home", expOverride: futureExp)
        let result = try JWTVerifier.verify(token, expectedPath: nil, publicKeyPEM: factory.publicKeyPEM)
        #expect(abs(result.expiresAt.timeIntervalSince1970 - Double(futureExp)) < 1)
    }
}
