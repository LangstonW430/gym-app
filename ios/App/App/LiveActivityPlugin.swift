import ActivityKit
import Capacitor
import Foundation

/// JS bridge for the rest-timer Live Activity (see lib/live-activity.ts).
/// Everything happens on-device; no push entitlement is needed, which is what
/// lets this run on a free Apple ID.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    /// Shows the rest countdown, or updates the one already on screen.
    @objc func start(_ call: CAPPluginCall) {
        guard let endsAtMs = call.getDouble("endsAt"), let totalSec = call.getInt("totalSec") else {
            call.reject("endsAt and totalSec are required")
            return
        }
        let state = RestActivityAttributes.ContentState(
            endsAt: Date(timeIntervalSince1970: endsAtMs / 1000),
            totalSec: max(totalSec, 1),
            label: call.getString("label") ?? "Next set",
            detail: call.getString("detail") ?? ""
        )
        // Keep the activity around for a minute after zero so "GO" is visible
        // on the lock screen even if the app never comes back to end it.
        let content = ActivityContent(state: state, staleDate: state.endsAt, relevanceScore: 100)
        Task {
            let existing = Activity<RestActivityAttributes>.activities
            if let current = existing.first {
                await current.update(content)
                for extra in existing.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
                call.resolve()
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.reject("Live Activities are turned off for this app in Settings")
                return
            }
            do {
                _ = try Activity.request(attributes: RestActivityAttributes(), content: content, pushType: nil)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
