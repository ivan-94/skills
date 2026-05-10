import Foundation

struct GitHubService {
    struct Repository: Decodable {
        var nameWithOwner: String
        var url: String
        var hasIssuesEnabled: Bool?
        var labels: [Label]
    }

    struct Label: Decodable {
        var name: String
    }

    struct User: Decodable {
        var login: String
    }

    struct IssuePayload: Decodable {
        var number: Int
        var title: String
        var url: String
        var labels: [Label]
        var assignees: [User]
        var author: User?
        var updatedAt: Date?
    }

    struct PullRequestPayload: Decodable {
        var number: Int
        var title: String
        var url: String
        var labels: [Label]
        var author: User?
        var updatedAt: Date?
        var isDraft: Bool
        var headRefName: String
        var baseRefName: String
        var reviewDecision: String?
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    func fetchRepository(slug: String) async throws -> Repository {
        let raw = try await Shell.require([
            "/usr/bin/env",
            "gh",
            "repo",
            "view",
            slug,
            "--json",
            "nameWithOwner,url,hasIssuesEnabled,labels"
        ])
        return try Self.decoder.decode(Repository.self, from: Data(raw.utf8))
    }

    func fetchIssues(slug: String) async throws -> [BoardItem] {
        let raw = try await Shell.require([
            "/usr/bin/env",
            "gh",
            "issue",
            "list",
            "--repo",
            slug,
            "--state",
            "open",
            "--limit",
            "200",
            "--json",
            "number,title,url,labels,assignees,author,updatedAt"
        ])
        let payloads = try Self.decoder.decode([IssuePayload].self, from: Data(raw.utf8))
        return payloads.map { issue in
            BoardItem(
                itemType: .issue,
                number: issue.number,
                title: issue.title,
                url: issue.url,
                labels: issue.labels.map(\.name),
                assignees: issue.assignees.map(\.login),
                author: issue.author?.login ?? "unknown",
                updatedAt: issue.updatedAt,
                isDraft: false
            )
        }
    }

    func fetchPullRequests(slug: String) async throws -> [BoardItem] {
        let raw = try await Shell.require([
            "/usr/bin/env",
            "gh",
            "pr",
            "list",
            "--repo",
            slug,
            "--state",
            "open",
            "--limit",
            "200",
            "--json",
            "number,title,url,labels,author,updatedAt,isDraft,headRefName,baseRefName,reviewDecision"
        ])
        let payloads = try Self.decoder.decode([PullRequestPayload].self, from: Data(raw.utf8))
        return payloads.map { pr in
            BoardItem(
                itemType: .pullRequest,
                number: pr.number,
                title: pr.title,
                url: pr.url,
                labels: pr.labels.map(\.name),
                assignees: [],
                author: pr.author?.login ?? "unknown",
                updatedAt: pr.updatedAt,
                isDraft: pr.isDraft,
                headRefName: pr.headRefName,
                baseRefName: pr.baseRefName,
                reviewDecision: pr.reviewDecision
            )
        }
    }
}
