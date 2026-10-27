import ActivityKit
import SwiftUI
import WidgetKit

// Colors match the web app's dark theme (app/globals.css).
private let bg = Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x10 / 255)
private let card = Color(red: 0x1a / 255, green: 0x1a / 255, blue: 0x19 / 255)
private let accent = Color(red: 0x39 / 255, green: 0x87 / 255, blue: 0xe5 / 255)
private let go = Color(red: 0x3d / 255, green: 0xd6 / 255, blue: 0x8c / 255)
private let muted = Color(red: 0xa3 / 255, green: 0xa2 / 255, blue: 0x9b / 255)

struct RestActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .activityBackgroundTint(bg)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 10) {
                        IconTile(over: context.state.isOver, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.state.isOver ? "GO" : "REST")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(context.state.isOver ? go : muted)
                            Text(context.state.label).font(.subheadline.weight(.semibold)).lineLimit(1)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state, size: 30)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Bar(state: context.state)
                        Chips(state: context.state)
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill").foregroundStyle(context.state.isOver ? go : accent)
            } compactTrailing: {
                Countdown(state: context.state, size: 14).frame(width: 48)
            } minimal: {
                Image(systemName: context.state.isOver ? "checkmark.circle.fill" : "timer")
                    .foregroundStyle(context.state.isOver ? go : accent)
            }
        }
    }
}

private extension RestActivityAttributes.ContentState {
    var isOver: Bool { Date() >= endsAt }
    /// "Set 2 of 4 · planned 185×8 · last time 180×8" → ["Set 2 of 4", "Planned 185×8", "Last 180×8"]
    var chips: [String] {
        detail
            .split(separator: "·")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { part in
                let lower = part.lowercased()
                if lower.hasPrefix("planned ") { return "Planned " + part.dropFirst(8) }
                if lower.hasPrefix("last time ") { return "Last " + part.dropFirst(10) }
                return part
            }
    }
}

private struct IconTile: View {
    let over: Bool
    let size: CGFloat
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(over ? go.opacity(0.2) : accent.opacity(0.2))
            Image(systemName: over ? "checkmark" : "dumbbell.fill")
                .font(.system(size: size * 0.46, weight: .bold))
                .foregroundStyle(over ? go : accent)
        }
        .frame(width: size, height: size)
    }
}

private struct Countdown: View {
    let state: RestActivityAttributes.ContentState
    let size: CGFloat
    var body: some View {
        if state.isOver {
            Text("GO")
                .font(.system(size: size, weight: .heavy, design: .rounded))
                .foregroundStyle(go)
        } else {
            Text(timerInterval: state.startsAt...state.endsAt, countsDown: true)
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.white)
        }
    }
}

private struct Bar: View {
    let state: RestActivityAttributes.ContentState
    var body: some View {
        if state.isOver {
            Capsule().fill(go).frame(height: 5)
        } else {
            ProgressView(timerInterval: state.startsAt...state.endsAt, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear)
                .tint(accent)
                .frame(height: 5)
                .clipShape(Capsule())
        }
    }
}

private struct Chips: View {
    let state: RestActivityAttributes.ContentState
    var body: some View {
        let chips = state.chips
        if !chips.isEmpty {
            HStack(spacing: 6) {
                ForEach(chips, id: \.self) { chip in
                    Text(chip)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(.white.opacity(0.12)))
                        .lineLimit(1)
                }
            }
        }
    }
}

private struct LockScreenView: View {
    let state: RestActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                IconTile(over: state.isOver, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.isOver ? "REST OVER · NEXT UP" : "RESTING · NEXT UP")
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(state.isOver ? go : muted)
                    Text(state.label)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Countdown(state: state, size: 38)
            }
            Bar(state: state)
            Chips(state: state)
        }
    }
}
