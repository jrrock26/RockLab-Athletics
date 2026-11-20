import SwiftUI

struct FundraiserDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let fundraiser: Fundraiser
    let vm: LogisticsViewModel
    let teamId: String
    @State private var showingAdd = false
    @State private var progressEntry: RosterEntry?
    @State private var access = TeamAccess()

    private var currentRaised: Double {
        vm.fundraisers.first(where: { $0.id == fundraiser.id })?.raised ?? fundraiser.raised
    }

    private var canManage: Bool {
        access.canManageTeam || access.hasPerm(.fundraising)
    }

    var body: some View {
        List {
            Section("Progress") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("$\(currentRaised, specifier: "%.2f") of $\(fundraiser.goal, specifier: "%.2f")")
                        .font(.title2.bold())
                    ProgressView(value: currentRaised, total: max(fundraiser.goal, 1))
                }
            }

            Section("Players") {
                if vm.roster.isEmpty {
                    Text("No players on the roster yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.roster) { entry in
                        let prog = vm.progress[entry.id]
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.playerName).font(.headline)
                                Text(progressText(prog)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if canManage {
                                Button { progressEntry = entry } label: { Image(systemName: "pencil") }
                                .accessibilityLabel("Update progress")
                                    .buttonStyle(.borderless)
                            } else if isMyEntry(entry), prog?.submitted != true {
                                Button("Submit") { progressEntry = entry }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                            } else if prog?.submitted == true {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                            }
                        }
                    }
                }
            }

            Section("Donations") {
                if vm.donations.isEmpty {
                    Text("No donations yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.donations) { donation in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(donation.donorName).font(.headline)
                                Text(donation.date.formatted(date: .abbreviated, time: .omitted))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("$\(donation.amount, specifier: "%.2f")")
                                .fontWeight(.semibold)
                        }
                    }
                }
            }
        }
        .navigationTitle(fundraiser.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add entry")
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddDonationSheet(vm: vm, fundraiserId: fundraiser.id)
        }
        .sheet(item: $progressEntry) { entry in
            PlayerProgressSheet(
                fundraiserId: fundraiser.id, entry: entry, existing: vm.progress[entry.id],
                canReview: canManage) {
                Task { await vm.loadFundraiserDetail(fundraiserId: fundraiser.id, teamId: teamId) }
            }
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.loadFundraiserDetail(fundraiserId: fundraiser.id, teamId: teamId)
        }
    }

    private func progressText(_ prog: FundraiserProgress?) -> String {
        guard let prog else { return "No amount reported" }
        var text = String(format: "$%.0f", prog.raised)
        text += prog.submitted ? " · Submitted" : " · Not submitted"
        return text
    }

    private func isMyEntry(_ entry: RosterEntry) -> Bool {
        guard let uid = auth.user?.id, let pid = entry.userId else { return false }
        let linked = auth.user?.linkedPlayerIds ?? []
        return pid == uid || linked.contains(pid)
    }
}

struct AddDonationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: LogisticsViewModel
    let fundraiserId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Donation") {
                    TextField("Donor name", text: $vm.newDonorName)
                    TextField("Amount ($)", text: $vm.newDonationAmount)
                        .keyboardType(.decimalPad)
                }
            }
            .navigationTitle("Add Donation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addDonation(fundraiserId: fundraiserId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newDonorName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              || (Double(vm.newDonationAmount) ?? 0) <= 0)
                }
            }
        }
    }
}

struct PlayerProgressSheet: View {
    @Environment(\.dismiss) private var dismiss
    let fundraiserId: String
    let entry: RosterEntry
    let existing: FundraiserProgress?
    let canReview: Bool
    let onSave: () -> Void

    @State private var raisedText = ""
    @State private var submitted = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(entry.playerName) {
                    TextField("Amount raised ($)", text: $raisedText)
                        .keyboardType(.decimalPad)
                    if canReview {
                        Toggle("Marked submitted", isOn: $submitted)
                    } else {
                        Text("Submitting marks your contributions as turned in.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle(canReview ? "Player Progress" : "Submit Contributions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isWorking)
                }
            }
            .onAppear {
                raisedText = existing.map { String(format: "%.0f", $0.raised) } ?? ""
                submitted = existing?.submitted ?? false
            }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        let amount = Double(raisedText.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        do {
            try await FirestoreService.shared.upsertFundraiserProgress(
                fundraiserId: fundraiserId, rosterEntryId: entry.id, playerName: entry.playerName,
                raised: amount, submitted: canReview ? submitted : true)
            onSave()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
