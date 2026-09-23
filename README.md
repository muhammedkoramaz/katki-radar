# katki-radar

A weekly radar for meaningful open-source contributions, with a human in the loop.

*"Katkı"* is Turkish for *contribution*.

Every Monday a GitHub Action scans public projects in **accessibility, education, health/humanitarian and privacy/self-hosted** spaces and posts a ranked list of opportunities as an issue in this repo. It looks for three kinds of work:

- **Missing Turkish translations.** The project has an i18n folder and several languages, but no Turkish locale, or an incomplete one.
- **Code issues** labelled `good first issue` or `help wanted`, unassigned and not already claimed.
- **Documentation issues** labelled `documentation` or `docs`.

Picking an opportunity and turning it into a pull request is done locally with a Claude Code command (`/katki`). A person approves every outward action: claiming an issue, pushing, opening a PR, replying to review comments.

## Why a human in the loop?

Maintainers are dealing with a flood of low-quality, AI-generated pull requests. This project is designed not to add to that:

- **No PR is ever opened automatically.** Each one is reviewed, tested and approved by me before it is sent.
- **Projects that forbid AI-assisted contributions are skipped.** The scan checks `CONTRIBUTING.md`, `AI_POLICY.md` and the README, and the policy is read again in full before any work starts.
- **Every PR says that AI assistance was used.**
- **At most one open PR per project at a time,** and a target of 2–3 PRs per week.
- **Translations are reviewed line by line** by a native speaker, and placeholders, keys and file validity are checked automatically.

## How the weekly scan works

1. **Discover.** Repositories are searched by topic × language (JavaScript, TypeScript, Python). They must have 100–30k stars, have been pushed to in the last 90 days, and not be archived.
2. **Filter.** Projects with an AI ban are dropped. So are issues that are assigned, have a linked PR, or were recently claimed in a comment, and projects where I already have an open PR. Opportunities shown in the last 180 days are not shown again.
3. **Score (0–100).** The score combines maintainer responsiveness (merged external PRs), issue clarity, topic and language fit, freshness and project size.
4. **Publish.** The top 10 go into a `Fırsatlar – YYYY-MM-DD` issue in this repo. The issue contains a table and a machine-readable data block.

The scanner has no dependencies (plain Node 22). It retries with backoff on GitHub rate limits and stops before it exhausts the API budget.

## Layout

| Path | Purpose |
|---|---|
| `scripts/tara.mjs` | Weekly scan entry point (`--dry-run` prints the report instead of publishing it) |
| `scripts/lib/` | GitHub client, discovery, AI-policy check, translation and issue detection, scoring, report |
| `scripts/lib/ceviri-kontrol.mjs` | CLI that validates a translation file against its source (placeholders, keys, format) |
| `config.json` | Topics, languages, star range, quotas, thresholds |
| `.github/workflows/tara.yml` | Monday 06:00 UTC schedule, plus manual runs |
| `komut/katki.md` | The `/katki` Claude Code command |
| `tr-sozluk.md` | Turkish UI terminology glossary used for consistent translations |
| `docs/superpowers/` | Design spec and implementation plan (in Turkish) |

## Running locally

```bash
npm test                                                  # 87 unit tests, no network
GITHUB_TOKEN=$(gh auth token) node scripts/tara.mjs --dry-run   # real scan, prints the report
node scripts/lib/ceviri-kontrol.mjs locales/en.json locales/tr.json
```

Code identifiers, the weekly report and the `/katki` workflow are in Turkish, because they are written for my own use.
