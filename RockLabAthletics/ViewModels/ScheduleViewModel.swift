import Foundation
import Observation

/// Drives the schedule, RSVP, and attendance features.
@Observable
final class ScheduleViewModel {
    var teams: [Team] = []
    var selectedTeamId = ""
    var events: [Event] = []
    var errorMessage: String?

    // Event detail state
    var roster: [RosterEntry] = []
    var attendance: [String: AttendanceStatus] = [:]
    var myRSVP: RSVPStatus = .pending

    // New event form
    var newEventTitle = ""
    var newEventType: EventType = .practice
    var newEventDate = Date()
    var newEventLocation = ""
    var newEventNotes = ""

    // MARK: Teams & events

    func loadTeams(schoolId: String) async {
        do {
            teams = try await FirestoreService.shared.fetchTeams(schoolId: schoolId)
            if selectedTeamId.isEmpty, let first = teams.first {
                selectedTeamId = first.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadEvents(teamId: String) async {
        selectedTeamId = teamId
        do {
            events = try await FirestoreService.shared.fetchEvents(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addEvent(teamId: String) async {
        let title = newEventTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        do {
            let id = try await FirestoreService.shared.createEvent(
                teamId: teamId, title: title, type: newEventType, date: newEventDate,
                location: newEventLocation, notes: newEventNotes)
            events.append(Event(id: id, teamId: teamId, title: title, type: newEventType,
                                date: newEventDate, location: newEventLocation, notes: newEventNotes))
            events.sort { $0.date < $1.date }
            newEventTitle = ""
            newEventLocation = ""
            newEventNotes = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteEvent(eventId: String) async {
        do {
            try await FirestoreService.shared.deleteEvent(eventId: eventId)
            events.removeAll { $0.id == eventId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Event detail (RSVP + attendance)

    func loadEventDetail(teamId: String, eventId: String, userId: String) async {
        do {
            roster = try await FirestoreService.shared.fetchRoster(teamId: teamId)
            attendance = try await FirestoreService.shared.fetchAttendance(eventId: eventId)
            myRSVP = try await FirestoreService.shared.fetchRSVP(eventId: eventId, userId: userId) ?? .pending
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setMyRSVP(eventId: String, userId: String, status: RSVPStatus) async {
        do {
            try await FirestoreService.shared.setRSVP(eventId: eventId, userId: userId, status: status)
            myRSVP = status
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setAttendance(eventId: String, rosterEntryId: String, status: AttendanceStatus) async {
        do {
            try await FirestoreService.shared.setAttendance(eventId: eventId, rosterEntryId: rosterEntryId, status: status)
            attendance[rosterEntryId] = status
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
