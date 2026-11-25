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

    var displayName: String {
        switch self {
        case .missing: return "Missing"
        case .submitted: return "Submitted"
        case .approved: return "Approved"
        case .expired: return "Expired"
        }
    }
}

/// A single form record for a player.
struct PlayerForm: Identifiable, Codable {
    let id: String
    var teamId: String
    var rosterEntryId: String
    var type: FormType
    var status: FormStatus
    var expiresAt: Date?
    var dueDate: Date?
    var signedByName: String
    var signedAt: Date?
    var submittedBy: String

    init(
        id: String,
        teamId: String,
        rosterEntryId: String,
        type: FormType,
        status: FormStatus,
        expiresAt: Date? = nil,
        dueDate: Date? = nil,
        signedByName: String = "",
        signedAt: Date? = nil,
        submittedBy: String = ""
    ) {
        self.id = id
        self.teamId = teamId
        self.rosterEntryId = rosterEntryId
        self.type = type
        self.status = status
        self.expiresAt = expiresAt
        self.dueDate = dueDate
        self.signedByName = signedByName
        self.signedAt = signedAt
        self.submittedBy = submittedBy
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
        self.expiresAt = (data["expiresAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.dueDate = (data["dueDate"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.signedByName = data["signedByName"] as? String ?? ""
        self.signedAt = (data["signedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.submittedBy = data["submittedBy"] as? String ?? ""
    }

    var isOverdue: Bool {
        guard status == .missing || status == .submitted, let dueDate else { return false }
        return dueDate < Date()
    }
}

/// Paperwork a family uploaded from the web portal.
///
/// The portal files an upload at `teams/{teamId}/roster/{entryId}/forms/{formId}` with a
/// `documentUrl` (a Storage download URL) beside the requirement's own fields. iOS read
/// neither the URL nor that collection -- `fetchForms` had no caller at all -- so a coach
/// reviewing a physical saw an empty requirement while the PDF sat one path away.
///
/// This decoder is deliberately narrow and does not reuse `PlayerForm`: `PlayerForm`
/// requires a `FormType`, and a coach-created form's id is not one of its three cases, so
/// those rows were dropped silently. A document only needs to be identified and opened.
struct UploadedDocument: Identifiable, Hashable {
    let id: String
    let formId: String
    let status: FormStatus
    let signedByName: String
    let signedAt: Date?
    let fileName: String
    let url: URL?

    init?(id: String, data: [String: Any]) {
        let rawURL = (data["documentUrl"] as? String) ?? ""
        self.id = id
        self.formId = data["formId"] as? String ?? id
        self.status = FormStatus(rawValue: data["status"] as? String ?? "") ?? .submitted
        self.signedByName = data["signedByName"] as? String ?? ""
        self.signedAt = (data["signedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.fileName = data["documentName"] as? String
            ?? data["fileName"] as? String
            ?? ""
        self.url = rawURL.isEmpty ? nil : URL(string: rawURL)
    }
}

/// Whether a player is cleared to play.
enum EligibilityStatus: Equatable {
    case eligible
    case injured
    case ineligible(missingForms: [String])

    var isEligible: Bool {
        if case .eligible = self { return true }
        return false
    }

    var label: String {
        switch self {
        case .eligible: return "Eligible"
        case .injured: return "Injured"
        case .ineligible: return "Ineligible"
        }
    }

    var missingForms: [String] {
        if case .ineligible(let forms) = self { return forms }
        return []
    }
}

/// Eligibility is driven ONLY by forms the AD/coach has actually issued
/// (published) for the team. If nothing has been issued, every player is
/// eligible. A player is also not eligible to play while injured.
enum EligibilityEngine {

    static func evaluate(publishedForms: [TeamForm],
                         submissions: [String: FormSubmission],
                         injury: InjuryStatus,
                         now: Date = Date()) -> EligibilityStatus {
        var missing: [String] = []

        for form in publishedForms where form.published {
            guard let submission = submissions[form.id] else {
                missing.append(form.title)
                continue
            }
            if submission.status == .expired {
                missing.append(form.title)
                continue
            }
            if submission.status == .missing {
                missing.append(form.title)
                continue
            }
            // A parent co-signature is part of completing the form.
            if form.requiresParentSignature && submission.parentSignedByName.isEmpty {
                missing.append(form.title)
                continue
            }
            // Overdue and not signed.
            if let due = form.dueDate, due < now, submission.signedAt == nil {
                missing.append(form.title)
            }
        }

        if !missing.isEmpty {
            return .ineligible(missingForms: missing)
        }
        if injury == .injured {
            return .injured
        }
        return .eligible
    }
}
