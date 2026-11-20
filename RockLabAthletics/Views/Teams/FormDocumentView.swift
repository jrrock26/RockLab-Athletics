import SwiftUI

/// A parsed block of a form document.
enum FormDocBlock: Hashable {
    case heading(String)
    case bullet(String)
    case paragraph(String)
}

enum FormDocumentParser {

    /// Splits the document into its letterhead lines and the section body.
    static func split(_ document: String) -> (header: [String], content: String) {
        func cleaned(_ text: String) -> [String] {
            text.components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { line in
                    guard !line.isEmpty else { return false }
                    // Drop horizontal rule lines made of box-drawing/underscore dashes.
                    let isRule = line.allSatisfy { $0 == "─" || $0 == "-" || $0 == "_" || $0 == "—" }
                    return !isRule
                }
        }
        guard let range = document.range(of: "\n## ") else {
            return (cleaned(document), "")
        }
        let head = cleaned(String(document[..<range.lowerBound]))
        let content = "## " + String(document[range.upperBound...])
        return (head, content)
    }

    static func blocks(from content: String) -> [FormDocBlock] {
        var result: [FormDocBlock] = []
        for raw in content.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            if line.hasPrefix("## ") {
                result.append(.heading(String(line.dropFirst(3))))
            } else if line.hasPrefix("• ") {
                result.append(.bullet(String(line.dropFirst(2))))
            } else if line.hasPrefix("•") {
                result.append(.bullet(String(line.dropFirst(1))))
            } else {
                result.append(.paragraph(line))
            }
        }
        return result
    }

    /// True when the line is a fill-in-the-blank row (underscores).
    static func isBlankLine(_ text: String) -> Bool {
        text.contains("____")
    }
}

/// Renders a form document as a printed page (letterhead, numbered sections,
/// bullets, fill-in lines, and optional signature block).
struct FormDocumentPage: View {
    let document: String

    // Type that scales with the user's Dynamic Type setting.
    @ScaledMetric(relativeTo: .caption2) private var docSize8: CGFloat = 8
    @ScaledMetric(relativeTo: .caption2) private var docSize85: CGFloat = 8.5
    @ScaledMetric(relativeTo: .caption) private var docSize95: CGFloat = 9.5
    @ScaledMetric(relativeTo: .caption) private var docSize105: CGFloat = 10.5
    @ScaledMetric(relativeTo: .footnote) private var docSize11: CGFloat = 11
    @ScaledMetric(relativeTo: .footnote) private var docSize115: CGFloat = 11.5
    @ScaledMetric(relativeTo: .footnote) private var docSize12: CGFloat = 12
    @ScaledMetric(relativeTo: .subheadline) private var docSize13: CGFloat = 13
    @ScaledMetric(relativeTo: .body) private var docSize15: CGFloat = 15
    @ScaledMetric(relativeTo: .title3) private var docSize17: CGFloat = 17
    @ScaledMetric(relativeTo: .body) private var docSignatureHeight: CGFloat = 22
    var athleteInfo: [(String, String)] = []
    var showsSignatures: Bool = false
    var athleteSignature: String = ""
    var parentSignature: String = ""
    var signatureDate: Date = Date()
    var generatedBy: String = ""

    private var parts: (header: [String], content: String) {
        FormDocumentParser.split(document)
    }

    private var blocks: [FormDocBlock] {
        FormDocumentParser.blocks(from: parts.content)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            letterhead
            if !athleteInfo.isEmpty { athleteTable }
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
            if showsSignatures { signatureBlock }
            footer
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .shadow(color: .black.opacity(0.16), radius: 8, x: 0, y: 3)
        .overlay(
            RoundedRectangle(cornerRadius: 3).stroke(Color.black.opacity(0.08), lineWidth: 1)
        )
    }
}

extension FormDocumentPage {

    // MARK: Letterhead

