"""
Management command: seed_dev_data
Populates the database with realistic fake data for development:
  - Extra users
  - Workspace memberships
  - Tags
  - Cases (open / closed / archived)
  - Closed sessions linked to cases / tags / notes

Usage:
    python manage.py seed_dev_data
    python manage.py seed_dev_data --clear   # wipe seeded data first
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone

import json
import uuid as _uuid

from workspaces.models import Workspace, WorkspaceMembership
from cases.models import Case, Tag, SessionNote, CaseComment
from sessions.models import Container


# ── Fake data pools ───────────────────────────────────────────────────────────

FAKE_USERS = [
    ("maya.chen", "maya.chen@example.com", "Maya", "Chen"),
    ("james.wright", "james.wright@example.com", "James", "Wright"),
    ("sofia.rodriguez", "sofia.rodriguez@example.com", "Sofia", "Rodriguez"),
    ("luca.ferrari", "luca.ferrari@example.com", "Luca", "Ferrari"),
    ("anya.patel", "anya.patel@example.com", "Anya", "Patel"),
    ("tom.okafor", "tom.okafor@example.com", "Tom", "Okafor"),
]

TAGS = [
    ("recon", "#6366f1"),
    ("exploit", "#ef4444"),
    ("osint", "#f59e0b"),
    ("forensics", "#10b981"),
    ("phishing", "#ec4899"),
    ("malware", "#8b5cf6"),
    ("web", "#0ea5e9"),
    ("network", "#14b8a6"),
    ("crypto", "#f97316"),
    ("review", "#a3a3a3"),
]

CASES = [
    ("APT-29 Campaign Analysis", "Tracking activity linked to APT-29 threat actor across multiple targets.", "open"),
    ("Phishing Infrastructure Takedown", "Identifying and disrupting phishing kit infrastructure.", "open"),
    ("Ransomware Incident Response", "Post-incident forensics on ransomware deployment at client site.", "closed"),
    ("Supply Chain Compromise", "Investigation into suspected supply-chain attack via npm package.", "open"),
    ("Dark Web Marketplace Monitoring", "Ongoing monitoring of credential leaks on dark web forums.", "open"),
    ("BEC Fraud Investigation", "Business email compromise targeting finance department.", "closed"),
    ("Zero-Day PoC Research", "Researching publicly disclosed zero-day exploits for patch prioritization.", "open"),
    ("Cobalt Strike C2 Hunt", "Hunting for Cobalt Strike beacon infrastructure using passive DNS.", "archived"),
    ("Credential Stuffing Campaign", "Attribution and scope of credential stuffing targeting customer portal.", "closed"),
    ("IoT Botnet Mapping", "Mapping botnet C2 infrastructure exploiting vulnerable IoT devices.", "open"),
    ("Red Team Engagement - Q3", "Internal red team exercise against corp network perimeter.", "closed"),
    ("Insider Threat Investigation", "Confidential review of anomalous data exfiltration activity.", "archived"),
]

BROWSERS = ["chrome", "firefox", "brave", "kali", "edge", "tor-browser", "mullvad"]
CAPACITY_PROVIDERS = ["FARGATE", "FARGATE_SPOT"]
CATEGORIES = ["browser", "security"]

NOTE_BODIES = [
    "Initial recon complete. Identified three live subdomains.",
    "Found exposed admin panel at /wp-admin — no auth bypass yet.",
    "C2 beacon calling back every 60s to 45.33.32.156:443.",
    "Pivoted via SMB to internal subnet 10.10.20.0/24.",
    "Credential dump via mimikatz — hashes extracted.",
    "Confirmed phishing kit hosted on compromised WordPress site.",
    "Passive DNS shows domain registered 3 days before campaign.",
    "Whois privacy — using OSINT to correlate registrant email.",
    "Malware sample submitted to sandbox — waiting on report.",
    "Screenshot of threat actor forum post archived.",
    "Shodan scan complete — 12 open ports on target.",
    "SSL cert transparency logs reveal additional subdomains.",
    "Pivoted to second host — escalated to root via SUID binary.",
    "Exported browser artifacts for timeline reconstruction.",
    "Found hardcoded AWS key in public GitHub repo.",
]


# ── BlockNote JSON helpers ────────────────────────────────────────────────────

def _pid():
    return str(_uuid.uuid4())

def _para(*text_runs):
    """Single paragraph block with one or more text runs."""
    content = []
    for run in text_runs:
        if isinstance(run, str):
            content.append({"type": "text", "text": run, "styles": {}})
        else:
            content.append(run)
    return {"id": _pid(), "type": "paragraph", "props": {"textColor": "default", "backgroundColor": "default", "textAlignment": "left"}, "content": content, "children": []}

def _heading(text, level=2):
    return {"id": _pid(), "type": "heading", "props": {"textColor": "default", "backgroundColor": "default", "textAlignment": "left", "level": level}, "content": [{"type": "text", "text": text, "styles": {}}], "children": []}

def _bullet(items):
    """Bulleted list — list of strings."""
    return [{"id": _pid(), "type": "bulletListItem", "props": {"textColor": "default", "backgroundColor": "default", "textAlignment": "left"}, "content": [{"type": "text", "text": item, "styles": {}}], "children": []} for item in items]

def _code(text):
    return {"id": _pid(), "type": "codeBlock", "props": {"language": "text"}, "content": [{"type": "text", "text": text, "styles": {}}], "children": []}

def _bold(text):
    return {"type": "text", "text": text, "styles": {"bold": True}}

def bn(*blocks):
    """Flatten nested lists and serialise to JSON string."""
    flat = []
    for b in blocks:
        if isinstance(b, list):
            flat.extend(b)
        else:
            flat.append(b)
    return json.dumps(flat)


# ── Per-case comment threads ──────────────────────────────────────────────────
# Each entry is a list of (author_index_into_member_users, body_json_string).
# author_index -1 = admin/owner user (index 0).

CASE_COMMENTS = {
    "APT-29 Campaign Analysis": [
        (0, bn(
            _heading("Initial Assessment", 2),
            _para("Passive DNS sweep complete. Identified ", _bold("7 unique C2 domains"), " resolving to ASN 208091."),
            _bullet(["45.33.32.156 — active beacon", "103.21.58.14 — suspected staging", "185.220.101.47 — TOR exit overlap"]),
        )),
        (1, bn(
            _para("Cross-referenced IOCs against VirusTotal — 3/7 flagged by CrowdStrike and Kaspersky feeds."),
            _para("Recommend adding all 7 to SIEM blocklist immediately."),
        )),
        (2, bn(
            _heading("MITRE ATT&CK Mapping", 2),
            _bullet(["T1583.001 — Acquire Infrastructure: Domains", "T1071.001 — Application Layer Protocol: Web Protocols", "T1027 — Obfuscated Files or Information"]),
        )),
        (0, bn(_para("Escalated to threat intel team. Awaiting confirmation from CISA advisory match."))),
        (3, bn(
            _para("Found certificate reuse — same Let's Encrypt cert on two domains. Strong indicator of shared infrastructure."),
            _code("echo | openssl s_client -connect 45.33.32.156:443 2>/dev/null | openssl x509 -noout -fingerprint"),
        )),
    ],
    "Phishing Infrastructure Takedown": [
        (1, bn(
            _para("Phishing kit decompiled. Uses AES-128 to encrypt harvested credentials before exfil to ", _bold("hxxps://cred-drop[.]ru/collect")),
        )),
        (4, bn(
            _para("Abuse report filed with hosting provider (Hetzner). Reference ticket: ", _bold("#HZ-2026-447821")),
            _para("Expected takedown within 24–72 hours per their SLA."),
        )),
        (0, bn(_para("Secondary kit discovered on a separate domain — same actor, different lure template. Adding to scope."))),
        (2, bn(
            _heading("Lure Domains Identified", 2),
            _bullet(["secure-login-verify[.]com", "account-confirm-portal[.]net", "bankauth-update[.]info"]),
            _para("All registered via NameSilo with privacy guard. WHOIS correlation ongoing."),
        )),
    ],
    "Ransomware Incident Response": [
        (0, bn(
            _heading("Timeline Reconstruction", 2),
            _para("Initial access via RDP brute-force on ", _bold("2026-06-14 03:22 UTC"), ". Attacker maintained persistence for 11 days before deployment."),
        )),
        (5, bn(
            _para("Ransom note analysed — variant matches ", _bold("BlackCat/ALPHV v3"), " based on negotiation portal URL structure."),
            _code("[+] Your network has been encrypted.\n[+] Contact: hxxp://alphvmmm27o3ixfa[.]onion"),
        )),
        (1, bn(_para("Recovered VSS shadow copies on 2 of 14 affected hosts. Partial data restoration underway."))),
        (3, bn(
            _para("Exfiltration confirmed via DNS tunnelling — approx 48 GB transferred over 6 days to external resolver."),
            _para("Recommend DNS logging uplift before remediation sign-off."),
        )),
        (0, bn(_para("Case closed. Final report drafted and submitted to client. Lessons learned session scheduled for next week."))),
    ],
    "Supply Chain Compromise": [
        (2, bn(
            _para("Malicious npm package: ", _bold("`event-stream-utils@2.1.4`"), " — published 2026-05-31, 1,200 downloads before removal."),
            _code("npm install event-stream-utils@2.1.4\n# Installs postinstall hook that phones home to attacker C2"),
        )),
        (0, bn(_para("Contacted npm security team. Package unpublished within 2 hours of report."))),
        (4, bn(
            _heading("Affected Internal Services", 2),
            _bullet(["api-gateway v2.3.1 — confirmed dependency", "data-pipeline worker — confirmed dependency", "auth-service — NOT affected (uses v2.1.3)"]),
        )),
        (1, bn(_para("Patched builds deployed to staging. Production rollout pending sign-off from CTO."))),
    ],
    "Dark Web Marketplace Monitoring": [
        (3, bn(
            _para("New credential dump posted to BreachForums — ", _bold("14,000 records"), " with hashed passwords. Partial plaintext visible in sample."),
        )),
        (0, bn(_para("Cross-referenced emails against customer DB — 312 matches. Forced password resets sent."))),
        (5, bn(
            _para("Actor profile: username ", _bold('"n3cr0m4nc3r"'), " — active since 2024, 47 previous posts, reputation score 94/100. High-value actor."),
        )),
        (2, bn(_para("Set up automated monitoring via DeHashed API for future dumps matching our domain patterns."))),
    ],
    "BEC Fraud Investigation": [
        (1, bn(
            _heading("Attack Summary", 2),
            _para("CFO email account compromised via adversary-in-the-middle proxy (Evilginx2). Session cookie stolen — MFA bypassed."),
        )),
        (0, bn(_para("$142,000 wire transfer intercepted by finance team after noticing unusual beneficiary bank (Latvia). Funds not lost."))),
        (4, bn(
            _para("Email headers show originating IP: ", _bold("91.108.56.44"), " — Telegram datacenter, consistent with AITM infrastructure."),
            _code("Received: from mail.victim-corp.com (91.108.56.44)\nX-Forwarded-For: 91.108.56.44"),
        )),
        (0, bn(_para("Phishing-resistant MFA (FIDO2) rollout approved as remediation action. ETA 30 days."))),
    ],
    "Zero-Day PoC Research": [
        (2, bn(
            _para("CVE-2026-31337 — heap overflow in libwebp affecting all Chromium-based browsers. CVSS 9.8."),
        )),
        (0, bn(_para("PoC repo located on GitHub (now removed). Archived copy in secure share for internal analysis only."))),
        (3, bn(
            _heading("Affected Versions", 2),
            _bullet(["Chrome < 126.0.6478.127", "Edge < 126.0.2592.87", "Brave < 1.67.119"]),
            _para("Firefox uses separate image decoder — not affected."),
        )),
        (1, bn(_para("Patch verification complete on Chrome 126.0.6478.127 — overflow no longer reachable via crafted WebP."))),
    ],
    "IoT Botnet Mapping": [
        (5, bn(
            _para("Shodan query identified ", _bold("3,400+ vulnerable devices"), " running MikroTik RouterOS 6.x with CVE-2018-14847 unpatched."),
            _code('shodan search "MikroTik RouterOS 6" port:8291 country:US'),
        )),
        (0, bn(_para("C2 panel located at hxxp://185.193.127.32:8080/panel — login bypassed via SQLi. Evidence preserved."))),
        (4, bn(
            _bullet(["Bot count: ~18,000 active nodes", "Primary use: DDoS-for-hire", "Secondary: credential proxy"]),
        )),
        (2, bn(_para("Notified CISA and relevant ISPs. Coordinated takedown planned for next Tuesday."))),
    ],
}


def _plain_bn(text):
    """Simple single-paragraph BlockNote JSON for short comments."""
    return bn(_para(text))


class Command(BaseCommand):
    help = "Seed the database with fake development data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove previously seeded data before re-seeding",
        )
        parser.add_argument(
            "--workspace",
            default=None,
            help="Slug of workspace to seed into (defaults to first non-personal workspace, or personal)",
        )

    def handle(self, *args, **options):
        rng = random.Random(42)  # deterministic so repeated runs are idempotent-ish

        # ── Resolve workspace ──────────────────────────────────────────────────
        if options["workspace"]:
            ws = Workspace.objects.get(slug=options["workspace"])
        else:
            ws = (
                Workspace.objects.filter(is_personal=False).first()
                or Workspace.objects.first()
            )
        if not ws:
            self.stderr.write("No workspace found — run migrations first.")
            return

        owner_membership = ws.memberships.filter(role="owner").first()
        admin_user = owner_membership.user if owner_membership else User.objects.first()
        if not admin_user:
            self.stderr.write("No users found — create a superuser first.")
            return

        self.stdout.write(f"Seeding into workspace: {ws.name} ({ws.slug})")

        # ── Optional clear ─────────────────────────────────────────────────────
        if options["clear"]:
            self._clear(ws, self.stdout)

        # ── Extra users + memberships ──────────────────────────────────────────
        member_users = [admin_user]
        roles = ["admin", "member", "member", "member", "admin", "member"]
        for (uname, email, first, last), role in zip(FAKE_USERS, roles):
            user, created = User.objects.get_or_create(
                username=uname,
                defaults={"email": email, "first_name": first, "last_name": last},
            )
            if created:
                user.set_password("devpassword123")
                user.save()
                self.stdout.write(f"  Created user: {uname}")

            _, mem_created = WorkspaceMembership.objects.get_or_create(
                workspace=ws, user=user,
                defaults={"role": role},
            )
            if mem_created:
                self.stdout.write(f"  Added {uname} as {role}")
            member_users.append(user)

        # ── Tags ───────────────────────────────────────────────────────────────
        tag_objs = []
        for tag_name, tag_color in TAGS:
            tag, _ = Tag.objects.get_or_create(
                workspace=ws, name=tag_name,
                defaults={"color": tag_color},
            )
            tag_objs.append(tag)
        self.stdout.write(f"  Ensured {len(tag_objs)} tags")

        # ── Cases ──────────────────────────────────────────────────────────────
        case_objs = []
        for case_name, case_desc, case_status in CASES:
            case, _ = Case.objects.get_or_create(
                workspace=ws, name=case_name,
                defaults={
                    "description": case_desc,
                    "status": case_status,
                    "created_by": rng.choice(member_users),
                },
            )
            case_objs.append(case)
        self.stdout.write(f"  Ensured {len(case_objs)} cases")

        # ── Case comments ──────────────────────────────────────────────────────
        comments_created = 0
        for case in case_objs:
            if CaseComment.objects.filter(case=case).exists():
                continue  # already seeded
            thread = CASE_COMMENTS.get(case.name)
            if thread:
                for author_idx, body_json in thread:
                    author = member_users[min(author_idx, len(member_users) - 1)]
                    CaseComment.objects.create(case=case, author=author, body=body_json)
                    comments_created += 1
            else:
                # Generic comments for cases without a custom thread
                for _ in range(rng.randint(2, 5)):
                    author = rng.choice(member_users)
                    CaseComment.objects.create(case=case, author=author, body=_plain_bn(rng.choice(NOTE_BODIES)))
                    comments_created += 1
        self.stdout.write(f"  Created {comments_created} comments")

        # ── Sessions (closed, so they appear in history) ───────────────────────
        from browsers.models import BrowserImage
        available_slugs = list(
            BrowserImage.objects.filter(slug__in=BROWSERS).values_list("slug", flat=True)
        )
        if not available_slugs:
            available_slugs = ["chrome", "firefox"]

        now = timezone.now()
        sessions_created = 0
        for i in range(40):
            user = rng.choice(member_users)
            browser_slug = rng.choice(available_slugs)
            start = now - timedelta(days=rng.randint(1, 90), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
            duration = timedelta(minutes=rng.randint(5, 180))
            closed = start + duration
            cost = Decimal(str(round(duration.total_seconds() / 3600 * rng.uniform(0.02, 0.12), 6)))
            cap = rng.choice(CAPACITY_PROVIDERS)
            case = rng.choice(case_objs + [None, None])  # ~1/3 unlinked

            container = Container.objects.create(
                user=user,
                workspace=ws,
                name=f"seed-{browser_slug}-{i}",
                type=browser_slug,
                category=rng.choice(CATEGORIES),
                active=False,
                start_time=start,
                closed_at=closed,
                capacity_provider=cap,
                vcpu=Decimal("0.25") if cap == "FARGATE_SPOT" else Decimal("1.00"),
                memory_gb=Decimal("0.5") if cap == "FARGATE_SPOT" else Decimal("2.00"),
                session_cost_usd=cost,
                case=case,
            )

            # Assign 0–3 tags
            chosen_tags = rng.sample(tag_objs, k=rng.randint(0, 3))
            container.tags.set(chosen_tags)

            # Add 0–3 notes
            for _ in range(rng.randint(0, 3)):
                SessionNote.objects.create(
                    container=container,
                    author=user,
                    body=rng.choice(NOTE_BODIES),
                )

            sessions_created += 1

        self.stdout.write(f"  Created {sessions_created} sessions")
        self.stdout.write(self.style.SUCCESS("Done! Dev data seeded successfully."))

    def _clear(self, ws, out):
        deleted, _ = Container.objects.filter(workspace=ws, name__startswith="seed-").delete()
        out.write(f"  Cleared {deleted} seeded sessions")
        # Cascade deletes comments too
        deleted, _ = Case.objects.filter(
            workspace=ws, name__in=[c[0] for c in CASES]
        ).delete()
        out.write(f"  Cleared {deleted} seeded cases (+ their comments)")
        deleted, _ = Tag.objects.filter(
            workspace=ws, name__in=[t[0] for t in TAGS]
        ).delete()
        out.write(f"  Cleared {deleted} seeded tags")
        for uname, *_ in FAKE_USERS:
            User.objects.filter(username=uname).delete()
        out.write(f"  Cleared seeded users")
