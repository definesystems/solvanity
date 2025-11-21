# Contributing to Solvanity

Thank you for your interest in contributing to Solvanity! This document provides guidelines and information for developers who want to contribute to the project.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Technical Architecture](#technical-architecture)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Performance Benchmarks](#performance-benchmarks)
- [Code Style Guidelines](#code-style-guidelines)
- [Submitting Changes](#submitting-changes)
- [Roadmap](#roadmap)

## Development Environment Setup

### Prerequisites

1. **Bun Runtime** (v1.2.5):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Node.js** (for compatibility testing):
   ```bash
   # Install via nvm (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 18
   ```

3. **Git**:
   ```bash
   git --version # Should be 2.0 or higher
   ```

### Initial Setup

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/definesystems/solvanity.git
   cd solvanity
   ```

2. **Install Dependencies**:
   ```bash
   bun install
   ```

3. **Run Development Version**:
   ```bash
   bun run solvanity.js -p tst -n 5
   ```

4. **Set Up Git Hooks** (optional):
   ```bash
   # Create pre-commit hook for linting
   echo '#!/bin/sh\nbun run lint' > .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```

## Project Structure

```
solvanity/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md       # Bug report template
│   │   ├── feature_request.md  # Feature request template
│   │   └── config.yml          # Issue template configuration
│   └── PULL_REQUEST_TEMPLATE.md # Pull request template
├── address/                     # Output directory for generated addresses
│   └── .gitkeep                # Keeps directory in git
├── solvanity.js                # Main application file (CLI + Worker threads)
├── solvanity.test.js           # Automated test suite (Vitest)
├── vitest.config.js            # Vitest configuration
├── package.json                # Project dependencies and scripts
├── bun.lock                    # Bun lockfile
├── README.md                   # User documentation
├── CONTRIBUTING.md             # Developer documentation (this file)
├── CHANGELOG.md                # Version history
├── LICENSE                     # MIT License
├── SECURITY.md                 # Security policy and reporting
├── SECURITY_AUDIT.md           # AI-powered security audit guide
├── PRE_RELEASE_AUDIT.md        # Pre-release audit report
├── CODE_OF_CONDUCT.md          # Contributor Covenant code of conduct
├── CLAUDE.md                   # AI assistant development guide
├── blacklist                   # Optional: Blacklisted mnemonic words
└── .gitignore                  # Git ignore rules (includes address/)
```

### Key Components in solvanity.js

1. **Configuration Object** (`CONFIG`):
   - Performance tuning parameters
   - Thread management settings
   - Buffer sizes and intervals

2. **File Operations**:
   - `FileOperationQueue`: Prevents race conditions
   - `writeFileAtomic()`: Ensures data integrity

3. **Worker Management**:
   - `WorkerManager`: Handles thread lifecycle
   - Automatic restart on failure
   - Health monitoring

4. **Core Functions**:
   - `generateVanityAddresses()`: Main orchestrator
   - `mnemonicToPrivateKey()`: Key conversion
   - `convertFile()`, `splitFile()`: File operations

## Technical Architecture

### Threading Model

```
Main Thread
    ├── WorkerManager
    │   ├── Worker 1 ─────► Address Generation Loop
    │   ├── Worker 2 ─────► Address Generation Loop
    │   └── Worker N ─────► Address Generation Loop
    ├── FileOperationQueue
    │   └── Buffered Writes
    └── UI Updates (Spinner)
```

### Address Generation Pipeline

1. **Mnemonic Generation**: BIP39 12-word phrase
2. **Seed Derivation**: Mnemonic → Seed
3. **HD Key Derivation**: Path `m/44'/501'/0'/0'`
4. **Keypair Creation**: Ed25519 keypair
5. **Address Extraction**: Base58 public key
6. **Pattern Matching**: Prefix/suffix validation

### Performance Optimizations

- **Batch Processing**: Workers process 100 addresses per iteration
- **Buffered I/O**: File writes buffered to reduce disk operations
- **Bounded Arrays**: Performance metrics use fixed-size arrays
- **Worker Pooling**: Reuse threads instead of creating new ones

## Development Workflow

### 1. Creating a New Feature

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes
# Test thoroughly
bun solvanity.js -p tst -n 100 -s

# Commit with descriptive message
git commit -m "feat: add amazing feature"
```

### 2. Bug Fixes

```bash
# Create bugfix branch
git checkout -b fix/issue-description

# Fix the bug
# Add tests if applicable
# Verify fix doesn't break existing features

git commit -m "fix: resolve issue with X"
```

### 3. Performance Improvements

```bash
# Benchmark before changes
bun solvanity.js -p bench -n 1000 -s > benchmark-before.txt

# Make improvements

# Benchmark after changes
bun solvanity.js -p bench -n 1000 -s > benchmark-after.txt

# Compare results
git commit -m "perf: improve generation speed by X%"
```

## Testing

### Automated Testing

The project includes a comprehensive automated test suite using **Vitest 4.0.12**:

```bash
# Run all tests
bun test

# Run tests in watch mode (re-runs on file changes)
bun test:watch

# Run tests with coverage (future)
bun test --coverage
```

**Test Coverage** (23 tests):
- ✅ Base58 character validation
- ✅ BIP39 mnemonic generation and validation
- ✅ CLI help and version information
- ✅ Input validation (prefix, suffix, threads, output modes)
- ✅ Address generation (display, combined, split, both modes)
- ✅ File format support (JSON, TXT)
- ✅ Distribution command with constraints
- ✅ Performance and statistics output

**Test Files**:
- `solvanity.test.js` - Main test suite
- `vitest.config.js` - Test configuration

### Manual Testing Checklist

Beyond automated tests, manually verify:

- [ ] Basic generation works (`bun solvanity.js`)
- [ ] Prefix matching works correctly (various lengths)
- [ ] Suffix matching works correctly (various lengths)
- [ ] Combined prefix/suffix works
- [ ] File output saves correctly to `address/` directory
- [ ] JSON format is valid and parseable
- [ ] TXT format is correctly formatted
- [ ] Split command works with existing files
- [ ] Convert command works between formats
- [ ] Interruption handling (Ctrl+C) preserves data
- [ ] Thread count validation works
- [ ] Performance stats are accurate
- [ ] QR codes display properly (`-q` flag)
- [ ] Private key export works (`-k` flag) - handle with care!
- [ ] Blacklist filtering works (create test blacklist file)
- [ ] Multiple addresses generation (`-n` flag)
- [ ] Custom filename option works
- [ ] Statistics flag shows detailed metrics (`-s`)

### Testing Best Practices

1. **Always test security-sensitive changes**:
   - Verify no network requests are made
   - Ensure files are only written to `address/` directory
   - Confirm sensitive data is not logged

2. **Performance testing**:
   - Benchmark before and after changes
   - Test with various thread counts
   - Monitor memory usage

3. **Cross-platform testing**:
   - Test on Linux, macOS, and Windows (if possible)
   - Verify file path handling works correctly

4. **Edge cases**:
   - Empty input
   - Maximum length prefix/suffix (7 characters)
   - Invalid Base58 characters
   - Zero or negative counts

## Performance Benchmarks

### Running Benchmarks

```bash
# Standard benchmark
time bun solvanity.js -p sol -n 1000 -s

# Thread scaling test
for t in 1 2 4 8 16; do
  echo "Threads: $t"
  time bun solvanity.js -p aa -n 1000 -t $t
done
```

### Current Performance Metrics (TODO)

On _ (8 cores):
- 1 character prefix: ~N addresses/second
- 2 character prefix: ~N addresses/second
- 3 character prefix: ~N addresses/second

## Code Style Guidelines

### JavaScript Style

1. **Use ES6+ Features**:
   ```javascript
   // Good
   const { address, mnemonic } = result;
   
   // Avoid
   var address = result.address;
   var mnemonic = result.mnemonic;
   ```

2. **Async/Await over Promises**:
   ```javascript
   // Good
   const data = await fs.promises.readFile(file);
   
   // Avoid
   fs.readFile(file).then(data => {});
   ```

3. **Meaningful Variable Names**:
   ```javascript
   // Good
   const workerThreadCount = os.cpus().length;

   // Avoid
   const n = os.cpus().length;
   ```

4. **Comment Complex Logic**:
   ```javascript
   // Calculate weighted average for performance metrics
   performanceData.total = (oldTotal * oldSamples + newTotal * newSamples) / totalSamples;
   ```

### Git Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `perf:` Performance improvement
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

## Submitting Changes

### Pull Request Process

1. **Update Documentation**:
   - Update README.md if adding user-facing features
   - Update CONTRIBUTING.md for developer changes
   - Update CHANGELOG.md with your changes

2. **Ensure Quality**:
   - Code follows style guidelines
   - All tests pass
   - No performance regressions
   - Documentation is clear

3. **Submit PR**:
   - Clear title and description
   - Reference any related issues
   - Include benchmark results if relevant

### Pull Request Template

When you create a pull request, GitHub will automatically load the PR template from `.github/PULL_REQUEST_TEMPLATE.md`. This template includes comprehensive checklists for:

- Description and type of change
- Testing requirements (manual, automated, performance, security)
- Code quality checklist
- Documentation updates
- Breaking changes handling
- Security considerations

**Key sections to complete**:
- Describe your changes clearly
- List what you've tested
- Check all security items
- Update relevant documentation
- Note any breaking changes

## Roadmap

### Completed (v1.5.3) ✅
- ✅ Automated test suite (Vitest)
- ✅ Security policy and reporting guidelines
- ✅ Code of conduct
- ✅ Issue and PR templates
- ✅ Comprehensive documentation

### Near Term (v1.6.0)
- [ ] Test coverage reporting
- [ ] GitHub Actions CI/CD pipeline
- [ ] Performance regression testing
- [ ] Additional test scenarios (worker thread failures, edge cases)

### Medium Term (v1.7.0+)
- [ ] GPU acceleration research
- [ ] Advanced pattern matching (regex support)
- [ ] Batch API for programmatic use
- [ ] Multi-pattern generation (generate multiple patterns in one run)

### Long Term (v2.0.0)
- [ ] Distributed generation network
- [ ] GPU acceleration implementation
- [ ] Web-based interface (optional)
- [ ] Plugin system for custom address validation

### Known Limitations
- Maximum 7 characters for prefix/suffix (Base58 encoding limit)
- No GPU acceleration (CPU only)
- Single-file architecture (trade-off for simplicity)

## Questions?

### Getting Help

- **Bug Reports**: Use the [bug report template](https://github.com/definesystems/solvanity/issues/new?template=bug_report.md)
- **Feature Requests**: Use the [feature request template](https://github.com/definesystems/solvanity/issues/new?template=feature_request.md)
- **Discussions**: Join [GitHub Discussions](https://github.com/definesystems/solvanity/discussions)
- **Security Issues**: See [SECURITY.md](SECURITY.md) for responsible disclosure

### Important Links

- [Code of Conduct](CODE_OF_CONDUCT.md) - Community guidelines
- [Security Policy](SECURITY.md) - Security reporting and best practices
- [Security Audit Guide](SECURITY_AUDIT.md) - AI-powered code verification
- [License](LICENSE) - MIT License terms

### Contact

- **General inquiries**: Open a GitHub issue
- **Security concerns**: security@define.systems
- **Code of conduct violations**: conduct@define.systems

---

Thank you for contributing to Solvanity! 🚀