import Foundation
import Observation

/// Drives the AD's onboarding flow: school profile → sports → coach invites.
@Observable
final class OnboardingViewModel {
    var schoolName = ""
    var mascot = ""
    var selectedSportIds: Set<String> = []
    var coachEmails: [String] = []
    var newCoachEmail = ""
    var schoolId: String?
    var errorMessage: String?

    var selectedSports: [Sport] {
        SportsCatalog.all.filter { selectedSportIds.contains($0.id) }
    }

    func toggleSport(_ id: String) {
        if selectedSportIds.contains(id) {
            selectedSportIds.remove(id)
        } else {
            selectedSportIds.insert(id)
        }
    }

    func addCoachEmail() {
        let trimmed = newCoachEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        coachEmails.append(trimmed)
        newCoachEmail = ""
    }

    /// Creates the school, promotes the caller to AD, and returns success.
    func createSchool(adUserId: String) async -> Bool {
        do {
            let schoolId = try await FirestoreService.shared.createSchool(
                name: schoolName,
                mascot: mascot,
                adUserId: adUserId,
                sports: selectedSports
            )
            try await FirestoreService.shared.updateUserRoleAndSchool(
                id: adUserId,
                role: .ad,
                schoolId: schoolId
            )
            self.schoolId = schoolId
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func sendInvite(email: String) async {
        guard let schoolId else { return }
        do {
            try await FirestoreService.shared.createInvitation(
                email: email,
                role: .coach,
                schoolId: schoolId,
                schoolName: schoolName,
                sportNames: selectedSports.map(\.name)
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
