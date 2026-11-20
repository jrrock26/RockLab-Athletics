import SwiftUI

extension View {
    /// Logs a Firebase `screen_view` event when this view appears.
    /// Use short, stable names (e.g. "home", "team_detail", "roster").
    func analyticsScreen(_ name: String) -> some View {
        onAppear {
            AnalyticsService.logScreen(name)
        }
    }
}
