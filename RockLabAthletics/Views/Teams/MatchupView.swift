import SwiftUI

/// Side-by-side team leaders (per-game averages) for a matchup.
struct MatchupView: View {
    let teamId: String
    let myName: String
    let opponentTeamId: String
    let opponentName: String
    let sportId: String
    @State private var myLines: [PlayerStatLine] = []
    @State private var oppLines: [PlayerStatLine] = []

    private var definition: SportDefinition { SportDefinitions.definition(for: sportId) }

    var body: some View {
        List {
            Section(myName) {
                leaderRows(myLines)
            }
            Section(opponentName) {
                leaderRows(oppLines)
            }
        }
        .navigationTitle("Matchup")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let stats = definition.stats
            myLines = (try? await FirestoreService.shared.fetchTeamStatLines(teamId: teamId, stats: stats)) ?? []
            oppLines = (try? await FirestoreService.shared.fetchTeamStatLines(teamId: opponentTeamId, stats: stats)) ?? []
        }
    }

    @ViewBuilder
    private func leaderRows(_ lines: [PlayerStatLine]) -> some View {
        if lines.isEmpty {
            Text("No stats recorded yet.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(Array(lines.prefix(5))) { line in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(line.playerName).font(.headline)
                        Spacer()
                        Text("\(line.gamesPlayed) GP").font(.caption).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 6) {
                        ForEach(definition.stats.prefix(4)) { stat in
                            statChip(stat.name, line.average(for: stat.key))
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func statChip(_ label: String, _ value: Double) -> some View {
        VStack(spacing: 1) {
            Text(String(format: "%.1f", value)).font(.subheadline.bold())
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color.gray.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }
}
