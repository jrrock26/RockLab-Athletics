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
                                Task { await vm.loadChats(teamId: newValue) }
                            }
                        }

                        Section("Channels") {
                            ForEach(vm.chats) { chat in
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
                    await vm.loadTeams(schoolId: schoolId)
                    if !vm.selectedTeamId.isEmpty {
                        await vm.loadChats(teamId: vm.selectedTeamId)
                    }
                }
            }
        }
    }
}
