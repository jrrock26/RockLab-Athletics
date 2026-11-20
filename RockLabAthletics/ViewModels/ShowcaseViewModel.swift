import Foundation
import Observation

/// Drives the recruiting showcase (bio, career stats, highlight reels).
@Observable
final class ShowcaseViewModel {
    var showcase: Showcase?
    var careerStats: [String: Int] = [:]
    /// Published reels that include a clip tagged to this player.
    var reels: [HighlightReel] = []
    var errorMessage: String?

    func load(rosterEntry: RosterEntry, teamId: String, sportId: String, canEdit: Bool) async {
        do {
            if let existing = try await FirestoreService.shared.fetchShowcase(rosterEntryId: rosterEntry.id) {
                showcase = existing
            } else if canEdit {
                // Only the athlete or a linked guardian may create the profile.
                try await FirestoreService.shared.createShowcase(
                    rosterEntryId: rosterEntry.id, teamId: teamId,
                    playerName: rosterEntry.playerName, position: rosterEntry.position)
                showcase = try await FirestoreService.shared.fetchShowcase(rosterEntryId: rosterEntry.id)
            }
            let stats = SportDefinitions.definition(for: sportId).stats
            careerStats = try await FirestoreService.shared.fetchCareerStats(teamId: teamId, rosterEntryId: rosterEntry.id, stats: stats)
            let published = (try? await HighlightService.shared.fetchReels(teamId: teamId, publishedOnly: true)) ?? []
            reels = published.filter { reel in
                reel.clips.contains { $0.playerId == rosterEntry.id }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Clips in a reel that belong to this player.
    func clips(for reel: HighlightReel, entryId: String) -> [ReelClip] {
        reel.clips.filter { $0.playerId == entryId }
    }

    func updateShowcase(height: String, weight: String, graduationYear: String, gpa: String, bio: String) async {
        guard var showcase else { return }
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
}

