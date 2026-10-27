import ActivityKit
import SwiftUI
import WidgetKit

struct RestActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .padding(16)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("REST").font(.caption2).foregroundStyle(.secondary)
                        Text(context.state.label).font(.headline).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state, size: 28)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.state.detail.isEmpty {
                        Text(context.state.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Bar(state: context.state)
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(.orange)
            } compactTrailing: {
                Countdown(state: context.state, size: 14).frame(width: 46)
            } minimal: {
                Image(systemName: "timer").foregroundStyle(.orange)
            }
        }
    }
}

private struct Countdown: View {
    let state: RestActivityAttributes.ContentState
    let size: CGFloat
    var body: some View {
        if Date() >= state.endsAt {
            Text("GO").font(.system(size: size, weight: .bold, design: .rounded)).foregroundStyle(.orange)
        } else {
            Text(timerInterval: state.startsAt...state.endsAt, countsDown: true)
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct Bar: View {
    let state: RestActivityAttributes.ContentState
    var body: some View {
        ProgressView(timerInterval: state.startsAt...state.endsAt, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
            .tint(.orange)
    }
}

private struct LockScreenView: View {
    let state: RestActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(Date() >= state.endsAt ? "REST OVER · NEXT" : "REST · NEXT")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(state.label).font(.title3.weight(.semibold)).lineLimit(1)
                    if !state.detail.isEmpty {
                        Text(state.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                Countdown(state: state, size: 40)
            }
            Bar(state: state)
        }
        .foregroundStyle(.white)
    }
}
