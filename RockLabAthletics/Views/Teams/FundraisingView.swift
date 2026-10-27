import SwiftUI

struct FundraisingView: View {
    let teamId: String
    @State private var vm = LogisticsViewModel()
    @State private var showingAdd = false

    var body: some View {
        List {
            if vm.fundraisers.isEmpty {
                Section {
                    Text("No fundraisers yet. Tap + to start one.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Campaigns") {
                    ForEach(vm.fundraisers) { fundraiser in
                        NavigationLink {
                            FundraiserDetailView(fundraiser: fundraiser, vm: vm)
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddFundraiserSheet(vm: vm, teamId: teamId)
        }
        .task { await vm.loadFundraisers(teamId: teamId) }
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
