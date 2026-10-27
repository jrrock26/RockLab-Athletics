import SwiftUI

struct SettingsView: View {
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        NavigationStack {
            Form {
                if let user = auth.user {
                    Section("Signed in as") {
                        LabeledContent("Name", value: user.displayName)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Role", value: user.role.displayName)
                    }
                }

                Section("App") {
                    LabeledContent("Version", value: "1.0")
                    LabeledContent("Platform", value: "iOS 17+")
                }

                Section("Family") {
                    NavigationLink("Link a child (parent)") {
                        ClaimChildView()
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        auth.signOut()
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

