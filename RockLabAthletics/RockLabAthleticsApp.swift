import SwiftUI
import FirebaseCore

@main
struct RockLabAthleticsApp: App {
    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
