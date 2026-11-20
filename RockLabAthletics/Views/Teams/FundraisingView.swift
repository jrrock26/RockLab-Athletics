import SwiftUI

struct FundraisingView: View {
    let teamId: String
    let sportId: String
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = LogisticsViewModel()
    @State private var showingAdd = false
    @State private var access = TeamAccess()

    var body: some View {
        List {
            if vm.fundraisers.isEmpty {
                Section {
                    Text(access.canManageTeam || access.hasPerm(.fundraising)
                         ? "No fundraisers yet. Tap + to start one."
                         : "No fundraisers yet.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Campaigns") {
                    ForEach(vm.fundraisers) { fundraiser in
                        NavigationLink {
                            FundraiserDetailView(fundraiser: fundraiser, vm: vm, teamId: teamId)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(fundraiser.title).font(.headline)
                                    Text(fundraiser.type.displayName)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("$\(fundraiser.raised, specifier: "%.0f") / $\(fundraiser.goal, specifier: "%.0f")")
                                    .font(.subheadline.monospacedDigit())
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Fundraising")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            if access.canManageTeam || access.hasPerm(.fundraising) {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New fundraiser")
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddFundraiserSheet(vm: vm, teamId: teamId)
        }
        .task {
            await vm.loadFundraisers(teamId: teamId)
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
    }
}

struct AddFundraiserSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: LogisticsViewModel
    let teamId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Campaign") {
                    TextField("Title", text: $vm.newFundTitle)
                    Picker("Type", selection: $vm.newFundType) {
                        ForEach(FundraiserType.allCases) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    TextField("Goal ($)", text: $vm.newFundGoal)
                        .keyboardType(.decimalPad)
                }
            }
            .navigationTitle("New Fundraiser")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addFundraiser(teamId: teamId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newFundTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              || (Double(vm.newFundGoal) ?? 0) <= 0)
                }
            }
        }
    }
}
