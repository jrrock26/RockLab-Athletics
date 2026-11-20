import Foundation
import FirebaseAnalytics
import FirebaseCrashlytics

/// Central wrapper for Firebase Analytics + Crashlytics.
///
/// Rules of the road:
/// - **Never** log PII (names, emails, phone numbers, roster IDs of minors).
/// - Use stable snake_case event and parameter names so reports stay usable.
/// - Prefer coarse buckets (e.g. duration_bucket) over raw values.
enum AnalyticsService {

    // MARK: Setup

    /// Called once at launch, right after `FirebaseApp.configure()`.
    static func configure() {
        #if DEBUG
        // Keep local test runs out of production reports, but still allow
        // manual verification builds by flipping this to true.
        Analytics.setAnalyticsCollectionEnabled(true)
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(true)
        Crashlytics.crashlytics().setCustomValue("debug", forKey: "environment")
        #else
        Analytics.setAnalyticsCollectionEnabled(true)
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(true)
        Crashlytics.crashlytics().setCustomValue("release", forKey: "environment")
        #endif
    }

    // MARK: Identity (no PII)

    /// Associates events/crashes with an app role and school — never a name or
    /// email address.
    static func setUser(userId: String?, role: String?, schoolId: String?) {
        if let userId {
            Analytics.setUserID(userId)
            Crashlytics.crashlytics().setUserID(userId)
        }
        if let role {
            Analytics.setUserProperty(role, forName: "role")
            Crashlytics.crashlytics().setCustomValue(role, forKey: "role")
        }
        if let schoolId, !schoolId.isEmpty {
            // School id is an opaque document id, not a student identifier.
            Analytics.setUserProperty(schoolId, forName: "school_id")
            Crashlytics.crashlytics().setCustomValue(schoolId, forKey: "school_id")
        }
    }

    static func clearUser() {
        Analytics.setUserID(nil)
        Crashlytics.crashlytics().setUserID(nil)
    }

    // MARK: Events

    static func log(_ event: String, _ parameters: [String: Any] = [:]) {
        Analytics.logEvent(event, parameters: parameters)
    }

    static func logScreen(_ name: String) {
        Analytics.logEvent(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: name,
            AnalyticsParameterScreenClass: name,
        ])
    }

    // MARK: Error + crumb reporting

    /// Records a non-fatal error so it shows up in Crashlytics.
    static func record(error: Error, context: String) {
        Crashlytics.crashlytics().record(error: error, userInfo: ["context": context])
    }

    /// Leaves a breadcrumb that appears in the next crash report.
    static func breadcrumb(_ message: String) {
        Crashlytics.crashlytics().log(message)
    }

    /// Debug-only crash trigger used to verify Crashlytics is wired up.
    static func simulateCrashForTesting() {
        #if DEBUG
        fatalError("Crashlytics test crash — this is intentional.")
        #endif
    }
}

// MARK: - Well-known event names

extension AnalyticsService {
    enum Event {
        static let signUp = AnalyticsEventSignUp              // sign_up
        static let login = AnalyticsEventLogin                // login
        static let emailVerified = "email_verified"
        static let passwordResetRequested = "password_reset_requested"
        static let teamCreated = "team_created"
        static let playerAdded = "player_added"
        static let injuryReported = "injury_reported"
        static let injuryCleared = "injury_cleared"
        static let formPublished = "form_published"
        static let formSigned = "form_signed"
        static let eligibilityReset = "eligibility_reset"
        static let volunteerSignup = "volunteer_signup"
        static let reelCreated = "reel_created"
        static let reelPublished = "reel_published"
        static let reelViewed = "reel_viewed"
        static let clipAdded = "clip_added"
        static let videoUploaded = "video_uploaded"
        static let messageSent = "message_sent"
        static let gameStarted = "game_started"
    }
}
