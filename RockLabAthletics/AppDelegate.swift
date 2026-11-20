import Foundation
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging

/// Handles Firebase configuration and push-notification registration.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        FirebaseApp.configure()
        AnalyticsService.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        requestNotificationPermission()
        application.registerForRemoteNotifications()
        return true
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

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }
}
