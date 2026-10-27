import ActivityKit
import Foundation

/// The rest-timer Live Activity. Compiled into both the app (which starts and
/// ends it) and the widget extension (which draws it on the lock screen).
struct RestActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// When rest ends. iOS counts down to it natively, so the activity keeps
        /// ticking while the WebView is suspended behind the lock screen.
        var endsAt: Date
        var totalSec: Int
        /// The exercise coming up next (or the superset label).
        var label: String
        /// "Set 2 of 4 · planned 185×8 · last time 180×8", may be empty.
        var detail: String

        var startsAt: Date { endsAt.addingTimeInterval(-Double(totalSec)) }
    }
}
