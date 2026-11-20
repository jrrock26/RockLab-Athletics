import Foundation

/// A canned form template used to prepopulate a new team form.
/// Backed by the full `FormLibrary` document catalog.
struct FormTemplate: Identifiable {
    let id: String
    let title: String
    let description: String
    let category: String
    let requiresParentSignature: Bool
}

enum FormTemplateCatalog {

    static var all: [FormTemplate] {
        FormLibrary.all.map {
            FormTemplate(id: $0.id,
                         title: $0.title,
                         description: $0.summary,
                         category: $0.category,
                         requiresParentSignature: $0.requiresParentSignature)
        }
    }

    static var categories: [String] { FormLibrary.categories }

    static func templates(in category: String) -> [FormTemplate] {
        all.filter { $0.category == category }
    }

    static func template(id: String) -> FormTemplate? {
        all.first { $0.id == id }
    }

    /// The full document text for a template, populated with school/team data.
    static func body(id: String, schoolName: String, teamName: String, season: String = "") -> String? {
        guard let doc = FormLibrary.template(id: id) else { return nil }
        return FormLibrary.render(doc, schoolName: schoolName, teamName: teamName, season: season)
    }

    /// Best-match document template for a natural-language request.
    static func match(_ prompt: String) -> FormDocumentTemplate? {
        FormLibrary.match(prompt)
    }
}

