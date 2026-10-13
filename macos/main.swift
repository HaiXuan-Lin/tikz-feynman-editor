import Cocoa
import WebKit

final class EditorApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var resourceURL: URL!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "Quit TikZ Feynman Editor", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)
        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        for (title, command, key) in [("New Diagram", "new", "n"), ("Open Project…", "open", "o"), ("Save Project…", "save", "s"), ("Export…", "export", "e")] {
            let item = NSMenuItem(title: title, action: #selector(runCommand(_:)), keyEquivalent: key)
            item.target = self
            item.representedObject = command
            fileMenu.addItem(item)
        }
        fileItem.submenu = fileMenu
        menu.addItem(fileItem)
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        for (title, command, key) in [("Undo", "undo", "z"), ("Redo", "redo", "Z")] {
            let item = NSMenuItem(title: title, action: #selector(runCommand(_:)), keyEquivalent: key)
            item.target = self
            item.representedObject = command
            editMenu.addItem(item)
        }
        for (title, action, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let selectAllItem = NSMenuItem(title: "Select All", action: #selector(runCommand(_:)), keyEquivalent: "a")
        selectAllItem.target = self
        selectAllItem.representedObject = "selectAll"
        editMenu.addItem(selectAllItem)
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu

        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "diagnostic")
        configuration.userContentController.add(self, name: "clipboard")
        configuration.userContentController.add(self, name: "download")
        configuration.userContentController.add(self, name: "openProject")
        configuration.userContentController.add(self, name: "language")
        configuration.userContentController.addUserScript(WKUserScript(source: """
            function report(message) {
                window.webkit.messageHandlers.diagnostic.postMessage(String(message));
            }
            window.addEventListener('error', function(event) {
                if (event.message) report(event.message);
                else if (event.target && event.target.src) report('Failed to load ' + event.target.src);
            }, true);
            window.addEventListener('unhandledrejection', function(event) { report(event.reason); });
            const originalExecCommand = document.execCommand.bind(document);
            document.execCommand = function(command) {
                if (command.toLowerCase() === 'copy') {
                    const element = document.activeElement;
                    const text = element && typeof element.selectionStart === 'number'
                        ? element.value.slice(element.selectionStart, element.selectionEnd)
                        : window.getSelection().toString();
                    window.webkit.messageHandlers.clipboard.postMessage(text);
                    return true;
                }
                return originalExecCommand.apply(document, arguments);
            };
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        if #available(macOS 13.3, *) { webView.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "TikZ Feynman Editor"
        window.isReleasedWhenClosed = false
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard let resources = Bundle.main.resourceURL else {
            showError("Application resources are missing.")
            return
        }
        resourceURL = resources
        webView.loadFileURL(resources.appendingPathComponent("index.html"), allowingReadAccessTo: resources)
    }

    private func showError(_ message: String) {
        NSLog("Editor: %@", message)
        let alert = NSAlert()
        alert.messageText = "Could not load the editor"
        alert.informativeText = message
        alert.beginSheetModal(for: window)
    }

    @objc private func runCommand(_ sender: NSMenuItem) {
        guard let command = sender.representedObject as? String else { return }
        let literal = "\"\(command)\""
        webView.evaluateJavaScript("""
            (() => {
                const command = \(literal);
                const typing = document.activeElement && document.activeElement.matches('input,textarea,[contenteditable="true"]');
                if (typing && ['undo', 'redo', 'selectAll'].includes(command)) document.execCommand(command);
                else window.dispatchEvent(new CustomEvent('native-command', {detail: command}));
            })()
            """)
    }

    private func setLanguage(_ language: String) {
        let zh = language == "zh"
        let titles = ["Quit TikZ Feynman Editor": "退出 TikZ Feynman Editor", "File": "文件", "Edit": "编辑", "New Diagram": "新建图形", "Open Project…": "打开项目…", "Save Project…": "保存项目…", "Export…": "导出…", "Undo": "撤销", "Redo": "重做", "Cut": "剪切", "Copy": "复制", "Paste": "粘贴", "Select All": "全选"]
        func translateMenu(_ menu: NSMenu) {
            if let english = titles.first(where: { $0.key == menu.title || $0.value == menu.title })?.key { menu.title = zh ? titles[english]! : english }
            for item in menu.items {
                if let english = titles.first(where: { $0.key == item.title || $0.value == item.title })?.key { item.title = zh ? titles[english]! : english }
                if let child = item.submenu { translateMenu(child) }
            }
        }
        if let menu = NSApp.mainMenu { translateMenu(menu) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "language", let language = message.body as? String { setLanguage(language); return }
        if message.name == "download", let payload = message.body as? [String: String], let name = payload["name"], let content = payload["content"] {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = name
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else { return }
                do { try content.write(to: url, atomically: true, encoding: .utf8) }
                catch { self.showError(error.localizedDescription) }
            }
            return
        }
        if message.name == "openProject" {
            let panel = NSOpenPanel()
            panel.allowedFileTypes = ["json", "feynman"]
            panel.allowsMultipleSelection = false
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else { return }
                do {
                    let content = try String(contentsOf: url, encoding: .utf8)
                    let data = try JSONSerialization.data(withJSONObject: [content])
                    let literal = String(data: data, encoding: .utf8)!
                    self.webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('native-open-project', {detail: \(literal)[0]}))")
                } catch { self.showError(error.localizedDescription) }
            }
            return
        }
        guard let text = message.body as? String else { return }
        if message.name == "clipboard" {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
        } else {
            showError(text)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showError(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError(error.localizedDescription) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { showError("The web content process stopped. Please reopen the application.") }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL && (url.path == resourceURL.path || url.path.hasPrefix(resourceURL.path + "/")) {
            decisionHandler(.allow)
        } else {
            if ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 400, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let application = NSApplication.shared
let delegate = EditorApp()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
