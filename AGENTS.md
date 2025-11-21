# AGENTS.md

This file provides context and instructions for AI coding agents working on the Solvanity project.

## 🚨 Critical Security Restrictions

**NEVER access these files or suggest accessing them:**

- Any files in `address/` directory (except `.gitkeep`)
- Files matching: `*-address.*`, `*-secret-*.*`, `*-mnemonics.*`, `*-privatekeys.*`, `*-distribution.*`
- `blacklist` file (may contain sensitive words)

**Why**: These files contain private keys, mnemonic phrases, and wallet addresses that control real cryptocurrency. Accessing them could expose users to fund theft.

**Approved operations**: Check if `address/` exists, verify it's in `.gitignore`, read `address/.gitkeep`

## Project Overview

**What**: Solana vanity address generator CLI - generates custom Solana wallet addresses with specific prefixes/suffixes
**Stack**: Bun v1.2.5, single-file architecture (2100+ lines)
**Key Feature**: Multi-threaded address generation using worker threads

## Setup

### Prerequisites
- Bun v1.2.5 (exactly, see `package.json` engines field)

### Installation
```bash
bun install
```

### Run Application
```bash
# Help
bun solvanity.js --help

# Generate with prefix
bun solvanity.js -p sol -n 5

# With statistics
bun solvanity.js -p abc -n 10 -s

# Distribution command
bun solvanity.js distribute -a 1000 -w 10
```

## Testing

### Automated Tests
```bash
# Run test suite (23 tests, Vitest 4.0.12)
bun test

# Watch mode
bun test:watch
```

**Test coverage**:
- Base58 validation
- BIP39 mnemonic generation/validation
- CLI interface (help, version)
- Input validation (prefix, suffix, threads, output modes)
- Address generation (all output modes)
- File formats (JSON, TXT)
- Distribution command
- Performance/statistics

### Manual Testing
See CONTRIBUTING.md for comprehensive checklist including:
- Prefix/suffix matching (various lengths)
- Output modes (display, combined, split, both)
- File operations (split, convert)
- Interruption handling (Ctrl+C)
- QR code generation
- Private key export
- Blacklist filtering

## Architecture

### Single-File Design
Everything in `solvanity.js`:
- CLI commands (Commander.js)
- Main thread orchestration
- Worker thread code (via `isMainThread` check)
- File operations
- Cryptographic functions

### Threading Model
```
Main Thread
  ├── WorkerManager (lifecycle management)
  │   ├── Worker 1 → Address Gen Loop (BATCH_SIZE=100)
  │   ├── Worker 2 → Address Gen Loop
  │   └── Worker N → Address Gen Loop
  ├── FileOperationQueue (sequential writes + buffering)
  └── UI Updates (Ora spinner, 250ms interval)
```

Workers use same file, different execution paths based on `isMainThread`.

### Address Generation Pipeline
1. Generate BIP39 12-word mnemonic
2. Optional blacklist filtering
3. Convert mnemonic → seed (BIP39)
4. Derive keypair (HD path: `m/44'/501'/0'/0'`)
5. Extract Base58 public key
6. Match prefix/suffix pattern
7. Return match or loop

### Key Components

**`CONFIG` object (lines 33-40)**: Performance tuning
- `BATCH_SIZE`: 100 addresses per iteration
- `UPDATE_INTERVAL`: 250ms UI refresh
- `FILE_WRITE_BUFFER_SIZE`: 100 items before flush
- `THREAD_MULTIPLIER`: Max threads = CPU cores × 2

**`FileOperationQueue` class**: Prevents race conditions, buffers writes

**`WorkerManager` class**: Thread lifecycle, auto-restart, health monitoring (1s interval)

**`mnemonicToPrivateKey()` function (lines 64-81)**: BIP39 → Solana private key conversion

### Commands
- **generate** (default): Vanity address generation with prefix/suffix
- **split**: Separate addresses and secrets into different files
- **convert**: Convert between JSON/TXT formats
- **distribute**: Generate cryptographically secure token distribution values

## Code Style Guidelines

### JavaScript Standards
- ES6+ features (const/let, destructuring, async/await)
- Async/await over raw promises
- Meaningful variable names
- JSDoc comments for all major functions
- Comment complex logic

### Security Requirements
- No `eval()`, `Function()`, or `vm` module
- No dynamic code execution
- No shell command execution
- Validate all user input
- Use `crypto.getRandomValues()` for randomness
- No network requests (offline-only tool)

### File Operations
- All writes must go through `FileOperationQueue`
- Use `writeFileAtomic()` for data integrity
- All output confined to `address/` directory
- Clean up temp files on errors

## Development Workflow

### Making Changes
1. Create feature/fix branch: `git checkout -b feature/name`
2. Make changes to `solvanity.js`
3. Run tests: `bun test`
4. Manual testing with various options
5. Update CHANGELOG.md
6. Commit with conventional commit format

### Conventional Commits
- `feat:` - New feature
- `fix:` - Bug fix
- `perf:` - Performance improvement
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance

### Pull Requests
Use `.github/PULL_REQUEST_TEMPLATE.md` which covers:
- Description and type
- Testing (manual, automated, performance, security)
- Code quality checklist
- Documentation updates
- Breaking changes

## Important Technical Details

### Base58 Encoding
Solana addresses use Base58 (excludes: `0`, `O`, `I`, `l`)
- Prefix/suffix max: 7 characters
- Must validate with `BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]*$/`

