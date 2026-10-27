import SwiftUI

struct InviteCoachesView: View {
    @Bindable var vm: OnboardingViewModel
    let isWorking: Bool
    let onFinish: () -> Void

    var body: some View {
        Form {
            Section("Invite coaches (optional)") {
                HStack {
                    TextField("Coach email", text: $vm.newCoachEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    Button("Add") {
                        vm.addCoachEmail()
                    }
                    .disabled(vm.newCoachEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                ForEach(vm.coachEmails, id: \.self) { email in
                    Label(email, systemImage: "envelope")
                }
            }

            if let error = vm.errorMessage {
                Section {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Text("Invitations are recorded now and will be delivered once email sending is enabled.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                onFinish()
            } label: {
                if isWorking {
                    ProgressView().frame(maxWidth: .infinity).padding()
                } else {
                    Text("Finish").fontWeight(.semibold).frame(maxWidth: .infinity).padding()
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding()
            .disabled(isWorking)
        }
    }
}
