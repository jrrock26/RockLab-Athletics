import SwiftUI
import PencilKit

/// A player's (or parent's) own forms, with e-sign to submit.
struct MyFormsView: View {
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let sportId: String
    @State private var vm = RosterViewModel()
    @State private var teamForms: [TeamForm] = []
    @State private var teamSubmissions: [String: FormSubmission] = [:]
    @State private var teamTarget: TeamFormSignable?

    var body: some View {
        List {
            if myEntries.isEmpty {
                Section {
                    Text("No player linked to your account on this team yet.")
                        .foregroundStyle(.secondary)
                }
            }

            if teamForms.isEmpty {
                Section {
                    Text("No forms have been issued for this team.")
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(teamForms) { form in
                    Section(form.title) {
                        if !form.description.isEmpty {
                            Text(form.description).font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(myEntries) { entry in
                            let key = "\(form.id)_\(entry.id)"
                            let sub = teamSubmissions[key]
                            TeamFormRow(form: form, entry: entry, submission: sub) {
                                teamTarget = TeamFormSignable(form: form, entry: entry)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("My Forms")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .task {
            // Players should always have a roster entry once accepted; self-heal if missing.
            if auth.user?.role == .player {
                _ = try? await FunctionsService.shared.ensurePlayerRosterEntry(teamId: teamId)
            }
            await vm.loadRoster(teamId: teamId, includeEligibility: false)
            await loadTeamForms()
        }
        .sheet(item: $teamTarget) { t in
            TeamFormSignSheet(teamId: teamId, form: t.form, entry: t.entry) {
                Task { await loadTeamForms() }
            }
        }
    }

    private var myEntries: [RosterEntry] {
        guard let uid = auth.user?.id else { return [] }
        let linked = auth.user?.linkedPlayerIds ?? []
        return vm.roster.filter { entry in
            guard let pid = entry.userId else { return false }
            return pid == uid || linked.contains(pid)
        }
    }

    private func loadTeamForms() async {
        teamForms = (try? await FirestoreService.shared.fetchTeamForms(teamId: teamId, publishedOnly: true)) ?? []
        var subs: [String: FormSubmission] = [:]
        for form in teamForms {
            for entry in myEntries {
                if let sub = try? await FirestoreService.shared.fetchFormSubmission(teamId: teamId, formId: form.id, entryId: entry.id) {
                    subs["\(form.id)_\(entry.id)"] = sub
                }
            }
        }
        teamSubmissions = subs
    }
}

struct TeamFormSignable: Identifiable {
    let form: TeamForm
    let entry: RosterEntry
    var id: String { "\(form.id)_\(entry.id)" }
}

struct TeamFormRow: View {
    let form: TeamForm
    let entry: RosterEntry
    let submission: FormSubmission?
    let onSign: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(form.title) — \(entry.playerName)").font(.subheadline)
                Text(statusText).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if submission?.status != .approved {
                Button("Sign") { onSign() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
    }

    private var statusText: String {
        if let submission {
            var text = submission.status.displayName
            if !submission.signedByName.isEmpty { text += " · \(submission.signedByName)" }
            if submission.isAwaitingParentSignature { text += " · Parent signature needed" }
            return text
        }
        if let d = form.dueDate {
            return "Due \(d.formatted(date: .abbreviated, time: .omitted))"
        }
        return "Not submitted"
    }
}

struct TeamFormSignSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthViewModel.self) private var auth
    let teamId: String
    let form: TeamForm
    let entry: RosterEntry
    let onComplete: () -> Void

    @State private var fullName = ""
    @State private var parentName = ""
    @State private var responses: [String: String] = [:]
    @State private var drawings: [String: PKDrawing] = [:]
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var reachedEnd = false
    @State private var viewportHeight: CGFloat = 0
    @State private var schoolName = ""
    @State private var teamName = ""

    /// The full document text. Falls back to the built-in library for legacy
    /// forms whose stored body is only a header or a short stub.
    private var documentBody: String {
        let trimmed = form.body.trimmingCharacters(in: .whitespacesAndNewlines)
        let looksComplete = trimmed.contains("## ") && trimmed.count > 400
        if looksComplete { return form.body }
        if let doc = FormLibrary.match(form.title) {
            return FormLibrary.render(doc, schoolName: schoolName, teamName: teamName)
        }
        return trimmed.isEmpty ? form.title : form.body
    }

    private var athleteInfo: [(String, String)] {
        [("Athlete", entry.playerName),
         ("Jersey", entry.jerseyNumber.isEmpty ? "—" : entry.jerseyNumber),
         ("Position", entry.position.isEmpty ? "—" : entry.position),
         ("Date", Date().formatted(date: .numeric, time: .omitted))]
    }

    private var canSubmit: Bool {
        reachedEnd
            && !fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !(form.requiresParentSignature && parentName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            && !isWorking
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    FormDocumentPage(
                        document: documentBody,
                        athleteInfo: athleteInfo,
                        showsSignatures: !fullName.isEmpty || !parentName.isEmpty,
                        athleteSignature: fullName,
                        parentSignature: form.requiresParentSignature ? parentName : "",
                        signatureDate: Date(),
                        generatedBy: "\(form.title) · \(entry.playerName) · \(teamName)"
                    )
                    .padding(.horizontal)

                    if reachedEnd {
                        signPanel
                    } else {
                        readingHint
                    }
                }
                .padding(.vertical)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: FormScrollMetricsKey.self,
                            value: FormScrollMetrics(
                                offset: proxy.frame(in: .named("formScroll")).minY,
                                height: proxy.size.height
                            )
                        )
                    }
                )
            }
            .coordinateSpace(name: "formScroll")
            .background(
                GeometryReader { outer in
                    Color.clear
                        .onAppear { viewportHeight = outer.size.height }
                        .onChange(of: outer.size.height) { _, h in viewportHeight = h }
                }
            )
            .onPreferenceChange(FormScrollMetricsKey.self) { metrics in
                guard !reachedEnd, viewportHeight > 0 else { return }
                // Already scrolled to (or within 32pt of) the bottom, or the
                // document is shorter than the screen.
                let nearBottom = -metrics.offset + viewportHeight >= metrics.height - 32
                let fitsOnScreen = metrics.height <= viewportHeight + 8
                if nearBottom || fitsOnScreen {
                    withAnimation(.easeInOut(duration: 0.25)) { reachedEnd = true }
                }
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(form.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") { Task { await submit() } }
                        .disabled(!canSubmit)
                }
            }
            .task {
                if let team = try? await FirestoreService.shared.fetchTeam(teamId: teamId) {
                    teamName = "\(team.sportName) \(team.level)"
                    if let school = try? await FirestoreService.shared.fetchSchool(id: team.schoolId) {
                        schoolName = school.name
                    }
                }
            }
        }
    }

    private var signPanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Respond & Sign").font(.headline)
            if !form.fields.isEmpty {
                ForEach(form.fields) { field in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(field.label.isEmpty ? "Question" : field.label)
                            .font(.subheadline.weight(.semibold))
                        fieldControl(field)
                    }
                }
                Divider()
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Student-Athlete Signature").font(.subheadline.weight(.semibold))
                Text("Type your full legal name. A typed name has the same effect as a handwritten signature.")
                    .font(.caption).foregroundStyle(.secondary)
                TextField("Full legal name", text: $fullName)
                    .textInputAutocapitalization(.words)
                    .textContentType(.name)
                    .textFieldStyle(.roundedBorder)
            }
            if form.requiresParentSignature {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Parent/Guardian Signature", systemImage: "person.2.badge.key")
                        .font(.subheadline.weight(.semibold))
                    Text("A parent or guardian must also sign this form. Type their full legal name.")
                        .font(.caption).foregroundStyle(.secondary)
                    TextField("Parent/guardian full name", text: $parentName)
                        .textInputAutocapitalization(.words)
                        .textContentType(.name)
                        .textFieldStyle(.roundedBorder)
                }
            }
            if let errorMessage {
                Text(errorMessage).font(.footnote).foregroundStyle(.red)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(uiColor: .secondarySystemGroupedBackground)))
        .padding(.horizontal)
    }

    private var readingHint: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.down.circle")
            Text("Scroll to the end of the form to sign.")
                .font(.footnote)
        }
        .foregroundStyle(.secondary)
        .padding()
    }
}


