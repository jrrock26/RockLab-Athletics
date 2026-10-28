import SwiftUI

struct JoinTeamView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = JoinViewModel()

    var body: some View {
        Form {
            Section("Enter invite code") {
                TextField("Code", text: $vm.code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            }

            if !vm.message.isEmpty {
                Section {
                    Text(vm.message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button("Join") {
                    Task {
                        let ok = await vm.join(userId: auth.user?.id ?? "", email: auth.user?.email ?? "")
                        if ok {
                            await auth.refreshUser()
                        }
                    }
                }
                .disabled(vm.code.isEmpty || vm.isWorking)
            }
        }
        .navigationTitle("Join a Team")
        .navigationBarTitleDisplayMode(.inline)
    }
}
