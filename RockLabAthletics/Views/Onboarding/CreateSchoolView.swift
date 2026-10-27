import SwiftUI

struct CreateSchoolView: View {
    @Bindable var vm: OnboardingViewModel
    let onNext: () -> Void

    var body: some View {
        Form {
            Section("School profile") {
                TextField("School name", text: $vm.schoolName)
                TextField("Mascot (optional)", text: $vm.mascot)
            }
            Section {
                Text("You'll be set up as the Athletic Director (system owner) for this school.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button("Continue", action: onNext)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding()
                .disabled(vm.schoolName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
