import Foundation

enum FundraiserType: String, Codable, CaseIterable, Identifiable {
    case donation, tickets, gear

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .donation: return "Donation"
        case .tickets: return "Ticket Sales"
        case .gear: return "Gear Store"
        }
    }
}

/// A fundraising campaign for a team.
struct Fundraiser: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var type: FundraiserType
    var goal: Double
    var raised: Double

    init(id: String, teamId: String, title: String, type: FundraiserType, goal: Double, raised: Double) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.type = type
        self.goal = goal
        self.raised = raised
    }

    init?(id: String, data: [String: Any]) {
        guard let teamId = data["teamId"] as? String,
              let title = data["title"] as? String,
              let typeRaw = data["type"] as? String,
              let type = FundraiserType(rawValue: typeRaw) else { return nil }
        self.id = id
        self.teamId = teamId
        self.title = title
        self.type = type
        self.goal = data["goal"] as? Double ?? 0
        self.raised = data["raised"] as? Double ?? 0
    }
}

/// A single donation toward a fundraiser.
struct Donation: Identifiable, Codable {
    let id: String
    var fundraiserId: String
    var donorName: String
    var amount: Double
    var date: Date

    init(id: String, fundraiserId: String, donorName: String, amount: Double, date: Date) {
        self.id = id
        self.fundraiserId = fundraiserId
        self.donorName = donorName
        self.amount = amount
        self.date = date
    }

    init?(id: String, data: [String: Any]) {
        guard let fundraiserId = data["fundraiserId"] as? String,
              let donorName = data["donorName"] as? String,
              let amount = data["amount"] as? Double else { return nil }
        self.id = id
        self.fundraiserId = fundraiserId
        self.donorName = donorName
        self.amount = amount
        self.date = Date(timeIntervalSince1970: (data["date"] as? Double) ?? 0)
    }
}
