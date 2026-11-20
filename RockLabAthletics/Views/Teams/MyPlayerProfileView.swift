import SwiftUI

/// A player's (or parent's) own entry point into their player profile.
/// This is where an athlete or guardian edits the profile/showcase — coaches
/// and staff never see an edit control.
struct MyPlayerProfileView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let sportId: String
    @State private var roster: [RosterEntry] = []
    @State private var isLoading = true

    private var mine: [RosterEntry] {
        guard let uid = auth.user?.id else { return [] }
        let linked = auth.user?.linkedPlayerIds ?? []
        return roster.filter { entry in
            guard let playerId = entry.userId else { return false }
            return playerId == uid || linked.contains(playerId)
        }
    }

    var body: some View {
        List {
            if isLoading {
                Section { ProgressView() }
            } else if mine.isEmpty {
                Section {
                    Text("No player profile is linked to your account yet. Ask your coach to link you on the roster.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Profiles you can edit") {
                    ForEach(mine) { entry in
                        NavigationLink {
                            PlayerDetailView(teamId: teamId, sportId: sportId, entry: entry, initialTab: 3)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.playerName).font(.headline)
                                Text(subtitle(entry))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("My Profile")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .task {
            roster = (try? await FirestoreService.shared.fetchRoster(teamId: teamId)) ?? []
            isLoading = false
        }
    }

    private func subtitle(_ entry: RosterEntry) -> String {
        var parts: [String] = []
        if !entry.jerseyNumber.isEmpty { parts.append("#\(entry.jerseyNumber)") }
        if !entry.position.isEmpty { parts.append(entry.position) }
        return parts.isEmpty ? "No number" : parts.joined(separator: " · ")
    }
}
