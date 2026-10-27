import SwiftUI

struct ScheduleView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "No Games Scheduled",
                systemImage: "calendar",
                description: Text("Your team's schedule will appear here.")
            )
            .navigationTitle("Schedule")
        }
    }
}

#Preview {
    ScheduleView()
}
