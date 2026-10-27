import SwiftUI

struct ScheduleView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = ScheduleViewModel()
    @State private var showingAdd = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.teams.isEmpty {
                    ContentUnavailableView(
                        "No teams",
                        systemImage: "calendar.badge.exclamationmark",
                        description: Text("Create a team in the Teams tab to start scheduling.")
                    )
                } else {
                    List {
                        Section {
                            Picker("Team", selection: $vm.selectedTeamId) {
                                ForEach(vm.teams) { team in
                                    Text("\(team.sportName) \(team.level)").tag(team.id)
                                }
                            }
                            .onChange(of: vm.selectedTeamId) { _, newValue in
                                Task { await vm.loadEvents(teamId: newValue) }
                            }
                        }

                        if vm.events.isEmpty {
                            Section {
                                Text("No events yet. Tap + to add one.")
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Section("Events") {
                                ForEach(vm.events) { event in
                                    NavigationLink {
                                        EventDetailView(event: event, vm: vm)
                                    } label: {
                                        EventRow(event: event)
                                    }
                                }
                                .onDelete { indexSet in
                                    for index in indexSet {
                                        Task { await vm.deleteEvent(eventId: vm.events[index].id) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Schedule")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                        .disabled(vm.teams.isEmpty)
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddEventSheet(vm: vm, teamId: vm.selectedTeamId)
            }
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.loadTeams(schoolId: schoolId)
                    if !vm.selectedTeamId.isEmpty {
                        await vm.loadEvents(teamId: vm.selectedTeamId)
                    }
                }
            }
        }
    }
}

struct EventRow: View {
    let event: Event

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: event.type.systemImage)
                .foregroundStyle(.tint)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title).font(.headline)
                Text("\(event.type.displayName) · \(event.date.formatted(date: .abbreviated, time: .shortened))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if !event.location.isEmpty {
                    Text(event.location)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct AddEventSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: ScheduleViewModel
    let teamId: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Event") {
                    TextField("Title", text: $vm.newEventTitle)
                    Picker("Type", selection: $vm.newEventType) {
                        ForEach(EventType.allCases) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    DatePicker("Date & time", selection: $vm.newEventDate)
                    TextField("Location", text: $vm.newEventLocation)
                    TextField("Notes (optional)", text: $vm.newEventNotes, axis: .vertical)
                }
            }
            .navigationTitle("New Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            await vm.addEvent(teamId: teamId)
                            dismiss()
                        }
                    }
                    .disabled(vm.newEventTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

