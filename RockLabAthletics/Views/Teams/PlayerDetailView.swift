import SwiftUI

struct PlayerDetailView: View {
    let teamId: String
    let entry: RosterEntry
    @State private var selection = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $selection) {
                Text("Forms").tag(0)
                Text("Showcase").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            if selection == 0 {
                FormsView(teamId: teamId, entryId: entry.id)
            } else {
                ShowcaseView(teamId: teamId, entry: entry)
            }
        }
        .navigationTitle(entry.playerName)
        .navigationBarTitleDisplayMode(.inline)
    }
}
