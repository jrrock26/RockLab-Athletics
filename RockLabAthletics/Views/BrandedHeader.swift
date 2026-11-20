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

/// A reusable branded header (background image + school logo + RockLab signage).
struct BrandedHeader: View {
    @Environment(AuthViewModel.self) private var auth
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

            VStack(spacing: 6) {
                if let url = schoolLogoURL {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFit()
                    } placeholder: {
                        Color.white.opacity(0.4)
                    }
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .shadow(color: .black.opacity(0.2), radius: 6, y: 2)
                } else {
                    Image("Logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .shadow(color: .black.opacity(0.1), radius: 6, y: 2)
                }
                Text("RockLab Athletics")
                    .font(.caption.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color.black.opacity(0.55), in: Capsule())
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var schoolLogoURL: URL? {
        guard let urlString = auth.school?.logoURL, !urlString.isEmpty else { return nil }
        return URL(string: urlString)
    }
}
