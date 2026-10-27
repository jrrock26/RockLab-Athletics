import SwiftUI

struct FundraiserDetailView: View {
    let fundraiser: Fundraiser
    let vm: LogisticsViewModel
    @State private var showingAdd = false

    private var currentRaised: Double {
        vm.fundraisers.first(where: { $0.id == fundraiser.id })?.raised ?? fundraiser.raised
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
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddDonationSheet(vm: vm, fundraiserId: fundraiser.id)
        }
        .task { await vm.loadDonations(fundraiserId: fundraiser.id) }
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
