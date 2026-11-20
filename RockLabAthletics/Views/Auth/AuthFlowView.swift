import SwiftUI

/// Primary action button for the auth screens.
///
/// SwiftUI's `.borderedProminent` renders a *disabled* button as a near-invisible
/// grey pill, and a white label on a 40%-opacity blue fill fails contrast. So the
/// button always looks like the primary action (as Apple's own sign-in screens
/// do) and the form validates on tap instead of refusing the tap.
struct PrimaryAuthButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.blue)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Branded container that hosts the sign-in / sign-up screens.
///
/// Layout is size-class driven rather than fixed:
///   • compact widths (iPhone): a single scrollable column, logo above the form
///   • regular widths (iPad, landscape): brand panel beside the form
///
/// The form sits on an opaque card. Previously it floated directly over a
/// photo with a light scrim, which left the disabled primary button and the
/// placeholders at very low contrast, and on iPad the fixed-size form collided
/// with the wordmark behind it.
struct AuthFlowView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showingSignUp = false

    private var isRegularWidth: Bool { horizontalSizeClass == .regular }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                background

                if isRegularWidth {
                    // Deliberately no ScrollView at regular width: an iPad has
                    // room for a login card.
                    content
                        .frame(width: min(proxy.size.width - 96, 520))
                } else {
                    ScrollView {
                        content
                            .frame(width: max(proxy.size.width - 40, 0))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: proxy.size.height)
                    }
                    .scrollBounceBehavior(.basedOnSize)
                }
            }
            // `Image.scaledToFill()` does not clip, so it inflates the ZStack to
            // the image's own oversized dimensions. Without this, the content is
            // centred inside that oversized space and lands off-screen on iPad.
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        // Let the proxy cover the full screen so the background reaches the
        // safe-area edges instead of leaving white bars.
        .ignoresSafeArea()
    }

    // MARK: - Pieces

    private var background: some View {
        Image("Background")
            .resizable()
            .scaledToFill()
            .ignoresSafeArea()
            .overlay(
                LinearGradient(
                    colors: [
                        Color.black.opacity(isRegularWidth ? 0.72 : 0.55),
                        Color.black.opacity(isRegularWidth ? 0.58 : 0.35),
                        Color.black.opacity(isRegularWidth ? 0.80 : 0.62)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
            )
    }

    private var logoMark: some View {
        Image("Logo")
            .resizable()
            .scaledToFit()
            .frame(width: 96, height: 96)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.35), radius: 14, y: 6)
            .accessibilityLabel("RockLab Athletics")
    }

    /// Stacked wordmark, shown only where there is vertical room for it.
    private var wordmark: some View {
        VStack(spacing: 2) {
            Text("ROCKLAB")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
            Text("ATHLETICS")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .kerning(4)
                .foregroundStyle(.white.opacity(0.88))
            Text("High school sports, managed.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.82))
                .padding(.top, 4)
        }
    }

    private var content: some View {
        VStack(spacing: isRegularWidth ? 36 : 24) {
            logoMark
            if isRegularWidth { wordmark }
            formCard
        }
    }

    private var formCard: some View {
        Group {
            if showingSignUp {
                SignUpView(onSignIn: { showingSignUp = false })
            } else {
                SignInView(onSignUp: { showingSignUp = true })
            }
        }
        .padding(24)
        .frame(maxWidth: isRegularWidth ? 520 : 460)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(Color(uiColor: .systemBackground).opacity(0.97))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color.white.opacity(0.35), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.28), radius: 26, y: 14)
    }
}