extension TeamFormSignSheet {

    @ViewBuilder
    private func fieldControl(_ field: FormField) -> some View {
        switch field.type {
        case .text:
            TextField(field.label, text: textBinding(field), axis: .vertical)
                .textFieldStyle(.roundedBorder)
        case .checkbox:
            Toggle(field.label, isOn: checkboxBinding(field))
        case .signature:
            SignatureCanvas(drawing: drawingBinding(field))
                .frame(height: 140)
                .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func textBinding(_ field: FormField) -> Binding<String> {
        Binding(get: { responses[field.id] ?? "" }, set: { responses[field.id] = $0 })
    }

    private func checkboxBinding(_ field: FormField) -> Binding<Bool> {
        Binding(get: { responses[field.id] == "true" }, set: { responses[field.id] = $0 ? "true" : "false" })
    }

    private func drawingBinding(_ field: FormField) -> Binding<PKDrawing> {
        Binding(get: { drawings[field.id] ?? PKDrawing() }, set: { drawings[field.id] = $0 })
    }

    private func submit() async {
        isWorking = true
        defer { isWorking = false }
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let uid = auth.user?.id, !name.isEmpty else { return }
        var finalResponses = responses
        for (fieldId, drawing) in drawings {
            let image = drawing.image(from: drawing.bounds, scale: 1.0)
            if let data = image.pngData() {
                finalResponses[fieldId] = data.base64EncodedString()
            }
        }
        let parent = parentName.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await FirestoreService.shared.submitTeamForm(
                teamId: teamId, formId: form.id, rosterEntryId: entry.id,
                playerName: entry.playerName, signerName: name, userId: uid,
                responses: finalResponses,
                requiresParentSignature: form.requiresParentSignature,
                parentSignerName: form.requiresParentSignature && !parent.isEmpty ? parent : nil)
            AnalyticsService.log(AnalyticsService.Event.formSigned, [
                "requires_parent_signature": form.requiresParentSignature,
                "parent_signed": !parent.isEmpty,
            ])
            onComplete()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}


// MARK: - Scroll tracking for the read-before-sign gate

struct FormScrollMetrics: Equatable {
    var offset: CGFloat
    var height: CGFloat
}

struct FormScrollMetricsKey: PreferenceKey {
    static var defaultValue = FormScrollMetrics(offset: 0, height: 0)
    static func reduce(value: inout FormScrollMetrics, nextValue: () -> FormScrollMetrics) {
        value = nextValue()
    }
}
