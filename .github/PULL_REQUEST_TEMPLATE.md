## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

<!-- Mark the relevant option with an "x" -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Security fix

## Related Issue

<!-- If this PR addresses an existing issue, link it here -->

Fixes #(issue number)

## Changes Made

<!-- Describe the changes made in this PR -->

-
-
-

## Testing

<!-- Describe the testing you've done -->

### Manual Testing

- [ ] Tested basic address generation
- [ ] Tested prefix/suffix matching
- [ ] Tested file output modes (display, combined, split, both)
- [ ] Tested file formats (JSON, TXT)
- [ ] Tested distribute command (if applicable)
- [ ] Tested split command (if applicable)
- [ ] Tested convert command (if applicable)
- [ ] Tested with various thread counts
- [ ] Tested error handling

### Automated Testing

- [ ] All existing tests pass (`bun test`)
- [ ] Added new tests for new functionality
- [ ] Test coverage is adequate

### Performance Testing

- [ ] Tested with 1-character prefix
- [ ] Tested with 2-3 character prefix
- [ ] Verified no performance regression
- [ ] Checked memory usage

## Security Checklist

<!-- Ensure security is maintained -->

- [ ] No new network requests added
- [ ] No access to files outside `address/` directory
- [ ] No use of `eval()`, `Function()`, or dynamic code execution
- [ ] No execution of shell commands
- [ ] Input validation added for new inputs
- [ ] Cryptographic operations use secure methods
- [ ] No logging of sensitive data (mnemonics, private keys)
- [ ] No sensitive data in error messages

## Code Quality

- [ ] Code follows existing style conventions
- [ ] Added JSDoc comments for new functions
- [ ] Removed debug/console.log statements
- [ ] No commented-out code blocks
- [ ] Variable names are descriptive
- [ ] Functions are focused and not too complex

## Documentation

- [ ] Updated README.md (if needed)
- [ ] Updated CHANGELOG.md
- [ ] Updated CONTRIBUTING.md (if workflow changed)
- [ ] Updated CLAUDE.md (if architecture changed)
- [ ] Added inline comments for complex logic
- [ ] Updated help text (if commands changed)

## Breaking Changes

<!-- If this is a breaking change, describe what breaks and how to migrate -->

**Does this PR introduce breaking changes?** Yes / No

If yes, describe:
- What breaks:
- Migration guide:
- Deprecated features:

## Screenshots (if applicable)

<!-- Add screenshots or terminal output demonstrating the changes -->

```
Paste terminal output here
```

## Performance Impact

<!-- Describe any performance impact (positive or negative) -->

- Benchmark results (if applicable):
- Memory usage change:
- Generation speed impact:

## Additional Notes

<!-- Any additional information that reviewers should know -->

## Checklist

- [ ] My code follows the project's code style
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Reviewer Notes

<!-- Any specific areas you want reviewers to focus on? -->

---

**By submitting this pull request, I confirm that my contribution is made under the terms of the MIT license.**
