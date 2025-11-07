# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-11-06

### Added
- **@lattestream/client**: Added automatic discovery endpoint integration for public API keys (`lspk_`)
  - Discovery endpoint is called before WebSocket connection establishment
  - Implements exponential backoff with jitter for discovery retries (max 3 attempts)
  - WebSocket endpoint is dynamically built from discovery response: `wss://{cluster}-node{node_id}.lattestream.com`
  - Discovery token is automatically included in WebSocket connection as query parameter
  - Localhost support for development environments

### Changed
- **@lattestream/client**: Connection flow now requires valid token format (`lspc_` or `lspk_`)
- **@lattestream/client**: Public key connections (`lspk_`) now fail fast if discovery endpoint is unreachable
- **@lattestream/client**: Improved error messages for invalid API key formats

### Technical Details
- Discovery endpoint called at: `https://{endpoint}/discover?api_key={publicKey}`
- WebSocket URL format: `wss://{endpoint}?discovery_token={token}` (for token-based auth)
- Connection will not proceed without a valid discovery token for public keys

## [1.1.0] - 2025-10-12

### Added
- **@lattestream/server**: Added `verifyWebhookSignature` function export for verifying webhook signatures from LatteStream
- **@lattestream/server**: Added `WebhookEventPayload` TypeScript type export for webhook request body typing
- **@lattestream/server**: Added comprehensive webhook documentation to README with examples

## [1.0.2] - 2025-10-12

### Changed
- **All packages**: Added links to specific SDK documentation
- **All packages**: Updated homepage and repository URLs for npm
- **All packages**: Redirected npm links to proper package directories
- **All packages**: Updated configuration and added npm ignore files

## [1.0.1] - 2025-10-12

### Added
- **@lattestream/server**: Refined SDK with comprehensive README documentation
- **@lattestream/client**: Refined SDK with comprehensive README documentation

### Changed
- Improved documentation structure across both packages

## [1.0.0] - 2025-10-12

### Added
- **@lattestream/server**: Initial release of server SDK for Node.js and Deno
  - Secure authentication with encrypted secrets
  - Channel authorization for private and presence channels
  - Event triggering (single and batch)
  - Connection pooling, batching, caching, and retry logic
  - Channel information and user management
  - Webhook signature verification (internal method)
  - TypeScript support with full type definitions
  - Performance optimizations with automatic event batching

- **@lattestream/client**: Initial release of client SDK for browsers and frontend frameworks
  - WebSocket connection management
  - Public, private, and presence channel support
  - Event binding and triggering
  - Channel authorization
  - TypeScript support with full type definitions
  - Connection state management
  - Automatic reconnection logic

### Infrastructure
- Set up monorepo structure with pnpm workspaces
- Configured build tooling with tsup
- Added TypeScript configuration
- Set up testing infrastructure with vitest
- Configured ESLint for code quality
- Added exponential backoff for retries
- Implemented encryption helpers

[Unreleased]: https://github.com/lattestream/lattestream-js/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/lattestream/lattestream-js/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/lattestream/lattestream-js/compare/d84afb6...v1.1.0
[1.0.2]: https://github.com/lattestream/lattestream-js/commit/d84afb6
[1.0.1]: https://github.com/lattestream/lattestream-js/compare/18bd26b...c4dda17
[1.0.0]: https://github.com/lattestream/lattestream-js/commit/1e0b4bd
