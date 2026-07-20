import os
import json
import time
import requests
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

CUSTOM_DOMAIN = settings.CUSTOM_DOMAIN
DEFAULT_IDLE_THRESHOLD = settings.DEFAULT_IDLE_THRESHOLD
CLUSTER_NAME = 'ovb-browsers'

# ─── DEV_MODE stub ────────────────────────────────────────────────────────────
# When DEV_MODE=1 (set in .env or environment), all AWS calls are bypassed.
# The callback is POSTed directly to localhost so the loading page resolves.
DEV_MODE = getattr(settings, 'DEV_MODE', False)

if not DEV_MODE:
    import boto3
    _region = settings.AWS_REGION
    ecs_client = boto3.client('ecs', region_name=_region)
    ec2_client = boto3.client('ec2', region_name=_region)

# ─── OS-based browser slugs ────────────────────────────────────────────────────
# These receive the "os" resource tier from SiteSettings instead of "browser".
OS_APP_SLUGS = frozenset({"kali", "ubuntu", "alpine"})

if not DEV_MODE:
    SUBNET_ID = settings.SUBNET_ID
    SECURITY_GROUP_ID = settings.SECURITY_GROUP_ID


def get_latest_task_definition(family: str) -> str:
    """Return the ARN of the latest ACTIVE task definition for the given family."""
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


def _dev_run_browser_task(container_uuid):
    """
    Stub used when DEV_MODE=1.
    Immediately POSTs a fake callback so the session moves to 'active'.
    The container_url points at localhost:6901 (KasmVNC default port) which
    won't actually work, but lets you exercise every UI state without AWS.
    """
    import uuid as _uuid
    fake_ip = '127.0.0.1'
    fake_arn = f'arn:aws:ecs:us-east-1:000000000000:task/vbrowsers/dev{_uuid.uuid4().hex[:8]}'
    payload = {
        'uuid':              container_uuid,
        'public_ip':         fake_ip,
        'private_ip':        fake_ip,
        'task_arn':          fake_arn,
        'capacity_provider': 'DEV',
        'vcpu':              0.25,
        'memory_gb':         0.5,
    }
    callback_url = f'http://127.0.0.1:8000/api/v1/sessions/{container_uuid}/callback/'
    try:
        resp = requests.post(callback_url, json=payload, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        # Swallow — the session record already exists; callback can be retried
        # manually with: python manage.py fake_callback <uuid>
        print(f"[DEV_MODE] callback POST failed ({exc}). "
              f"Run: python manage.py fake_callback {container_uuid}")
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'DEV_MODE stub — no ECS task launched', 'uuid': container_uuid}),
    }


