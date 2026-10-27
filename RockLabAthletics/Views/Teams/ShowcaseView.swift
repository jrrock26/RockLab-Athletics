import SwiftUI

struct ShowcaseView: View {
    let teamId: String
    let entry: RosterEntry
    @State private var vm = ShowcaseViewModel()
    @State private var showingEdit = false
    @State private var showingAddHighlight = false

    var body: some View {
        List {
            if let showcase = vm.showcase {
                Section("Bio") {
                    LabeledContent("Position", value: showcase.position.isEmpty ? "—" : showcase.position)
                    LabeledContent("Height", value: showcase.height.isEmpty ? "—" : showcase.height)
                    LabeledContent("Weight", value: showcase.weight.isEmpty ? "—" : showcase.weight)
                    LabeledContent("Class of", value: showcase.graduationYear.isEmpty ? "—" : showcase.graduationYear)
                    LabeledContent("GPA", value: showcase.gpa.isEmpty ? "—" : showcase.gpa)
                    if !showcase.bio.isEmpty {
                        Text(showcase.bio).font(.callout)
                    }
                }
            }

            Section("Career stats") {
                if vm.careerStats.isEmpty {
                    Text("No game stats yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(BasketballStat.allCases) { stat in
                        HStack {
                            Text(stat.displayName)
                            Spacer()
                            Text("\(vm.careerStats[stat.rawValue] ?? 0)")
                                .fontWeight(.semibold)
                        }
                    }
                }
            }

            Section("Highlights") {
                if vm.highlights.isEmpty {
                    Text("No highlights yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.highlights) { highlight in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(highlight.title).font(.headline)
                            if !highlight.description.isEmpty {
                                Text(highlight.description)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        for index in indexSet {
                            Task { await vm.removeHighlight(showcaseId: entry.id, highlightId: vm.highlights[index].id) }
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showingAddHighlight = true } label: { Image(systemName: "plus.rectangle.on.rectangle") }
                Button { showingEdit = true } label: { Image(systemName: "pencil") }
            }
        }
        .sheet(isPresented: $showingEdit) {
            EditShowcaseSheet(vm: vm, entry: entry)
        }
        .sheet(isPresented: $showingAddHighlight) {
            AddHighlightSheet(vm: vm, showcaseId: entry.id)
        }
        .task { await vm.load(rosterEntry: entry, teamId: teamId) }
    }
}
