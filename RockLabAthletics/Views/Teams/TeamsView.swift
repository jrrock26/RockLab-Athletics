import SwiftUI

struct TeamsView: View {
    private let sampleTeams = [
        Team(id: UUID(), name: "Varsity Football", sport: "Football", season: .fall, mascot: "Titans"),
        Team(id: UUID(), name: "Varsity Basketball", sport: "Basketball", season: .winter, mascot: "Titans"),
        Team(id: UUID(), name: "Varsity Baseball", sport: "Baseball", season: .spring, mascot: "Titans"),
    ]

    var body: some View {
        NavigationStack {
            List(sampleTeams) { team in
                VStack(alignment: .leading, spacing: 4) {
                    Text(team.name)
                        .font(.headline)
                    Text("\(team.sport) · \(team.season.rawValue.capitalized)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Teams")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        // TODO: add team flow
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
    }
}

#Preview {
    TeamsView()
}