    var letterhead: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let school = parts.header.first {
                Text(school)
                    .font(.system(size: docSize17, weight: .bold, design: .serif))
                    .tracking(1.4)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            if parts.header.count >= 3 {
                Text(parts.header[1])
                    .font(.system(size: docSize115, weight: .semibold, design: .serif))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, alignment: .center)
                Text(parts.header[2])
                    .font(.system(size: docSize13, weight: .bold, design: .serif))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 2)
            } else if parts.header.count == 2 {
                Text(parts.header[1])
                    .font(.system(size: docSize13, weight: .bold, design: .serif))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 2)
            }
            Rectangle()
                .fill(Color.black.opacity(0.75))
                .frame(height: 1.2)
                .padding(.top, 6)
        }
    }

    // MARK: Athlete info

    var athleteTable: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(Array(athleteInfo.enumerated()), id: \.offset) { _, pair in
                HStack(alignment: .top, spacing: 6) {
                    Text(pair.0.uppercased() + ":")
                        .font(.system(size: docSize95, weight: .bold, design: .serif))
                        .foregroundStyle(.secondary)
                        .frame(width: 92, alignment: .leading)
                    Text(pair.1)
                        .font(.system(size: docSize115, design: .serif))
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(Color.black.opacity(0.035))
    }
}


extension FormDocumentPage {

    // MARK: Blocks

    @ViewBuilder
    func blockView(_ block: FormDocBlock) -> some View {
        switch block {
        case .heading(let text):
            Text(text)
                .font(.system(size: docSize115, weight: .bold, design: .serif))
                .textCase(.uppercase)
                .padding(.top, 6)
                .padding(.bottom, 1)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.black.opacity(0.18)).frame(height: 0.8)
                }
        case .bullet(let text):
            HStack(alignment: .top, spacing: 7) {
                Text("•").font(.system(size: docSize12, weight: .bold, design: .serif))
                bodyText(text)
            }
            .padding(.leading, 6)
        case .paragraph(let text):
            bodyText(text)
        }
    }

    @ViewBuilder
    func bodyText(_ text: String) -> some View {
        if FormDocumentParser.isBlankLine(text) {
            Text(text)
                .font(.system(size: docSize105, design: .monospaced))
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(text)
                .font(.system(size: docSize115, design: .serif))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}


extension FormDocumentPage {

    // MARK: Signatures and footer

    var signatureBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("SIGNATURES").font(.system(size: docSize115, weight: .bold, design: .serif))
            signatureRow(title: "Student-Athlete", name: athleteSignature, date: signatureDate)
            if !parentSignature.isEmpty {
                signatureRow(title: "Parent/Guardian", name: parentSignature, date: signatureDate)
            }
        }
        .padding(.top, 18)
    }

    func signatureRow(title: String, name: String, date: Date) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name.isEmpty ? " " : name)
                .font(.system(size: docSize15, weight: .medium, design: .serif))
                .italic()
                .frame(height: docSignatureHeight, alignment: .bottomLeading)
            Rectangle().fill(Color.black.opacity(0.6)).frame(height: 0.9)
            HStack {
                Text(title.uppercased() + " SIGNATURE")
                    .font(.system(size: docSize85, weight: .semibold, design: .serif))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("DATE: " + date.formatted(date: .numeric, time: .omitted))
                    .font(.system(size: docSize85, weight: .semibold, design: .serif))
                    .foregroundStyle(.secondary)
            }
        }
    }

    var footer: some View {
        VStack(alignment: .leading, spacing: 2) {
            Rectangle().fill(Color.black.opacity(0.15)).frame(height: 0.7)
            Text(generatedBy.isEmpty ? "Generated by RockLab Athletics" : generatedBy)
                .font(.system(size: docSize8, design: .serif))
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
        .padding(.top, 16)
    }
}


// MARK: - Template picker and document preview

/// Category-grouped picker for the standard form library.
struct FormTemplatePickerView: View {
    let schoolName: String
    let teamName: String
    let onSelect: (FormTemplate) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            ForEach(FormTemplateCatalog.categories, id: \.self) { category in
                let items = FormTemplateCatalog.templates(in: category)
                if !items.isEmpty {
                    Section(category) {
                        ForEach(items) { t in
                            Button {
                                onSelect(t)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(t.title)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(t.description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if t.requiresParentSignature {
                                        Label("Parent/guardian signature", systemImage: "person.2.badge.key")
                                            .font(.caption2)
                                            .foregroundStyle(.orange)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .navigationTitle("Form Templates")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Read-only, paper-style preview of a form document.
struct FormDocumentPreviewView: View {
    let title: String
    let document: String
    var athleteInfo: [(String, String)] = []
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                FormDocumentPage(document: document, athleteInfo: athleteInfo)
                    .padding()
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}

