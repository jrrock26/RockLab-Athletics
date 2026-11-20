import SwiftUI

/// Presents the destination for a tapped push-notification deep link.
struct DeepLinkDestinationView: View {
    let deepLink: DeepLink
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var scoringVM = StatsViewModel()

    var body: some View {
        NavigationStack {
            content
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch deepLink.target {
        case .liveGame(let teamId, let gameId, let sportId, let opponent, let teamScore, let opponentScore, let isHome):
            let game = Game(id: gameId, teamId: teamId, opponent: opponent, isHome: isHome,
                            date: Date(), status: .live, teamScore: teamScore, opponentScore: opponentScore)
            ScoringView(game: game, teamId: teamId, sportId: sportId, vm: scoringVM)
        case .liveBroadcast(let url):
            VStack(spacing: 16) {
                Label("Live stream", systemImage: "dot.radiowaves.left.and.right")
                    .font(.title2.bold())
                Text("A broadcast is live now.")
                    .foregroundStyle(.secondary)
                if let u = URL(string: url) {
                    Button {
                        openURL(u)
                    } label: {
                        Label("Watch now", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
        }
    }
}
