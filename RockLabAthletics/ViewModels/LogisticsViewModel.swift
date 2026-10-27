import Foundation
import Observation

/// Drives trips (with manifests) and fundraising.
@Observable
final class LogisticsViewModel {
    var trips: [Trip] = []
    var fundraisers: [Fundraiser] = []
    var roster: [RosterEntry] = []
    var donations: [Donation] = []
    var selectedTrip: Trip?
    var errorMessage: String?

    // Trip form
    var newTripTitle = ""
    var newTripDestination = ""
    var newTripDeparture = Date()
    var newTripReturn = Date().addingTimeInterval(86_400)
    var newTripBus = ""
    var newTripHotel = ""
    var newTripMeal = ""

    // Fundraiser form
    var newFundTitle = ""
    var newFundType: FundraiserType = .donation
    var newFundGoal = ""

    // Donation form
    var newDonorName = ""
    var newDonationAmount = ""

    // MARK: Trips

    func loadTrips(teamId: String) async {
        do {
            trips = try await FirestoreService.shared.fetchTrips(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addTrip(teamId: String) async {
        let title = newTripTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        do {
            let id = try await FirestoreService.shared.createTrip(
                teamId: teamId, title: title, destination: newTripDestination,
                departureDate: newTripDeparture, returnDate: newTripReturn,
                busNumber: newTripBus, hotelInfo: newTripHotel, mealPlan: newTripMeal)
            trips.append(Trip(id: id, teamId: teamId, title: title, destination: newTripDestination,
                              departureDate: newTripDeparture, returnDate: newTripReturn,
                              busNumber: newTripBus, hotelInfo: newTripHotel, mealPlan: newTripMeal, rosterIds: []))
            trips.sort { $0.departureDate < $1.departureDate }
            newTripTitle = ""
            newTripDestination = ""
            newTripBus = ""
            newTripHotel = ""
            newTripMeal = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadTripDetail(_ trip: Trip, teamId: String) async {
        selectedTrip = trip
        do {
            roster = try await FirestoreService.shared.fetchRoster(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleTripRoster(entryId: String) async {
        guard var trip = selectedTrip else { return }
        let currentlyOn = trip.rosterIds.contains(entryId)
        do {
            try await FirestoreService.shared.toggleTripRoster(tripId: trip.id, rosterEntryId: entryId, isOn: !currentlyOn)
            if currentlyOn {
                trip.rosterIds.removeAll { $0 == entryId }
            } else {
                trip.rosterIds.append(entryId)
            }
            selectedTrip = trip
            if let index = trips.firstIndex(where: { $0.id == trip.id }) {
                trips[index] = trip
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTrip(tripId: String) async {
        do {
            try await FirestoreService.shared.deleteTrip(tripId: tripId)
            trips.removeAll { $0.id == tripId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Fundraisers

    func loadFundraisers(teamId: String) async {
        do {
            fundraisers = try await FirestoreService.shared.fetchFundraisers(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addFundraiser(teamId: String) async {
        let title = newFundTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let goal = Double(newFundGoal.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        guard !title.isEmpty, goal > 0 else { return }
        do {
            let id = try await FirestoreService.shared.createFundraiser(teamId: teamId, title: title, type: newFundType, goal: goal)
            fundraisers.append(Fundraiser(id: id, teamId: teamId, title: title, type: newFundType, goal: goal, raised: 0))
            newFundTitle = ""
            newFundGoal = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadDonations(fundraiserId: String) async {
        do {
            donations = try await FirestoreService.shared.fetchDonations(fundraiserId: fundraiserId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addDonation(fundraiserId: String) async {
        let name = newDonorName.trimmingCharacters(in: .whitespacesAndNewlines)
        let amount = Double(newDonationAmount.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        guard !name.isEmpty, amount > 0 else { return }
        do {
            let id = try await FirestoreService.shared.addDonation(fundraiserId: fundraiserId, donorName: name, amount: amount)
            donations.insert(Donation(id: id, fundraiserId: fundraiserId, donorName: name, amount: amount, date: Date()), at: 0)
            if let index = fundraisers.firstIndex(where: { $0.id == fundraiserId }) {
                fundraisers[index].raised += amount
            }
            newDonorName = ""
            newDonationAmount = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
