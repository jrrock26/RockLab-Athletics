import SwiftUI

@main
struct RockLabAthleticsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @State private var auth = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
        }
    }
}


