# Security Policy

## Reporting a Vulnerability

We take security issues seriously, especially given Open vBrowser's use in covert
cyber threat intelligence work — a vulnerability could deanonymize investigators
or expose workspace data.

**Please do not open a public GitHub issue for security reports.**

Report vulnerabilities through **one** of these private channels:

1. **GitHub private vulnerability reporting** (preferred):
   https://github.com/fish-not-phish/open-vbrowser/security/advisories/new
2. **Email**: support@vbrowser.io

If emailing, please include as much of the following
as possible:

- Description of the issue and its potential impact
- Steps to reproduce (code snippets, requests, screenshots)
- Affected version / commit
- Any suggested fix or mitigation

We will acknowledge receipt within **14 business days** and aim to provide an
initial assessment within **30 days**.

## Disclosure Policy

- Please give us reasonable time to investigate and publish a fix before any
  public disclosure. We ask for **at least 90 days** from the initial report.
- We will credit reporters in the advisory unless they prefer to remain
  anonymous.
- Once a fix is released, we will publish a GitHub Security Advisory with a CVE
  where applicable.

## Scope

**In scope:**

- Vulnerabilities in this repository's code (backend, frontend, Dockerfiles,
  Terraform).
- Issues affecting authentication, authorization, session isolation, DNS record
  management, file protection (7z archives), or secret handling.
- Privilege escalation within the workspace role hierarchy.

**Out of scope:**

- Misconfiguration of your own self-hosted deployment (AWS account, Cloudflare,
  Docker host, reverse proxy, database).
- Vulnerabilities in third-party dependencies already disclosed publicly and
  awaiting upstream fixes — report these to the upstream maintainer.
- Issues that require prior, unauthorized access to an account or host.
- Social engineering, physical attacks, or DoS against our infrastructure.

## Supported Versions

Only the latest release on the `main` branch receives security fixes. There are
no backports to older releases at this time.

## Responsible Use

Open vBrowser is intended for lawful security research and threat intelligence.
Using it to violate applicable laws or the rights of others is outside its
intended purpose and may void any expectation of support.

## Questions

For non-sensitive security questions, open a normal GitHub issue or email
support@vbrowser.io. For vulnerability reports, use the private channels above.
