import Foundation
import Observation

/// Drives team/roster management, forms, eligibility, and injury status.
@Observable
final class RosterViewModel {
    var teams: [Team] = []
    var roster: [RosterEntry] = []
    var eligibility: [String: EligibilityStatus] = [:]

    /// Forms the AD/coach has issued (published) for this team.
    var publishedForms: [TeamForm] = []
    /// formId -> rosterEntryId -> submission
    var submissionsByForm: [String: [String: FormSubmission]] = [:]

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

    /// Coaches see only the teams they personally coach — never the whole
    /// school's list.
    func loadMyTeams(userId: String, teamIds: [String]) async {
        do {
            teams = try await FirestoreService.shared.fetchTeams(forUser: userId, teamIds: teamIds)
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
            AnalyticsService.log(AnalyticsService.Event.teamCreated, [
                "sport": sport.id,
                "level": newTeamLevel,
                "season": newTeamSeason,
            ])
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: Roster

    func loadRoster(teamId: String, includeEligibility: Bool = true) async {
        selectedTeamId = teamId
        do {
            roster = try await FirestoreService.shared.fetchRoster(teamId: teamId)
            if includeEligibility {
                await reloadEligibility(teamId: teamId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Recomputes eligibility from the forms that are actually issued.
    /// With no published forms, every player is eligible.
    func reloadEligibility(teamId: String) async {
        let published = (try? await FirestoreService.shared.fetchTeamForms(teamId: teamId, publishedOnly: true)) ?? []
        publishedForms = published

        var byForm: [String: [String: FormSubmission]] = [:]
        for form in published {
            let submissions = (try? await FirestoreService.shared.fetchFormSubmissions(teamId: teamId, formId: form.id)) ?? []
            var map: [String: FormSubmission] = [:]
            for submission in submissions { map[submission.rosterEntryId] = submission }
            byForm[form.id] = map
        }
        submissionsByForm = byForm

        var result: [String: EligibilityStatus] = [:]
        for entry in roster {
            var mine: [String: FormSubmission] = [:]
            for form in published {
                if let submission = byForm[form.id]?[entry.id] { mine[form.id] = submission }
            }
            result[entry.id] = EligibilityEngine.evaluate(
                publishedForms: published,
                submissions: mine,
                injury: entry.injuryStatus
            )
        }
        eligibility = result
    }


    func addPlayer(teamId: String) async {
        let name = newPlayerName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let id = try await FirestoreService.shared.addRosterEntry(
                teamId: teamId, playerName: name, jerseyNumber: newPlayerJersey, position: newPlayerPosition)
            roster.append(RosterEntry(id: id, teamId: teamId, playerName: name,
                                      jerseyNumber: newPlayerJersey, position: newPlayerPosition))
            await reloadEligibility(teamId: teamId)
            newPlayerName = ""
            newPlayerJersey = ""
            newPlayerPosition = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func importCSV(teamId: String) async {
        _ = await importRosterAndInviteParents(teamId: teamId)
    }

    /// Bulk onboarding: `Name, Jersey, Position, Parent Email` per line.
    /// Creates the roster entries, then invites every parent in one server call.
    @discardableResult
    func importRosterAndInviteParents(teamId: String) async -> String {
        let rows = csvText.split(whereSeparator: \.isNewline).map(String.init)
        var invites: [[String: String]] = []
        var added = 0
        var skipped = 0

        for row in rows {
            let cols = row.split(separator: ",", omittingEmptySubsequences: false)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            guard !cols.isEmpty, !cols[0].isEmpty else { continue }
            let name = cols[0]
            let jersey = cols.count > 1 ? cols[1] : ""
            let position = cols.count > 2 ? cols[2] : ""
            let parentEmail = cols.count > 3 ? cols[3] : ""

            do {
                let id = try await FirestoreService.shared.addRosterEntry(
                    teamId: teamId, playerName: name, jerseyNumber: jersey, position: position)
                roster.append(RosterEntry(id: id, teamId: teamId, playerName: name,
                                          jerseyNumber: jersey, position: position))
                added += 1
                if !parentEmail.isEmpty {
                    invites.append(["email": parentEmail, "rosterEntryId": id, "name": name])
                }
            } catch {
                skipped += 1
            }
        }

        csvText = ""
        await reloadEligibility(teamId: teamId)

        guard !invites.isEmpty else {
            return "\(added) player(s) added. No parent emails in the file."
        }

        do {
            let result = try await FunctionsService.shared.bulkInviteParents(teamId: teamId, invites: invites)
            let created = result["created"] as? Int ?? 0
            let dupes = result["skipped"] as? Int ?? 0
            let bad = result["invalid"] as? Int ?? 0
            let emailOK = result["emailConfigured"] as? Bool ?? false
            var summary = "\(added) player(s) added · \(created) parent invite(s) sent."
            if dupes > 0 { summary += " \(dupes) already invited." }
            if bad > 0 { summary += " \(bad) invalid email(s)." }
            if !emailOK { summary += " Email delivery isn't configured yet — invites are in the app only." }
            AnalyticsService.log("bulk_import", ["players": added, "invites": created])
            return summary
        } catch {
            return "\(added) player(s) added, but parent invitations failed: \(error.localizedDescription)"
        }
    }

    func dropPlayer(teamId: String, entryId: String) async {
        do {
            try await FirestoreService.shared.removeRosterEntry(teamId: teamId, entryId: entryId)
            roster.removeAll { $0.id == entryId }
            eligibility.removeValue(forKey: entryId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Injury

    /// Files an injury report and marks the player injured / limited.
    func reportInjury(teamId: String,
                      entryId: String,
                      status: InjuryStatus,
                      bodyPart: String,
                      details: String,
                      severity: String,
                      expectedReturn: String) async -> Bool {
        do {
            _ = try await FunctionsService.shared.reportPlayerInjury(
                teamId: teamId,
                rosterEntryId: entryId,
                status: status.rawValue,
                bodyPart: bodyPart,
                details: details,
                severity: severity,
                expectedReturn: expectedReturn)
            AnalyticsService.log(AnalyticsService.Event.injuryReported, [
                "status": status.rawValue,
                "severity": severity.isEmpty ? "unspecified" : severity,
            ])
            await loadRoster(teamId: teamId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Clears a player to return to full participation.
    func clearInjury(teamId: String, entryId: String) async -> Bool {
        do {
            _ = try await FunctionsService.shared.clearPlayerInjury(teamId: teamId, rosterEntryId: entryId)
            AnalyticsService.log(AnalyticsService.Event.injuryCleared)
            await loadRoster(teamId: teamId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func injuryReports(teamId: String, entryId: String) async -> [InjuryReport] {
        (try? await FirestoreService.shared.fetchInjuryReports(teamId: teamId, rosterEntryId: entryId)) ?? []
    }
}

