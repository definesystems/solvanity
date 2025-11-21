# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.3] - 2025-11-20

### Added
- CLAUDE.md documentation for AI-assisted development
- SECURITY_AUDIT.md guide for user-driven security verification
- Comprehensive security audit prompt for AI assistants (Claude, ChatGPT, Gemini, DeepSeek)

### Documentation
- Added detailed architecture documentation for AI code assistants
- Created ready-to-use security audit guide with structured prompts
- Documented threading model, file operations, and key technical details
- Included step-by-step instructions for users to verify code safety independently

## [1.5.2] - 2025-08-13

### Changed
- Version number is now imported from package.json to maintain single source of truth
- Improved version management by using JSON import assertion

### Technical
- Replaced hardcoded version string with dynamic import from package.json
- Uses ES module import syntax: `import { version } from './package.json' with { type: 'json' }`

## [1.5.0] - 2025-07-20

### Added
- Token distribution generator command (`distribute`)
- Cryptographically secure random distribution values
- Support for min/max constraints in distributions
- Decimal precision support (0-18 decimals)
- Unique value generation option for distributions
- Distribution statistics (min, max, average, total)

### Changed
- Enhanced random number generation using crypto.getRandomValues()
- Improved distribution algorithm with automatic rounding corrections

## [1.4.0] - 2025-07-18

### Changed
- Improved error messages for better user experience
- Enhanced documentation structure

## [1.3.7] - 2025-07-15

### Added
- Graceful interruption handling - statistics are preserved when process is interrupted
- Success rate display in statistics
- Partial results notification when interrupted
- Dynamic thread limit based on CPU cores
- Warning messages when exceeding recommended thread count

### Changed
- Improved worker management with automatic restart on failure
- Better file operation queue with buffering
- Enhanced performance metrics with bounded arrays

### Fixed
- Race condition in file operations
- Memory leaks in worker thread management
- Performance issues with file I/O operations

## [1.3.5] - 2025-07-10

### Added
- Commander.js integration for better CLI parsing
- Private key export functionality (`-k` flag)
- Split command for separating addresses and secrets
- Convert command for file format conversion
- Atomic file writes to prevent corruption

### Changed
- Refactored command-line argument parsing
- Improved file handling with FileOperationQueue
- Better error handling throughout the application

## [1.3.0] - 2025-07-02

### Added
- Multi-threading support for parallel address generation
- QR code generation for addresses
- Support for both JSON and TXT output formats
- Custom filename support
- Output modes: screen, file, or all

### Changed
- Improved address generation algorithm
- Better progress reporting with spinner

## [1.2.0] - 2025-06-17

### Added
- Real-time progress updates
- Performance statistics with `-s` flag
- Blacklist feature for filtering unwanted mnemonic words

### Changed
- Code refactoring

## [1.1.0] - 2025-05-01

### Added
- Suffix support for address generation
- Configurable thread count

### Changed
- Optimized Base58 validation

## [1.0.0] - 2025-03-09

### Added
- Initial release
- Basic CLI interface
- Basic vanity address generation with prefix matching

[1.5.1]: https://github.com/definesystems/solvanity/compare/v1.5.2...v1.5.3