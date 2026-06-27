import CryptoKit
import Foundation

/// The verified claims extracted from a signed preview JWT.
///
/// A `PreviewToken` is only reachable after ``JWTVerifier`` has confirmed the
/// ES256 signature, so every value here is trustworthy.
struct PreviewToken {
    /// The `sub` claim — the author identity from the signing tool.
    let subject: String
    /// The `path` claim — the content path this token is valid for (e.g. `/digi2/home`).
    let path: String
    /// The `exp` claim as a `Date`.
    let expiresAt: Date
}

/// Errors thrown by ``JWTVerifier``.
enum JWTError: LocalizedError, Equatable {
    /// The token does not have exactly three `.`-separated segments.
    case invalidFormat
    /// A segment contains characters that are not valid base64url.
    case invalidEncoding
    /// The ECDSA signature does not match the header and payload.
    case invalidSignature
    /// The payload is not valid JSON or is missing required claims.
    case invalidPayload
    /// The `exp` claim is in the past.
    case expired
    /// The `path` claim does not match the expected path passed to the verifier.
    case pathMismatch

    var errorDescription: String? {
        switch self {
        case .invalidFormat: "Token has wrong number of segments"
        case .invalidEncoding: "Token contains invalid base64url data"
        case .invalidSignature: "Token signature is invalid"
        case .invalidPayload: "Token payload could not be decoded"
        case .expired: "Token has expired"
        case .pathMismatch: "Token is not valid for this page"
        }
    }
}

/// Verifies ES256 JWTs used to activate the in-app preview session.
///
/// All verification is performed locally using CryptoKit — no network call is
/// made. The public key is embedded in the binary; rotate it by shipping a new
/// app build or by having the app fetch the key dynamically from
/// `/.well-known/jwks.json`.
///
/// ## Usage
/// ```swift
/// let token = try JWTVerifier.verify(rawToken, expectedPath: screen.path)
/// previewPaths.insert(token.path)
/// ```
///
/// ## Security notes
/// - `expectedPath` must be validated explicitly; the JWT library does not
///   enforce it automatically.
/// - Tokens are short-lived (TTL set by the signing tool). There is no
///   revocation mechanism — expiry is the only mitigation for a leaked token.
/// - Only the public key is in the binary. The private key lives in the signing
///   tool (CLI or proxy worker) and is never distributed to clients.
enum JWTVerifier {
    // Public key for the preview signing key pair served by the proxy worker.
    // Rotate by updating this value and redeploying; no other app change needed.
    private static let publicKeyPEM = """
    -----BEGIN PUBLIC KEY-----
    MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDgyKDCsiUaNTXWqwWTfI7ZFfa+0W
    YYN+mf0YRRFaPJC0TnTae5mJtagiyXxZJUx/jSTjvFe7fYL62D72GN0ukQ==
    -----END PUBLIC KEY-----
    """

    /// Verify signature and expiry without constraining the path. The caller
    /// can then route based on the returned token's `path` claim.
    static func verify(_ token: String) throws -> PreviewToken {
        try verify(token, expectedPath: nil, publicKeyPEM: publicKeyPEM)
    }

    static func verify(_ token: String, expectedPath: String?) throws -> PreviewToken {
        try verify(token, expectedPath: expectedPath, publicKeyPEM: publicKeyPEM)
    }

    // Internal overload used by tests to inject a key without touching the
    // production PEM constant.
    internal static func verify(
        _ token: String,
        expectedPath: String?,
        publicKeyPEM keyPEM: String
    ) throws -> PreviewToken {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { throw JWTError.invalidFormat }

        let publicKey = try P256.Signing.PublicKey(pemRepresentation: keyPEM)

        guard let sigBytes = base64URLDecode(String(parts[2])) else {
            throw JWTError.invalidEncoding
        }
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: sigBytes)

        let headerPayload = Data("\(parts[0]).\(parts[1])".utf8)
        guard publicKey.isValidSignature(signature, for: headerPayload) else {
            throw JWTError.invalidSignature
        }

        guard let payloadBytes = base64URLDecode(String(parts[1])) else {
            throw JWTError.invalidEncoding
        }

        struct Claims: Decodable {
            let sub: String
            let path: String
            let exp: Int
        }

        guard let claims = try? JSONDecoder().decode(Claims.self, from: payloadBytes) else {
            throw JWTError.invalidPayload
        }
        guard claims.exp > Int(Date().timeIntervalSince1970) else { throw JWTError.expired }
        if let expectedPath, claims.path != expectedPath { throw JWTError.pathMismatch }

        return PreviewToken(
            subject: claims.sub,
            path: claims.path,
            expiresAt: Date(timeIntervalSince1970: TimeInterval(claims.exp))
        )
    }

    private static func base64URLDecode(_ string: String) -> Data? {
        var s = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder != 0 { s += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: s)
    }
}
