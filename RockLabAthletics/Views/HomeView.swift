import SwiftUI

struct HomeView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = HomeViewModel()

    private var myTeams: [Team] {
        let ids = auth.user?.teamIds ?? []
        return vm.teams.filter { ids.contains($0.id) }
    }

    private var role: UserRole { auth.user?.role ?? .follower }
    private var isAdmin: Bool { role == .ad }

    var body: some View {
        NavigationStack {
            List {
                header
                dashboard
            }
            .navigationTitle("Home")
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.load(schoolId: schoolId)
                }
            }
        }
    }

    // MARK: Role-specific dashboard

    @ViewBuilder
    private var dashboard: some View {
        switch role {
        case .ad:
            schoolSection
            adminSummary
            adminLinks
            organizationSection
        case .coach:
            teamsSection("Coaching")
            organizationSection
        case .staff:
            teamsSection("Your teams")
            organizationSection
        case .player:
            teamsSection("Your teams")
            formsSection
            organizationSection
        case .parent:
            teamsSection("Your child's teams")
            formsSection
            organizationSection
        case .family:
            // Family see the same public surface as followers. Their athlete
            // link (via the parent-link approval) is what makes it personal.
            if myTeams.isEmpty { noTeamSection } else { teamsSection("Family") }
            organizationSection
        case .follower:
            if myTeams.isEmpty { noTeamSection } else { teamsSection("Following") }
            organizationSection
        }
    }

    // MARK: Sections

    private var header: some View {
        Section {
            NavigationLink { ProfileView() } label: {
                HStack(spacing: 12) {
                    if let urlString = auth.user?.photoURL, !urlString.isEmpty, let url = URL(string: urlString) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.accentColor.opacity(0.3)
                        }
                        .frame(width: 44, height: 44)
                        .clipShape(Circle())
                    } else {
                        Text(initials)
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Color.accentColor, in: Circle())
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(greeting)
                            .font(.title3.bold())
                            .foregroundStyle(.primary)
                        Text(roleSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var initials: String {
        let parts = greeting.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters)
    }

    private var greeting: String {
        let name = auth.user?.displayName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? "Welcome" : "Hi, \(name)"
    }

    private var roleSubtitle: String {
        let count = myTeams.count
        switch role {
        case .ad: return "Athletic Director"
        case .coach: return "Coach · \(count) team\(count == 1 ? "" : "s")"
        case .staff: return "Staff · \(count) team\(count == 1 ? "" : "s")"
        case .player: return "Player · \(count) team\(count == 1 ? "" : "s")"
        case .parent: return "Parent / Guardian"
        case .family: return "Family · \(count) team\(count == 1 ? "" : "s")"
        case .follower: return "Following \(count) team\(count == 1 ? "" : "s")"
        }
    }

    @ViewBuilder
    private var schoolSection: some View {
        if let school = auth.school {
            Section("Your School") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(school.name).font(.headline)
                    if !school.mascot.isEmpty {
                        Text(school.mascot).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if school.activeSports.isEmpty {
                    Text("No sports selected yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(school.activeSports) { sport in
                        NavigationLink {
                            SportGendersView(schoolId: school.id, sport: sport)
                        } label: {
                            Label("\(sport.emoji) \(sport.name)", systemImage: "sportscourt")
                        }
                    }
                }
            }
        }
    }

    private var adminSummary: some View {
        Section("Organization overview") {
            summaryCard(title: "Teams", value: "\(vm.teamCount)", systemImage: "person.3.fill", tint: .blue)
            summaryCard(title: "Players", value: "\(vm.playerCount)", systemImage: "person.fill", tint: .green)
            summaryCard(title: "Upcoming Games", value: "\(vm.upcomingGameCount)", systemImage: "calendar", tint: .orange)
        }
    }

    private var adminLinks: some View {
        Section("Administration") {
            NavigationLink { PeopleView() } label: {
                Label("Manage people", systemImage: "person.2")
            }
            NavigationLink { TeamsView() } label: {
                Label("Manage teams", systemImage: "sportscourt")
            }
            NavigationLink { ADDirectoryView() } label: {
                Label("AD Directory", systemImage: "building.columns")
            }
        }
    }

    private func teamsSection(_ title: String) -> some View {
        Section(title) {
            if myTeams.isEmpty {
                Text("No teams yet.").foregroundStyle(.secondary)
            } else {
                ForEach(myTeams) { team in
                    teamRow(team)
                }
            }
        }
    }

    private var formsSection: some View {
        Section("Forms to sign") {
            if myTeams.isEmpty {
                Text("No forms.").foregroundStyle(.secondary)
            } else {
                ForEach(myTeams) { team in
                    NavigationLink { MyFormsView(teamId: team.id, sportId: team.sportId) } label: {
                        Label("\(team.sportName) \(team.level)", systemImage: "signature")
                    }
                }
            }
        }
    }

    private var noTeamSection: some View {
        Section {
            Label("You're not following a team yet.", systemImage: "info.circle")
                .foregroundStyle(.secondary)
            Text("Browse the organization below and tap a team to follow it.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var organizationSection: some View {
        let orgName = auth.school?.name ?? (isAdmin ? "All Teams" : "Organization")
        return Section(orgName) {
            if vm.teams.isEmpty {
                Text("No teams yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(vm.teams) { team in
                    teamRow(team)
                }
            }
        }
    }

    private func teamRow(_ team: Team) -> some View {
        NavigationLink { TeamDetailView(team: team) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(team.sportName) \(team.level)").font(.headline)
                Text("\(team.season) · \(team.gender)").font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func summaryCard(title: String, value: String, systemImage: String, tint: Color) -> some View {
        HStack {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(value).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }
}

