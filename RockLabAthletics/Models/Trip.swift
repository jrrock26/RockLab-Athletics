import Foundation

/// A travel/trip plan for a team, with a roster manifest.
struct Trip: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var destination: String
    var departureDate: Date
    var returnDate: Date
    var busNumber: String
    var hotelInfo: String
    var mealPlan: String
    var rosterIds: [String]

    init(id: String, teamId: String, title: String, destination: String, departureDate: Date, returnDate: Date, busNumber: String, hotelInfo: String, mealPlan: String, rosterIds: [String]) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.destination = destination
        self.departureDate = departureDate
        self.returnDate = returnDate
        self.busNumber = busNumber
        self.hotelInfo = hotelInfo
        self.mealPlan = mealPlan
        self.rosterIds = rosterIds
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let title = data["title"] as? String,
              let departure = data["departureDate"] as? Double,
              let returnDate = data["returnDate"] as? Double else { return nil }
        self.id = id
        self.teamId = teamId
        self.title = title
        self.destination = data["destination"] as? String ?? ""
        self.departureDate = Date(timeIntervalSince1970: departure)
        self.returnDate = Date(timeIntervalSince1970: returnDate)
        self.busNumber = data["busNumber"] as? String ?? ""
        self.hotelInfo = data["hotelInfo"] as? String ?? ""
        self.mealPlan = data["mealPlan"] as? String ?? ""
        self.rosterIds = data["rosterIds"] as? [String] ?? []
    }
}
