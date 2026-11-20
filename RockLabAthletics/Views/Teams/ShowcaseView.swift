import SwiftUI

/// A player's profile / recruiting showcase.
///
/// Ownership: the **athlete** and their **parent/guardian** may edit the
/// profile (height, weight, class, GPA, bio). The AD, coaches, and staff see
/// this tab read-only — they own jersey number, position, eligibility,
/// injury, and attendance instead.
struct ShowcaseView: View {
    let teamId: String
    let sportId: String
    @Environment(AuthViewModel.self) private var auth
    let entry: RosterEntry
    @State private var vm = ShowcaseViewModel()
    @State private var showingEdit = false
    @State private var access = TeamAccess()

    /// True only for the athlete themself or a linked parent/guardian.
    private var canEdit: Bool {
        access.canEditShowcase(for: entry,
                               userId: auth.user?.id,
                               linkedPlayerIds: auth.user?.linkedPlayerIds ?? [])
    }

    var body: some View {
        List {
            Section("Athlete") {
                // Jersey & position are roster data owned by the coaching staff,
                // so they are always view-only here.
                LabeledContent("Jersey", value: entry.jerseyNumber.isEmpty ? "—" : "#\(entry.jerseyNumber)")
                LabeledContent("Position", value: entry.position.isEmpty ? "—" : entry.position)
                LabeledContent("Height", value: display(vm.showcase?.height))
                LabeledContent("Weight", value: display(vm.showcase?.weight))
                LabeledContent("Class of", value: display(vm.showcase?.graduationYear))
                LabeledContent("GPA", value: display(vm.showcase?.gpa))
            }

            if let bio = vm.showcase?.bio, !bio.isEmpty {
                Section("Bio") {
                    Text(bio).font(.callout)
                }
            }

            Section("Career stats") {
                if vm.careerStats.isEmpty {
                    Text("No game stats yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(SportDefinitions.definition(for: sportId).stats) { stat in
                        HStack {
                            Text(stat.name)
                            Spacer()
                            Text("\(vm.careerStats[stat.key] ?? 0)")
                                .fontWeight(.semibold)
                        }
                    }
                }
            }

            Section("Highlight reels") {
                if vm.reels.isEmpty {
                    Text("No published highlight reels include \(entry.playerName) yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.reels) { reel in
                        NavigationLink {
                            ReelPlayerView(teamId: teamId, reel: reel)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                ReelBanner(reel: reel, compact: true)
                                let mine = vm.clips(for: reel, entryId: entry.id)
                                Text("\(mine.count) clip\(mine.count == 1 ? "" : "s") in this reel")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            if !canEdit {
                Section {
                    Text("Only \(entry.playerName) or a linked parent/guardian can edit this profile.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if let error = vm.errorMessage {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle(entry.playerName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingEdit = true } label: { Label("Edit profile", systemImage: "pencil") }
                }
            }
        }
        .sheet(isPresented: $showingEdit) {
            EditShowcaseSheet(vm: vm, entry: entry)
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.load(rosterEntry: entry, teamId: teamId, sportId: sportId, canEdit: canEdit)
        }
    }

    private func display(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "—" }
        return value
    }
}

