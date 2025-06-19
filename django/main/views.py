from django.shortcuts import render, redirect
from django.http import JsonResponse, HttpResponseRedirect, HttpResponseForbidden, Http404
from .models import *
from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.utils import timezone
from .forms import *
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.shortcuts import get_object_or_404
from .tasks import *
from .decorators import *
import json
import hashlib
import boto3
from allauth.account.models import EmailAddress
from django.db.models import Q
from allauth.mfa.models import Authenticator
import re
from .filters import *
from rest_framework.authtoken.models import Token
from .storages import OverwriteS3Boto3Storage
import string
import os
from pathlib import Path

custom_domain = settings.CUSTOM_DOMAIN

overwrite_storage = OverwriteS3Boto3Storage()

s3_client = boto3.client('s3')

########################################################
# WRAPPER FUNCTIONS
########################################################

def check_referer(func):
    def wrapper(request, *args, **kwargs):
        referer = request.META.get('HTTP_REFERER')
        if not referer or custom_domain not in referer:
            return HttpResponseForbidden("You're not allowed to access this resource.")
        return func(request, *args, **kwargs)
    return wrapper

########################################################
# MAIN VIEWS
########################################################

@login_required
def start(request):
    vb_path = Path(settings.BASE_DIR) / 'vbrowsers'
    enabled = sorted(
        d.name for d in vb_path.iterdir()
        if d.is_dir()
    )
    User = get_user_model()
    user = User.objects.get(id=request.user.id)    
    profile = user.extendprofile

    active_containers = Container.objects.filter(user=user, active=True)   
    active_container = active_containers.first()

    existing_container = Container.objects.filter(user=user).filter(Q(start_time__isnull=True)).first()

    if existing_container:
        # The user already has a container without a start_time, so we should not create a new one
        return redirect('loading', container_uuid=existing_container.uuid)
    
    if active_container is not None:
        cont_uuid = active_container.uuid
        return redirect('surf', container_uuid=cont_uuid)
    
    context = {}

    context['enabled_browsers'] = enabled

    if request.GET.get('failed'):
        failed_req = request.GET.get('failed', '')
        failed_text = 'Your session failed to start.'
        if failed_req != '':
            context['failed_text'] = failed_text
    else:
        context['failed_text'] = "None"

    if request.GET.get('session_summary'):
        session_summary = request.GET.get('session_summary', '')
        details_container = Container.objects.get(uuid=session_summary)
        if session_summary != '':
            context['details_container'] = details_container
    else:
        context['details_container'] = "None"
    
    if request.method == 'POST':
        session_type = request.POST.get('session_type', 'vSpot')
        browser_choice = request.POST.get('browser_choice', 'chrome')
        auto_open_url = request.POST.get('session_input', '').strip()

        if not auto_open_url:
            auto_open_url = 'google.com'
        elif browser_choice in ['chrome', 'firefox', 'edge', 'tor', 'mullvad', 'brave', 'librewolf', 'telegram', 'vivaldi', 'slack', 'postman', 'discord', 'signal', 'zoom', 'ungoogled', 'chromium', 'brave', 'opera', 'icecat', 'falkon', 'floorp', 'waterfox', 'seamonkey', 'zen', 'thorium', 'palemoon', 'basilik', 'pulse', 'remnux', 'terminal']:
            pass
        else:
            browser_choice = 'chrome'
        
        active = False            
        port = 443
        rand_suffix = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(6))

        container_name = f"{browser_choice}-{rand_suffix}--{port}"

        if not active:
            new_container = Container (
                    name = container_name,
                    port = port,
                    active = False,
                    user = user,
                    type=browser_choice,
                    url = auto_open_url,
                    container_url = None,
                    category = session_type
                )
            new_container.save()
            
            raw_username = user.username
            username = re.sub(r'[^A-Za-z0-9]', '', raw_username)

            start_container.delay(str(new_container.uuid), str(browser_choice), str(auto_open_url), str(username), str(session_type))
            return redirect('loading', container_uuid=new_container.uuid)
    
    context['profile'] = profile 
    
    return render(request, 'main/start.html', context)

