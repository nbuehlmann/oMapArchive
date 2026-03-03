#!/usr/bin/env node
/**
 * Runs `pnpm audit --json` and fails on any high/critical vulnerability
 * that is not in the documented allowlist below.
 *
 * Add entries to ALLOWLIST only when ALL of the following are true:
 *   1. No patched version exists (confirmed in the GitHub Advisory Database)
 *   2. The vulnerable code path is not reachable from untrusted input, OR
 *      a compensating control is documented here
 *   3. A tracking issue exists to revisit when a fix is released
 */

import { execSync } from 'child_process'

// Advisory IDs are the numeric IDs from `pnpm audit --json` (.advisories keys),
// paired with their GHSA alias for readability.
const ALLOWLIST = new Map([
  [
    '1091573', // GHSA-crh6-fp67-6883 — xmldom allows multiple root nodes in a DOM
    {
      ghsa: 'GHSA-crh6-fp67-6883',
      package: 'xmldom (via ocad2geojson)',
      reason:
        'No patched version exists upstream (patched versions: <0.0.0). ' +
        'xmldom is used by ocad2geojson only when processing OCAD/OOM files. ' +
        'Files are uploaded by authenticated users only — not exposed to arbitrary internet input.',
      reviewBy: '2026-06-01',
    },
  ],
])

let raw
try {
  raw = execSync('pnpm audit --json', { encoding: 'utf8' })
} catch (err) {
  // pnpm audit exits non-zero when vulnerabilities are found; capture stdout
  raw = err.stdout ?? ''
}

let report
try {
  report = JSON.parse(raw)
} catch {
  console.error('Failed to parse pnpm audit JSON output')
  process.exit(1)
}

const advisories = report.advisories ?? {}
const HIGH_SEVERITIES = new Set(['high', 'critical'])

let failed = false

for (const [id, advisory] of Object.entries(advisories)) {
  if (!HIGH_SEVERITIES.has(advisory.severity)) continue

  if (ALLOWLIST.has(id)) {
    const entry = ALLOWLIST.get(id)
    console.warn(
      `[ALLOWLISTED] ${advisory.severity.toUpperCase()} — ${advisory.title} (${entry.ghsa})\n` +
        `  Reason: ${entry.reason}\n` +
        `  Review by: ${entry.reviewBy}\n`,
    )
    continue
  }

  console.error(
    `[FAIL] ${advisory.severity.toUpperCase()} — ${advisory.title}\n` +
      `  Package: ${advisory.module_name}\n` +
      `  Advisory: ${advisory.url}\n`,
  )
  failed = true
}

if (failed) {
  console.error('One or more high/critical vulnerabilities must be resolved before merging.')
  process.exit(1)
}

console.log('Audit passed — no unacknowledged high/critical vulnerabilities.')
