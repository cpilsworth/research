//
//  Endpoints.swift
//  ContentPreview
//
//  Builds content-service URLs. Pages and the manifest are addressed by the
//  same `path` the manifest uses (e.g. "/digi2/home"); the only difference
//  between published and preview content is the "/live/" vs "/page/" segment.
//

import Foundation

/// Builds URLs for the content service.
///
/// All content is fetched from a single `host`. The URL shape is:
/// ```
/// https://<host>/<mode>/<site>/<path>
/// ```
/// where `mode` is `live` for published content and `preview` for draft content.
/// `preview` mode is only activated after a valid ``JWTVerifier`` token has been
/// accepted — regular users always receive `live` content.
///
/// To point the app at a different environment, change `host` and `site`.
enum ContentEndpoint {
    /// Base URL of the content service (no trailing slash).
    static let host = "https://da-sc.cpilsworth.workers.dev"

    /// Site identifier prefix inserted between the mode and the content path.
    static let site = "/cpilsworth/nedp"

    /// Path of the manifest document that enumerates the app's screens.
    static let manifestPath = "/digi2/manifest"

    /// Resolve a manifest `path` to a fetchable URL.
    ///
    /// - Parameters:
    ///   - path: The content path as it appears in the manifest (e.g. `/digi2/home`).
    ///   - preview: When `true`, requests unpublished draft content from the
    ///     `preview` tree. Defaults to `false` (published `live` content).
    /// - Returns: The fully-qualified URL, or `nil` if the resulting string is
    ///   not a valid URL.
    static func url(path: String, preview: Bool = false) -> URL? {
        let mode = preview ? "preview" : "live"
        return URL(string: "\(host)/\(mode)\(site)\(path)")
    }
}
