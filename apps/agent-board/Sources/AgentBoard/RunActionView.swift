import SwiftUI

struct RunActionView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Environment(\.dismiss) private var dismiss
    @State var draft: RunDraft

    var runner: RunnerConfiguration? {
        store.appConfiguration.runners.first { $0.id == draft.runnerID }
    }

    var permissionModes: [PermissionMode] {
        runner?.permissionModes ?? []
    }

    var cliPreview: String {
        guard let runner else { return "" }
        let mode = permissionModes.first { $0.id == draft.permissionModeID }
        let args = ((mode?.arguments ?? []) + runner.arguments)
            .map { $0.replacingOccurrences(of: "{{prompt}}", with: draft.prompt).shellQuoted }
        return ([runner.command.shellQuoted] + args).joined(separator: " ")
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Run Action")
                    .font(.title2.bold())
                Text("\(draft.action.title) · \(draft.items.map(\.ref).joined(separator: " "))")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)

            Divider()

            Form {
                Picker("Runner", selection: $draft.runnerID) {
                    ForEach(store.appConfiguration.runners) { runner in
                        Text(runner.label).tag(runner.id)
                    }
                }

                if !permissionModes.isEmpty {
                    Picker("Permission", selection: $draft.permissionModeID) {
                        ForEach(permissionModes) { mode in
                            Text(mode.label).tag(mode.id)
                        }
                    }
                }

                if draft.items.count > 1 {
                    Toggle("Run separately for each Issue or PR", isOn: $draft.splitRuns)
                }

                TextEditor(text: $draft.prompt)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 220)

                VStack(alignment: .leading, spacing: 6) {
                    Text("CLI Preview")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(cliPreview)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .agentGlassCard(radius: 10)
                }
            }
            .formStyle(.grouped)
            .padding()

            Divider()

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button {
                    Task { await store.run(draft) }
                } label: {
                    Label(draft.splitRuns ? "Run \(draft.items.count)" : "Run", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
    }
}
