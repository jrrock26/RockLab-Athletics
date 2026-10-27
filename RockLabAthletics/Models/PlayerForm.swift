import Foundation

/// The compliance forms a player must clear to be eligible.
enum FormType: String, Codable, CaseIterable, Identifiable {
    case physical
    case codeOfConduct
    case concussionWaiver

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .physical: return "Physical"
        case .codeOfConduct: return "Code of Conduct"
        case .concussionWaiver: return "Concussion Waiver"
        }
    }
}

enum FormStatus: String, Codable {
    case missing
    case submitted
    case approved
    case expired
}

/// A single form record for a player.
struct PlayerForm: Identifiable, Codable {
    let id: String
    var teamId: String
    var rosterEntryId: String
    var type: FormType
    var status: FormStatus
    var expiresAt: Date?

    init(
        id: String,
        teamId: String,
        rosterEntryId: String,
        type: FormType,
        status: FormStatus,
        expiresAt: Date? = nil
    ) {
        self.id = id
        self.teamId = teamId
        self.rosterEntryId = rosterEntryId
        self.type = type
        self.status = status
        self.expiresAt = expiresAt
    }

    init?(id: String, data: [String: Any]) {
        guard let rosterEntryId = data["rosterEntryId"] as? String,
              let typeRaw = data["type"] as? String,
              let type = FormType(rawValue: typeRaw) else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.rosterEntryId = rosterEntryId
        self.type = type
        self.status = FormStatus(rawValue: data["status"] as? String ?? "") ?? .missing
        if let exp = data["expiresAt"] as? Double {
            self.expiresAt = Date(timeIntervalSince1970: exp)
        } else {
            self.expiresAt = nil
        }
    }
}

/// Whether a player is cleared to play.
enum EligibilityStatus: Equatable {
    case eligible
    case ineligible(missing: [FormType], expired: [FormType])

    var isEligible: Bool {
        if case .eligible = self { return true }
        return false
    }
}

/// The safety-first rule engine: a player is eligible only when all required
/// forms are approved and the physical hasn't expired.
enum EligibilityEngine {
    static func requiredForms() -> [FormType] {
        [.physical, .codeOfConduct, .concussionWaiver]
    }

    static func evaluate(forms: [PlayerForm], now: Date = Date()) -> EligibilityStatus {
        var missing: [FormType] = []
        var expired: [FormType] = []

        for type in requiredForms() {
            guard let form = forms.first(where: { $0.type == type }) else {
                missing.append(type)
                continue
            }
            switch form.status {
            case .approved:
                if type == .physical, let exp = form.expiresAt, exp < now {
                    expired.append(type)
                }
            case .expired:
                expired.append(type)
            case .missing, .submitted:
                missing.append(type)
            }
        }

        if missing.isEmpty && expired.isEmpty {
            return .eligible
        }
        return .ineligible(missing: missing, expired: expired)
    }
}