@login_required
def loading(request, container_uuid):
    DEFAULT_MAX_WAIT_TIME = 120000  # 2 minutes
    REMNUX_MAX_WAIT_TIME = 600000    
    container = Container.objects.get(uuid=container_uuid)
    if container.type == 'remnux':
        max_wait_time = REMNUX_MAX_WAIT_TIME
    else:
        max_wait_time = DEFAULT_MAX_WAIT_TIME
    context = {
        'container_uuid': container_uuid,
        'type': container.type,
        'max_wait_time': max_wait_time,
    }
    return render(request, 'main/loading.html', context)

@csrf_exempt
def container_data_returned(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            container_uuid = data.get('uuid')
            public_ip = data.get('public_ip')
            private_ip = data.get('private_ip')
            task_arn = data.get('task_arn')
            sg_id = data.get('security_group_id')
            capacity_provider = data.get('capacity_provider')

            appended_uuid = container_uuid + "\n"

            hash_object = hashlib.md5(appended_uuid.encode('utf-8'))
            RANDOM_STRING = hash_object.hexdigest()
            subdomain = f'browser-{RANDOM_STRING}.{custom_domain}'
            

            container = Container.objects.get(uuid=container_uuid)

            container.ip_address = public_ip
            container.private_ip = private_ip
            container.task_arn = task_arn
            container.subdomain = subdomain
            container.sg_id = sg_id
            container.active = True
            container.container_url = f"https://{subdomain}"
            container.start_time = timezone.now()
            container.capacity_provider = capacity_provider
            container.save()

            open_container,_ = OpenContainers.objects.get_or_create(container_uuid=container_uuid, container=container, closed_at__isnull=True)
            
            print(f"Container UUID: {container_uuid}, Public IP: {public_ip}, Task ARN: {task_arn}")
            
            return JsonResponse({'status': 'success', 'message': 'Data received successfully'})
        except json.JSONDecodeError:
            return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body'}, status=400)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'An unexpected error occurred: {str(e)}'}, status=500)

    return JsonResponse({'status': 'error', 'message': 'Invalid request method'}, status=405)

@check_referer
@csrf_exempt
@login_required
def container_status(request, container_uuid):
    try:
        container = Container.objects.get(uuid=container_uuid)
        if container.container_url is not None:
            response_data = {
                'status': 'active',
                'container_uuid': container_uuid
            }
        else:
            response_data = {
                'status': 'inactive',
                'message': 'Inactive'
            }
    except Container.DoesNotExist:
        response_data = {
            'status': 'error',
            'message': 'Container not found'
        }
    
    return JsonResponse(response_data)

@login_required
def account_settings(request):
    user = request.user
    # Use get_or_create to ensure an ExtendProfile exists.
    extendprofile, created = ExtendProfile.objects.get_or_create(user=user, defaults={'phone': '123-345-6789'})
    context = {}
    
    if request.method == 'POST':
        first_name = request.POST.get('first_name', '').strip()
        last_name = request.POST.get('last_name', '').strip()
        phone = request.POST.get('phone', '').strip()

        # Update the user's basic info.
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        user.save()

        # Update or create the phone number.
        if phone:
            extendprofile.phone = phone
            extendprofile.save()
        
        messages.success(request, "Account details updated successfully.")
        return redirect('account_settings')
    user = request.user
    email_addresses = EmailAddress.objects.filter(user=user)
    email_verified = email_addresses.filter(verified=True).exists()
    context['verified'] = email_verified
    context['user'] = user
    context['extendprofile'] = extendprofile
    return render(request, 'main/account_settings.html', context)


@login_required
def account_security(request):
    user = request.user
    
    if request.method == 'POST':
        current_password = request.POST.get('current_password', '')
        new_password = request.POST.get('new_password', '')
        new_password_confirm = request.POST.get('new_password_confirm', '')
        
        if not user.check_password(current_password):
            messages.error(request, "Incorrect current password.")
        elif new_password != new_password_confirm:
            messages.error(request, "New passwords do not match.")
        else:
            user.set_password(new_password)
            user.save()
            update_session_auth_hash(request, user)
            messages.success(request, "Password updated successfully.")
            return redirect('account_security')
    
    # Check whether MFA is enabled (for display purposes)
    mfa_enabled = Authenticator.objects.filter(user=user).exists()
    
    context = {
        'user': user,
        'mfa_enabled': mfa_enabled,
    }
    return render(request, 'main/account_security.html', context)


@login_required
def account_api_key(request):
    user = request.user
    try:
        extendprofile = ExtendProfile.objects.get(user=user)
    except ExtendProfile.DoesNotExist:
        extendprofile = None  # Treat no ExtendProfile as a Free plan

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'delete':
            Token.objects.filter(user=user).delete()
            messages.success(request, 'Your API key has been deleted.')
        elif action == 'create':
            # Delete the old token if it exists and create a new one
            Token.objects.filter(user=user).delete()
            Token.objects.create(user=user)
            messages.success(request, 'Your API key has been created/regenerated.')
        return redirect('account_api')
    
    # For GET requests, retrieve the existing token (if any)
    token = Token.objects.filter(user=user).first()
    context = {
        'user': user,
        'extendprofile': extendprofile,
        'token': token,
    }
    return render(request, 'main/account_api.html', context)

@login_required
def surf(request, container_uuid):
    context = {}
    container = Container.objects.get(uuid=container_uuid)
    container_name = container.name
    if container.closed_at is not None:
        return redirect('account_settings')
    context['custom_domain'] = custom_domain
    context['type'] = container.type
    context['container_uuid'] = container.uuid
    user = request.user
    context['username'] = user.username
    port = container_name.split('-')[1]
    context['port'] = port
    context['container_name'] = container_name
    context['session_token'] = container.session_token

    if container.start_time:
        context['session_duration'] = container.start_time.isoformat()
    else:
        context['session_duration'] = None
    print("surf end of function")
    return render(request, 'main/session.html', context)

@csrf_exempt
def close_session(request, container_uuid):
    if request.method == 'POST':
        try:
            container = Container.objects.get(uuid=container_uuid)
            if container.active:
                delete_container.delay(str(container.uuid))
                response_data = {
                    'status': 'removed'
                }
            else:
                delete_container.delay(str(container.uuid))
                response_data = {
                    'status': 'removed'
                }
        except Container.DoesNotExist:
            response_data = {
                'status': 'error',
                'message': 'Container not found'
            }
        
        return JsonResponse(response_data)
    else:
        return JsonResponse({'status': 'error', 'message': 'Invalid request method'})

@check_referer
def container_proxy(request):
    session_token = request.GET.get('session_token')

    if not session_token:
        raise Http404("Session token not provided")

    container = get_object_or_404(Container, session_token=session_token, active=True)

    token = str(container.uuid)

    url = f'{container.container_url}/?token={token}'

    return HttpResponseRedirect(url)

@check_referer
def ping(request, container_uuid):
    open_container_inst = get_object_or_404(OpenContainers, container_uuid=container_uuid, closed_at__isnull=True)
    open_container_inst.last_ping_at = timezone.now()
    open_container_inst.save()
    return JsonResponse({'msg': 'ok'})

@login_required
def session(request):
    user = request.user
    active_containers = Container.objects.filter(user=user, active=True)

    alive_containers = active_containers.first()

    if alive_containers is not None:
        cont_uuid = alive_containers.uuid
        return redirect('surf', container_uuid=cont_uuid)
    
    else:
        return redirect('start')
    
#####################################################
# ERROR VIEWS
#####################################################
    
def error_404(request, exception):
    return render(request, 'main/404.html', status=404)

def error_403(request, exception):
    return render(request, 'main/404.html', status=403)

def error_400(request, exception):
    return render(request, 'main/404.html', status=400)

def error_500(request):
    return render(request, 'main/404.html', status=500)


#####################################################
# DOCUMENTATION
#####################################################

def docs_session(request):
    context = {
        'custom_domain': custom_domain
    }
    return render(request, 'main/docs_session.html', context)

def docs_clipboard(request):
    context = {
        'custom_domain': custom_domain
    }
    return render(request, 'main/docs_clipboard.html', context)

def docs_sounds(request):
    context = {
        'custom_domain': custom_domain
    }
    return render(request, 'main/docs_sounds.html', context)

def docs_screenshot(request):
    context = {
        'custom_domain': custom_domain
    }
    return render(request, 'main/docs_screenshot.html', context)

def docs_file(request):
    context = {
        'custom_domain': custom_domain
    }
    return render(request, 'main/docs_file.html', context)