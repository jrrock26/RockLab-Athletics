import Foundation
import Observation

/// Drives team/roster management, forms, and eligibility.
@Observable
final class RosterViewModel {
    var teams: [Team] = []
    var roster: [RosterEntry] = []
    var eligibility: [String: EligibilityStatus] = [:]
    var forms: [String: [PlayerForm]] = [:]
    var selectedTeamId: String?
    var errorMessage: String?

    // New team fields
    var newTeamSportId = ""
    var newTeamLevel = "Varsity"
    var newTeamSeason = "Fall"
    var newTeamGender = "Boys"

    // Add player fields
    var newPlayerName = ""
    var newPlayerJersey = ""
    var newPlayerPosition = ""
    var csvText = ""

    // MARK: Teams

    func loadTeams(schoolId: String) async {
        do {
            teams = try await FirestoreService.shared.fetchTeams(schoolId: schoolId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createTeam(schoolId: String, headCoachId: String) async -> Bool {
        guard let sport = SportsCatalog.all.first(where: { $0.id == newTeamSportId }) else { return false }
        do {
            let team = try await FirestoreService.shared.createTeam(
                schoolId: schoolId,
                sportId: sport.id,
                sportName: sport.name,
                level: newTeamLevel,
                season: newTeamSeason,
                gender: newTeamGender,
                headCoachId: headCoachId
            )
            teams.append(team)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: Roster

    func loadRoster(teamId: String) async {
        selectedTeamId = teamId
        do {
            roster = try await FirestoreService.shared.fetchRoster(teamId: teamId)
            var elig: [String: EligibilityStatus] = [:]
            var fm: [String: [PlayerForm]] = [:]
            for entry in roster {
                let f = try await FirestoreService.shared.fetchForms(teamId: teamId, rosterEntryId: entry.id)
                fm[entry.id] = f
                elig[entry.id] = EligibilityEngine.evaluate(forms: f)
            }
            forms = fm
            eligibility = elig
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addPlayer(teamId: String) async {
        let name = newPlayerName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let id = try await FirestoreService.shared.addRosterEntry(
                teamId: teamId, playerName: name, jerseyNumber: newPlayerJersey, position: newPlayerPosition)
            roster.append(RosterEntry(id: id, teamId: teamId, playerName: name,
                                      jerseyNumber: newPlayerJersey, position: newPlayerPosition))
            eligibility[id] = .ineligible(missing: EligibilityEngine.requiredForms(), expired: [])
            forms[id] = []
            newPlayerName = ""
            newPlayerJersey = ""
            newPlayerPosition = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func importCSV(teamId: String) async {
        let rows = csvText.split(whereSeparator: \.isNewline).map(String.init)
        for row in rows {
            let cols = row.split(separator: ",", omittingEmptySubsequences: false)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            guard !cols.isEmpty, !cols[0].isEmpty else { continue }
            let name = cols[0]
            let jersey = cols.count > 1 ? cols[1] : ""
            let position = cols.count > 2 ? cols[2] : ""
            do {
                let id = try await FirestoreService.shared.addRosterEntry(
                    teamId: teamId, playerName: name, jerseyNumber: jersey, position: position)
                roster.append(RosterEntry(id: id, teamId: teamId, playerName: name,
                                          jerseyNumber: jersey, position: position))
                eligibility[id] = .ineligible(missing: EligibilityEngine.requiredForms(), expired: [])
                forms[id] = []
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        csvText = ""
    }

    func dropPlayer(teamId: String, entryId: String) async {
        do {
            try await FirestoreService.shared.removeRosterEntry(teamId: teamId, entryId: entryId)
            roster.removeAll { $0.id == entryId }
            eligibility.removeValue(forKey: entryId)
            forms.removeValue(forKey: entryId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Forms

    func setFormStatus(teamId: String, entryId: String, type: FormType, status: FormStatus, expiresAt: Date? = nil) async {
        do {
            try await FirestoreService.shared.submitForm(
                teamId: teamId, rosterEntryId: entryId, type: type, status: status, expiresAt: expiresAt)
            let updated = try await FirestoreService.shared.fetchForms(teamId: teamId, rosterEntryId: entryId)
            forms[entryId] = updated
            eligibility[entryId] = EligibilityEngine.evaluate(forms: updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
