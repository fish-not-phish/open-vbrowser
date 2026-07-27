"""
Backfill S3 Files access points for existing non-personal workspaces.

Workspaces created before S3 Files was enabled don't have an access point
(the post_save signal only fires on creation). This command provisions
access points for all non-personal workspaces that are missing one.

Idempotent — safe to run multiple times. Only workspaces without an
access_point_arn will be provisioned.

If an access point was deleted manually in AWS, the DB may still hold a
stale ARN. Use --verify to check existing ARNs against AWS and clear
stale ones before provisioning.

Usage:
    python manage.py backfill_access_points
    python manage.py backfill_access_points --dry-run
    python manage.py backfill_access_points --verify
    python manage.py backfill_access_points --verify --dry-run
"""
from django.core.management.base import BaseCommand, CommandParser


class Command(BaseCommand):
    help = "Provision S3 Files access points for existing non-personal workspaces that don't have one."

    def add_arguments(self, parser: CommandParser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be provisioned without making AWS calls.',
        )
        parser.add_argument(
            '--verify',
            action='store_true',
            help='Verify existing access points still exist in AWS; clear stale ARNs and reprovision.',
        )

    def handle(self, *args, **options):
        from workspaces.models import Workspace
        from workspaces.services import provision_access_point, verify_access_point_exists

        dry_run = options['dry_run']
        verify = options['verify']

        # ── Verify existing ARNs against AWS ────────────────────────────────
        if verify:
            with_arn = Workspace.objects.filter(
                is_personal=False,
            ).exclude(s3files_access_point_arn='')

            stale_cleared = 0
            verified_ok = 0
            for ws in with_arn:
                if verify_access_point_exists(ws.s3files_access_point_arn):
                    verified_ok += 1
                else:
                    stale_cleared += 1
                    self.stdout.write(self.style.WARNING(
                        f"  Stale ARN for {ws.name} ({ws.uuid}): "
                        f"{ws.s3files_access_point_arn}"
                    ))
                    if not dry_run:
                        ws.s3files_access_point_arn = ''
                        ws.save(update_fields=['s3files_access_point_arn'])

            self.stdout.write(
                f"Verified {verified_ok + stale_cleared} existing access point(s): "
                f"{verified_ok} OK, {stale_cleared} stale (cleared)."
            )

        # ── Provision missing access points ────────────────────────────────
        missing = Workspace.objects.filter(
            is_personal=False,
            s3files_access_point_arn='',
        )

        count = missing.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("All non-personal workspaces already have access points."))
            return

        self.stdout.write(f"Found {count} non-personal workspace(s) without an access point.")

        if dry_run:
            for ws in missing:
                self.stdout.write(f"  [DRY RUN] Would provision for: {ws.name} ({ws.uuid})")
            return

        succeeded = 0
        failed = 0
        for ws in missing:
            try:
                arn = provision_access_point(ws)
            except Exception as exc:
                failed += 1
                self.stdout.write(self.style.ERROR(
                    f"  Failed for {ws.name} ({ws.uuid}): {exc}"
                ))
                continue
            if arn:
                succeeded += 1
                self.stdout.write(self.style.SUCCESS(
                    f"  Provisioned for {ws.name} ({ws.uuid}): {arn}"
                ))
            else:
                failed += 1
                self.stdout.write(self.style.WARNING(
                    f"  Skipped for {ws.name} ({ws.uuid}) "
                    "— S3 Files not configured or DEV_MODE"
                ))

        self.stdout.write()
        self.stdout.write(self.style.SUCCESS(
            f"Done: {succeeded} provisioned, {failed} failed, {count} total."
        ))
