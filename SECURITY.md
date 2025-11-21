# Security Policy

## Supported Versions

We release security updates for the following versions of Solvanity:

| Version | Supported          |
| ------- | ------------------ |
| 1.5.x   | :white_check_mark: |
| < 1.5.0 | :x:                |

## Security Guarantees

Solvanity is designed with security as a top priority. The application provides the following guarantees:

### 🔒 Core Security Features

1. **No Network Activity**: Solvanity does NOT make any network requests
   - No HTTP/HTTPS connections
   - No WebSocket connections
   - No external API calls
   - No DNS lookups
   - All operations are 100% local

2. **No Data Exfiltration**: Your sensitive data never leaves your machine
   - File operations limited to `address/` directory only
   - No access to system directories
   - No reading of sensitive files (SSH keys, browser data, environment variables)
   - No clipboard access
   - No system notifications used for data leakage

3. **Cryptographically Secure**: All cryptographic operations use industry standards
   - `crypto.getRandomValues()` for secure random number generation
   - BIP39 standard for mnemonic generation
   - Solana standard HD derivation path: `m/44'/501'/0'/0'`
   - Ed25519 keypair generation
   - No backdoors or weakened random number generators

4. **No Code Injection**: Safe from common injection attacks
   - No use of `eval()`, `Function()`, or `vm` module
   - No dynamic code execution
   - No shell command execution
   - All user input is properly validated

## Verifying Solvanity's Security

You can verify Solvanity's security independently using AI-powered code analysis. See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for detailed instructions on how to:

1. Use Claude, ChatGPT, Gemini, or DeepSeek to analyze the code
2. Verify no malicious code exists
3. Confirm no network activity occurs
4. Check cryptographic security
5. Validate input handling

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues via one of these methods:

1. **Email**: Send details to [security@define.systems](mailto:security@define.systems)
2. **GitHub Security Advisory**: Use GitHub's private vulnerability reporting feature
   - Go to the [Security tab](https://github.com/definesystems/solvanity/security)
   - Click "Report a vulnerability"
   - Fill out the form with details

### What to Include

When reporting a vulnerability, please include:

- **Description**: Clear description of the vulnerability
- **Impact**: What could an attacker do with this vulnerability?
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Affected Versions**: Which versions are affected?
- **Suggested Fix**: If you have a suggestion for how to fix it (optional)
- **Your Contact Info**: How we can reach you for follow-up questions

### What to Expect

After you submit a vulnerability report:

1. **Acknowledgment**: We'll acknowledge receipt within 48 hours
2. **Assessment**: We'll assess the vulnerability within 7 days
3. **Updates**: We'll keep you informed of our progress
4. **Fix Timeline**: Critical issues will be fixed within 30 days
5. **Disclosure**: We'll coordinate public disclosure with you
6. **Credit**: You'll be credited in the security advisory (unless you prefer to remain anonymous)

### Severity Levels

We classify vulnerabilities as follows:

**Critical** (Fix within 7 days)
- Remote code execution
- Private key exposure
- Mnemonic phrase leakage
- Network-based data exfiltration

**High** (Fix within 14 days)
- Local privilege escalation
- File system access outside `address/` directory
- Cryptographic weaknesses
- Input validation bypass leading to code execution

**Medium** (Fix within 30 days)
- Denial of service
- Information disclosure (non-sensitive)
- Input validation issues (low impact)

**Low** (Fix within 60 days)
- Minor information leaks
- UI/UX issues with security implications
- Best practice violations

## Security Best Practices for Users

To maximize security when using Solvanity:

### 🏆 Recommended Practices

1. **Offline Generation**: Generate addresses on an air-gapped computer
   - Disconnect from the internet before generating
   - Never connect the computer to the internet after generating
   - Transfer files using USB drives (scan for malware first)

2. **Secure Storage**: Protect your generated files
   - Store mnemonic phrases in encrypted containers
   - Use hardware-encrypted USB drives
   - Never email or message mnemonic phrases
   - Consider physical storage (paper wallets) stored in secure locations

3. **File Management**: Handle output files carefully
   - Delete temporary files securely (use `shred` or similar tools)
   - Never commit address files to version control
   - Verify `.gitignore` includes `address/` directory
   - Encrypt files before cloud storage

4. **Verification**: Always verify the software
   - Clone from official GitHub repository only
   - Check commit signatures when available
   - Review code changes before updating
   - Use AI-powered security analysis (see SECURITY_AUDIT.md)

### ⚠️ Security Warnings

**Never do these things:**

1. ❌ Share mnemonic phrases with anyone
2. ❌ Store mnemonics in plain text files on networked computers
3. ❌ Enter mnemonics into websites or online forms
4. ❌ Take screenshots of mnemonic phrases (they can be recovered)
5. ❌ Store mnemonics in email, messaging apps, or cloud notes
6. ❌ Generate addresses on shared or public computers
7. ❌ Run Solvanity on a computer with untrusted software
8. ❌ Use addresses for high-value transactions without offline generation

## Dependencies Security

Solvanity uses the following trusted dependencies:

- `@solana/web3.js` - Official Solana SDK
- `bip39-light` - BIP39 mnemonic generation
- `ed25519-hd-key` - HD key derivation
- `bs58` - Base58 encoding
- `chalk`, `ora`, `commander`, `qrcode-terminal` - CLI utilities

All dependencies are from well-known, actively maintained packages. We regularly review and update dependencies to patch security vulnerabilities.

### Checking for Dependency Vulnerabilities

You can check for known vulnerabilities in dependencies:

```bash
bun audit
```

## Security Updates

Security updates will be:

1. Released as soon as possible after verification
2. Announced on GitHub releases page
3. Tagged with `[SECURITY]` in the release notes
4. Include CVE numbers when applicable
5. Provide clear upgrade instructions

Subscribe to the [GitHub repository](https://github.com/definesystems/solvanity) to receive notifications of security updates.

## Responsible Disclosure

If you report a vulnerability responsibly, we commit to:

- Work with you to understand and resolve the issue quickly
- Keep you informed throughout the process
- Publicly acknowledge your contribution (if you wish)
- Not take legal action against security researchers who follow this policy

## Hall of Fame

We're grateful to the following security researchers who have helped make Solvanity more secure:

*No vulnerabilities have been reported yet.*

---

**Last Updated**: 2025-11-20
**Version**: 1.5.3

For general questions, see our [README](README.md) or open a [GitHub issue](https://github.com/definesystems/solvanity/issues).
