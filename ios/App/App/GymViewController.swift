import Capacitor
import UIKit

/// Registers the app-local plugins with the Capacitor bridge.
class GymViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
