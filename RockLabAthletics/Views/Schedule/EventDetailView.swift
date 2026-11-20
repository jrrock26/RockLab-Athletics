import SwiftUI

struct EventDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let event: Event
    let vm: ScheduleViewModel
    @State private var access = TeamAccess()
    @State private var plans: [ReleasePlan] = []
    @State private var travelError = ""

    /// Athletes this account is the guardian of. Deliberately not the athlete's
    /// own account: a minor cannot sign themselves out.
    private var myAthletes: [RosterEntry] {
        let linked = auth.user?.linkedPlayerIds ?? []
        return vm.roster.filter { entry in
            guard let playerUid = entry.userId else { return false }
            return linked.contains(playerUid) && playerUid != (auth.user?.id ?? "")
        }
    }

    /// The team's parents, taken from the roster the coach already maintains.
    /// Team membership records are not readable by parents, and loosening that
    /// would expose every member's email — so the roster is the directory.
    private var candidatePickups: [String] {
        let names = vm.roster
            .map { $0.parentName.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return Array(Set(names)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func plan(for entry: RosterEntry) -> ReleasePlan? {
        plans.first { $0.id == entry.id }
    }

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

            if !myAthletes.isEmpty {
                Section {
                    ForEach(myAthletes) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(entry.playerName)
                                .font(.subheadline.weight(.semibold))

                            Picker("Getting home", selection: Binding(
                                get: { plan(for: entry)?.homeWith ?? "" },
                                set: { newValue in Task { await setHome(entry, newValue) } }
                            )) {
                                Text("Choose…").tag("")
                                Text("Riding the bus").tag("bus")
                                Text("I'll pick up").tag("me")
                                Text("Another parent").tag("other_parent")
                                Text("Not attending").tag("not_attending")
                            }
                            .pickerStyle(.menu)

                            if plan(for: entry)?.homeWith == "other_parent" {
                                Picker("With", selection: Binding(
                                    get: { plan(for: entry)?.pickupName ?? "" },
                                    set: { newValue in Task { await setPickup(entry, newValue) } }
                                )) {
                                    Text("Choose parent…").tag("")
                                    ForEach(candidatePickups, id: \.self) { name in
                                        Text(name).tag(name)
                                    }
                                }
                                .pickerStyle(.menu)
                            }

                            if let current = plan(for: entry) {
                                Text(current.summary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    Text("Travel & pickup")
                } footer: {
                    Text("Choosing another parent records your consent for them to take your athlete home.")
                }
            }

            if access.canManageTeam || access.hasPerm(.attendance) {
                Section("Release manifest") {
                    if vm.roster.isEmpty {
                        Text("No players on the roster yet.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(vm.roster) { entry in
                        if let current = plan(for: entry) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.playerName).font(.subheadline)
                                Text(current.summary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            HStack {
                                Text(entry.playerName).font(.subheadline)
                                Spacer()
                                Label("No plan", systemImage: "exclamationmark.triangle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                }
            }

            if !travelError.isEmpty {
                Section {
                    Text(travelError).foregroundStyle(.red).font(.footnote)
                }
            }

            if access.canSeeAllEvents {
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
            }

            if access.hasPerm(.attendance) {
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
        }
        .navigationTitle(event.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: event.teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.loadEventDetail(teamId: event.teamId, eventId: event.id, userId: auth.user?.id ?? "", access: access)
            await loadPlans()
        }
    }

    // MARK: - Travel & pickup

    private func loadPlans() async {
        plans = (try? await FirestoreService.shared.fetchReleasePlans(eventId: event.id)) ?? []
    }

    private func setHome(_ entry: RosterEntry, _ value: String) async {
        guard !value.isEmpty else { return }
        travelError = ""
        let existing = plan(for: entry)
        // Clear a stale pickup when the choice is no longer "another parent",
        // otherwise the manifest keeps showing a name that no longer applies.
        let keepPickup = value == "other_parent"
        do {
            try await FirestoreService.shared.saveReleasePlan(
                eventId: event.id,
                rosterEntryId: entry.id,
                athleteName: entry.playerName,
                homeWith: value,
                pickupUserId: "",
                pickupName: keepPickup ? (existing?.pickupName ?? "") : "",
                declaredByUserId: auth.user?.id ?? "",
                declaredByName: auth.user?.displayName ?? "")
            await loadPlans()
        } catch {
            travelError = error.localizedDescription
        }
    }

    private func setPickup(_ entry: RosterEntry, _ name: String) async {
        guard !name.isEmpty else { return }
        travelError = ""
        do {
            try await FirestoreService.shared.saveReleasePlan(
                eventId: event.id,
                rosterEntryId: entry.id,
                athleteName: entry.playerName,
                homeWith: "other_parent",
                pickupUserId: "",
                pickupName: name,
                declaredByUserId: auth.user?.id ?? "",
                declaredByName: auth.user?.displayName ?? "")
            await loadPlans()
        } catch {
            travelError = error.localizedDescription
        }
    }
}
