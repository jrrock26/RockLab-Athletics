import Foundation
import Observation

/// Drives the coach/AD team-forms management screen.
@Observable
final class TeamFormsViewModel {
    var forms: [TeamForm] = []
    var submissionsByForm: [String: [FormSubmission]] = [:]
    var errorMessage: String?

    // New form draft
    var newTitle = ""
    var newDescription = ""
    var newBody = ""
    var newRequiresParentSignature = false
    var newDueDate = Date()
    var newFields: [FormField] = []

    func load(teamId: String) async {
        do {
            let loaded = try await FirestoreService.shared.fetchTeamForms(teamId: teamId)
            forms = loaded
            var subs: [String: [FormSubmission]] = [:]
            for form in loaded {
                subs[form.id] = try await FirestoreService.shared.fetchFormSubmissions(teamId: teamId, formId: form.id)
            }
            submissionsByForm = subs
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createForm(teamId: String) async -> Bool {
        let title = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return false }
        do {
            _ = try await FirestoreService.shared.createTeamForm(
                teamId: teamId, title: title, description: newDescription.trimmingCharacters(in: .whitespacesAndNewlines),
                body: newBody, dueDate: newDueDate, fields: newFields,
                requiresParentSignature: newRequiresParentSignature)
            newTitle = ""
            newDescription = ""
            newBody = ""
            newRequiresParentSignature = false
            newFields = []
            await load(teamId: teamId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func togglePublished(teamId: String, form: TeamForm) async {
        do {
            try await FirestoreService.shared.setTeamFormPublished(teamId: teamId, formId: form.id, published: !form.published)
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteForm(teamId: String, formId: String) async {
        do {
            try await FirestoreService.shared.deleteTeamForm(teamId: teamId, formId: formId)
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Unpublishes every form, which clears all form-based ineligibility.
    func resetEligibility(teamId: String) async {
        do {
            try await FirestoreService.shared.unpublishAllTeamForms(teamId: teamId)
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reviewSubmission(teamId: String, formId: String, entryId: String, status: FormStatus) async {
        do {
            try await FirestoreService.shared.reviewTeamFormSubmission(
                teamId: teamId, formId: formId, rosterEntryId: entryId, status: status)
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
