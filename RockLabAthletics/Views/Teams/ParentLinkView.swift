import SwiftUI

/// Parent flow: pick your child on the roster and request to link.
struct ParentLinkView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String

    @State private var players: [[String: Any]] = []
    @State private var isLoading = true
    @State private var requested: Set<String> = []
    @State private var errorMessage: String?

    private var linkedPlayerIds: Set<String> {
        Set(auth.user?.linkedPlayerIds ?? [])
    }

    var body: some View {
        List {
            Section {
                Text("Request to link to your child on this team. A coach or AD will approve it.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if isLoading {
                Section { ProgressView() }
            } else if players.isEmpty {
                Section { Text("No players on this roster yet.").foregroundStyle(.secondary) }
            } else {
                Section("Roster") {
                    ForEach(Array(players.enumerated()), id: \.offset) { _, player in
                        playerRow(player)
                    }
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Link to Player")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func playerRow(_ player: [String: Any]) -> some View {
        let entryId = player["entryId"] as? String ?? ""
        let name = player["playerName"] as? String ?? "Player"
        let jersey = player["jerseyNumber"] as? String ?? ""
        let playerUid = player["playerUserId"] as? String

        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.headline)
                if !jersey.isEmpty {
                    Text("#\(jersey)").font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let playerUid, linkedPlayerIds.contains(playerUid) {
                Label("Linked", systemImage: "checkmark.seal.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
            } else if requested.contains(entryId) {
                Text("Pending").font(.caption.bold()).foregroundStyle(.orange)
            } else {
                Button("Request") { Task { await request(entryId) } }
                    .buttonStyle(.bordered)
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            players = try await FunctionsService.shared.listRosterForLinking(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func request(_ entryId: String) async {
        do {
            _ = try await FunctionsService.shared.requestParentLink(teamId: teamId, rosterEntryId: entryId)
            requested.insert(entryId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
