# Solvanity

[![Version](https://img.shields.io/badge/version-1.5.3-blue.svg)](https://github.com/definesystems/solvanity/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-1.2.5-orange.svg)](https://bun.sh)
[![Security](https://img.shields.io/badge/security-audited-brightgreen.svg)](SECURITY_AUDIT.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-contributor%20covenant-purple.svg)](CODE_OF_CONDUCT.md)

A high-performance Solana vanity address generator CLI built with Bun.

![Solvanity CLI](repo.png)

## 🚀 Quick Start

### Most Common Use Case
Generate a Solana address starting with "sol":
```bash
bun solvanity.js -p sol
```

### Installation

**Prerequisites**: [Bun](https://bun.sh) runtime (v1.2.5)

```bash
# Clone the repository
git clone https://github.com/definesystems/solvanity.git
cd solvanity

# Install dependencies
bun install

# Generate your first vanity address
bun solvanity.js -p sol
```

## 🛡️ Security Best Practices

⚠️ **IMPORTANT: Keep Your Keys Safe!**

1. **Mnemonic Phrases**: These 12-word phrases provide complete access to your wallet. Never share them.
2. **Private Keys**: When using `-k/--privatekey`, the exported keys grant full wallet access.
3. **File Storage**:
  - Store generated files in secure, encrypted locations
  - Never commit address files to version control
  - Use encrypted drives or secure cloud storage
4. **Best Practices**:
  - Generate addresses on an offline computer for maximum security
  - Immediately transfer files to secure storage after generation
  - Delete temporary files securely after backing up

## Core Features

### Essential Features
- 🎯 **Custom Addresses**: Generate addresses with specific prefixes/suffixes
- 💾 **Flexible Output**: Multiple output modes including split file saving
- 📄 **Multiple Formats**: JSON or plain text output
- ✨ **Fast Performance**: Multi-threaded generation using all CPU cores

### Advanced Features
- 🔐 **Complete Recovery**: Saves mnemonic phrases for each address
- 🔑 **Private Key Export**: Convert mnemonics to private keys
- 📂 **Split File Output**: Save addresses and secrets in separate files
- ✂️ **File Operations**: Split and convert existing address files
- 📱 **QR Code Generation**: Display QR codes for mobile scanning
- 📊 **Performance Metrics**: Detailed statistics and benchmarks
- 🧵 **Thread Control**: Manual optimization for your hardware
- 📈 **Graceful Interruption**: Statistics preserved when stopped

## Usage Guide

### Basic Commands

```bash
# Generate one random address
bun solvanity.js

# Generate addresses with prefix
bun solvanity.js -p abc -n 10

# Generate addresses with suffix
bun solvanity.js -x xyz -n 3

# Generate with both prefix and suffix
bun solvanity.js -p sol -x 123
```

### Command Reference

#### Generate Command (Default)
```bash
bun solvanity.js [options]
```

**Common Options:**
- `-n, --count <number>` - Number of addresses to generate (default: 1)
- `-p, --prefix <string>` - Address prefix (max 7 chars, Base58)
- `-x, --suffix <string>` - Address suffix (max 7 chars, Base58)
- `-o, --output <mode>` - Output mode (default: combined)
  - `display` - Show addresses on screen only
  - `combined` - Save addresses and secrets in one file
  - `split` - Save addresses and secrets in separate files
  - `both` - Display on screen AND save to file
- `-f, --format <type>` - File format: json or txt (default: json)
- `-q, --qr` - Display QR codes

**Advanced Options:**
- `-s, --stats` - Show performance statistics
- `-t, --threads <number>` - Manual thread count
- `-k, --privatekey` - Export private keys instead of mnemonics
- `--filename <name>` - Custom output filename

#### Split Command
```bash
bun solvanity.js split <file> [options]
```

Split address files into separate address and secret files.

**Options:**
- `-f, --format <type>` - Output format (default: auto-detect)
- `-k, --privatekey` - Convert mnemonics to private keys

#### Convert Command
```bash
bun solvanity.js convert <file> [targetFormat]
```

Convert between JSON and TXT formats.

#### Distribute Command
```bash
bun solvanity.js distribute [options]
```

Generate cryptographically secure random token distribution values across multiple wallets for planning airdrops or token allocations.

**Required Options:**
- `-a, --amount <number>` - Total amount of tokens to distribute
- `-w, --wallets <number>` - Number of wallets to distribute to

**Optional Parameters:**
- `-m, --min <number>` - Minimum amount per wallet (default: 0)
- `-M, --max <number>` - Maximum amount per wallet (default: total amount)
- `-d, --decimals <number>` - Decimal places 0-18 (default: 0)
- `-u, --unique` - Guarantee unique values for each wallet
- `-f, --format <type>` - Output format: json or txt (default: json)
- `-v, --verbose` - Show detailed generation process

### Examples by Use Case

#### For Beginners
```bash
# Generate one address starting with "sol"
bun solvanity.js -p sol

# Generate 5 addresses and display them
bun solvanity.js -n 5 -o display

# Save addresses as text file
bun solvanity.js -n 10 -f txt
```

#### For Advanced Users
```bash
# High-performance generation with statistics
bun solvanity.js -n 100 -p sol -t 16 -s

# Generate with QR codes for mobile
bun solvanity.js -p pay -o both -q

# Export private keys (use with caution!)
bun solvanity.js -n 10 -k --filename secure-keys.json

# Save addresses and secrets in separate files
bun solvanity.js -n 20 -o split

# Generate with prefix and save split files as TXT
bun solvanity.js -p sol -n 5 -o split -f txt
```

#### File Management
```bash
# Split existing file
bun solvanity.js split my-addresses.json

# Convert formats
bun solvanity.js convert addresses.json txt

# Split and convert to private keys
bun solvanity.js split addresses.txt -k
```

#### Token Distribution
```bash
# Simple distribution of 1000 tokens to 10 wallets
bun solvanity.js distribute -a 1000 -w 10

# With min/max constraints
bun solvanity.js distribute -a 1000 -w 20 --min 30 --max 80

# With decimal precision for fractional amounts
bun solvanity.js distribute -a 500 -w 15 -d 2

# Guarantee all unique amounts
bun solvanity.js distribute -a 1000 -w 25 --unique

# Complex distribution with all parameters
bun solvanity.js distribute -a 10000 -w 100 --min 50 --max 200 -d 4 --unique -f txt
```

## Output Modes Explained

### Combined Mode (Default)
Saves addresses and their corresponding secrets (mnemonics/private keys) together in one file.

```bash
bun solvanity.js -n 5 -o combined
# Creates: 1234567890-address.json
```

### Split Mode
Saves addresses and secrets in two separate files for better security and organization.

```bash
bun solvanity.js -n 5 -o split
# Creates: 
#   1234567890-address.json (public addresses)
#   1234567890-secret-mnemonics.json (private mnemonics)

bun solvanity.js -n 5 -o split -k
# Creates:
#   1234567890-address.json (public addresses)
#   1234567890-secret-privatekeys.json (private keys)
```

### Display Mode
Shows addresses on screen without saving to files.

```bash
bun solvanity.js -n 5 -o display
```

### Both Mode
Displays addresses on screen AND saves them to file(s).

```bash
bun solvanity.js -n 5 -o both
```

## Token Distribution Generator

The `distribute` command generates random token allocation values for planning airdrops, token distributions, or testing purposes. It ensures the sum of all allocations equals your specified total amount.

### Key Features
- **Precise Distribution**: Sum of all values exactly equals the total amount
- **Flexible Constraints**: Set minimum and maximum amounts per wallet
- **Decimal Support**: Generate whole numbers or fractional amounts (0-18 decimals)
- **Unique Values**: Option to guarantee all wallets receive different amounts
- **Variable Precision**: Numbers can have 0 to max decimal places for natural variety

### Usage Examples
```bash
# Basic distribution
bun solvanity.js distribute -a 1000 -w 10

# With constraints
bun solvanity.js distribute -a 5000 -w 50 --min 50 --max 150

# Fractional amounts with 5 decimal places
bun solvanity.js distribute -a 110 -w 30 --min 0.2 --max 6 -d 5

# All unique values (no duplicates)
bun solvanity.js distribute -a 1000 -w 20 --unique

# Save as plain text
bun solvanity.js distribute -a 10000 -w 100 -f txt
```

### Output Formats

**JSON Format** (includes metadata and statistics):
```json
{
  "metadata": {
    "timestamp": 1234567890,
    "totalAmount": 1000,
    "wallets": 10,
    "decimals": 2,
    "minAmount": 50,
    "maxAmount": 150,
    "uniqueValues": true
  },
  "statistics": {
    "total": 1000,
    "average": 100,
    "min": 52.3,
    "max": 148.75,
    "unique": 10
  },
  "distribution": [52.3, 148.75, 91.2, ...]
}
```

**TXT Format** (clean, values only):
```
52.3
148.75
91.2
...
```

### Important Notes
- When using `--unique`, the system guarantees all values are different
- Numbers can have varying decimal places (e.g., 5, 5.2, 5.123) for natural variety
- The algorithm respects min/max bounds even during rounding corrections
- TXT files contain only values for easy import into other tools

## Performance Guide

### Generation Times
| Pattern | Example | Estimated Time |
|---------|---------|----------------|
| 1 char | `-p s` | < 1 second |
| 2 chars | `-p so` | 1-5 seconds |
| 3 chars | `-p sol` | 10-60 seconds |
| 4 chars | `-p sola` | 5-30 minutes |
| 5 chars | `-p solan` | 2-24 hours |

### Optimization Tips
- **Default Settings**: Automatically uses optimal thread count
- **Manual Tuning**: Use `-t` flag if you know your system well
- **Performance Mode**: Add `-s` flag to see detailed metrics

## Output Formats

### JSON Format (Default)

**Combined mode:**
```json
[
  {
    "address": "SoLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "mnemonic": "word1 word2 word3 ... word12"
  }
]
```

**Split mode (address file):**
```json
[
  "SoLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "SoLyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
]
```

**Split mode (secret file):**
```json
[
  "word1 word2 word3 ... word12",
  "word1 word2 word3 ... word12"
]
```

### TXT Format

**Combined mode:**
```
SoLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:word1 word2 word3 ... word12
```

**Split mode (address file):**
```
SoLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SoLyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

**Split mode (secret file):**
```
word1 word2 word3 ... word12
word1 word2 word3 ... word12
```

## Error Handling & Troubleshooting

### Common Errors

| Error | Solution |
|-------|----------|
| "Prefix must be 7 characters or less" | Use shorter prefix (max 7 chars) |
| "Invalid Base58 characters" | Remove 0, O, I, or l from prefix/suffix |
| "Permission denied" | Check write permissions in address/ folder |
| "Thread count must be positive" | Use a number greater than 0 |
| "File not found" | Ensure file exists in address/ directory |
| "Output mode must be..." | Use: display, combined, split, or both |

### Troubleshooting Bun Installation

If you encounter issues installing Bun:

1. **macOS/Linux**:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Windows**:
   ```bash
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

3. **Version Issues**: Ensure you have Bun v1.2.5:
   ```bash
   bun --version
   ```

### Interrupted Generation

If you interrupt generation (Ctrl+C):
- Statistics are preserved and displayed
- Partial results are automatically saved
- You can continue with the same settings

## Advanced Features

### Blacklist Filtering

Create a `blacklist` file to exclude unwanted mnemonic words:

```
# blacklist (no extension)
abandon
ability
able
```

- One word per line
- Case-insensitive matching
- Empty lines ignored

### Performance Metrics

Use `-s` flag to see:
- Time per address generation
- Seed generation time
- Key derivation time
- Keypair creation time

## Project Information

- **Version**: 1.5.3
- **License**: MIT
- **Repository**: [github.com/definesystems/solvanity](https://github.com/definesystems/solvanity)
- **Issues**: [Report bugs or request features](https://github.com/definesystems/solvanity/issues)

## Getting Help

```bash
# View all commands
bun solvanity.js --help
```

For development setup, contributing guidelines, and technical details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT License](LICENSE) - see the file for details.

## Acknowledgements

- The Bun team for blazing-fast JavaScript runtime
- The Solana Foundation for SDK
- Commander.js for excellent CLI framework
- Define Systems and contributors for development