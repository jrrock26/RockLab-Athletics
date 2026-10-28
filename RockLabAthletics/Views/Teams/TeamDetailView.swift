import SwiftUI

struct TeamDetailView: View {
    let team: Team
    @State private var showingInvite = false

    var body: some View {
        List {
            Section {
                NavigationLink { RosterView(teamId: team.id) } label: {
                    Label("Roster", systemImage: "person.3")
                }
                NavigationLink { GamesView(teamId: team.id) } label: {
                    Label("Games", systemImage: "sportscourt")
                }
                NavigationLink { TripsView(teamId: team.id) } label: {
                    Label("Trips", systemImage: "bus")
                }
                NavigationLink { FundraisingView(teamId: team.id) } label: {
                    Label("Fundraising", systemImage: "dollarsign.circle")
                }
            }

            Section("Join code") {
                HStack {
                    Text("Share this code so players, parents, and followers can join.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(team.joinCode.isEmpty ? "—" : team.joinCode)
                        .font(.title3.bold().monospaced())
                }
            }
        }
        .navigationTitle("\(team.sportName) \(team.level)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingInvite = true } label: { Image(systemName: "person.badge.plus") }
            }
        }
        .sheet(isPresented: $showingInvite) {
            InviteCoachSheet(team: team)
        }
    }
}


