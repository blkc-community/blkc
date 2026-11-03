# Contributing to BLKC

Thank you for your interest in contributing to BLKC! We welcome contributions from everyone.

## Code of Conduct

This project follows a Code of Conduct to ensure a welcoming and inclusive community. Please follow these guidelines in all interactions.

## How to Contribute

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/blkc-community/blkc/issues) with the following information:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Your environment (Node.js version, OS, etc.)
- Relevant code snippets or error messages

### Suggesting Enhancements

For feature requests or enhancements, please [open an issue](https://github.com/blkc-community/blkc/issues) with:

- A clear description of the problem or use case
- Your proposed solution
- Any relevant examples or references

### Pull Requests

1. **Fork the repository** and create a feature branch from `main`
2. **Follow the coding standards** described below
3. **Add tests** for new functionality or bug fixes
4. **Update documentation** as needed
5. **Ensure all tests pass** (`npm run test`)
6. **Ensure lint passes** (`npm run lint`)
7. **Ensure type checking passes** (`npm run typecheck`)
8. **Submit your PR** with a clear title and description

### Code Review Process

All PRs will be reviewed by maintainers. We aim to respond to PRs within a reasonable timeframe. You may be asked to make changes before your PR is merged.

## Coding Standards

### TypeScript

- Use **strict mode** (no `any`, no `@ts-ignore`)
- Use **explicit return types** for public APIs
- Use **type guards** for runtime validation
- Prefer **interfaces** over type aliases for object types

### Formatting

- **Indentation**: 2 spaces
- **Line length**: 100 characters maximum
- **Quotes**: Double quotes for strings, single quotes for JSX attributes
- **Semicolons**: Required
- **Trailing commas**: Required in multi-line objects/arrays

### Naming Conventions

- **Variables and functions**: camelCase (`getBlockById`)
- **Classes**: PascalCase (`BlockRegistry`)
- **Types and interfaces**: PascalCase (`BlockManifest`)
- **Constants**: UPPER_CASE (`DEFAULT_LICENSE`)
- **Files**: kebab-case (`props-schema.ts`)

### Testing

- **Test files**: `*.test.ts` or `*.spec.ts`
- **Test directory**: `__tests__` in the package root
- **Test framework**: Use the workspace's configured test runner
- **Coverage**: Aim for 100% coverage on new code

### Documentation

- **Code comments**: Use JSDoc for public APIs
- **File headers**: Include license and purpose
- **Markdown**: Use consistent formatting and structure

### Commits

- **Message format**: `<type>(<scope>): <subject>`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- **Scope**: The package or component affected
- **Subject**: Brief description of the change (50 characters or less)
- **Body**: Detailed description (if needed)
- **Footer**: Reference to issues, breaking changes, etc.

Examples:
```
feat(core): add Block kind discriminant
fix(render-web): fix hero block rendering
/docs: update v2 spec with new fields
chore: update dependencies
```

## Development Workflow

### Setup

```bash
# Clone the repository
git clone https://github.com/blkc-community/blkc.git
cd blkc

# Install dependencies
npm install

# Build all packages
npm run build
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for a specific package
cd packages/core
npm run test
```

### Running Lint

```bash
# Run lint for all packages
npm run lint

# Run lint for a specific package
cd packages/core
npm run lint
```

### Type Checking

```bash
# Run type checking for all packages
npm run typecheck
```

## Package Structure

Each package in the workspace follows a consistent structure:

```
packages/<package-name>/
├── src/
│   ├── index.ts          # Public API
│   └── ...               # Implementation files
├── __tests__/
│   └── *.test.ts         # Test files
├── package.json
├── tsconfig.json
└── README.md             # Package-specific documentation
```

## Versioning

BLKC follows [Semantic Versioning](https://semver.org/) for all packages:

- **PATCH**: Backward-compatible bug fixes
- **MINOR**: Backward-compatible new features
- **MAJOR**: Breaking changes

### Publishing

1. Update the version in `package.json`
2. Update the CHANGELOG
3. Create a Git tag
4. Push to GitHub
5. Publish to npm

Only maintainers can publish to npm. If you'd like to contribute a package, please open a PR and a maintainer will handle the publishing.

## Security

If you discover a security vulnerability, please report it to security@blackcodemarket.com rather than creating a public issue. We will work with you to address the vulnerability and credit you appropriately.

## License

By contributing to BLKC, you agree that your contributions will be licensed under the same license as the project:

- **Framework packages**: Apache-2.0
- **Content (Blocks, Kits, Circuits)**: MIT

## Maintainers

- Austin (Black Code Enterprises LLC)

## Resources

- [GitHub Repository](https://github.com/blkc-community/blkc)
- [Documentation](https://blkc.community) (coming soon)
- [Issues](https://github.com/blkc-community/blkc/issues)
- [Discussions](https://github.com/blkc-community/blkc/discussions)

---

Thank you for contributing to BLKC! Your contributions help make this framework better for everyone.