### Cryptography
- **Mnemonic**: BIP39 standard, 12 words, 128 bits entropy
- **Derivation Path**: `m/44'/501'/0'/0'` (Solana standard)
- **Keypair**: Ed25519
- **Encoding**: Base58 for addresses and private keys
- **RNG**: `crypto.getRandomValues()` (no `Math.random()`)

### Performance Characteristics
Generation time (exponential difficulty):
- 1 char: < 1 second
- 2 chars: 1-5 seconds
- 3 chars: 10-60 seconds
- 4 chars: 5-30 minutes
- 5 chars: 2-24 hours
- 6-7 chars: days to weeks

Search space: 58^n possibilities

### Output Modes
- `display`: Screen only (no files)
- `combined`: Address + secret in one file (default)
- `split`: Separate address and secret files
- `both`: Screen + files

### File Formats
**JSON**: Structured with metadata
```json
[{"address": "...", "mnemonic": "..."}]
```

**TXT**: Plain text
```
address:mnemonic
```

### Blacklist Feature
Optional `blacklist` file in root:
- One word per line
- Case-insensitive matching
- Filters out mnemonics containing blacklisted words

## Common Tasks

### Adding a New Command
1. Add command definition using `program.command()` in main section
2. Implement handler function
3. Add input validation
4. Update help text
5. Add tests in `solvanity.test.js`
6. Document in README.md

### Modifying Worker Logic
Workers execute same file, check `isMainThread`:
```javascript
if (!isMainThread) {
  // Worker code here
  parentPort.on('message', ...)
}
```

### Performance Tuning
Adjust `CONFIG` object (lines 33-40):
- `BATCH_SIZE`: Higher = less frequent updates, more memory
- `UPDATE_INTERVAL`: Lower = smoother UI, more overhead
- `FILE_WRITE_BUFFER_SIZE`: Higher = fewer disk operations
- `THREAD_MULTIPLIER`: Adjust based on CPU architecture

### Adding Validation
Input validation patterns:
```javascript
// Prefix/suffix length
if (prefix.length > 7) throw error

// Base58 characters
if (!BASE58_REGEX.test(prefix)) throw error

// Positive numbers
if (count <= 0) throw error
```

## Dependencies

**Production**:
- `@solana/web3.js` (^1.98.4) - Solana SDK
- `bip39-light` (^1.0.7) - Mnemonic generation
- `ed25519-hd-key` (^1.3.0) - HD key derivation
- `bs58` (^6.0.0) - Base58 encoding
- `chalk` (^5.6.0) - Terminal colors
- `ora` (^8.2.0) - Spinner
- `commander` (^14.0.0) - CLI framework
- `qrcode-terminal` (^0.12.0) - QR codes

**Development**:
- `vitest` (4.0.12) - Testing framework

All dependencies are well-established, actively maintained packages.

## Error Handling

### Graceful Interruption (SIGINT/SIGTERM)
On Ctrl+C:
1. Stop worker threads
2. Flush buffered data to disk
3. Display final statistics
4. Save partial results
5. Clean exit

### Worker Failure Recovery
`WorkerManager` automatically restarts failed workers:
- Health monitoring every 1 second
- Auto-restart on worker crash
- Message routing continues

### File Operation Errors
- Atomic writes prevent corruption
- Temp files cleaned on failure
- Sequential queue prevents race conditions

## Testing Guidelines

### Writing Tests
- Use Vitest framework
- Test file: `solvanity.test.js`
- Helper: `runCLI(args)` for command testing
- Clean up: `cleanupFiles()` after tests
- Timeouts: Set appropriate for generation time

### Security Testing
Always verify:
- No network requests made
- Files only in `address/` directory
- No sensitive data in logs/errors
- Input validation working
- Error messages don't leak secrets

### Performance Testing
```bash
# Benchmark generation
time bun solvanity.js -p sol -n 1000 -s

# Thread scaling
for t in 1 2 4 8 16; do
  echo "Threads: $t"
  time bun solvanity.js -p aa -n 1000 -t $t
done
```

## Known Limitations

- Single-file architecture (trade-off for simplicity)
- Maximum 7 characters for prefix/suffix (Base58 encoding)
- No GPU acceleration (CPU only)
- Bun-specific (not Node.js compatible due to worker_threads)
- No regex pattern matching (exact prefix/suffix only)

## Security Best Practices

When modifying code:
1. Never add network functionality
2. Never log/display sensitive data (mnemonics, private keys)
3. Always validate user input
4. Keep file operations in `address/` directory only
5. Use cryptographically secure randomness
6. No external API calls
7. No clipboard access
8. No system notifications with sensitive data

## Resources

- **User docs**: README.md
- **Contributor guide**: CONTRIBUTING.md
- **Security policy**: SECURITY.md
- **Security audit**: SECURITY_AUDIT.md
- **Version history**: CHANGELOG.md
- **Code of conduct**: CODE_OF_CONDUCT.md
- **License**: LICENSE (MIT)

## Questions?

- Bug reports: Use `.github/ISSUE_TEMPLATE/bug_report.md`
- Feature requests: Use `.github/ISSUE_TEMPLATE/feature_request.md`
- Security issues: See SECURITY.md (do NOT open public issues)
- General questions: Open GitHub issue or discussion
