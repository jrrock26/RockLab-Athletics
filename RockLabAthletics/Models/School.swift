import Foundation

/// A school organization. **Only an athletic director creates one.**
/// Teams can exist before a school does; when an AD adopts them they join the
/// school and take its official name.
struct School: Identifiable, Codable {
    let id: String
    var name: String
    var mascot: String
    var zipCode: String
    var district: String
    var districtKey: String
    var adUserId: String
    var activeSports: [Sport]
    var logoURL: String

    init(id: String, name: String, mascot: String, zipCode: String = "", district: String = "", districtKey: String = "", adUserId: String, activeSports: [Sport], logoURL: String = "") {
        self.id = id
        self.name = name
        self.mascot = mascot
        self.zipCode = zipCode
        self.district = district
        self.districtKey = districtKey
        self.adUserId = adUserId
        self.activeSports = activeSports
        self.logoURL = logoURL
    }

    init?(id: String, data: [String: Any]) {
        guard let name = data["name"] as? String else { return nil }
        self.id = id
        self.name = name
        self.mascot = data["mascot"] as? String ?? ""
        self.zipCode = data["zipCode"] as? String ?? ""
        self.district = data["district"] as? String ?? ""
        self.districtKey = data["districtKey"] as? String ?? ""
        self.adUserId = data["adUserId"] as? String ?? ""
        if let sportsData = data["activeSports"] as? [[String: Any]] {
            self.activeSports = sportsData.compactMap { Sport(data: $0) }
        } else {
            self.activeSports = []
        }
        self.logoURL = data["logoURL"] as? String ?? ""
    }
}


