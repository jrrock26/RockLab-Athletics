import SwiftUI

/// A coach starts a team. **Only an AD creates a school organization** — this
/// screen just records the school name as a hint so the AD can find and adopt
/// the team later. The coach only ever sees their own team.
struct CoachTeamSetupView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let onCreated: () -> Void

    @State private var schoolName = ""
    @State private var sportId = SportsCatalog.all.first?.id ?? "football"
    @State private var level = "Varsity"
    @State private var season = "Fall"
    @State private var gender = "Boys"
    @State private var isWorking = false
    @State private var errorMessage: String?

    private let levels = ["Varsity", "JV", "Freshman", "Middle School", "Youth"]
    private let seasons = ["Fall", "Winter", "Spring", "Summer"]
    private let genders = ["Boys", "Girls", "Coed"]

    private var canSubmit: Bool { !isWorking }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("School name", text: $schoolName)
                } header: {
                    Text("Where do you coach?")
                } footer: {
                    Text("Just for matching — only your athletic director creates the school. If your school joins RockLab later, they'll adopt this team and their official school name will replace this one.")
                        .font(.caption)
                }

                Section("Team") {
                    Picker("Sport", selection: $sportId) {
                        ForEach(SportsCatalog.all) { sport in
                            Text("\(sport.emoji) \(sport.name)").tag(sport.id)
                        }
                    }
                    Picker("Level", selection: $level) {
                        ForEach(levels, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Season", selection: $season) {
                        ForEach(seasons, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Team", selection: $gender) {
                        ForEach(genders, id: \.self) { Text($0).tag($0) }
                    }
                }

                Section {
                    Label("You'll only see your own team. Roster, forms, injuries, and film all work right away.",
                          systemImage: "lock.shield")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Start Your Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(!canSubmit)
                }
            }
        }
    }

    private func create() async {
        isWorking = true
        defer { isWorking = false }
        errorMessage = nil
        let sport = SportsCatalog.all.first { $0.id == sportId }
        do {
            _ = try await FunctionsService.shared.createCoachTeam(
                schoolName: schoolName.trimmingCharacters(in: .whitespacesAndNewlines),
                sportId: sportId,
                sportName: sport?.name ?? sportId,
                level: level,
                season: season,
                gender: gender)
            await auth.refreshUser()
            AnalyticsService.log(AnalyticsService.Event.teamCreated, [
                "sport": sportId,
                "level": level,
                "origin": "coach_unattached",
            ])
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
