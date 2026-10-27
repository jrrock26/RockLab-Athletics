import SwiftUI

struct TeamDetailView: View {
    let team: Team
    @State private var selection = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $selection) {
                Text("Roster").tag(0)
                Text("Games").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            if selection == 0 {
                RosterView(teamId: team.id)
            } else {
                GamesView(teamId: team.id)
            }
        }
        .navigationTitle("\(team.sportName) \(team.level)")
        .navigationBarTitleDisplayMode(.inline)
    }
}
