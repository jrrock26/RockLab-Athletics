import SwiftUI
import PhotosUI

struct CreateSchoolView: View {
    @Bindable var vm: OnboardingViewModel
    let onNext: () -> Void

    @State private var logoItem: PhotosPickerItem?

    var body: some View {
        Form {
            Section("School profile") {
                TextField("School name", text: $vm.schoolName)
                TextField("Mascot (optional)", text: $vm.mascot)
                TextField("Zip code", text: $vm.zipCode)
                    .keyboardType(.numberPad)
                TextField("District / Association (e.g. PIAA District 1)", text: $vm.district)
            }

            Section("School logo") {
                PhotosPicker(selection: $logoItem, matching: .images) {
                    if let data = vm.logoData, let image = UIImage(data: data) {
                        HStack {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 56, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            Text("Change logo")
                        }
                    } else {
                        Label("Add logo", systemImage: "photo.badge.plus")
                    }
                }
                .onChange(of: logoItem) { _, newItem in
                    Task {
                        if let data = try? await newItem?.loadTransferable(type: Data.self),
                           let image = UIImage(data: data) {
                            vm.logoData = ImageHelper.compressedData(image, maxDimension: 512, quality: 0.7)
                        }
                    }
                }
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

