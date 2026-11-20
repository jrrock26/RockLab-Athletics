import SwiftUI

extension Color {
    /// Builds a color from a "#RRGGBB" hex string.
    init(reelHex hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r, g, b: Double
        if cleaned.count == 6 {
            r = Double((value & 0xFF0000) >> 16) / 255
            g = Double((value & 0x00FF00) >> 8) / 255
            b = Double(value & 0x0000FF) / 255
        } else {
            r = 0.04; g = 0.52; b = 1.0
        }
        self.init(red: r, green: g, blue: b)
    }
}

/// Preset team colors for the reel banner.
enum ReelColorPalette {
    static let colors: [(name: String, hex: String)] = [
        ("Royal Blue", "#0A84FF"),
        ("Navy", "#0B2545"),
        ("Red", "#D62828"),
        ("Crimson", "#A4161A"),
        ("Maroon", "#6A040F"),
        ("Orange", "#F77F00"),
        ("Gold", "#D4A017"),
        ("Green", "#2A9D8F"),
        ("Forest", "#1B4332"),
        ("Purple", "#5A189A"),
        ("Black", "#111111"),
        ("Silver", "#8D99AE"),
    ]

    static func name(for hex: String) -> String {
        colors.first { $0.hex.lowercased() == hex.lowercased() }?.name ?? "Team color"
    }
}

/// The ESPN-style banner shown on reels and in the player.
struct ReelBanner: View {
    let reel: HighlightReel
    var compact: Bool = false

    private var tint: Color { Color(reelHex: reel.teamColorHex) }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 2 : 6) {
            Text(reel.title.isEmpty ? "Highlight Reel" : reel.title)
                .font(compact ? .caption2.weight(.bold) : .caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.85))
                .textCase(.uppercase)
                .lineLimit(1)
            Text(reel.homeTeam)
                .font(compact ? .headline.weight(.heavy) : .title2.weight(.black))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text("vs \(reel.awayTeam)")
                .font(compact ? .subheadline.weight(.semibold) : .title3.weight(.semibold))
                .foregroundStyle(.white.opacity(0.9))
                .lineLimit(1)
            HStack(spacing: 8) {
                Text(reel.gameDateText)
                if reel.durationSeconds > 0 {
                    Text("·")
                    Text(reel.durationText)
                }
                if !reel.clips.isEmpty {
                    Text("·")
                    Text("\(reel.clips.count) clips")
                }
            }
            .font(compact ? .caption2 : .caption.weight(.medium))
            .foregroundStyle(.white.opacity(0.8))
        }
        .padding(compact ? 10 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [tint, tint.opacity(0.72)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .overlay(alignment: .trailing) {
            Image(systemName: "film.stack")
                .font(.system(size: compact ? 22 : 40, weight: .black))
                .foregroundStyle(.white.opacity(0.15))
                .padding(.trailing, compact ? 12 : 18)
        }
        .clipShape(RoundedRectangle(cornerRadius: compact ? 10 : 14))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(reel.title). \(reel.homeTeam) versus \(reel.awayTeam), \(reel.gameDateText). \(reel.clips.count) clips.")
    }
}

/// Small status pill for a reel.
struct ReelStatusBadge: View {
    let status: ReelStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status == .published ? Color.green.opacity(0.16) : Color.orange.opacity(0.16))
            .foregroundStyle(status == .published ? Color.green : Color.orange)
            .clipShape(Capsule())
    }
}
