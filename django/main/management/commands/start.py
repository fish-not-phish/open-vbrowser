import os
import json
import time
import requests
import boto3
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

ecs_client = boto3.client('ecs')
ec2_client = boto3.client('ec2')

SUBNET_ID = settings.SUBNET_ID
SECURITY_GROUP_ID = settings.SECURITY_GROUP_ID
CUSTOM_DOMAIN = settings.CUSTOM_DOMAIN
CLUSTER_NAME = 'vbrowsers'

def get_latest_task_definition(family: str) -> str:
    """
    Return the ARN of the latest ACTIVE task definition for the given family.
    Raises Exception if none found.
    """
    resp = ecs_client.list_task_definitions(
        familyPrefix=family,
        status='ACTIVE',
        sort='DESC',
        maxResults=1
    )
    arns = resp.get('taskDefinitionArns', [])
    if not arns:
        raise RuntimeError(f"No active task definitions found for family '{family}'")
    return arns[0]  

def run_browser_task(browser_type, container_uuid, auto_open_url, username, session_type):
    # 1) Network configuration
    network_configuration = {
        'awsvpcConfiguration': {
            'subnets':         [SUBNET_ID],
            'securityGroups':  [SECURITY_GROUP_ID],
            'assignPublicIp':  'ENABLED'
        }
    }

    # 2) Resolve task definition
    family = browser_type.lower()
    try:
        task_definition_arn = get_latest_task_definition(family)
    except Exception:
        family = 'chrome'
        task_definition_arn = get_latest_task_definition(family)

    # 3) Container overrides
    overrides = {
        'containerOverrides': [{
            'name': family,
            'environment': [
                {'name': 'UUID',     'value': container_uuid},
                {'name': 'USERNAME', 'value': username},
            ]
        }]
    }
    if browser_type not in (
        "tor","telegram","remnux","discord","slack",
        "zoom","signal","postman","terminal"
    ):
        overrides['containerOverrides'][0]['environment'].append({
            'name': 'FF_OPEN_URL',
            'value': auto_open_url
        })

    def try_run(cp):
        return ecs_client.run_task(
            cluster=CLUSTER_NAME,
            capacityProviderStrategy=[{'capacityProvider': cp, 'weight': 1}],
            taskDefinition=task_definition_arn,
            networkConfiguration=network_configuration,
            overrides=overrides
        )

    # 4) Launch on FARGATE or FARGATE_SPOT
    if session_type.lower() == 'vspot':
        try:
            response = try_run('FARGATE_SPOT')
            cp_used = 'FARGATE_SPOT'
        except ecs_client.exceptions.ClientError as e:
            if 'insufficient capacity' in str(e):
                response = try_run('FARGATE')
                cp_used = 'FARGATE'
            else:
                raise
    else:
        response = try_run('FARGATE')
        cp_used = 'FARGATE'

    # 5) Poll indefinitely until RUNNING
    task_arn = response['tasks'][0]['taskArn']
    while True:
        desc   = ecs_client.describe_tasks(cluster=CLUSTER_NAME, tasks=[task_arn])
        status = desc['tasks'][0]['lastStatus']
        if status == 'RUNNING':
            break
        # You may want to log each attempt here...
        time.sleep(3)

    # 6) Lookup the ENI and its IPs
    attachments = desc['tasks'][0]['attachments']
    eni_id = next(
        detail['value']
        for att in attachments if att['type']=='ElasticNetworkInterface'
        for detail in att['details']
        if detail['name']=='networkInterfaceId'
    )
    eni = ec2_client.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
    public_ip  = eni['NetworkInterfaces'][0]['Association']['PublicIp']
    private_ip = eni['NetworkInterfaces'][0]['PrivateIpAddress']

    # 7) Extra “warm-up” wait if you still need it
    time.sleep(30)

    # 8) POST back — no timeout at all
    payload = {
        'uuid':              container_uuid,
        'public_ip':         public_ip,
        'private_ip':        private_ip,
        'task_arn':          task_arn,
        'capacity_provider': cp_used
    }
    resp = requests.post(
        f'https://{CUSTOM_DOMAIN}/container_data_returned/',
        json=payload
        # <-- deliberately no `timeout=` here
    )
    resp.raise_for_status()

    return {
        'statusCode': 200,
        'body':       json.dumps({
            'message':           'ECS Task Started',
            'uuid':              container_uuid,
            'public_ip':         public_ip,
            'private_ip':        private_ip,
            'task_arn':          task_arn,
            'capacity_provider': cp_used
        })
    }

def lambda_handler(event, context):
    params = event.get('queryStringParameters') or {}
    return run_browser_task(
        browser_type=params.get('browser_type', 'chrome'),
        container_uuid=params.get('uuid', ''),
        auto_open_url=params.get('auto_open_url', ''),
        username=params.get('username', ''),
        session_type=params.get('session_type', 'vstandard'),
    )

class Command(BaseCommand):
    help = "Launches a vBrowser ECS task (originally a Lambda)"

    def add_arguments(self, parser):
        parser.add_argument('--browser_type', required=True)
        parser.add_argument('--uuid', required=True)
        parser.add_argument('--auto_open_url', default='')
        parser.add_argument('--user_tier', default='free')
        parser.add_argument('--username', required=True)
        parser.add_argument('--session_type', default='vstandard')

    def handle(self, *args, **options):
        result = lambda_handler({
            'queryStringParameters': options
        }, context=None)
        status = result.get('statusCode')
        body = result.get('body')
        if status != 200:
            raise CommandError(f"Task failed ({status}): {body}")
        self.stdout.write(self.style.SUCCESS(f"Success: {body}"))
