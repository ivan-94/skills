// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "AgentBoard",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "AgentBoard", targets: ["AgentBoard"])
    ],
    targets: [
        .executableTarget(
            name: "AgentBoard",
            swiftSettings: [
                .enableUpcomingFeature("ExistentialAny")
            ]
        )
    ]
)
