import Cocoa
import WebKit

// Test packaged web resources off screen without touching saved projects.
final class BuildSmokeTest: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var poll: Timer?
    private var deadline: Timer?
    private var errors: [String] = []
    private var complete = false

    func start(resources: URL) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "buildError")
        configuration.userContentController.addUserScript(WKUserScript(source: """
            window.addEventListener('error', e => {
                const message = e.message || ('Resource failed: ' + (e.target.src || e.target.href || 'unknown'));
                window.webkit.messageHandlers.buildError.postMessage(message);
            }, true);
            window.addEventListener('unhandledrejection', e => {
                window.webkit.messageHandlers.buildError.postMessage(String(e.reason));
            });
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 850), configuration: configuration)
        webView.navigationDelegate = self
        deadline = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in
            self?.finish(false, "Offline WebKit startup timed out.")
        }
        webView.loadFileURL(resources.appendingPathComponent("index.html"), allowingReadAccessTo: resources)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        poll = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            self?.checkPage()
        }
        checkPage()
    }

    private func checkPage() {
        webView.evaluateJavaScript("""
            Boolean(document.querySelector('.global-toolbar') &&
                document.querySelector('[data-kind="edge"]') &&
                document.querySelector('.math-label svg') &&
                window.MathJax && MathJax.isReady)
            """) { [weak self] result, error in
            guard let self = self, !self.complete else { return }
            if let error = error { self.finish(false, error.localizedDescription); return }
            if !self.errors.isEmpty { self.finish(false, self.errors.joined(separator: "\n")); return }
            if result as? Bool == true {
                self.finish(true, "Offline WebKit startup, diagram rendering and vector math labels passed.")
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        errors.append(String(describing: message.body))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(false, error.localizedDescription)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(false, error.localizedDescription)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        finish(false, "WebKit content process terminated.")
    }

    private func finish(_ success: Bool, _ message: String) {
        guard !complete else { return }
        complete = true
        poll?.invalidate()
        deadline?.invalidate()
        print(message)
        exit(success ? 0 : 1)
    }
}

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: smoke-test RESOURCES_PATH\n", stderr)
    exit(1)
}
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let test = BuildSmokeTest()
test.start(resources: URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true))
application.run()
