import Foundation
import Observation

/// Drives the recruiting showcase (bio, career stats, highlights).
@Observable
final class ShowcaseViewModel {
    var showcase: Showcase?
    var highlights: [Highlight] = []
    var careerStats: [String: Int] = [:]
    var errorMessage: String?

    // Highlight form
    var newHighlightTitle = ""
    var newHighlightURL = ""
    var newHighlightDescription = ""

    func load(rosterEntry: RosterEntry, teamId: String) async {
        do {
            if let existing = try await FirestoreService.shared.fetchShowcase(rosterEntryId: rosterEntry.id) {
                showcase = existing
            } else {
                try await FirestoreService.shared.createShowcase(
                    rosterEntryId: rosterEntry.id, teamId: teamId,
                    playerName: rosterEntry.playerName, position: rosterEntry.position)
                showcase = try await FirestoreService.shared.fetchShowcase(rosterEntryId: rosterEntry.id)
            }
            highlights = try await FirestoreService.shared.fetchHighlights(showcaseId: rosterEntry.id)
            careerStats = try await FirestoreService.shared.fetchCareerStats(teamId: teamId, rosterEntryId: rosterEntry.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateShowcase(position: String, height: String, weight: String, graduationYear: String, gpa: String, bio: String) async {
        guard var showcase else { return }
        showcase.position = position
        showcase.height = height
        showcase.weight = weight
        showcase.graduationYear = graduationYear
        showcase.gpa = gpa
        showcase.bio = bio
        self.showcase = showcase
        do {
            try await FirestoreService.shared.saveShowcase(showcase)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addHighlight(showcaseId: String) async {
        let title = newHighlightTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        do {
            let id = try await FirestoreService.shared.addHighlight(
                showcaseId: showcaseId, title: title, url: newHighlightURL, description: newHighlightDescription)
            highlights.insert(Highlight(id: id, title: title, url: newHighlightURL, description: newHighlightDescription, createdAt: Date()), at: 0)
            newHighlightTitle = ""
            newHighlightURL = ""
            newHighlightDescription = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeHighlight(showcaseId: String, highlightId: String) async {
        do {
            try await FirestoreService.shared.removeHighlight(showcaseId: showcaseId, highlightId: highlightId)
            highlights.removeAll { $0.id == highlightId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
