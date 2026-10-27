import SwiftUI

/// Three-step AD onboarding: school profile → select sports → invite coaches.
struct OnboardingFlowView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var vm = OnboardingViewModel()
    @State private var step = 0
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ProgressView(value: Double(step + 1), total: 3)
                    .padding(.horizontal)
                    .padding(.top)

                switch step {
                case 0:
                    CreateSchoolView(vm: vm) { step = 1 }
                case 1:
                    SelectSportsView(vm: vm) { step = 2 }
                default:
                    InviteCoachesView(vm: vm, isWorking: isWorking) {
                        Task { await finishOnboarding() }
                    }
                }
            }
            .navigationTitle("Set up your school")
            .navigationBarTitleDisplayMode(.inline)
        }
        .interactiveDismissDisabled()
    }

    private func finishOnboarding() async {
        guard let uid = auth.user?.id else { return }
        isWorking = true
        let success = await vm.createSchool(adUserId: uid)
        if success {
            for email in vm.coachEmails {
                await vm.sendInvite(email: email)
            }
            await auth.refreshUser()
        }
        isWorking = false
    }
}
