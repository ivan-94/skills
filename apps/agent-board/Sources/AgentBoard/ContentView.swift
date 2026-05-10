import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @State private var selectedBoardID: String = "issues"
    @State private var showingAddWorkspace = false
    @State private var showingSettings = false

    var activeBoard: RenderedBoard? {
        store.renderedBoards.first { $0.id == selectedBoardID } ?? store.renderedBoards.first
    }

    var body: some View {
        NavigationSplitView {
            SidebarView(showingAddWorkspace: $showingAddWorkspace)
                .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
        } detail: {
            ZStack {
                if store.activeWorkspace == nil {
                    EmptyWorkspaceView(showingAddWorkspace: $showingAddWorkspace)
                } else {
                    BoardDetailView(selectedBoardID: $selectedBoardID, activeBoard: activeBoard)
                }
            }
            .toolbar {
                ToolbarItemGroup {
                    WorkspaceToolbarMenu()
                    Button {
                        Task { await store.refresh() }
                    } label: {
                        Label(store.isLoading ? "Refreshing" : "Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(store.activeWorkspace == nil || store.isLoading)

                    Button {
                        showingSettings = true
                    } label: {
                        Label("Configure", systemImage: "gearshape")
                    }
                }
            }
        }
        .sheet(isPresented: $showingAddWorkspace) {
            AddWorkspaceView()
                .environmentObject(store)
                .frame(width: 620)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(store)
                .frame(width: 980, height: 680)
        }
        .sheet(item: $store.runDraft) { draft in
            RunActionView(draft: draft)
                .environmentObject(store)
                .frame(width: 760, height: 660)
        }
        .alert("Agent Board", isPresented: Binding(
            get: { store.message != nil },
            set: { if !$0 { store.message = nil } }
        )) {
            Button("OK") { store.message = nil }
        } message: {
            Text(store.message ?? "")
        }
        .onReceive(NotificationCenter.default.publisher(for: .agentBoardAddWorkspace)) { _ in
            showingAddWorkspace = true
        }
        .onChange(of: store.renderedBoards.map(\.id)) { _, boardIDs in
            if !boardIDs.contains(selectedBoardID) {
                selectedBoardID = boardIDs.first ?? "issues"
            }
        }
    }
}

struct SidebarView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Binding var showingAddWorkspace: Bool

    var body: some View {
        List(selection: Binding(
            get: { store.activeWorkspace?.id },
            set: { id in
                guard let id, let workspace = store.appConfiguration.workspaces.first(where: { $0.id == id }) else { return }
                store.selectWorkspace(workspace)
            }
        )) {
            Section("Workspaces") {
                ForEach(store.appConfiguration.workspaces) { workspace in
                    WorkspaceRow(workspace: workspace)
                        .tag(workspace.id)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                showingAddWorkspace = true
            } label: {
                Label("Add Workspace", systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding()
        }
        .navigationTitle("Agent Board")
    }
}

struct WorkspaceRow: View {
    var workspace: Workspace

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(workspace.name)
                .font(.headline)
            Text(workspace.repoSlug)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 4)
    }
}

struct WorkspaceToolbarMenu: View {
    @EnvironmentObject private var store: AgentBoardStore

    var body: some View {
        Menu {
            ForEach(store.appConfiguration.workspaces) { workspace in
                Button {
                    store.selectWorkspace(workspace)
                } label: {
                    Label(workspace.name, systemImage: workspace.id == store.activeWorkspace?.id ? "checkmark" : "folder")
                }
            }
        } label: {
            Label(store.activeWorkspace?.name ?? "Workspace", systemImage: "folder")
        }
        .disabled(store.appConfiguration.workspaces.isEmpty)
    }
}

struct EmptyWorkspaceView: View {
    @Binding var showingAddWorkspace: Bool

    var body: some View {
        ContentUnavailableView {
            Label("Add a Workspace", systemImage: "rectangle.stack.badge.plus")
        } description: {
            Text("Choose a local Git repository with a GitHub remote. Agent Board stores state under ~/.agent-board.")
        } actions: {
            Button("Add Workspace") {
                showingAddWorkspace = true
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

struct BoardDetailView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Binding var selectedBoardID: String
    var activeBoard: RenderedBoard?

    var body: some View {
        VStack(spacing: 0) {
            Picker("Board", selection: $selectedBoardID) {
                ForEach(store.renderedBoards) { board in
                    Text(board.configuration.title).tag(board.id)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            Divider()

            if let activeBoard {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: AgentMetric.spacing) {
                        ForEach(activeBoard.lanes) { lane in
                            LaneView(board: activeBoard.configuration, lane: lane)
                        }
                    }
                    .padding()
                }
                .background(.background)
            } else if store.isLoading {
                ProgressView("Loading GitHub state...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView("No Board", systemImage: "square.grid.3x3")
            }
        }
    }
}

struct LaneView: View {
    @EnvironmentObject private var store: AgentBoardStore
    var board: BoardConfiguration
    var lane: RenderedLane

    var selectedItems: [BoardItem] {
        lane.items.filter { store.selectedIDs.contains($0.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(lane.configuration.title)
                        .font(.headline)
                    Text(selectedItems.isEmpty ? "\(lane.items.count) items" : "\(selectedItems.count) selected")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if !selectedItems.isEmpty {
                    Menu {
                        ForEach(lane.configuration.actions) { action in
                            Button(action.title) {
                                store.openRunDraft(board: board, lane: lane.configuration, action: action, items: selectedItems)
                            }
                        }
                        if lane.configuration.actions.isEmpty {
                            Text("No actions")
                        }
                    } label: {
                        Label("Actions", systemImage: "bolt")
                    }
                    .menuStyle(.borderlessButton)
                }
            }
            .padding()

            Divider()

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(lane.items) { item in
                        ItemCard(item: item)
                    }
                    if lane.items.isEmpty {
                        ContentUnavailableView("No items here", systemImage: "tray")
                            .frame(height: 180)
                    }
                }
                .padding()
            }
        }
        .frame(width: AgentMetric.laneWidth)
        .agentGlassCard()
    }
}

struct ItemCard: View {
    @EnvironmentObject private var store: AgentBoardStore
    var item: BoardItem

    var isSelected: Bool { store.selectedIDs.contains(item.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Toggle("", isOn: Binding(
                    get: { isSelected },
                    set: { selected in
                        if selected { store.selectedIDs.insert(item.id) }
                        else { store.selectedIDs.remove(item.id) }
                    }
                ))
                .toggleStyle(.checkbox)
                Text(item.ref)
                    .font(.headline.monospacedDigit())
                Spacer()
                Button {
                    if let url = URL(string: item.url) {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Image(systemName: "arrow.up.right.square")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }

            Text(item.title)
                .font(.headline)
                .lineLimit(3)

            Text(itemSubtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            FlowLayout(spacing: 6) {
                if item.labels.isEmpty {
                    Text("no labels")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.quaternary, in: Capsule())
                } else {
                    ForEach(item.labels, id: \.self) { label in
                        Text(label)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.quaternary, in: Capsule())
                    }
                }
            }
        }
        .padding(12)
        .agentInteractiveGlass(radius: AgentMetric.cardRadius)
        .overlay {
            RoundedRectangle(cornerRadius: AgentMetric.cardRadius, style: .continuous)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
        }
    }

    var itemSubtitle: String {
        if item.itemType == .issue {
            "by \(item.author) · assignee: \(item.assignees.isEmpty ? "none" : item.assignees.joined(separator: ", "))"
        } else {
            "\(item.isDraft ? "draft" : "ready") · \(item.headRefName ?? "?") → \(item.baseRefName ?? "?")"
        }
    }
}

struct AddWorkspaceView: View {
    @EnvironmentObject private var store: AgentBoardStore
    @Environment(\.dismiss) private var dismiss
    @State private var path = ""
    @State private var name = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Add Workspace")
                    .font(.title2.bold())
                Text("Choose a local Git repository with a GitHub remote. The first GitHub remote is used.")
                    .foregroundStyle(.secondary)
            }

            Form {
                TextField("Repository path", text: $path)
                TextField("Display name", text: $name)
            }

            HStack {
                Button("Browse...") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    if panel.runModal() == .OK, let url = panel.url {
                        path = url.path
                    }
                }
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Add") {
                    Task {
                        await store.addWorkspace(path: path, displayName: name)
                        if store.activeWorkspace != nil { dismiss() }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 260
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
