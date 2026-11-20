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



/// An organization-owned asset: a facility, field, bus, or anything else an AD
/// wants bookable. Added once by the AD and then permanent until retired.
struct OrgResource: Identifiable {
    var id: String
    var schoolId: String
    /// facility | field | bus | other
    var type: String
    var name: String
    var notes: String
    var active: Bool

    var typeLabel: String {
        switch type {
        case "field": return "Field"
        case "bus": return "Bus"
        case "other": return "Other"
        default: return "Facility"
        }
    }

    var symbol: String {
        switch type {
        case "field": return "sportscourt"
        case "bus": return "bus"
        case "other": return "shippingbox"
        default: return "building.2"
        }
    }

    init?(id: String, data: [String: Any]) {
        guard let name = data["name"] as? String else { return nil }
        self.id = id
        self.schoolId = data["schoolId"] as? String ?? ""
        self.type = data["type"] as? String ?? "facility"
        self.name = name
        self.notes = data["notes"] as? String ?? ""
        self.active = data["active"] as? Bool ?? true
    }
}

/// A booked window on a resource. Cancelled bookings are kept so the calendar can
/// show that a slot was held and released rather than silently rewriting history.
struct ResourceBooking: Identifiable {
    var id: String
    var schoolId: String
    var resourceId: String
    var resourceName: String
    var teamId: String
    var teamName: String
    var title: String
    var startMs: Double
    var endMs: Double
    var status: String
    var bookedByName: String

    var isActive: Bool { status == "booked" }
    var startDate: Date { Date(timeIntervalSince1970: startMs / 1000) }
    var endDate: Date { Date(timeIntervalSince1970: endMs / 1000) }

    init?(id: String, data: [String: Any]) {
        guard let resourceId = data["resourceId"] as? String else { return nil }
        self.id = id
        self.schoolId = data["schoolId"] as? String ?? ""
        self.resourceId = resourceId
        self.resourceName = data["resourceName"] as? String ?? ""
        self.teamId = data["teamId"] as? String ?? ""
        self.teamName = data["teamName"] as? String ?? ""
        self.title = data["title"] as? String ?? ""
        self.startMs = data["startMs"] as? Double ?? 0
        self.endMs = data["endMs"] as? Double ?? 0
        self.status = data["status"] as? String ?? "booked"
        self.bookedByName = data["bookedByName"] as? String ?? ""
    }
}

