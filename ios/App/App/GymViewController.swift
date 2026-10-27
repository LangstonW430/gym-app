import Capacitor
import UIKit

/// Registers the app-local plugins with the Capacitor bridge and tunes the WebView.
class GymViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
        // The page's fixed bottom tab bar would ride along with the rubber-band
        // bounce; the site already handles its own scrolling.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
    }
}
