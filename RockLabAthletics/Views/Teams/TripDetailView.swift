import SwiftUI

struct TripDetailView: View {
    let trip: Trip
    let teamId: String
    let vm: LogisticsViewModel

    var body: some View {
        let current = vm.selectedTrip ?? trip
        List {
            Section("Details") {
                LabeledContent("Destination", value: current.destination)
                LabeledContent("Departure", value: current.departureDate.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Return", value: current.returnDate.formatted(date: .abbreviated, time: .shortened))
                if !current.busNumber.isEmpty { LabeledContent("Bus", value: current.busNumber) }
                if !current.hotelInfo.isEmpty { LabeledContent("Hotel", value: current.hotelInfo) }
                if !current.mealPlan.isEmpty { LabeledContent("Meals", value: current.mealPlan) }
            }

            Section("Manifest (\(current.rosterIds.count)/\(vm.roster.count))") {
                if vm.roster.isEmpty {
                    Text("No players on the roster yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.roster) { entry in
                        Button {
                            Task { await vm.toggleTripRoster(entryId: entry.id) }
                        } label: {
                            HStack {
                                Text(entry.playerName)
                                Spacer()
                                Image(systemName: current.rosterIds.contains(entry.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(current.rosterIds.contains(entry.id) ? Color.green : Color.secondary)
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
        }
        .navigationTitle(current.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.loadTripDetail(trip, teamId: teamId) }
    }
}
