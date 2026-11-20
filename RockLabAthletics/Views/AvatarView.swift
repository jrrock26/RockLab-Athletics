import SwiftUI

/// A circular avatar: shows the user's photo if present, else a gray circle.
struct AvatarView: View {
    let urlString: String
    var size: CGFloat = 28

    var body: some View {
        if !urlString.isEmpty, let url = URL(string: urlString) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.gray.opacity(0.25)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(Color.gray.opacity(0.25))
                .frame(width: size, height: size)
        }
    }
}
