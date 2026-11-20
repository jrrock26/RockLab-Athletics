import Foundation
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging
import FirebaseAppCheck

/// Handles Firebase configuration and push-notification registration.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureAppCheck()
        FirebaseApp.configure()
        AnalyticsService.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        // Notification permission is requested AFTER sign-in (see RootView), not at
        // launch. Prompting before the user has an account hurts opt-in rates and is
        // discouraged by Apple's HIG. Registering for remote notifications here is
        // safe: it does not show a prompt.
        application.registerForRemoteNotifications()
        return true
    }

    /// Selects the App Check provider.
    ///
    /// App Attest is the production provider and requires a real device, so Debug
    /// builds and simulators use the debug provider instead. Its token is printed
    /// to the console and must be registered in the Firebase console before the
    /// device can mint real App Check tokens.
    ///
    /// Enforcement is intentionally NOT enabled yet: the app sends App Check
    /// tokens, Firebase verifies them, and requests are still allowed through if a
    /// token is missing or invalid. Flip enforcement on per-product in the console
    /// once device tokens are confirmed healthy.
    private func configureAppCheck() {
        #if DEBUG || targetEnvironment(simulator)
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
        #endif
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Self.storeCurrentFCMToken()
    }

    /// Stores the current FCM token on the signed-in user's document so they
    /// receive push notifications (live games, broadcasts, announcements, etc.).
    static func storeCurrentFCMToken() {
        guard let token = Messaging.messaging().fcmToken,
              let uid = Auth.auth().currentUser?.uid else { return }
        Firestore.firestore().collection("users").document(uid).setData(["fcmToken": token], merge: true) { _ in }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let deepLink = DeepLink.parse(userInfo: response.notification.request.content.userInfo) {
            DispatchQueue.main.async {
                DeepLinkRouter.shared.pending = deepLink
            }
        }
        completionHandler()
    }

    /// Requests notification authorization. Called after the user signs in so the
    /// system prompt appears in context rather than over the login screen.
    static func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }
}
