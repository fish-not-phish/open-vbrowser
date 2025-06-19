import boto3
from django.core.management.base import BaseCommand, CommandError
import requests
from django.conf import settings

custom_domain = settings.CUSTOM_DOMAIN

ecs_client = boto3.client('ecs')
ec2_client = boto3.client('ec2')

cf_token = settings.CLOUDFLARE_API_TOKEN
cf_zone = settings.CLOUDFLARE_ZONE_ID

cluster = 'vbrowsers'
CF_API_BASE = 'https://api.cloudflare.com/client/v4'

class Command(BaseCommand):
    help = 'Stops ECS task, deletes Route 53 A record, EFS access point'

    def add_arguments(self, parser):
        parser.add_argument('--task-arn', required=True, help='ECS Task ARN')
        parser.add_argument('--public-ip', required=True, help='Public IP of the ECS task')

    def handle(self, *args, **options):
        task_arn = options['task_arn']
        public_ip = options['public_ip']
        
        try:
            # Stop ECS Task
            try:
                stop_response = ecs_client.stop_task(
                    cluster=cluster,
                    task=task_arn,
                    reason='Task stopped by management command'
                )
                print("ECS Task stopped:", stop_response)
                ecs_client.get_waiter('tasks_stopped').wait(
                    cluster=cluster,
                    tasks=[task_arn]
                )
            except Exception as e:
                print(f"Error stopping ECS Task: {str(e)}")

            # Delete A record from Route 53
            headers = {
                'Authorization': f'Bearer {cf_token}',
                'Content-Type': 'application/json'
            }
            params = {
                'type': 'A',
                'content': public_ip,
                'per_page': 100
            }
            list_url = f"{CF_API_BASE}/zones/{cf_zone}/dns_records"
            self.stdout.write(f"Looking for Cloudflare A-records with IP {public_ip}…")
            r = requests.get(list_url, headers=headers, params=params)
            resp = r.json()
            if not resp.get('success'):
                raise CommandError(f"Cloudflare list failed: {resp.get('errors')}")

            records = resp.get('result', [])
            if not records:
                self.stdout.write("No matching DNS records found.")
            else:
                for rec in records:
                    rec_id = rec['id']
                    name = rec['name']
                    del_url = f"{CF_API_BASE}/zones/{cf_zone}/dns_records/{rec_id}"
                    dr = requests.delete(del_url, headers=headers)
                    dresp = dr.json()
                    if dresp.get('success'):
                        self.stdout.write(self.style.SUCCESS(f"Deleted DNS record: {name} → {public_ip}"))
                    else:
                        self.stderr.write(f"Failed to delete {name}: {dresp.get('errors')}")

            self.stdout.write(self.style.SUCCESS("delete command completed."))

        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Operation failed: {str(e)}"))
