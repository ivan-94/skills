import SwiftUI

extension View {
    @ViewBuilder
    func agentGlassCard(radius: CGFloat = 18) -> some View {
        if #available(macOS 26.0, *) {
            self
                .glassEffect(.regular, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        } else {
            self
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(.separator.opacity(0.35), lineWidth: 1)
                }
        }
    }

    @ViewBuilder
    func agentInteractiveGlass(radius: CGFloat = 14) -> some View {
        if #available(macOS 26.0, *) {
            self
                .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        } else {
            self
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(.separator.opacity(0.35), lineWidth: 1)
                }
        }
    }
}

struct AgentMetric {
    static let windowMinWidth: CGFloat = 1180
    static let windowMinHeight: CGFloat = 760
    static let laneWidth: CGFloat = 340
    static let spacing: CGFloat = 14
    static let cardRadius: CGFloat = 16
}
