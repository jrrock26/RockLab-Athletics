import SwiftUI

struct PlayerDetailView: View {
    let teamId: String
    let entry: RosterEntry
    @State private var selection = 0
    @State private var showingLinkParent = false

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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingLinkParent = true } label: {
                    Image(systemName: "person.crop.circle.badge.plus")
                }
            }
        }
        .sheet(isPresented: $showingLinkParent) {
            LinkParentSheet(teamId: teamId, entry: entry)
        }
    }
}

