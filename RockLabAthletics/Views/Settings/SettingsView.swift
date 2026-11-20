import SwiftUI

struct SettingsView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var showingCreateDev = false
    @State private var devAccountMessage: String?
    @State private var showingLeaveSchool = false
    @State private var leaveSchoolMessage: String?
    @State private var myTeams: [Team] = []
    @State private var teamToLeave: Team?

    var body: some View {
        NavigationStack {
            Form {
                if let user = auth.user {
                    Section("Account") {
                        NavigationLink {
                            ProfileView()
                        } label: {
                            Label("My Profile", systemImage: "person.crop.circle")
                        }
                        LabeledContent("Name", value: user.displayName.isEmpty ? "Unnamed" : user.displayName)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Role", value: user.role.displayName)
                    }
                }

                Section("App") {
                    LabeledContent("Version", value: "1.0")
                    LabeledContent("Platform", value: "iOS 17+")
                    NavigationLink {
                        PrivacyView()
                    } label: {
                        Label("Privacy & Data", systemImage: "hand.raised.fill")
                    }
                }

                Section("My Invitations") {
                    NavigationLink("My Invitations") {
                        MyInvitationsView()
                    }
                }

                if !myTeams.isEmpty {
                    Section("Your Teams") {
                        ForEach(myTeams) { team in
                            teamLeaveRow(team)
                        }
                    }
                }

                if auth.user?.role == .ad {
                    Section("Administration") {
                        NavigationLink("Manage people") {
                            PeopleView()
                        }
                        NavigationLink("AD Directory") {
                            ADDirectoryView()
                        }
                        if auth.school != nil {
                            NavigationLink("Edit School") {
                                EditSchoolView()
                            }
                        }
                        #if DEBUG
                        Button("Create Dev Test Accounts") {
                            showingCreateDev = true
                        }
                        .foregroundStyle(.red)
                        #endif
                    }
                }

                if auth.user?.schoolId != nil {
                    Section("School") {
                        Button("Leave School", role: .destructive) {
                            showingLeaveSchool = true
                        }
                    }
                }

                if let devAccountMessage {
                    Section {
                        Text(devAccountMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                if let leaveSchoolMessage {
                    Section {
                        Text(leaveSchoolMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                #if DEBUG
                Section {
                    Button("Send a test crash to Crashlytics") {
                        AnalyticsService.breadcrumb("manual crash test from Settings")
                        AnalyticsService.simulateCrashForTesting()
                    }
                    .foregroundStyle(.red)
                } footer: {
                    Text("Debug builds only. Relaunch the app after the crash, then check Firebase → Crashlytics.")
                        .font(.caption)
                }
                #endif

                Section {
                    NavigationLink {
                        DeleteAccountView()
                    } label: {
                        Label("Delete Account", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                } footer: {
                    Text("Deleting your account removes your profile. Forms you signed stay with your school.")
                        .font(.caption)
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        auth.signOut()
                    }
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog("Create dev accounts?", isPresented: $showingCreateDev, titleVisibility: .visible) {
                Button("Create all 5 test accounts", role: .none) {
                    Task {
                        do {
                            let result = try await FunctionsService.shared.createDevAccounts()
                            devAccountMessage = "Done: \(result)"
                        } catch {
                            devAccountMessage = "Error: \(error.localizedDescription)"
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Creates coach, player, parent, follower, staff. Password: RockLabDev!2026")
            }
            .confirmationDialog("Leave school?", isPresented: $showingLeaveSchool, titleVisibility: .visible) {
                Button("Leave School", role: .destructive) {
                    Task {
                        await auth.leaveSchool()
                        if auth.user?.schoolId == nil {
                            leaveSchoolMessage = "You've left your school. Follow a new school to see teams."
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Leaving your school will remove your access to its teams until you follow a new school.")
            }
            .confirmationDialog("Leave team?", isPresented: Binding(
                get: { teamToLeave != nil },
                set: { if !$0 { teamToLeave = nil } }
            ), titleVisibility: .visible) {
                Button("Leave Team", role: .destructive) {
                    if let team = teamToLeave {
                        Task {
                            await auth.leaveTeam(teamId: team.id)
                            teamToLeave = nil
                            await loadMyTeams()
                        }
                    }
                }
                Button("Cancel", role: .cancel) { teamToLeave = nil }
            } message: {
                if let team = teamToLeave {
                    Text("Leave \(team.sportName) \(team.level)? A coach or AD can re-add you if needed.")
                } else {
                    Text("")
                }
            }
            .task { await loadMyTeams() }
        }
    }

    private func loadMyTeams() async {
        guard let ids = auth.user?.teamIds, !ids.isEmpty else {
            myTeams = []
            return
        }
        var loaded: [Team] = []
        for id in ids {
            if let team = try? await FirestoreService.shared.fetchTeam(teamId: id) {
                loaded.append(team)
            }
        }
        myTeams = loaded
    }

    @ViewBuilder
    private func teamLeaveRow(_ team: Team) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(team.sportName) \(team.level)")
                    .font(.headline)
                Text("\(team.season) · \(team.gender)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Leave", role: .destructive) {
                teamToLeave = team
            }
        }
    }
}

