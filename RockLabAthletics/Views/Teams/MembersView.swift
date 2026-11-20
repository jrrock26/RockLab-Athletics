import SwiftUI

struct MembersView: View {
    let teamId: String
    let sportId: String
    @State private var vm = MembersViewModel()
    @State private var selectedMember: TeamMembership?
    @State private var showingAdd = false

    var body: some View {
        List(vm.members.filter { $0.role != .follower }) { member in
            Button {
                selectedMember = member
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.name.isEmpty ? member.email : member.name).font(.headline)
                        Text(member.email).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(member.role.displayName)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }
            .foregroundStyle(.primary)
        }
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .sheet(item: $selectedMember) { member in
            MemberDetailSheet(teamId: teamId, member: member) {
                Task {
                    await vm.load(teamId: teamId)
                    selectedMember = nil
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddMemberSheet(teamId: teamId) {
                Task { await vm.load(teamId: teamId) }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
                .accessibilityLabel("Add member")
            }
        }
        .task { await vm.load(teamId: teamId) }
    }
}

struct MemberDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let teamId: String
    let member: TeamMembership
    let onChanged: () -> Void

    @State private var selectedPermissions: Set<String>
    @State private var isWorking = false
    @State private var errorMessage: String?

    init(teamId: String, member: TeamMembership, onChanged: @escaping () -> Void) {
        self.teamId = teamId
        self.member = member
        self.onChanged = onChanged
        _selectedPermissions = State(initialValue: Set(member.permissions))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("\(member.name.isEmpty ? member.email : member.name) · \(member.role.displayName)") {
                    Text(member.email).font(.footnote).foregroundStyle(.secondary)
                }

                if member.role == .staff {
                    Section("Permissions") {
                        ForEach(StaffPermission.allCases) { perm in
                            Toggle(perm.displayName, isOn: binding(for: perm))
                        }
                    }
                }

                Section {
                    Button("Remove from team", role: .destructive) {
                        Task { await remove() }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Manage Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(isWorking)
                }
            }
        }
    }

    private func binding(for perm: StaffPermission) -> Binding<Bool> {
        Binding(
            get: { selectedPermissions.contains(perm.rawValue) },
            set: { on in
                if on { selectedPermissions.insert(perm.rawValue) }
                else { selectedPermissions.remove(perm.rawValue) }
            }
        )
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await FirestoreService.shared.updateMemberPermissions(teamId: teamId, userId: member.id, permissions: Array(selectedPermissions))
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
            try await FirestoreService.shared.removeMember(teamId: teamId, userId: member.id)
            onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct AddMemberSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let onAdded: () -> Void

    @State private var users: [AppUser] = []
    @State private var selectedUserId: String?
    @State private var selectedRole: UserRole = .player
    @State private var isWorking = false
    @State private var errorMessage: String?

    private let assignableRoles: [UserRole] = [.staff, .player, .parent, .family, .follower]

    var body: some View {
        NavigationStack {
            Form {
                Section("Member") {
                    Picker("User", selection: $selectedUserId) {
                        Text("Select a user").tag(String?.none)
                        ForEach(users) { u in
                            Text(u.displayName.isEmpty ? u.email : u.displayName).tag(Optional(u.id))
                        }
                    }
                    Picker("Role", selection: $selectedRole) {
                        ForEach(assignableRoles, id: \.self) { r in
                            Text(r.displayName).tag(r)
                        }
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Add Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await add() } }
                        .disabled(selectedUserId == nil || isWorking)
                }
            }
            .task { await loadUsers() }
        }
    }

    private func loadUsers() async {
        guard let schoolId = auth.user?.schoolId else { return }
        let all = (try? await FirestoreService.shared.fetchSchoolUsers(schoolId: schoolId)) ?? []
        let existing = (try? await FirestoreService.shared.fetchMemberships(teamId: teamId)) ?? []
        let existingIds = Set(existing.map { $0.userId })
        users = all.filter { !existingIds.contains($0.id) && $0.id != auth.user?.id }
    }

    private func add() async {
        guard let uid = selectedUserId else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await FunctionsService.shared.assignTeamRole(teamId: teamId, targetUid: uid, role: selectedRole.rawValue)
            onAdded()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
