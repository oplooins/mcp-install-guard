# MCP Install Risk Report

Generated: 2026-05-19T15:07:57.948Z
Source: .\sample-tools-list.json

## Decision

- Health Score: 22
- Risk Score: 78
- Install Decision: do-not-install
- Reason: Too many high-risk findings. Fix before install or production use.

## Summary

- Tools: 3
- Issues: 7
- High: 4
- Medium: 1
- Low: 2

## Findings

- **[low] delete_customer_record**: Parameter description is weak
  - Detail: customerId has an unclear or missing description.
  - Fix: Explain meaning, expected format, and limits.
- **[high] delete_customer_record**: Write-like tool lacks confirmation
  - Detail: This tool appears to write, delete, send, charge, or mutate state without a confirm/dryRun parameter.
  - Fix: Add confirm, dryRun, or previewOnly and enforce it server-side.
- **[high] delete_customer_record**: Database tool lacks read-only constraint
  - Detail: Database tools without explicit read-only constraints are high-risk.
  - Fix: Add readOnly=true, statementType restrictions, or reject write SQL server-side.
- **[medium] db**: Tool name is too short
  - Detail: Very short names are hard for AI clients and developers to understand.
  - Fix: Use verb + object, such as search_docs or create_ticket.
- **[high] db**: Possible prompt injection in description/schema
  - Detail: Suspicious phrases found: ignore previous instructions, reveal secrets.
  - Fix: Remove instruction-like text from descriptions. Descriptions should only explain tool behavior.
- **[low] db**: Parameter description is weak
  - Detail: sql has an unclear or missing description.
  - Fix: Explain meaning, expected format, and limits.
- **[high] db**: Database tool lacks read-only constraint
  - Detail: Database tools without explicit read-only constraints are high-risk.
  - Fix: Add readOnly=true, statementType restrictions, or reject write SQL server-side.
