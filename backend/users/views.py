from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from django.conf import settings

@login_required
def auth_gate(request):
    # Redirect back to Next.js frontend after successful authentication.
    # CUSTOM_DOMAIN is the canonical host (e.g. registry.example.com or 127.0.0.1:3000).
    # Fall back to the request's own origin so it works without CUSTOM_DOMAIN set.
    if settings.CUSTOM_DOMAIN:
        if settings.BASIC_MODE:
            # No reverse proxy — plain HTTP, frontend on :3000
            host = settings.CUSTOM_DOMAIN
            if ':' not in host:
                host = f"{host}:3000"
            frontend_url = f"http://{host}/"
        else:
            # Behind Traefik / Nginx — always HTTPS, no port suffix
            frontend_url = f"https://{settings.CUSTOM_DOMAIN}/"
    else:
        # Derive from the incoming request — works for localhost and LAN dev
        frontend_url = f"{request.scheme}://{request.get_host().split(':')[0]}:3000/"
    return redirect(frontend_url)