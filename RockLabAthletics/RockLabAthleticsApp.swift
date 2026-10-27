import SwiftUI
import FirebaseCore

@main
struct RockLabAthleticsApp: App {
    @State private var auth = AuthViewModel()

    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
        }
    }
}

