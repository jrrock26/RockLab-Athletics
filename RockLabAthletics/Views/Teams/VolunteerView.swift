import SwiftUI

/// Volunteer work-event sign-ups, divided into time slots.
struct VolunteerView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let sportId: String
    @State private var vm = VolunteerViewModel()
    @State private var showingNew = false
    @State private var access = TeamAccess()

    private var canManage: Bool {
        access.canManageTeam || access.hasPerm(.concessions)
    }

    var body: some View {
        List {
            if vm.shifts.isEmpty {
                Section {
                    Text(canManage ? "No volunteer events yet. Tap + to create one." : "No volunteer events posted yet.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Volunteer events") {
                    ForEach(vm.shifts) { shift in
                        NavigationLink {
                            ShiftDetailView(teamId: teamId, shift: shift, vm: vm)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(shift.title).font(.headline)
                                Text(shift.timeRangeText).font(.caption).foregroundStyle(.secondary)
                                Text("\(shift.slotsPerShift) per \(shift.incrementMinutes)-min slot")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        guard canManage else { return }
                        for i in indexSet {
                            Task { await vm.deleteShift(teamId: teamId, shiftId: vm.shifts[i].id) }
                        }
                    }
                    .deleteDisabled(!canManage)
                }
            }
        }
        .navigationTitle("Volunteer")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingNew = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New volunteer event")
                }
            }
        }
        .sheet(isPresented: $showingNew) {
            NewShiftSheet(vm: vm, teamId: teamId)
        }
        .task {
            access = await FirestoreService.shared.teamAccess(teamId: teamId, userId: auth.user?.id, isAd: auth.user?.role == .ad)
            await vm.load(teamId: teamId)
        }
    }
}

