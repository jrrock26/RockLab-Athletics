import SwiftUI

struct ScheduleView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = ScheduleViewModel()
    @State private var showingAdd = false
    @State private var access = TeamAccess()
    @State private var showingResources = false

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
                                Task {
                                    access = await FirestoreService.shared.teamAccess(teamId: newValue, userId: auth.user?.id, isAd: auth.user?.role == .ad)
                                    await vm.loadEvents(teamId: newValue, gamesOnly: !access.canSeeAllEvents)
                                }
                            }
                        }

                        if vm.events.isEmpty {
                            Section {
                                Text(access.canManageTeam ? "No events yet. Tap + to add one." : "No events scheduled.")
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
                                .deleteDisabled(!access.canManageTeam)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Schedule")
            .toolbar {
                if access.canManageTeam || auth.user?.role == .ad {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { showingResources = true } label: {
                            Image(systemName: "building.2.crop.circle")
                        }
                        .accessibilityLabel("Facilities and buses")
                    }
                }
                if access.canManageTeam {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showingAdd = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add event")
                            .disabled(vm.teams.isEmpty)
                    }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddEventSheet(vm: vm, teamId: vm.selectedTeamId)
            }
            .sheet(isPresented: $showingResources) {
                ResourceBookingView(
                    schoolId: auth.user?.schoolId ?? "",
                    teamId: vm.selectedTeamId,
                    isAd: auth.user?.role == .ad)
            }
            .task {
                if let schoolId = auth.user?.schoolId {
                    await vm.loadTeams(schoolId: schoolId, userTeamIds: auth.user?.role == .ad ? nil : auth.user?.teamIds)
                    if !vm.selectedTeamId.isEmpty {
                        access = await FirestoreService.shared.teamAccess(teamId: vm.selectedTeamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
                        await vm.loadEvents(teamId: vm.selectedTeamId, gamesOnly: !access.canSeeAllEvents)
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

// MARK: - Facilities, fields and buses

/// Books an organization asset for a time window, like reserving a conference
/// room. The AD adds assets once; coaches pick a date and see what is free.
/// Overlap is refused by the server in a transaction, so the UI can show
/// availability but never has the final say.
private struct ResourceBookingView: View {
    let schoolId: String
    let teamId: String
    let isAd: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var resources: [OrgResource] = []
    @State private var bookings: [ResourceBooking] = []
    @State private var selectedResourceId = ""
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(3600)
    @State private var title = "Practice"
    @State private var errorMessage = ""
    @State private var busy = false
    @State private var newName = ""
    @State private var newType = "facility"
    @State private var newNotes = ""
    @State private var newOpen = 6
    @State private var newClose = 22
    @State private var repeats = false
    @State private var weekdays: Set<Int> = []
    @State private var weeks = 4
    @State private var addToSchedule = true
    @State private var resultMessage = ""

    private func weekdayLetter(_ swiftWeekday: Int) -> String {
        let symbols = ["S", "M", "T", "W", "T", "F", "S"]
        return symbols[(swiftWeekday - 1) % 7]
    }

    private func toggleDay(_ day: Int) {
        if weekdays.contains(day) { weekdays.remove(day) } else { weekdays.insert(day) }
    }

    private var selectedResource: OrgResource? {
        resources.first { $0.id == selectedResourceId }
    }

    private var dayBookings: [ResourceBooking] {
        let calendar = Calendar.current
        return bookings.filter {
            $0.isActive && calendar.isDate($0.startDate, inSameDayAs: start)
        }
    }

    private var bookingsForSelected: [ResourceBooking] {
        dayBookings.filter { $0.resourceId == selectedResourceId }
            .sorted { $0.startMs < $1.startMs }
    }

    var body: some View {
        NavigationStack {
            Form {
                if isAd {
                    Section {
                        TextField("High School Gym", text: $newName)
                        Picker("Type", selection: $newType) {
                            Text("Facility").tag("facility")
                            Text("Field").tag("field")
                            Text("Bus").tag("bus")
                            Text("Other").tag("other")
                        }
                        TextField("Notes (optional)", text: $newNotes, axis: .vertical)
                        Button("Add resource") { Task { await addResource() } }
                            .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                        Stepper("Opens \(newOpen):00", value: $newOpen, in: 0...23)
                        Stepper("Closes \(newClose):00", value: $newClose, in: 1...24)
                    } header: {
                        Text("Add a resource")
                    } footer: {
                        Text("Assets are permanent until you retire them. Add as many as the organization owns.")
                        Text("Notes are visible to every coach who books this asset, and to every athletic director signed in. Do not put gate codes, lockbox combinations, alarm codes, key locations or other credentials here.")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Book") {
                    if resources.isEmpty {
                        Text("No resources yet. An athletic director adds them.")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Resource", selection: $selectedResourceId) {
                            ForEach(resources) { resource in
                                Label(resource.name, systemImage: resource.symbol).tag(resource.id)
                            }
                        }
                        TextField("What is it for?", text: $title)
                        DatePicker("Start", selection: $start)
                        DatePicker("End", selection: $end, in: start...)
                        if let resource = selectedResource {
                            Text("Bookable \(resource.openLabel)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Toggle("Repeat weekly", isOn: $repeats)
                        if repeats {
                            HStack(spacing: 6) {
                                ForEach(1...7, id: \.self) { day in
                                    Button(weekdayLetter(day)) { toggleDay(day) }
                                        .buttonStyle(.bordered)
                                        .tint(weekdays.contains(day) ? Color.accentColor : Color.gray)
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            Stepper("For \(weeks) week(s)", value: $weeks, in: 1...16)
                        }

                        Toggle("Add to schedule", isOn: $addToSchedule)

                        Button(busy ? "Booking…" : "Book") { Task { await book() } }
                            .disabled(busy || selectedResourceId.isEmpty || end <= start)
                    }
                }

                Section {
                    if bookingsForSelected.isEmpty {
                        Label("Free all day", systemImage: "checkmark.circle")
                            .foregroundStyle(.green)
                    } else {
                        ForEach(bookingsForSelected) { booking in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(booking.startDate.formatted(date: .omitted, time: .shortened)) – \(booking.endDate.formatted(date: .omitted, time: .shortened))")
                                        .font(.subheadline.weight(.semibold))
                                    Text(booking.teamName.isEmpty ? booking.bookedByName : booking.teamName)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Cancel") { Task { await cancel(booking) } }
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                } header: {
                    Text("\(selectedResource?.name ?? "Resource") on \(start.formatted(date: .abbreviated, time: .omitted))")
                } footer: {
                    Text("If this is taken, check the other resources below.")
                }

                Section("Everything booked that day") {
                    if dayBookings.isEmpty {
                        Text("Nothing booked yet.").foregroundStyle(.secondary)
                    }
                    ForEach(dayBookings.sorted { $0.startMs < $1.startMs }) { booking in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(booking.resourceName).font(.subheadline.weight(.semibold))
                            Text("\(booking.startDate.formatted(date: .omitted, time: .shortened)) – \(booking.endDate.formatted(date: .omitted, time: .shortened)) · \(booking.teamName)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if !resultMessage.isEmpty {
                    Section { Text(resultMessage).foregroundStyle(.green).font(.footnote) }
                }

                if !errorMessage.isEmpty {
                    Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle("Facilities & buses")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await load()
                if weekdays.isEmpty {
                    weekdays = [Calendar.current.component(.weekday, from: start)]
                }
            }
        }
    }

    private func load() async {
        guard !schoolId.isEmpty else { return }
        resources = (try? await FirestoreService.shared.fetchResources(schoolId: schoolId)) ?? []
        bookings = (try? await FirestoreService.shared.fetchResourceBookings(schoolId: schoolId)) ?? []
        if selectedResourceId.isEmpty { selectedResourceId = resources.first?.id ?? "" }
    }

    private func addResource() async {
        busy = true
        errorMessage = ""
        do {
            _ = try await FunctionsService.shared.createResource(
                name: newName.trimmingCharacters(in: .whitespaces),
                type: newType,
                notes: newNotes.trimmingCharacters(in: .whitespacesAndNewlines),
                openMin: newOpen * 60,
                closeMin: newClose * 60)
            newName = ""
            newNotes = ""
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    private func book() async {
        busy = true
        errorMessage = ""
        resultMessage = ""
        do {
            let result = try await FunctionsService.shared.bookResource(
                resourceId: selectedResourceId,
                teamId: teamId,
                title: title,
                start: start,
                end: end,
                weekdays: repeats ? weekdays.map { $0 - 1 }.sorted() : [],
                weeks: repeats ? weeks : 1,
                createEvent: addToSchedule,
                eventTitle: title)
            let booked = result["booked"] as? Int ?? 0
            let conflicts = (result["conflicts"] as? [[String: Any]])?.count ?? 0
            if booked == 0 {
                errorMessage = "Nothing booked — every window in this series is already taken."
            } else if conflicts > 0 {
                resultMessage = "Booked \(booked) window(s); \(conflicts) were already taken."
            } else {
                resultMessage = "Booked \(booked) window(s)\(addToSchedule ? " and added to the schedule" : "")."
            }
            await load()
        } catch {
            // The server refused: usually open hours, or a clash this screen
            // had not seen yet — which is why the check lives server-side.
            errorMessage = error.localizedDescription
        }
        busy = false
    }

    private func cancel(_ booking: ResourceBooking) async {
        busy = true
        errorMessage = ""
        do {
            _ = try await FunctionsService.shared.cancelResourceBooking(bookingId: booking.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}



