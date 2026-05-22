# Security Policy

MCP Install Guard is a pre-install risk checker. It is designed to highlight risky MCP tool exposure, not to prove that a server is safe.

## What to report

Please report:

- False negatives for dangerous tools.
- Incorrect install decisions.
- Package contents that expose local paths, secrets, or credentials.
- Crashes when scanning valid MCP tool metadata.

## Limitations

- It does not perform full source-code malware analysis.
- It does not guarantee that an MCP server is safe.
- It does not replace sandboxing, least-privilege permissions, or professional security review.
- It uses heuristics and may produce false positives or false negatives.

## Safe usage

- Run untrusted MCP servers in a restricted environment.
- Avoid scanning configs that contain production secrets.
- Review high-risk findings manually before installing a server.
