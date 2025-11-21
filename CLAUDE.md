# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL SECURITY RESTRICTIONS

**ABSOLUTE PROHIBITION - NEVER VIOLATE THESE RULES:**

1. **DO NOT** read, analyze, or load ANY files from the `address/` directory into neural networks or AI systems
2. **DO NOT** access files with the following patterns:
   - `*-address.json`, `*-address.txt`
   - `*-secret-*.json`, `*-secret-*.txt`
   - `*-mnemonics.*`, `*-privatekeys.*`
   - `*-distribution.*`
3. **DO NOT** suggest reading these files for debugging, analysis, or any other purpose
4. **DO NOT** use these files as examples or test data

**Reason**: These files contain HIGHLY SENSITIVE DATA including:
- BIP39 mnemonic phrases (12-word recovery phrases)
- Private keys (grant full wallet access)
- Solana wallet addresses
- Token distribution data

**Violation Risk**: Reading these files could expose private keys and mnemonic phrases that control real cryptocurrency wallets, leading to potential fund theft.

**Approved Operations**:
- Reading `address/.gitkeep` (empty placeholder file)
- Checking if `address/` directory exists
- Verifying `address/` is in `.gitignore`
- General file structure documentation (without content access)

## Project Overview

Solvanity is a high-performance Solana vanity address generator CLI built with Bun. It generates Solana wallet addresses with custom prefixes/suffixes using multi-threaded processing. The entire application is contained in a single 2100+ line file (`solvanity.js`) that handles CLI interface, worker thread management, and file operations.

## Development Commands

### Running the Application
```bash
# Run with help
bun solvanity.js --help

# Generate addresses with prefix
bun solvanity.js -p sol -n 5

# Generate with statistics enabled
bun solvanity.js -p abc -n 10 -s

# Run distribute command
bun solvanity.js distribute -a 1000 -w 10
```

### Installation
```bash
bun install
```

### Testing
```bash
# Run automated test suite
bun test

# Run tests in watch mode
bun test:watch
```

The project includes a comprehensive test suite using Vitest 4.0.12 that covers:
- Base58 validation
- Mnemonic generation and validation
- Address generation with various output modes
- File operations and formats
- Input validation
- Distribution command
- CLI interface

Manual testing procedures are also documented in CONTRIBUTING.md.

## Architecture

### Single-File Structure
The entire application lives in `solvanity.js` which contains:
- CLI command definitions (using Commander.js)
- Main thread orchestration logic
- Worker thread code (runs in same file via `isMainThread` check)
- File operation utilities
- Mnemonic/private key conversion functions

### Threading Model
```
Main Thread
    ├── WorkerManager (manages lifecycle of N worker threads)
    │   ├── Worker 1 → Address Generation Loop (BATCH_SIZE=100)
    │   ├── Worker 2 → Address Generation Loop
    │   └── Worker N → Address Generation Loop
    ├── FileOperationQueue (sequential file writes with buffering)
    └── UI Updates (Ora spinner, updates every 250ms)
```

Workers run the same `solvanity.js` file but execute different code paths based on `isMainThread` flag. Each worker:
1. Generates BIP39 12-word mnemonic phrases in batches of 100
2. Derives Solana addresses via HD path `m/44'/501'/0'/0'`
3. Checks if addresses match prefix/suffix patterns
4. Returns matches to main thread via message passing

### Key Components

**FileOperationQueue**: Prevents race conditions by sequentializing all file writes. Includes buffering (default 100 items) to reduce disk I/O.

**WorkerManager**: Handles worker lifecycle including:
- Automatic thread count based on CPU cores
- Worker restart on failure
- Health monitoring at 1-second intervals
- Message routing between workers and main thread

**Configuration Tuning**: All performance parameters in `CONFIG` object (lines 33-40):
- `BATCH_SIZE`: Addresses per worker iteration (100)
- `UPDATE_INTERVAL`: UI refresh rate (250ms)
- `FILE_WRITE_BUFFER_SIZE`: Buffer size before flush (100)
- `THREAD_MULTIPLIER`: Max threads = CPU cores × 2

### Address Generation Pipeline
1. Generate BIP39 mnemonic (12 words)
2. Optional blacklist filtering (if `blacklist` file exists)
3. Convert mnemonic to seed
4. Derive keypair using path `m/44'/501'/0'/0'`
5. Extract public key as Base58 address
6. Pattern match against prefix/suffix
7. Return match or continue loop

### Commands
- **Default (generate)**: Generate vanity addresses with optional prefix/suffix
- **split**: Split existing address files into separate public/private files
- **convert**: Convert between JSON and TXT formats
- **distribute**: Generate cryptographically secure token distribution values

## File Operations

### Output Modes
- `display`: Show on screen only
- `combined`: Save address + secret together (default)
- `split`: Save addresses and secrets in separate files
- `both`: Display + save to file

### Output Directory
All generated files are saved to `address/` directory with timestamped filenames:
- `{timestamp}-address.json` (combined mode)
- `{timestamp}-address.json` + `{timestamp}-secret-mnemonics.json` (split mode)
- `{timestamp}-address.json` + `{timestamp}-secret-privatekeys.json` (split with -k flag)

### Format Support
- **JSON**: Structured format with metadata (default)
- **TXT**: Plain text, one entry per line (address:mnemonic or just address)

## Important Technical Details

### Base58 Validation
Solana addresses use Base58 encoding which excludes: `0`, `O`, `I`, `l` (to avoid confusion). Prefix/suffix patterns must only use valid Base58 characters and be max 7 characters.

### Mnemonic to Private Key Conversion
Function `mnemonicToPrivateKey()` (lines 64-81):
1. Converts 12-word mnemonic to seed via BIP39
2. Derives key using Solana standard path `m/44'/501'/0'/0'`
3. Creates Ed25519 keypair
4. Returns Base58-encoded private key

Use `-k/--privatekey` flag to export private keys instead of mnemonics.

### Blacklist Filtering
Optional `blacklist` file in root directory can contain unwanted mnemonic words (one per line, case-insensitive). Workers check generated mnemonics against this list.

### Performance Characteristics
- 1 char prefix: < 1 second
- 2 char prefix: 1-5 seconds
- 3 char prefix: 10-60 seconds
- 4 char prefix: 5-30 minutes
- 5 char prefix: 2-24 hours

Difficulty increases exponentially due to Base58 search space (58^n possibilities).

## Development Notes

### Bun Runtime Requirement
This project requires Bun v1.2.5 specifically (see package.json engines). Uses Bun's worker_threads implementation for multi-threading.

### No Git Repository
The working directory is not a Git repository. If adding Git, ensure `address/` directory is in `.gitignore` to prevent committing generated wallets.

### Error Handling
The application includes graceful interruption handling (Ctrl+C). When interrupted:
- Statistics are preserved and displayed
- Buffered data is flushed to disk
- Partial results are saved

### Contributing
See CONTRIBUTING.md for:
- Manual testing checklist (no automated tests yet)
- Performance benchmarking procedures
- Conventional commit message format
- Pull request process

## Security Considerations

Generated mnemonics and private keys provide complete wallet access. The application displays security warnings and users should:
- Generate addresses on offline computers for maximum security
- Store output files in encrypted locations
- Never commit address files to version control
- Delete temporary files securely after backup
