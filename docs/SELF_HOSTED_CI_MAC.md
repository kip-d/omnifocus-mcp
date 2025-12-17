# Self‑Hosted CI for OmniFocus Integration (macOS + Tailscale)

This guide sets up a dedicated Mac mini to run OmniFocus integration tests as a GitHub Actions self‑hosted runner. It
complements the cloud CI (unit tests) by exercising the tools against a real OmniFocus database.

## Overview

- Strategy: run a self‑hosted macOS runner labeled `self-hosted, macos, omnifocus` that executes only trusted/manual
  workflows.
- What runs here: `npm run test:integration` (and optional performance tests). Cloud CI still runs unit tests.

**Note**: As of September 2025, cloud CI has been fixed to work properly in Linux environments by disabling cache
warming when OmniFocus is not available. This Mac mini setup enables full integration testing including cache warming,
permission validation, and complete OmniFocus operations.

## Prerequisites

- Mac mini (Apple Silicon or Intel) with macOS 13+.
- Admin access once; dedicated non‑admin user for the runner (e.g., `ci-runner`).
- Tailscale account for remote access.
- OmniFocus installed and a copy of your test database (~1,500 tasks), not your live one.

## 1) Prepare macOS (as admin)

- System update: install all macOS updates.
- Prevent sleep (headless‑safe):
  - `sudo pmset -a sleep 0 displaysleep 0 disksleep 0`
  - Disable "Power Nap"; keep a dummy HDMI plug if headless.
- Install Xcode CLT: `xcode-select --install`.
- Create user: System Settings → Users & Groups → Add user `ci-runner` (non‑admin). Optionally enable auto‑login for
  this user.

## 2) Tailscale

- Download Tailscale and sign in; name device (e.g., `of-ci-macmini`).
- Ensure it starts at login. Optional: enable Tailscale SSH for remote shell.

## 3) Install Node and tooling (as `ci-runner`)

- Homebrew (recommended):
  - Install: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
  - `brew install node@20`
  - Add to PATH (Apple Silicon): `echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc`
- Verify: `node -v` and `npm -v`.

## 4) OmniFocus setup (as `ci-runner`)

- Install OmniFocus (App Store or Omni Group DMG) and sign in.
- Load a copy of your test database (not production). Disable risky sync if desired.
- Add OmniFocus to Login Items (auto‑launch).
- Open OmniFocus once to ensure a document is loaded.

## 5) Grant Automation permissions (critical)

- Trigger initial Apple Events prompt:
  - `osascript -e 'tell application "OmniFocus" to get name of default document'`
- System Settings → Privacy & Security → Automation:
  - Allow Terminal and the GitHub Actions Runner app (will appear after first run) to control OmniFocus.
- If prompted later, grant Full Disk Access to the Runner only if necessary for logs under `~/.omnifocus-mcp`.

## 6) Install the GitHub self‑hosted runner

- In GitHub: Repository → Settings → Actions → Runners → New self‑hosted runner → macOS.
- As `ci-runner`, in a working folder (e.g., `~/actions-runner`):
  - Download and configure per GitHub instructions.
  - Add labels: `self-hosted`, `macos`, `omnifocus` when prompted (or edit `./config.sh` flags).
  - Install as a service and start:
    - `./svc.sh install`
    - `./svc.sh start`
- Verify in GitHub that the runner shows "Idle".

## 7) Repo checkout and first run

- Ensure this repo's `main` is accessible by the runner.
- From the repo directory:
  - `npm ci`
  - Run once locally to surface any first‑time prompts: `./scripts/local-ci.sh`

## 8) Integration workflow (manual trigger)

Add this workflow to run only on the self‑hosted mac with labels. It avoids untrusted PRs by using `workflow_dispatch`.

```yaml
# .github/workflows/mac-integration.yml
name: mac-integration
on:
  workflow_dispatch:

jobs:
  integration:
    runs-on: [self-hosted, macos, omnifocus]
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - name: Run integration tests (OmniFocus)
        run: npm run test:integration
      # Optional performance suite (long‑running)
      # - run: npm run test:performance
```

## 9) Operational tips

- Keep the `ci-runner` session logged in; the runner service survives reboots.
- If Automation prompts reappear (after OS updates), re‑run `./scripts/local-ci.sh` once.
- Monitor logs: `~/actions-runner/_diag` and workflow logs in GitHub.
- Test data hygiene: use `npm run cleanup:test-data` or the script's cleanup steps; the integration tests already clean
  up, but stale data can remain if runs are interrupted.

## 10) Security & safety

- Limit this workflow to `workflow_dispatch` (or a nightly `schedule`) to avoid running untrusted PR code on your Mac.
- Use a non‑admin user; restrict SSH/Screen Sharing. Prefer Tailscale SSH.
- Use a test OmniFocus database; never point at your live personal system.

## 11) Troubleshooting

- OmniFocus not reachable: open OmniFocus manually; confirm a document is loaded; re‑grant Automation.
- Apple Events denied (`-1743`): re‑visit Privacy → Automation for Runner and Terminal.
- Runner disappears after reboot: ensure `./svc.sh start` is enabled and `ci-runner` logs in at boot.
- Timeouts in tests: check mac performance settings (no sleep), and confirm OmniFocus is responsive (no dialogs).

---

With this in place, cloud CI runs fast unit tests, and the Mac mini runner validates real OmniFocus behavior on demand.
