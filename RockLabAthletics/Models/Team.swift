import Foundation

/// A specific team (a sport instance at a given level/season).
///
/// A team can exist **without a school**. Only an athletic director creates a
/// school organization; a coach who starts on their own gets an *unattached*
/// team carrying a `schoolNameHint` they typed. When an AD adopts the team, it
/// joins the AD's school and the AD's official school name replaces the hint.
struct Team: Identifiable, Codable {

    enum AdoptionStatus: String, Codable {
        /// Started by a coach; not yet part of a school organization.
        case unattached
        /// Owned by a school organization.
        case adopted
    }

    let id: String
    var schoolId: String
    var sportId: String
    var sportName: String
    var level: String
    var season: String
    var gender: String
    var headCoachId: String
    var joinCode: String

    /// What the coach typed when they started solo. Display-only until adopted.
    var schoolNameHint: String
    var adoptionStatus: AdoptionStatus
    var adoptedAt: Date?
    var adoptedByName: String

    init(
        id: String,
        schoolId: String,
        sportId: String,
        sportName: String,
        level: String,
        season: String,
        gender: String,
        headCoachId: String,
        joinCode: String,
        schoolNameHint: String = "",
        adoptionStatus: AdoptionStatus = .adopted,
        adoptedAt: Date? = nil,
        adoptedByName: String = ""
    ) {
        self.id = id
        self.schoolId = schoolId
        self.sportId = sportId
        self.sportName = sportName
        self.level = level
        self.season = season
        self.gender = gender
        self.headCoachId = headCoachId
        self.joinCode = joinCode
        self.schoolNameHint = schoolNameHint
        self.adoptionStatus = adoptionStatus
        self.adoptedAt = adoptedAt
        self.adoptedByName = adoptedByName
    }

    init?(id: String, data: [String: Any]) {
        guard let sportName = data["sportName"] as? String else { return nil }
        self.id = id
        // Teams started by a coach have no school yet.
        self.schoolId = data["schoolId"] as? String ?? ""
        self.sportId = data["sportId"] as? String ?? ""
        self.sportName = sportName
        self.level = data["level"] as? String ?? "Varsity"
        self.season = data["season"] as? String ?? ""
        self.gender = data["gender"] as? String ?? ""
        self.headCoachId = data["headCoachId"] as? String ?? ""
        self.joinCode = data["joinCode"] as? String ?? ""
        self.schoolNameHint = data["schoolNameHint"] as? String ?? ""
        // Teams created before this field existed always belonged to a school.
        if let raw = data["adoptionStatus"] as? String, let status = AdoptionStatus(rawValue: raw) {
            self.adoptionStatus = status
        } else {
            self.adoptionStatus = (data["schoolId"] as? String ?? "").isEmpty ? .unattached : .adopted
        }
        self.adoptedAt = (data["adoptedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.adoptedByName = data["adoptedByName"] as? String ?? ""
    }

    /// True when this team is still waiting for an AD to adopt it.
    var isUnattached: Bool { adoptionStatus == .unattached || schoolId.isEmpty }

    /// "Football Varsity" style label.
    var title: String { "\(sportName) \(level)" }

    /// The school name to show: the AD's official name, or the coach's hint.
    func displaySchoolName(school: School?) -> String {
        if let school, !school.name.isEmpty { return school.name }
        return schoolNameHint.isEmpty ? "Independent team" : schoolNameHint
    }
}



