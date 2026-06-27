import Testing
import CryptoKit
import Foundation
@testable import ContentPreview

@Suite("AppViewModel")
@MainActor
struct AppViewModelTests {
    // Shared factory so all tests use the same key pair.
    let factory = TokenFactory()

    /// Returns an AppViewModel whose tokenVerify uses the test key pair.
    func makeViewModel(screens: [ScreenRef] = []) -> AppViewModel {
        let vm = AppViewModel()
        vm.screens = screens
        let pem = factory.publicKeyPEM
        vm.tokenVerify = { token in
            try JWTVerifier.verify(token, expectedPath: nil, publicKeyPEM: pem)
        }
        return vm
    }

    // MARK: applyPreviewToken — happy path

    @Test func validToken_addsPathToPreviewPaths() {
        let vm = makeViewModel()
        vm.applyPreviewToken(factory.make(path: "/digi2/home"))
        #expect(vm.previewPaths.contains("/digi2/home"))
        #expect(vm.tokenError == nil)
    }

    @Test func validToken_selectsMatchingScreen() {
        let screens = [
            ScreenRef(id: "home", path: "/digi2/home"),
            ScreenRef(id: "invest", path: "/digi2/invest"),
        ]
        let vm = makeViewModel(screens: screens)
        vm.selectedScreenID = "invest"

        vm.applyPreviewToken(factory.make(path: "/digi2/home"))

        #expect(vm.selectedScreenID == "home")
    }

    @Test func validToken_noMatchingScreen_doesNotChangeSelection() {
        let screens = [ScreenRef(id: "home", path: "/digi2/home")]
        let vm = makeViewModel(screens: screens)
        vm.selectedScreenID = "home"

        vm.applyPreviewToken(factory.make(path: "/digi2/unknown"))

        #expect(vm.selectedScreenID == "home")
        #expect(vm.previewPaths.contains("/digi2/unknown"))
    }

    @Test func multipleTokens_accumulatePreviewPaths() {
        let vm = makeViewModel()
        vm.applyPreviewToken(factory.make(path: "/digi2/home"))
        vm.applyPreviewToken(factory.make(path: "/digi2/invest"))
        #expect(vm.previewPaths == ["/digi2/home", "/digi2/invest"])
    }

    // MARK: applyPreviewToken — error paths

    @Test func expiredToken_setsTokenError() {
        let vm = makeViewModel()
        vm.applyPreviewToken(factory.make(path: "/digi2/home", ttlSeconds: -10))
        #expect(vm.tokenError != nil)
        #expect(vm.previewPaths.isEmpty)
    }

    @Test func invalidToken_setsTokenError() {
        let vm = makeViewModel()
        vm.applyPreviewToken("not.a.valid.jwt.at.all")
        #expect(vm.tokenError != nil)
        #expect(vm.previewPaths.isEmpty)
    }

    @Test func wrongKey_setsTokenError() {
        let vm = makeViewModel()
        // Token signed by a different key than the one vm.tokenVerify uses.
        let otherFactory = TokenFactory()
        vm.applyPreviewToken(otherFactory.make(path: "/digi2/home"))
        #expect(vm.tokenError != nil)
    }

    // MARK: exitPreview

    @Test func exitPreview_removesPath() {
        let vm = makeViewModel()
        vm.applyPreviewToken(factory.make(path: "/digi2/home"))
        vm.exitPreview(path: "/digi2/home")
        #expect(vm.previewPaths.isEmpty)
        #expect(vm.tokenError == nil)
    }

    @Test func exitPreview_clearsTokenError() {
        let vm = makeViewModel()
        vm.applyPreviewToken("garbage-token")
        #expect(vm.tokenError != nil)
        vm.exitPreview(path: "/digi2/home")
        #expect(vm.tokenError == nil)
    }

    @Test func exitPreview_onlyRemovesSpecifiedPath() {
        let vm = makeViewModel()
        vm.applyPreviewToken(factory.make(path: "/digi2/home"))
        vm.applyPreviewToken(factory.make(path: "/digi2/invest"))
        vm.exitPreview(path: "/digi2/home")
        #expect(!vm.previewPaths.contains("/digi2/home"))
        #expect(vm.previewPaths.contains("/digi2/invest"))
    }

    // MARK: handle(action:)

    @Test func handleDeeplinkAction_setsLastDeepLink() {
        let vm = makeViewModel()
        vm.handle(action: CTAAction(type: "deeplink", value: "/digi2/accounts/savings"))
        #expect(vm.lastDeepLink == "/digi2/accounts/savings")
    }

    @Test func handleNonDeeplinkAction_doesNotSetLastDeepLink() {
        let vm = makeViewModel()
        vm.handle(action: CTAAction(type: "external", value: "https://example.com"))
        #expect(vm.lastDeepLink == nil)
    }
}
