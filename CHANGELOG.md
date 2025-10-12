# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/lattestream/lattestream-js/compare/d84afb6...HEAD
[1.1.0]: https://github.com/lattestream/lattestream-js/compare/d84afb6...HEAD
[1.0.2]: https://github.com/lattestream/lattestream-js/commit/d84afb6
[1.0.1]: https://github.com/lattestream/lattestream-js/compare/18bd26b...c4dda17
[1.0.0]: https://github.com/lattestream/lattestream-js/commit/1e0b4bd
