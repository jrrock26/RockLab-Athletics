import SwiftUI

/// Coach/AD: create, publish, and review team forms.
struct TeamFormsView: View {
    let teamId: String
    let sportId: String
    @State private var vm = TeamFormsViewModel()
    @State private var showingNew = false
    @State private var confirmingReset = false

    var body: some View {
        List {
            if vm.forms.isEmpty {
                Section {
                    Text("No forms yet. Tap + to create one.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Forms") {
                    ForEach(vm.forms) { form in
                        NavigationLink {
                            FormSubmissionsView(teamId: teamId, form: form, vm: vm)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(form.title).font(.headline)
                                Text(subtitle(form)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section {
                Button("Reset eligibility (unpublish all forms)", role: .destructive) {
                    confirmingReset = true
                }
            } footer: {
                Text("Eligibility only applies to forms you have issued. Unpublishing every form makes all players eligible again.")
                    .font(.caption)
            }
        }
        .navigationTitle("Forms")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            BrandedHeader(imageName: SportBackground.image(for: sportId))
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingNew = true } label: { Image(systemName: "plus") }
                .accessibilityLabel("New form")
            }
        }
        .sheet(isPresented: $showingNew) {
            NewFormSheet(vm: vm, teamId: teamId)
        }
        .confirmationDialog("Unpublish every form?", isPresented: $confirmingReset, titleVisibility: .visible) {
            Button("Unpublish all forms", role: .destructive) {
                Task { await vm.resetEligibility(teamId: teamId) }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This makes every player eligible again. You can republish forms at any time.")
        }
        .task { await vm.load(teamId: teamId) }
    }

    private func subtitle(_ form: TeamForm) -> String {
        var parts: [String] = []
        if let d = form.dueDate {
            parts.append("Due \(d.formatted(date: .abbreviated, time: .omitted))")
        }
        parts.append(form.published ? "Published" : "Draft")
        let count = vm.submissionsByForm[form.id]?.count ?? 0
        parts.append("\(count) submitted")
        return parts.joined(separator: " · ")
    }
}

struct NewFormSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var vm: TeamFormsViewModel
    let teamId: String

    @State private var selectedTemplateId: String?
    @State private var aiPrompt = ""
    @State private var isGenerating = false
    @State private var schoolName = ""
    @State private var teamName = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Start from a form template") {
                    NavigationLink {
                        FormTemplatePickerView(schoolName: schoolName, teamName: teamName) { t in
                            selectedTemplateId = t.id
                            apply(template: t)
                        }
                    } label: {
                        LabeledContent("Template",
                                       value: selectedTemplateId.flatMap { FormTemplateCatalog.template(id: $0)?.title } ?? "Choose…")
                    }
                    if let id = selectedTemplateId,
                       let doc = FormLibrary.template(id: id) {
                        Text(doc.summary).font(.caption).foregroundStyle(.secondary)
                    }
                }

                Section("Or generate with AI") {
                    TextField("Describe the form (e.g. \"permission slip for the away game\")", text: $aiPrompt, axis: .vertical)
                    Button {
                        Task { await generate() }
                    } label: {
                        if isGenerating {
                            ProgressView()
                        } else {
                            Text("Generate")
                        }
                    }
                    .disabled(aiPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isGenerating)
                }

                Section("Form") {
                    TextField("Title", text: $vm.newTitle)
                    TextField("Description (optional)", text: $vm.newDescription, axis: .vertical)
                    DatePicker("Due date", selection: $vm.newDueDate, displayedComponents: .date)
                }

                Section("Document (players read this before signing)") {
                    TextEditor(text: $vm.newBody)
                        .frame(minHeight: 180)
                        .font(.system(size: 13, design: .serif))
                    NavigationLink {
                        FormDocumentPreviewView(title: vm.newTitle.isEmpty ? "Preview" : vm.newTitle,
                                                document: vm.newBody,
                                                athleteInfo: sampleAthleteInfo)
                    } label: {
                        Label("Preview as printed form", systemImage: "doc.text.magnifyingglass")
                    }
                    .disabled(vm.newBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section {
                    Toggle("Requires parent/guardian signature", isOn: $vm.newRequiresParentSignature)
                }

                Section("Fields") {
                    ForEach($vm.newFields) { $field in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Picker("Type", selection: $field.type) {
                                    ForEach(FormFieldType.allCases) { t in
                                        Text(t.displayName).tag(t)
                                    }
                                }
                                .pickerStyle(.menu)
                                Spacer()
                                Button(role: .destructive) {
                                    vm.newFields.removeAll { $0.id == field.id }
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.borderless)
                            }
                            TextField("Label", text: $field.label)
                            Toggle("Required", isOn: $field.required)
                        }
                    }
                    Button {
                        vm.newFields.append(FormField(type: .text, label: "New field"))
                    } label: {
                        Label("Add field", systemImage: "plus.circle")
                    }
                }
                if let error = vm.errorMessage {
                    Section { Text(error).font(.footnote).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            if await vm.createForm(teamId: teamId) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(vm.newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task {
                if let team = try? await FirestoreService.shared.fetchTeam(teamId: teamId) {
                    teamName = "\(team.sportName) \(team.level)"
                    if let school = try? await FirestoreService.shared.fetchSchool(id: team.schoolId) {
                        schoolName = school.name
                    }
                    // Re-render any already-selected template with the school/team data.
                    if let id = selectedTemplateId, let t = FormTemplateCatalog.template(id: id) {
                        apply(template: t)
                    }
                }
            }
        }
    }

    private func generate() async {
        let prompt = aiPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }
        isGenerating = true
        defer { isGenerating = false }
        do {
            let (title, description, body, templateId) = try await FunctionsService.shared.generateFormContent(prompt: prompt, teamId: teamId)
            if !templateId.isEmpty, let doc = FormLibrary.template(id: templateId) {
                // The server matched a standard form — render the real document.
                apply(doc: doc)
                return
            }
            if let doc = FormTemplateCatalog.match(prompt) {
                apply(doc: doc)
                return
            }
            vm.newTitle = title
            vm.newDescription = description
            vm.newBody = body
        } catch {
            vm.errorMessage = error.localizedDescription
        }
    }

    private func apply(template t: FormTemplate) {
        guard let doc = FormLibrary.template(id: t.id) else {
            vm.newTitle = t.title
            vm.newDescription = t.description
            vm.newRequiresParentSignature = t.requiresParentSignature
            return
        }
        apply(doc: doc)
    }

    /// Fills the draft with a complete library document, populated with school/team data.
    private func apply(doc: FormDocumentTemplate) {
        selectedTemplateId = doc.id
        vm.newTitle = doc.title
        vm.newDescription = doc.summary
        vm.newRequiresParentSignature = doc.requiresParentSignature
        vm.newBody = FormLibrary.render(doc, schoolName: schoolName, teamName: teamName)
    }

    /// Sample athlete data so the coach sees how the page will look when populated.
    private var sampleAthleteInfo: [(String, String)] {
        [("Athlete", "Jordan Sample"), ("Grade", "11"), ("Jersey", "24"), ("Date", Date().formatted(date: .numeric, time: .omitted))]
    }
}


struct FormSubmissionsView: View {
    let teamId: String
    let form: TeamForm
    @Bindable var vm: TeamFormsViewModel

    var body: some View {
        List {
            Section("Form") {
                Text(form.title).font(.headline)
                if !form.description.isEmpty {
                    Text(form.description).font(.subheadline).foregroundStyle(.secondary)
                }
                if let d = form.dueDate {
                    LabeledContent("Due", value: d.formatted(date: .abbreviated, time: .omitted))
                }
                LabeledContent("Status", value: form.published ? "Published" : "Draft")
            }

            Section("Submissions") {
                if submissions.isEmpty {
                    Text("No submissions yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(submissions) { sub in
                        NavigationLink {
                            SubmissionDetailView(form: form, submission: sub)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(sub.playerName).font(.headline)
                                    if !sub.signedByName.isEmpty {
                                        Text("Signed by \(sub.signedByName)").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                Text(sub.status.displayName)
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            if sub.status != .approved {
                                Button("Approve") {
                                    Task { await vm.reviewSubmission(teamId: teamId, formId: form.id, entryId: sub.id, status: .approved) }
                                }
                                .tint(.green)
                            }
                            if sub.status != .expired {
                                Button("Expire", role: .destructive) {
                                    Task { await vm.reviewSubmission(teamId: teamId, formId: form.id, entryId: sub.id, status: .expired) }
                                }
                            }
                        }
                    }
                }
            }

            Section {
                Button(form.published ? "Unpublish" : "Publish") {
                    Task { await vm.togglePublished(teamId: teamId, form: form) }
                }
                Button("Delete form", role: .destructive) {
                    Task { await vm.deleteForm(teamId: teamId, formId: form.id) }
                }
            }
        }
        .navigationTitle(form.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(teamId: teamId) }
    }

    private var submissions: [FormSubmission] {
        vm.submissionsByForm[form.id] ?? []
    }
}

struct SubmissionDetailView: View {
    let form: TeamForm
    let submission: FormSubmission

    var body: some View {
        List {
            Section(submission.playerName) {
                LabeledContent("Status", value: submission.status.displayName)
                if !submission.signedByName.isEmpty {
                    LabeledContent("Signed by", value: submission.signedByName)
                }
                if let d = submission.signedAt {
                    LabeledContent("Signed", value: d.formatted(date: .abbreviated, time: .shortened))
                }
                if submission.requiresParentSignature {
                    LabeledContent("Parent signature",
                                   value: submission.parentSignedByName.isEmpty ? "Required — pending" : submission.parentSignedByName)
                }
            }

            Section("Responses") {
                if form.fields.isEmpty {
                    Text("No fields on this form.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(form.fields) { field in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(field.label.isEmpty ? "Question" : field.label).font(.headline)
                            Text(responseText(for: field)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(submission.playerName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func responseText(for field: FormField) -> String {
        let value = submission.responses[field.id] ?? ""
        switch field.type {
        case .checkbox:
            return value == "true" ? "Yes" : "No"
        case .signature:
            return value.isEmpty ? "—" : "Signed"
        case .text:
            return value.isEmpty ? "—" : value
        }
    }
}

