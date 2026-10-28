import SwiftUI

struct TeamDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let team: Team
    @State private var showingInvite = false
    @State private var invites: [Invitation] = []

    private var canInvite: Bool {
        let role = auth.user?.role
        return role == .ad || role == .coach
    }

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

            if canInvite {
                Section("Coaching staff") {
                    Button {
                        showingInvite = true
                    } label: {
                        Label("Invite a coach", systemImage: "person.badge.plus")
                    }

                    if invites.isEmpty {
                        Text("No coaches invited yet.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(invites) { invite in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(invite.email) · \(invite.role.displayName)")
                                    .font(.subheadline)
                                if !invite.code.isEmpty {
                                    Text("Code: \(invite.code)")
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
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
        .sheet(isPresented: $showingInvite) {
            InviteCoachSheet(team: team) {
                Task { await loadInvites() }
            }
        }
        .task { await loadInvites() }
    }

    private func loadInvites() async {
        do {
            invites = try await FirestoreService.shared.fetchTeamInvitations(teamId: team.id)
        } catch {
            // keep the list empty on error
        }
    }
}




