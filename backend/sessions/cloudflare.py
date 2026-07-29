"""
Shared Cloudflare DNS helpers.

Used by:
- sessions.management.commands.delete  (record deletion on session close)
- sessions.tasks.upsert_dns_record     (record creation on session callback)
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

CF_API_BASE = 'https://api.cloudflare.com/client/v4'

# Cloudflare request settings (#7)
CF_TIMEOUT_SECONDS = 10
CF_MAX_RETRIES = 3
CF_RETRY_BACKOFF_SECONDS = 2  # doubles each attempt: 2s, 4s

# DNS record defaults — match the old 1-app.sh behaviour.
CF_DNS_TTL = 300
CF_DNS_PROXIED = True


class CloudflareError(Exception):
    """Raised when the Cloudflare API returns success:false in the response body."""


def get_credentials():
    """Return (api_token, zone_id) from Django settings."""
    return settings.CLOUDFLARE_API_TOKEN, settings.CLOUDFLARE_ZONE_ID


def _cf_request(method, url, *, headers, params=None, json=None, max_retries=CF_MAX_RETRIES):
    """
    Thin wrapper around requests that adds a timeout and exponential-backoff
    retry for transient Cloudflare API failures.

    Retry policy:
    - Network/timeout errors: always retry.
    - HTTP 5xx and 429 (rate-limit): retry — these are transient server-side.
    - HTTP 4xx (except 429): do NOT retry — these are permanent caller errors
      (bad token, record not found, etc.) that won't be fixed by retrying. (#1)

    After a successful HTTP response, the Cloudflare JSON envelope is checked.
    If success:false is present a CloudflareError is raised immediately so the
    caller sees a meaningful error rather than silently accepting a failure. (#2)

    Raises:
        requests.RequestException  — network/timeout failure after all retries
        requests.HTTPError         — permanent HTTP 4xx (not retried)
        CloudflareError            — HTTP 2xx but success:false in JSON body
    """
    backoff = CF_RETRY_BACKOFF_SECONDS
    last_exc = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.request(
                method, url,
                headers=headers,
                params=params,
                json=json,
                timeout=CF_TIMEOUT_SECONDS,
            )

            # Permanent 4xx — raise immediately, no retry. (#1)
            if 400 <= resp.status_code < 500 and resp.status_code != 429:
                resp.raise_for_status()

            # Transient 5xx or 429 — treat like a network error and retry.
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError(
                    f"Transient HTTP {resp.status_code}", response=resp
                )

            # 2xx — check the Cloudflare envelope. (#2)
            try:
                body = resp.json()
            except ValueError:
                # Non-JSON 2xx: return the raw response and let the caller handle it.
                return resp

            if not body.get('success', True):
                errors = body.get('errors', [])
                raise CloudflareError(
                    f"Cloudflare API error (success:false): {errors}"
                )

            return resp

        except CloudflareError:
            # success:false is a permanent semantic error — never retry it.
            raise
        except requests.RequestException as exc:
            # Don't retry permanent 4xx (they'll be HTTPError with a 4xx response).
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                if 400 <= exc.response.status_code < 500 and exc.response.status_code != 429:
                    raise
            last_exc = exc
            if attempt < max_retries:
                import time
                time.sleep(backoff)
                backoff *= 2

    # last_exc is always set here because max_retries >= 1 and every loop
    # iteration either returns or assigns last_exc before continuing.
    # The assertion keeps this invariant explicit and satisfies type checkers.
    assert last_exc is not None
    raise last_exc


def upsert_a_record(subdomain: str, public_ip: str):
    """
    Create or update a Cloudflare A record for *subdomain* pointing at *public_ip*.

    Mirrors the old in-container 1-app.sh logic:
    1. GET existing A record by name.
    2. POST (create) if none exists, or PUT (update) if one does.

    Raises:
        requests.RequestException / CloudflareError on failure.
    """
    api_token, zone_id = get_credentials()
    if not api_token or not zone_id:
        raise CloudflareError(
            "Cloudflare credentials not configured "
            "(CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID)."
        )

    headers = {
        'Authorization': f'Bearer {api_token}',
        'Content-Type': 'application/json',
    }
    api_url = f"{CF_API_BASE}/zones/{zone_id}/dns_records"

    logger.info("Upserting DNS A record: %s -> %s", subdomain, public_ip)

    # 1) Look up existing record.
    lookup = _cf_request(
        'GET', api_url,
        headers=headers,
        params={'type': 'A', 'name': subdomain},
    )
    result = lookup.json().get('result', [])
    record_id = result[0]['id'] if result else None

    body = {
        'type': 'A',
        'name': subdomain,
        'content': public_ip,
        'ttl': CF_DNS_TTL,
        'proxied': CF_DNS_PROXIED,
    }

    # 2) Create or update.
    if record_id is None:
        logger.info("No existing A record for %s — creating.", subdomain)
        _cf_request('POST', api_url, headers=headers, json=body)
    else:
        logger.info("Existing A record %s for %s — updating.", record_id, subdomain)
        _cf_request('PUT', f"{api_url}/{record_id}", headers=headers, json=body)

    logger.info("DNS upsert complete for %s -> %s", subdomain, public_ip)