def run_browser_task(browser_type, container_uuid, auto_open_url, username, session_type,
                     enable_traffic_log=False, file_protection=False):
    if DEV_MODE:
        return _dev_run_browser_task(container_uuid)

    # 1) Network configuration
    network_configuration = {
        'awsvpcConfiguration': {
            'subnets':         [SUBNET_ID],
            'securityGroups':  [SECURITY_GROUP_ID],
            'assignPublicIp':  'ENABLED'
        }
    }

    # 2) Resolve task definition
    browser = browser_type.lower()
    family = f"ovb-{browser}"
    try:
        task_definition_arn = get_latest_task_definition(family)
    except Exception:
        browser = 'chrome'
        family = 'ovb-chrome'
        task_definition_arn = get_latest_task_definition(family)

    # 3) Container overrides
    from sessions.models import Container as _Container
    _container_obj = _Container.objects.get(uuid=container_uuid)

    overrides = {
        'containerOverrides': [{
            'name': browser,
            'environment': [
                {'name': 'UUID',                    'value': container_uuid},
                {'name': 'SESSION_TOKEN',           'value': _container_obj.session_token},
                {'name': 'USERNAME',                'value': username},
                {'name': 'ENTERPRISE',              'value': "yes"},
                {'name': 'SAAS',                    'value': "yes"},
                {'name': 'CUSTOM_DOMAIN',           'value': CUSTOM_DOMAIN},
                {'name': 'DEFAULT_IDLE_THRESHOLD',  'value': str(DEFAULT_IDLE_THRESHOLD)},
                {'name': 'ENABLE_TRAFFIC_LOG',      'value': 'true' if enable_traffic_log else 'false'},
                {'name': 'FILE_PROTECTION',         'value': 'true' if file_protection else 'false'},
            ]
        }]
    }
    if browser not in (
        "tor", "telegram", "kali",
        "alpine", "ubuntu"
    ):
        overrides['containerOverrides'][0]['environment'].append({
            'name': 'FF_OPEN_URL',
            'value': auto_open_url
        })

    # ── Resource overrides from SiteSettings ──────────────────────────────────
    # Read the admin-configured vCPU/memory for this app type and inject them
    # as task-level overrides so every session honours the current setting.
    # ECS expects cpu as CPU units (1 vCPU = 1024) and memory in MiB — both strings.
    try:
        from users.models import SiteSettings as _SiteSettings
        _site = _SiteSettings.get()
        if browser in OS_APP_SLUGS:
            _vcpu_units = int(float(_site.os_vcpu) * 1024)
            _mem_mib    = int(float(_site.os_memory_gb) * 1024)
        else:
            _vcpu_units = int(float(_site.browser_vcpu) * 1024)
            _mem_mib    = int(float(_site.browser_memory_gb) * 1024)
    except Exception:
        # Fall back to task-definition defaults if DB is unavailable
        _vcpu_units = None
        _mem_mib    = None

    if _vcpu_units:
        overrides['cpu']    = str(_vcpu_units)
        overrides['memory'] = str(_mem_mib)

    def try_run(cp):
        return ecs_client.run_task(
            cluster=CLUSTER_NAME,
            capacityProviderStrategy=[{'capacityProvider': cp, 'weight': 1}],
            taskDefinition=task_definition_arn,
            networkConfiguration=network_configuration,
            overrides=overrides,
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
        desc = ecs_client.describe_tasks(cluster=CLUSTER_NAME, tasks=[task_arn])
        status = desc['tasks'][0]['lastStatus']
        if status == 'RUNNING':
            break
        time.sleep(3)

    # 6) Extract vCPU and memory actually used by this running task for cost tracking.
    # Read from the task object itself (not the task definition) so that any
    # task-level overrides we injected (cpu/memory in `overrides`) are reflected.
    running_task = desc['tasks'][0]
    td_cpu = running_task.get('cpu', '256')    # in CPU units (256 = 0.25 vCPU)
    td_mem = running_task.get('memory', '512') # in MiB

    vcpu_value = float(td_cpu) / 1024
    memory_gb_value = float(td_mem) / 1024

    # 7) Lookup the ENI and its IPs
    attachments = desc['tasks'][0]['attachments']
    eni_id = next(
        detail['value']
        for att in attachments if att['type'] == 'ElasticNetworkInterface'
        for detail in att['details']
        if detail['name'] == 'networkInterfaceId'
    )
    eni = ec2_client.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
    public_ip  = eni['NetworkInterfaces'][0]['Association']['PublicIp']
    private_ip = eni['NetworkInterfaces'][0]['PrivateIpAddress']

    # 8) Extra warm-up wait
    time.sleep(30)

    # 9) POST back the callback
    payload = {
        'uuid':              container_uuid,
        'public_ip':         public_ip,
        'private_ip':        private_ip,
        'task_arn':          task_arn,
        'capacity_provider': cp_used,
        'vcpu':              vcpu_value,
        'memory_gb':         memory_gb_value,
    }
    resp = requests.post(
        f'https://{CUSTOM_DOMAIN}/api/v1/sessions/{container_uuid}/callback/',
        json=payload
    )
    resp.raise_for_status()

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message':           'ECS Task Started',
            'uuid':              container_uuid,
            'public_ip':         public_ip,
            'private_ip':        private_ip,
            'task_arn':          task_arn,
            'capacity_provider': cp_used,
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
        enable_traffic_log=params.get('enable_traffic_log', False),
        file_protection=params.get('file_protection', False),
    )


class Command(BaseCommand):
    help = "Launches a vBrowser ECS task"

    def add_arguments(self, parser):
        parser.add_argument('--browser_type', required=True)
        parser.add_argument('--uuid', required=True)
        parser.add_argument('--auto_open_url', default='')
        parser.add_argument('--user_tier', default='free')
        parser.add_argument('--username', required=True)
        parser.add_argument('--session_type', default='vstandard')
        parser.add_argument('--enable_traffic_log', default=False, type=lambda x: x in (True, 'True', 'true', '1'))
        parser.add_argument('--file_protection', default=False, type=lambda x: x in (True, 'True', 'true', '1'))

    def handle(self, *args, **options):
        result = lambda_handler({'queryStringParameters': options}, context=None)
        status = result.get('statusCode')
        body = result.get('body')
        if status != 200:
            raise CommandError(f"Task failed ({status}): {body}")
        self.stdout.write(self.style.SUCCESS(f"Success: {body}"))