struct NewShiftSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: VolunteerViewModel
    let teamId: String

    private let increments = [15, 30, 60, 90, 120]

    var body: some View {
        NavigationStack {
            Form {
                Section("Event") {
                    TextField("Title (e.g. Concessions — Friday Football)", text: $vm.newTitle)
                    DatePicker("Date", selection: $vm.newDate, displayedComponents: .date)
                    DatePicker("Start time", selection: $vm.newStart, displayedComponents: .hourAndMinute)
                    DatePicker("End time", selection: $vm.newEnd, displayedComponents: .hourAndMinute)
                }
                Section("Slots") {
                    Stepper("Volunteers per slot: \(vm.newSlotsPerShift)", value: $vm.newSlotsPerShift, in: 1...20)
                    Picker("Slot length", selection: $vm.newIncrementMinutes) {
                        ForEach(increments, id: \.self) { m in
                            Text(m == 60 ? "1 hour" : "\(m) min").tag(m)
                        }
                    }
                    TextField("Note (optional)", text: $vm.newNote, axis: .vertical)
                }
                Section {
                    Toggle("Players can volunteer", isOn: $vm.newPlayersCanVolunteer)
                } footer: {
                    Text("When on, parents can sign up their linked players for a slot.")
                        .font(.caption)
                }
                if let error = vm.errorMessage {
                    Section { Text(error).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Volunteer Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            if await vm.createShift(teamId: teamId) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(vm.newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

/// A volunteer (the account holder or a linked player) that can be signed up.
private struct VolunteerParticipant: Identifiable, Hashable {
    let id: String
    let name: String
    let isPlayer: Bool
}

struct ShiftDetailView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let shift: VolunteerShift
    let vm: VolunteerViewModel

    @State private var linkedPlayers: [VolunteerParticipant] = []
    @State private var selectedParticipantId: String?

    var body: some View {
        List {
            Section("Event") {
                LabeledContent("When", value: shift.timeRangeText)
                LabeledContent("Volunteers per slot", value: "\(shift.slotsPerShift)")
                LabeledContent("Slot length", value: shift.incrementMinutes == 60 ? "1 hour" : "\(shift.incrementMinutes) min")
                if !shift.note.isEmpty {
                    Text(shift.note).font(.subheadline).foregroundStyle(.secondary)
                }
            }

            if participants.count > 1 {
                Section {
                    Picker("Signing up", selection: Binding(
                        get: { selectedParticipantId ?? selfParticipant?.id ?? "" },
                        set: { selectedParticipantId = $0 }
                    )) {
                        ForEach(participants) { p in
                            Text(p.isPlayer ? "\(p.name) (player)" : "\(p.name) (me)").tag(p.id)
                        }
                    }
                } footer: {
                    Text("Pick who you're signing up. Each person can take one spot per event, but can sign up for other events too.")
                        .font(.caption)
                }
            }

            Section("Sign-up slots") {
                ForEach(shift.slots) { slot in
                    slotRow(slot)
                }
            }

            let family = familySignups
            if !family.isEmpty {
                Section("Your sign-ups") {
                    ForEach(family) { s in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.name).font(.subheadline.weight(.semibold))
                                Text(shift.slots.indices.contains(s.slotIndex) ? shift.slots[s.slotIndex].timeText : "—")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(role: .destructive) {
                                Task { await vm.cancelSignUp(teamId: teamId, shiftId: shift.id, participantUserId: s.userId) }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }

            if let error = vm.errorMessage {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle(shift.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadLinkedPlayers() }
    }

    @ViewBuilder
    private func slotRow(_ slot: ShiftSlot) -> some View {
        let filled = slot.filled(in: signups)
        let names = signups.filter { $0.slotIndex == slot.index }.map(\.name)
        let participant = selectedParticipant
        let existing = participant.flatMap { p in signups.first { $0.userId == p.id } }
        let isMySlot = existing?.slotIndex == slot.index
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(slot.timeText).font(.headline)
                Spacer()
                Text("\(filled)/\(slot.capacity) filled")
                    .font(.caption.bold())
                    .foregroundStyle(filled >= slot.capacity ? Color.secondary : Color.green)
            }
            if names.isEmpty {
                Text("Spots available").font(.caption).foregroundStyle(.secondary)
            } else {
                Text(names.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
            }
            if isMySlot {
                Label("\(participant?.name ?? "You") signed up here", systemImage: "checkmark.seal.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
            } else if existing != nil {
                Text("\(participant?.name ?? "You") already signed up for another slot")
                    .font(.caption).foregroundStyle(.secondary)
            } else if filled < slot.capacity {
                Button(participant?.isPlayer == true ? "Sign up \(participant?.name ?? "player")" : "Sign up for this slot") {
                    Task {
                        await vm.signUp(teamId: teamId, shiftId: shift.id, slotIndex: slot.index,
                                        participantUserId: participant?.isPlayer == true ? participant?.id : nil)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            } else {
                Text("Full").font(.caption.bold()).foregroundStyle(.red)
            }
        }
        .padding(.vertical, 2)
    }

    private var signups: [ShiftSignup] {
        vm.signupsByShift[shift.id] ?? []
    }

    private var selfParticipant: VolunteerParticipant? {
        guard let user = auth.user else { return nil }
        return VolunteerParticipant(id: user.id,
                                    name: user.displayName.isEmpty ? "Me" : user.displayName,
                                    isPlayer: false)
    }

    private var participants: [VolunteerParticipant] {
        var list: [VolunteerParticipant] = []
        if let selfParticipant { list.append(selfParticipant) }
        list.append(contentsOf: linkedPlayers)
        return list
    }

    private var selectedParticipant: VolunteerParticipant? {
        let id = selectedParticipantId ?? selfParticipant?.id
        return participants.first { $0.id == id } ?? selfParticipant
    }

    private var familySignups: [ShiftSignup] {
        let ids = Set(participants.map(\.id))
        return signups.filter { ids.contains($0.userId) }.sorted { $0.slotIndex < $1.slotIndex }
    }

    private func loadLinkedPlayers() async {
        guard shift.playersCanVolunteer else { linkedPlayers = []; return }
        let ids = auth.user?.linkedPlayerIds ?? []
        guard !ids.isEmpty else { linkedPlayers = []; return }
        guard let roster = try? await FirestoreService.shared.fetchRoster(teamId: teamId) else {
            linkedPlayers = []
            return
        }
        var names: [String: String] = [:]
        for entry in roster {
            if let uid = entry.userId { names[uid] = entry.playerName }
        }
        // Only offer linked players who are on this team's roster.
        linkedPlayers = ids.compactMap { id in
            guard let name = names[id] else { return nil }
            return VolunteerParticipant(id: id, name: name, isPlayer: true)
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}
