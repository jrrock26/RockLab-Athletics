import SwiftUI

/// AD / coach / staff / trainer: report an injury or clear a player to play.
struct InjuryReportSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: RosterViewModel
    let teamId: String
    let entry: RosterEntry

    @State private var status: InjuryStatus = .injured
    @State private var bodyPart = ""
    @State private var severity = "Moderate"
    @State private var details = ""
    @State private var expectedReturn = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var reports: [InjuryReport] = []

    private let severities = ["Mild", "Moderate", "Severe"]

    /// Latest copy of the entry from the view model (refreshed after saving).
    private var current: RosterEntry {
        vm.roster.first { $0.id == entry.id } ?? entry
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Current status") {
                    HStack {
                        Text(current.playerName).font(.headline)
                        Spacer()
                        InjuryBadge(status: current.injuryStatus)
                    }
                    if !current.injuryBodyPart.isEmpty {
                        LabeledContent("Area", value: current.injuryBodyPart)
                    }
                    if !current.injuryNote.isEmpty {
                        Text(current.injuryNote).font(.subheadline).foregroundStyle(.secondary)
                    }
                    if !current.injuryUpdatedByName.isEmpty {
                        LabeledContent("Updated by", value: current.injuryUpdatedByName)
                    }
                    if current.injuryStatus != .healthy {
                        Button {
                            Task { await clear() }
                        } label: {
                            Label("Clear to play", systemImage: "checkmark.seal")
                        }
                        .disabled(isWorking)
                    }
                }

                Section("Report an injury") {
                    Picker("Status", selection: $status) {
                        Text("Injured — no participation").tag(InjuryStatus.injured)
                        Text("Limited — modified participation").tag(InjuryStatus.limited)
                    }
                    TextField("Body part (e.g. right ankle)", text: $bodyPart)
                    Picker("Severity", selection: $severity) {
                        ForEach(severities, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Expected return (optional)", text: $expectedReturn)
                    TextField("Details / mechanism of injury", text: $details, axis: .vertical)
                        .lineLimit(3...6)
                    Button {
                        Task { await save() }
                    } label: {
                        if isWorking {
                            ProgressView()
                        } else {
                            Text("Save injury report")
                        }
                    }
                    .disabled(isWorking || bodyPart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if let errorMessage {
                    Section { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                }

                if !reports.isEmpty { historySection }
            }
            .navigationTitle("Injury Status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task {
                status = current.injuryStatus == .limited ? .limited : .injured
                bodyPart = current.injuryBodyPart
                details = current.injuryNote
                reports = await vm.injuryReports(teamId: teamId, entryId: entry.id)
            }
        }
    }
}

extension InjuryReportSheet {

    private var historySection: some View {
        Section("History") {
            ForEach(reports) { report in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(report.bodyPart.isEmpty ? report.status.displayName : report.bodyPart)
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(report.cleared ? "Cleared" : report.status.displayName)
                            .font(.caption.bold())
                            .foregroundStyle(report.cleared ? Color.green : Color.red)
                    }
                    if !report.details.isEmpty {
                        Text(report.details).font(.caption).foregroundStyle(.secondary)
                    }
                    if let d = report.reportedAt {
                        Text("Reported \(d.formatted(date: .abbreviated, time: .shortened)) by \(report.reportedByName)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if report.cleared, let d = report.clearedAt {
                        Text("Cleared \(d.formatted(date: .abbreviated, time: .omitted)) by \(report.clearedByName)")
                            .font(.caption2).foregroundStyle(.green)
                    }
                }
            }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        let ok = await vm.reportInjury(
            teamId: teamId,
            entryId: entry.id,
            status: status,
            bodyPart: bodyPart.trimmingCharacters(in: .whitespacesAndNewlines),
            details: details.trimmingCharacters(in: .whitespacesAndNewlines),
            severity: severity,
            expectedReturn: expectedReturn.trimmingCharacters(in: .whitespacesAndNewlines))
        if ok {
            reports = await vm.injuryReports(teamId: teamId, entryId: entry.id)
            details = ""
            expectedReturn = ""
            errorMessage = nil
        } else {
            errorMessage = vm.errorMessage
        }
    }

    private func clear() async {
        isWorking = true
        defer { isWorking = false }
        let ok = await vm.clearInjury(teamId: teamId, entryId: entry.id)
        if ok {
            reports = await vm.injuryReports(teamId: teamId, entryId: entry.id)
            errorMessage = nil
        } else {
            errorMessage = vm.errorMessage
        }
    }
}

