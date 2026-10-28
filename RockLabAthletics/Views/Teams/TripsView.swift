import SwiftUI

struct TripsView: View {
    let teamId: String
    let sportId: String
    @State private var vm = LogisticsViewModel()
    @State private var showingAdd = false

    var body: some View {
        List {
            if vm.trips.isEmpty {
                Section {
                    Text("No trips yet. Tap + to plan one.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Trips") {
                    ForEach(vm.trips) { trip in
                        NavigationLink {
                            TripDetailView(trip: trip, teamId: teamId, vm: vm)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(trip.title).font(.headline)
                                Text(trip.destination)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        for index in indexSet {
                            Task { await vm.deleteTrip(tripId: vm.trips[index].id) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Trips")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddTripSheet(vm: vm, teamId: teamId)
        }
        .task { await vm.loadTrips(teamId: teamId) }
    }
}

struct AddTripSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: LogisticsViewModel
    let teamId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Trip") {
                    TextField("Title", text: $vm.newTripTitle)
                    TextField("Destination", text: $vm.newTripDestination)
                    DatePicker("Departure", selection: $vm.newTripDeparture)
                    DatePicker("Return", selection: $vm.newTripReturn)
                }
                Section("Logistics") {
                    TextField("Bus number", text: $vm.newTripBus)
                    TextField("Hotel", text: $vm.newTripHotel)
                    TextField("Meal plan", text: $vm.newTripMeal)
                }
            }
            .navigationTitle("New Trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addTrip(teamId: teamId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newTripTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
