import os
from django.core.management.base import BaseCommand
from api.services.seed_service import seed_database


class Command(BaseCommand):
    help = "Run idempotent minimal database seed for Galli Smartkottu on Supabase PostgreSQL"

    def handle(self, *args, **options):
        created = seed_database()
        if created:
            self.stdout.write(self.style.SUCCESS("-------------------------------------------------------------"))
            self.stdout.write(self.style.SUCCESS("Galli Smartkottu Seed Completed (Supabase PostgreSQL)"))
            self.stdout.write(
                f"Super Admin : {os.environ.get('SEED_ADMIN_EMAIL', 'admin@gallismartkottu.local')} / "
                f"{os.environ.get('SEED_ADMIN_PASSWORD', 'Admin@2026!')}"
            )
            self.stdout.write(
                f"SMO         : {os.environ.get('SEED_SMO_EMAIL', 'owner@gallifresh.local')} "
                f"(or {os.environ.get('SEED_SMO_PHONE', '9876543210')}) / "
                f"{os.environ.get('SEED_SMO_PASSWORD', 'Owner@2026!')}"
            )
            self.stdout.write(f"Store URL   : /store/{os.environ.get('SEED_STORE_SLUG', 'galli-fresh-mart')}")
            self.stdout.write(
                f"Customer    : {os.environ.get('SEED_CUSTOMER_PHONE', '9123456789')} / "
                f"PIN {os.environ.get('SEED_CUSTOMER_PIN', '1234')}"
            )
            self.stdout.write(self.style.SUCCESS("-------------------------------------------------------------"))
        else:
            self.stdout.write("Database already seeded (seeded_v1 present). No changes made.")
