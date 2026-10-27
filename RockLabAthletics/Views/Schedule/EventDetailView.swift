import SwiftUI

struct EventDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let event: Event
    let vm: ScheduleViewModel

    var body: some View {
        List {
            Section("Details") {
                LabeledContent("Type", value: event.type.displayName)
                LabeledContent("When", value: event.date.formatted(date: .abbreviated, time: .shortened))
                if !event.location.isEmpty {
                    LabeledContent("Where", value: event.location)
                }
                if !event.notes.isEmpty {
                    LabeledContent("Notes", value: event.notes)
                }
            }

            Section("My RSVP") {
                HStack(spacing: 12) {
                    ForEach([RSVPStatus.attending, RSVPStatus.notAttending]) { status in
                        Button {
                            Task {
                                await vm.setMyRSVP(eventId: event.id, userId: auth.user?.id ?? "", status: status)
                            }
                        } label: {
                            Text(status.displayName)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(status == vm.myRSVP ? Color.accentColor : Color.gray)
                    }
                }
            }

            Section("Attendance") {
                if vm.roster.isEmpty {
                    Text("No players on the roster yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.roster) { entry in
                        HStack {
                            Text(entry.playerName)
                            Spacer()
                            Menu {
                                ForEach(AttendanceStatus.allCases) { status in
                                    Button(status.displayName) {
                                        Task {
                                            await vm.setAttendance(eventId: event.id, rosterEntryId: entry.id, status: status)
                                        }
                                    }
                                }
                            } label: {
                                Text((vm.attendance[entry.id] ?? .pending).displayName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(event.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await vm.loadEventDetail(teamId: event.teamId, eventId: event.id, userId: auth.user?.id ?? "")
        }
    }
}
