import SwiftUI

@main
struct AgentBoardApp: App {
    @StateObject private var store = AgentBoardStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .frame(minWidth: AgentMetric.windowMinWidth, minHeight: AgentMetric.windowMinHeight)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Add Workspace...") {
                    NotificationCenter.default.post(name: .agentBoardAddWorkspace, object: nil)
                }
                .keyboardShortcut("n", modifiers: [.command])
            }
            CommandMenu("Board") {
                Button("Refresh") {
                    Task { await store.refresh() }
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
        }

        Settings {
            SettingsView()
                .environmentObject(store)
                .frame(width: 920, height: 620)
        }
    }
}

extension Notification.Name {
    static let agentBoardAddWorkspace = Notification.Name("AgentBoardAddWorkspace")
}
