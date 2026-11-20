import SwiftUI

struct EventDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let event: Event
    let vm: ScheduleViewModel
    @State private var access = TeamAccess()
    @State private var plans: [ReleasePlan] = []
    @State private var releases: [ReleaseRecord] = []
    @State private var releaseTarget: RosterEntry?
    @State private var overrideTarget: RosterEntry?
    @State private var undoTarget: RosterEntry?
    @State private var undoReason = ""
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

    private func release(for entry: RosterEntry) -> ReleaseRecord? {
        releases.first { $0.id == entry.id }
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
                                Text(current.declaredByLabel)
                                    .font(.caption2)
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
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.playerName)
                                .font(.subheadline.weight(.semibold))

                            if let current = plan(for: entry) {
                                Text(current.summary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(current.declaredByLabel)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if current.isOverridden && !current.overrideReason.isEmpty {
                                    Text("Override: \(current.overrideReason)")
                                        .font(.caption2)
                                        .foregroundStyle(.orange)
                                }
                            } else {
                                Label("No plan", systemImage: "exclamationmark.triangle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }

                            if let record = release(for: entry), record.isReleased {
                                Label(record.summary, systemImage: "checkmark.seal.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.green)
                            } else if let record = release(for: entry), record.status == "reopened" {
                                Text("Release corrected: \(record.correctionReason)")
                                    .font(.caption2)
                                    .foregroundStyle(.orange)
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            if plan(for: entry) != nil, release(for: entry)?.isReleased != true {
                                Button {
                                    releaseTarget = entry
                                } label: {
                                    Label("Release", systemImage: "arrow.right.circle")
                                }
                                .tint(.green)
                            }
                            Button {
                                overrideTarget = entry
                            } label: {
                                Label("Override", systemImage: "pencil")
                            }
                            .tint(.orange)
                            if release(for: entry)?.isReleased == true {
                                Button {
                                    undoTarget = entry
                                } label: {
                                    Label("Undo", systemImage: "arrow.uturn.backward")
                                }
                                .tint(.red)
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
        .sheet(item: $releaseTarget) { entry in
            ReleaseConfirmSheet(
                eventId: event.id,
                entry: entry,
                plan: plan(for: entry),
                opponent: event.title) { type, name, note in
                    Task { await confirm(entry, type: type, name: name, note: note) }
                }
        }
        .sheet(item: $overrideTarget) { entry in
            OverridePlanSheet(
                eventId: event.id,
                entry: entry,
                current: plan(for: entry),
                pickups: candidatePickups) { homeWith, pickupName, reason in
                    Task { await applyOverride(entry, homeWith: homeWith, pickupName: pickupName, reason: reason) }
                }
        }
        .alert("Correct release", isPresented: Binding(
            get: { undoTarget != nil },
            set: { if !$0 { undoTarget = nil } }
        )) {
            TextField("Reason", text: $undoReason)
            Button("Cancel", role: .cancel) { undoTarget = nil; undoReason = "" }
            Button("Correct") {
                if let entry = undoTarget {
                    Task { await undo(entry, reason: undoReason) }
                }
                undoTarget = nil
                undoReason = ""
            }
        } message: {
            Text("The original handoff stays on the record; the correction is added to it and audited.")
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: event.teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.loadEventDetail(teamId: event.teamId, eventId: event.id, userId: auth.user?.id ?? "", access: access)
            await loadPlans()
            await loadReleases()
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

    // MARK: - Release confirmation

    private func loadReleases() async {
        releases = (try? await FirestoreService.shared.fetchReleases(eventId: event.id)) ?? []
    }

    private func confirm(_ entry: RosterEntry, type: String, name: String, note: String) async {
        travelError = ""
        do {
            _ = try await FunctionsService.shared.confirmRelease(
                eventId: event.id,
                rosterEntryId: entry.id,
                releasedToType: type,
                releasedToName: name,
                note: note)
            await loadReleases()
        } catch {
            travelError = error.localizedDescription
        }
    }

    private func undo(_ entry: RosterEntry, reason: String) async {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            travelError = "A reason is required to correct a release."
            return
        }
        travelError = ""
        do {
            _ = try await FunctionsService.shared.reopenRelease(
                eventId: event.id, rosterEntryId: entry.id, reason: trimmed)
            await loadReleases()
        } catch {
            travelError = error.localizedDescription
        }
    }

    private func applyOverride(_ entry: RosterEntry,
                               homeWith: String,
                               pickupName: String,
                               reason: String) async {
        travelError = ""
        do {
            _ = try await FunctionsService.shared.setReleasePlanOverride(
                eventId: event.id,
                rosterEntryId: entry.id,
                homeWith: homeWith,
                pickupName: pickupName,
                reason: reason)
            await loadPlans()
        } catch {
            travelError = error.localizedDescription
        }
    }
}

// MARK: - Confirm a handoff

/// Records who the athlete actually left with. This is the liability record, so
/// it asks for a name rather than quietly trusting the plan.
private struct ReleaseConfirmSheet: View {
    let eventId: String
    let entry: RosterEntry
    let plan: ReleasePlan?
    let opponent: String
    var onConfirm: (String, String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var type = "bus"
    @State private var name = ""
    @State private var note = ""
    @State private var didPrefill = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Athlete") {
                    Text(entry.playerName).font(.headline)
                    if let plan {
                        Text(plan.summary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(plan.declaredByLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Released to") {
                    Picker("Type", selection: $type) {
                        Text("Team bus").tag("bus")
                        Text("Guardian").tag("guardian")
                        Text("Another parent").tag("other_parent")
                    }
                    .pickerStyle(.segmented)

                    if type != "bus" {
                        TextField("Name of person collecting", text: $name)
                            .textInputAutocapitalization(.words)
                    }
                }

                Section("Note (optional)") {
                    TextField("e.g. left with sister", text: $note)
                }

                if let plan, plan.homeWith == "other_parent", type != "other_parent" {
                    Section {
                        Label("The plan says another parent is collecting. Confirm you are releasing to someone else.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Confirm release")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Release") {
                        onConfirm(type, name.trimmingCharacters(in: .whitespacesAndNewlines), note)
                        dismiss()
                    }
                    .disabled(type != "bus" && name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                guard !didPrefill else { return }
                didPrefill = true
                switch plan?.homeWith {
                case "bus": type = "bus"
                case "me": type = "guardian"; name = plan?.declaredByName ?? ""
                case "other_parent": type = "other_parent"; name = plan?.pickupName ?? ""
                default: type = "bus"
                }
            }
        }
    }
}


// MARK: - Override a guardian's plan (audited)

private struct OverridePlanSheet: View {
    let eventId: String
    let entry: RosterEntry
    let current: ReleasePlan?
    let pickups: [String]
    var onApply: (String, String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var homeWith = "bus"
    @State private var pickupName = ""
    @State private var reason = ""

    private var canSave: Bool {
        !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (homeWith != "other_parent" || !pickupName.isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Athlete") {
                    Text(entry.playerName).font(.headline)
                    if let current {
                        Text("Current: \(current.summary)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("New plan") {
                    Picker("Getting home", selection: $homeWith) {
                        Text("Riding the bus").tag("bus")
                        Text("Guardian picks up").tag("me")
                        Text("Another parent").tag("other_parent")
                        Text("Not attending").tag("not_attending")
                    }
                    if homeWith == "other_parent" {
                        Picker("With", selection: $pickupName) {
                            Text("Choose parent…").tag("")
                            ForEach(pickups, id: \.self) { Text($0).tag($0) }
                        }
                    }
                }

                Section {
                    TextField("Why is this being changed?", text: $reason, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Reason (required)")
                } footer: {
                    Text("Overrides are recorded in the audit log with your name and this reason.")
                }
            }
            .navigationTitle("Override plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onApply(homeWith, pickupName, reason.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear {
                if let current, !current.homeWith.isEmpty { homeWith = current.homeWith }
                pickupName = current?.pickupName ?? ""
            }
        }
    }
}

