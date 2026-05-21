# Final Effect

This generated version repositions the project from a simple MCP scanner into an AI Tool Security Gate.

## Added / improved

- Built-in `--demo` mode so users can test without sample files.
- Policy gate with `--policy` and `--fail-on policy`.
- Permission drift detection with `--baseline` and `--fail-on diff`.
- GitHub Actions composite action for CI use.
- Cleaner README focused on repeat usage and workflow integration.
- npm package metadata prepared for beta distribution.

## Product direction

The standalone CLI scanner is useful, but low frequency. The stronger direction is CI/security workflow integration:

- block risky MCP changes in pull requests
- define team policy for AI tool permissions
- detect permission escalation over time
- later evolve into reputation / trust infrastructure
