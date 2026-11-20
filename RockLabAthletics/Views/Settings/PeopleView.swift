import SwiftUI

struct PeopleView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = PeopleViewModel()
    @State private var selectedUser: AppUser?

    var body: some View {
        List(vm.users) { user in
            Button {
                selectedUser = user
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.displayName.isEmpty ? "Unnamed" : user.displayName).font(.headline)
                        Text(user.email).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(user.role.displayName)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }
            .foregroundStyle(.primary)
        }
        .navigationTitle("Manage People")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedUser) { user in
            UserManagementSheet(user: user) {
                Task {
                    await vm.load(schoolId: auth.user?.schoolId ?? "")
                    selectedUser = nil
                }
            }
        }
        .task {
            if let schoolId = auth.user?.schoolId {
                await vm.load(schoolId: schoolId)
            }
        }
    }
}

struct UserManagementSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let user: AppUser
    let onChanged: () -> Void

    @State private var selectedRole: UserRole
    @State private var isWorking = false
    @State private var errorMessage: String?

    init(user: AppUser, onChanged: @escaping () -> Void) {
        self.user = user
        self.onChanged = onChanged
        _selectedRole = State(initialValue: user.role)
    }

    /// AD can assign any role; coach can assign staff/player/parent/follower.
    private var allowedRoles: [UserRole] {
        if auth.user?.role == .ad {
            return [.ad, .coach, .staff, .player, .parent, .follower]
        }
        return [.staff, .player, .parent, .follower]
    }

    private var canRemove: Bool {
        if user.role == .ad { return false }                    // nobody removes an AD
        if user.role == .coach { return auth.user?.role == .ad } // only AD removes a coach
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(user.displayName.isEmpty ? "User" : user.displayName) {
                    Text(user.email).font(.footnote).foregroundStyle(.secondary)
                    Picker("Role", selection: $selectedRole) {
                        ForEach(allowedRoles, id: \.self) { r in
                            Text(r.displayName).tag(r)
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    }
                }

                if canRemove {
                    Section {
                        Button("Remove from school", role: .destructive) {
                            Task { await remove() }
                        }
                    }
                }
            }
            .navigationTitle("Manage User")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save role") {
                        Task { await saveRole() }
                    }
                    .disabled(isWorking || selectedRole == user.role)
                }
            }
        }
    }

    private func saveRole() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await FunctionsService.shared.manageUserRole(targetUid: user.id, action: "setRole", newRole: selectedRole.rawValue)
            onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func remove() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await FunctionsService.shared.manageUserRole(targetUid: user.id, action: "remove")
            onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
