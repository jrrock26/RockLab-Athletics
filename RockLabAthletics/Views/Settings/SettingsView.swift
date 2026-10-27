import SwiftUI

struct SettingsView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section("App") {
                    LabeledContent("Version", value: "1.0")
                    LabeledContent("Platform", value: "iOS 17+")
                }

                Section("Coming Soon") {
                    Text("Firebase sync & accounts will be configured here.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    SettingsView()
}
