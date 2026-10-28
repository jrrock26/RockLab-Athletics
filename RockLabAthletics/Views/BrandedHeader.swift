import SwiftUI

/// Maps a sport id to its branded background image.
enum SportBackground {
    static func image(for sportId: String) -> String {
        switch sportId {
        case "basketball": return "BasketballBackground"
        default: return "Background"
        }
    }
}

/// A reusable branded header (background image + white watermark + logo),
/// sized to work on tall iPhones (used as a banner across team screens).
struct BrandedHeader: View {
    let imageName: String
    var height: CGFloat = 180

    var body: some View {
        ZStack {
            Image(imageName)
                .resizable()
                .scaledToFill()
                .frame(height: height)
                .clipped()
                .overlay(Color.white.opacity(0.35))
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: .black.opacity(0.1), radius: 6, y: 2)
        }
        .frame(maxWidth: .infinity)
    }
}
