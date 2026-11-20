import SwiftUI

/// Root view of the app. Provides primary tab-based navigation.
struct ContentView: View {
    @Environment(DeepLinkRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .analyticsScreen("home")

            TeamsView()
                .tabItem {
                    Label("Teams", systemImage: "person.3.fill")
                }
                .analyticsScreen("teams")

            ScheduleView()
                .tabItem {
                    Label("Schedule", systemImage: "calendar")
                }
                .analyticsScreen("schedule")

            ChatView()
                .tabItem {
                    Label("Chat", systemImage: "bubble.left.and.bubble.right")
                }
                .analyticsScreen("chat")

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .analyticsScreen("settings")
        }
        .fullScreenCover(item: $router.pending) { deepLink in
            DeepLinkDestinationView(deepLink: deepLink)
        }
    }
}

#Preview {
    ContentView()
        .environment(DeepLinkRouter.shared)
}
