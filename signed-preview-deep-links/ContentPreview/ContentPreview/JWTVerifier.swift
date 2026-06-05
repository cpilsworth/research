import CryptoKit
import Foundation

struct PreviewToken {
    let subject: String
    let path: String
    let expiresAt: Date
}

enum JWTError: LocalizedError {
    case invalidFormat
    case invalidEncoding
    case invalidSignature
    case invalidPayload
    case expired
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

enum JWTVerifier {
    // Public half of the preview signing key pair.
    // The private key is kept in tools/preview-private.pem (never committed).
    private static let publicKeyPEM = """
    -----BEGIN PUBLIC KEY-----
    MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/x3OL811m1E48opxcKHJ99KbZM3F
    XslcBSQEfi2dR3myuLCMOIKeCTuRVBYyGqLqc0JjJP7kJCb9QG8foeBHHg==
    -----END PUBLIC KEY-----
    """

    static func verify(_ token: String, expectedPath: String) throws -> PreviewToken {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { throw JWTError.invalidFormat }

        let publicKey = try P256.Signing.PublicKey(pemRepresentation: publicKeyPEM)

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
        guard claims.path == expectedPath else { throw JWTError.pathMismatch }

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
