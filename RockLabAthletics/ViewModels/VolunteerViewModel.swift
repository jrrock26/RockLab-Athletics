import Foundation
import Observation

/// Drives the volunteer shift sign-up screen.
@Observable
final class VolunteerViewModel {
    var shifts: [VolunteerShift] = []
    var signupsByShift: [String: [ShiftSignup]] = [:]
    var errorMessage: String?

    // New shift form
    var newTitle = ""
    var newDate = Date()
    var newStart = Date()
    var newEnd = Date().addingTimeInterval(8 * 3600)
    var newSlotsPerShift = 4
    var newIncrementMinutes = 60
    var newPlayersCanVolunteer = true
    var newNote = ""

    func load(teamId: String) async {
        do {
            let loaded = try await FirestoreService.shared.fetchVolunteerShifts(teamId: teamId)
            shifts = loaded
            var s: [String: [ShiftSignup]] = [:]
            for shift in loaded {
                s[shift.id] = try await FirestoreService.shared.fetchShiftSignups(teamId: teamId, shiftId: shift.id)
            }
            signupsByShift = s
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createShift(teamId: String) async -> Bool {
        let title = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return false }
        let startCombined = combine(date: newDate, time: newStart)
        let endCombined = combine(date: newDate, time: newEnd)
        guard endCombined > startCombined else {
            errorMessage = "End time must be after the start time."
            return false
        }
        do {
            _ = try await FirestoreService.shared.createVolunteerShift(
                teamId: teamId, title: title,
                start: startCombined,
                end: endCombined,
                slotsPerShift: max(1, newSlotsPerShift),
                incrementMinutes: max(15, newIncrementMinutes),
                playersCanVolunteer: newPlayersCanVolunteer,
                note: newNote)
            newTitle = ""
            newNote = ""
            await load(teamId: teamId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteShift(teamId: String, shiftId: String) async {
        do {
            try await FirestoreService.shared.deleteVolunteerShift(teamId: teamId, shiftId: shiftId)
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signUp(teamId: String, shiftId: String, slotIndex: Int, participantUserId: String? = nil) async {
        do {
            _ = try await FunctionsService.shared.volunteerSignUp(
                teamId: teamId, shiftId: shiftId, slotIndex: slotIndex, participantUserId: participantUserId)
            AnalyticsService.log(AnalyticsService.Event.volunteerSignup, [
                "for_player": participantUserId != nil,
            ])
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancelSignUp(teamId: String, shiftId: String, participantUserId: String? = nil) async {
        do {
            _ = try await FunctionsService.shared.volunteerCancelSignUp(
                teamId: teamId, shiftId: shiftId, participantUserId: participantUserId)
            await load(teamId: teamId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func combine(date: Date, time: Date) -> Date {
        let cal = Calendar.current
        let dc = cal.dateComponents([.hour, .minute], from: time)
        return cal.date(bySettingHour: dc.hour ?? 0, minute: dc.minute ?? 0, second: 0, of: date) ?? date
    }
}
