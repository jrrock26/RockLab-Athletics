import SwiftUI

struct TripsView: View {
    let teamId: String
    let sportId: String
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = LogisticsViewModel()
    @State private var showingAdd = false
    @State private var access = TeamAccess()

    var body: some View {
        List {
            if vm.trips.isEmpty {
                Section {
                    Text(access.canManageTeam ? "No trips yet. Tap + to plan one." : "No trips scheduled.")
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
                    .deleteDisabled(!access.canManageTeam)
                }
            }
        }
        .navigationTitle("Trips")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            if access.canManageTeam {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New trip")
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddTripSheet(vm: vm, teamId: teamId)
        }
        .task {
            await vm.loadTrips(teamId: teamId)
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
        }
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
