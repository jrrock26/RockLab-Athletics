import SwiftUI

struct TeamDetailView: View {
    let team: Team

    var body: some View {
        List {
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
        .navigationTitle("\(team.sportName) \(team.level)")
        .navigationBarTitleDisplayMode(.inline)
    }
}

