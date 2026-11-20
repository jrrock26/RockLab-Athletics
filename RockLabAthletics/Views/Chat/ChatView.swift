import SwiftUI

struct ChatView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = ChatViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if vm.teams.isEmpty {
                    ContentUnavailableView(
                        "No teams",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("Create a team to start communicating.")
                    )
                } else {
                    List {
                        Section {
                            Picker("Team", selection: $vm.selectedTeamId) {
                                ForEach(vm.teams) { team in
                                    Text("\(team.sportName) \(team.level)").tag(team.id)
                                }
                            }
                            .onChange(of: vm.selectedTeamId) { _, newValue in
                                Task {
                                    let access = await FirestoreService.shared.teamAccess(teamId: newValue, userId: auth.user?.id, isAd: auth.user?.role == .ad)
                                    await vm.loadChats(teamId: newValue, access: access)
                                }
                            }
                        }

                        Section("Channels") {
                            ForEach(vm.visibleChats) { chat in
                                NavigationLink {
                                    ChatDetailView(chat: chat, vm: vm)
                                } label: {
                                    Label(chat.title, systemImage: chat.type.systemImage)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Communication")
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.loadTeams(schoolId: schoolId, userTeamIds: auth.user?.role == .ad ? nil : auth.user?.teamIds)
                    if !vm.selectedTeamId.isEmpty {
                        let access = await FirestoreService.shared.teamAccess(teamId: vm.selectedTeamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
                        await vm.loadChats(teamId: vm.selectedTeamId, access: access)
                    }
                }
            }
        }
    }
}
