//
//  Endpoints.swift
//  ContentPreview
//
//  Builds content-service URLs. Pages and the manifest are addressed by the
//  same `path` the manifest uses (e.g. "/digi2/home"); the only difference
//  between published and preview content is the "/live/" vs "/page/" segment.
//

import Foundation

enum ContentEndpoint {
    static let host = "https://da-sc.cpilsworth.workers.dev"
    static let site = "/cpilsworth/nedp"

    /// The manifest enumerates the app's screens.
    static let manifestPath = "/digi2/manifest"

    /// Resolve a manifest `path` to a fetchable URL.
    /// - Parameter preview: when true, request unpublished draft content from
    ///   the "/preview/" tree instead of published "/live/" content.
    static func url(path: String, preview: Bool = false) -> URL? {
        let mode = preview ? "preview" : "live"
        return URL(string: "\(host)/\(mode)\(site)\(path)")
    }
}
