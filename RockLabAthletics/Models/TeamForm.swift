import Foundation

/// The types of fields a coach can put on a team form.
enum FormFieldType: String, Codable, CaseIterable, Identifiable {
    case text, checkbox, signature

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .text: return "Text"
        case .checkbox: return "Checkbox"
        case .signature: return "Signature"
        }
    }
}

/// A single question/field on a team form.
struct FormField: Identifiable, Codable, Hashable {
    let id: String
    var type: FormFieldType
    var label: String
    var required: Bool

    init(id: String = UUID().uuidString, type: FormFieldType, label: String, required: Bool = true) {
        self.id = id
        self.type = type
        self.label = label
        self.required = required
    }

    init?(id: String, data: [String: Any]) {
        guard let typeRaw = data["type"] as? String,
              let type = FormFieldType(rawValue: typeRaw) else { return nil }
        self.id = id
        self.type = type
        self.label = data["label"] as? String ?? ""
        self.required = data["required"] as? Bool ?? true
    }
}

/// A coach-published form template for a team (permission slip, waiver, etc.).
struct TeamForm: Identifiable, Codable {
    let id: String
    var teamId: String
    var title: String
    var description: String
    var body: String
    var dueDate: Date?
    var published: Bool
    var fields: [FormField]
    var requiresParentSignature: Bool

    init(id: String, teamId: String, title: String, description: String, body: String = "", dueDate: Date? = nil, published: Bool = false, fields: [FormField] = [], requiresParentSignature: Bool = false) {
        self.id = id
        self.teamId = teamId
        self.title = title
        self.description = description
        self.body = body
        self.dueDate = dueDate
        self.published = published
        self.fields = fields
        self.requiresParentSignature = requiresParentSignature
    }

    init?(id: String, data: [String: Any]) {
        guard let title = data["title"] as? String else { return nil }
        self.id = id
        self.teamId = data["teamId"] as? String ?? ""
        self.title = title
        self.description = data["description"] as? String ?? ""
        self.body = data["body"] as? String ?? ""
        self.dueDate = (data["dueDate"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.published = data["published"] as? Bool ?? false
        self.requiresParentSignature = data["requiresParentSignature"] as? Bool ?? false
        let rawFields = data["fields"] as? [[String: Any]] ?? []
        self.fields = rawFields.enumerated().compactMap { index, f in
            FormField(id: (f["id"] as? String) ?? "field_\(index)", data: f)
        }
    }

    var isOverdue: Bool {
        guard let dueDate else { return false }
        return dueDate < Date()
    }
}

/// A player's completion of a team form.
struct FormSubmission: Identifiable, Codable {
    let id: String          // rosterEntryId (one submission per player per form)
    var formId: String
    var rosterEntryId: String
    var playerName: String
    var status: FormStatus
    var signedByName: String
    var signedAt: Date?
    var submittedBy: String
    var responses: [String: String]  // fieldId -> value
    var requiresParentSignature: Bool
    var parentSignedByName: String

    init(
        id: String,
        formId: String,
        rosterEntryId: String,
        playerName: String,
        status: FormStatus,
        signedByName: String = "",
        signedAt: Date? = nil,
        submittedBy: String = "",
        responses: [String: String] = [:],
        requiresParentSignature: Bool = false,
        parentSignedByName: String = ""
    ) {
        self.id = id
        self.formId = formId
        self.rosterEntryId = rosterEntryId
        self.playerName = playerName
        self.status = status
        self.signedByName = signedByName
        self.signedAt = signedAt
        self.submittedBy = submittedBy
        self.responses = responses
        self.requiresParentSignature = requiresParentSignature
        self.parentSignedByName = parentSignedByName
    }

    init?(id: String, data: [String: Any]) {
        guard let formId = data["formId"] as? String else { return nil }
        self.id = id
        self.formId = formId
        self.rosterEntryId = data["rosterEntryId"] as? String ?? id
        self.playerName = data["playerName"] as? String ?? ""
        self.status = FormStatus(rawValue: data["status"] as? String ?? "") ?? .submitted
        self.signedByName = data["signedByName"] as? String ?? ""
        self.signedAt = (data["signedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        self.submittedBy = data["submittedBy"] as? String ?? ""
        self.responses = data["responses"] as? [String: String] ?? [:]
        self.requiresParentSignature = data["requiresParentSignature"] as? Bool ?? false
        self.parentSignedByName = data["parentSignedByName"] as? String ?? ""
    }

    /// True when a parent signature is required but hasn't been provided yet.
    var isAwaitingParentSignature: Bool {
        requiresParentSignature && parentSignedByName.isEmpty
    }
}

