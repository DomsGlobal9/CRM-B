import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SENDING_OFF = 'WhatsApp sending is turned off for the platform (WHATSAPP_SENDING_ENABLED).'
BOUTIQUE_SENDING_OFF = 'WhatsApp messages are switched off in Settings.'


def sending_enabled() -> bool:
    """The platform's master switch (WHATSAPP_SENDING_ENABLED in the .env)."""
    return getattr(settings, 'WHATSAPP_SENDING_ENABLED', True)


def boutique_sending_enabled(tenant=None) -> bool:
    """The boutique's own switch, in Settings > WhatsApp integration.

    In `tenant`'s schema when given, else the connection's. A boutique with no
    settings row yet has not switched anything off.
    """
    from crm_api.models import BoutiqueSettings

    def read():
        return not BoutiqueSettings.objects.filter(id=1, customer_messaging_enabled=False).exists()

    if tenant is None:
        return read()
    from django_tenants.utils import tenant_context
    with tenant_context(tenant):
        return read()


def _record(phone, session_id, tenant, purpose, status, error=''):
    """One row in the console's outbound log. Never the message text: those
    carry sign-in codes and tracking links."""
    from superadmin import outbound
    outbound.record('whatsapp', [phone], status, purpose=purpose, session=session_id or '',
                    boutique=getattr(tenant, 'schema_name', None), error=error)


def _record_result(phone, session_id, tenant, purpose, result):
    if result.get('success'):
        _record(phone, session_id, tenant, purpose, 'sent')
        return
    data = result.get('data')
    reason = result.get('error') or (data.get('error') or data.get('message') if isinstance(data, dict) else data)
    _record(phone, session_id, tenant, purpose, 'failed', error=str(reason or 'WhatsApp delivery failed'))


def _blocked(phone, session_id, tenant, purpose) -> dict:
    _record(phone, session_id, tenant, purpose, 'blocked', error=SENDING_OFF)
    return {'success': False, 'status_code': 503, 'blocked': True, 'error': SENDING_OFF}


def send_whatsapp_message(phone: str, message_text: str, session_id: str = None, tenant=None,
                          purpose: str = '') -> dict:
    """
    Client function in Django to request whatsapp_service to send an outgoing WhatsApp message.
    Resolves session_id from tenant's WhatsAppAccount mapping if not explicitly provided.
    Authenticates using X-Internal-API-Secret header.

    `purpose` is what the outbound log calls this message ('birthday', 'invoice').
    """
    if not session_id and tenant:
        account = getattr(tenant, 'whatsapp_account', None)
        if account:
            session_id = account.session_id

    if not session_id:
        session_id = 'default'

    if not sending_enabled():
        return _blocked(phone, session_id, tenant, purpose)

    base_url = getattr(settings, 'WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3001').rstrip('/')
    url = f"{base_url}/whatsapp/send-message"
    secret = getattr(settings, 'INTERNAL_API_SECRET', '')

    headers = {
        'Content-Type': 'application/json',
        'X-Internal-API-Secret': secret
    }
    payload = {
        'sessionId': session_id,
        'phone': phone,
        'message': message_text
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        content_type = response.headers.get('content-type', '')

        if content_type.startswith('application/json'):
            res_data = response.json()
        else:
            res_data = {'raw': response.text}

        result = {
            'success': response.status_code == 200,
            'status_code': response.status_code,
            'data': res_data
        }
    except Exception as exc:
        logger.error(f"[Django WhatsApp Client] Failed to reach whatsapp_service for session {session_id}: {exc}")
        result = {
            'success': False,
            'status_code': 500,
            'error': str(exc)
        }
    _record_result(phone, session_id, tenant, purpose, result)
    return result


def send_whatsapp_document(phone: str, content: bytes, filename: str, caption: str = '',
                           mime_type: str = 'application/pdf', session_id: str = None, tenant=None,
                           media_type: str = 'document', purpose: str = '') -> dict:
    """A file (an invoice PDF) to a customer, through whatsapp_service's
    /whatsapp/send-media. Same session lookup, secret, switch, log and answer
    shape as send_whatsapp_message."""
    import base64

    if not session_id and tenant:
        account = getattr(tenant, 'whatsapp_account', None)
        if account:
            session_id = account.session_id
    if not session_id:
        session_id = 'default'

    if not sending_enabled():
        return _blocked(phone, session_id, tenant, purpose)

    base_url = getattr(settings, 'WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3001').rstrip('/')
    headers = {
        'Content-Type': 'application/json',
        'X-Internal-API-Secret': getattr(settings, 'INTERNAL_API_SECRET', ''),
    }
    payload = {
        'sessionId': session_id, 'phone': phone, 'mediaType': media_type,
        'mediaBase64': base64.b64encode(content).decode('ascii'),
        'mimeType': mime_type, 'filename': filename, 'caption': caption,
    }
    try:
        response = requests.post(f"{base_url}/whatsapp/send-media", json=payload, headers=headers, timeout=30)
        res_data = (response.json() if response.headers.get('content-type', '').startswith('application/json')
                    else {'raw': response.text})
        result = {'success': response.status_code == 200, 'status_code': response.status_code, 'data': res_data}
    except Exception as exc:
        logger.error(f"[Django WhatsApp Client] Failed to send a document via session {session_id}: {exc}")
        result = {'success': False, 'status_code': 500, 'error': str(exc)}
    _record_result(phone, session_id, tenant, purpose, result)
    return result


def get_whatsapp_status(session_id: str = None, tenant=None) -> dict:
    """
    Client function in Django to query whatsapp_service for session connection status and QR code.
    """
    if not session_id and tenant:
        account = getattr(tenant, 'whatsapp_account', None)
        if account:
            session_id = account.session_id

    if not session_id:
        session_id = 'default'

    base_url = getattr(settings, 'WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3001').rstrip('/')
    url = f"{base_url}/whatsapp/status?sessionId={session_id}"
    secret = getattr(settings, 'INTERNAL_API_SECRET', '')

    headers = {
        'Content-Type': 'application/json',
        'X-Internal-API-Secret': secret
    }

    try:
        response = requests.get(url, headers=headers, timeout=5)
        content_type = response.headers.get('content-type', '')

        if response.status_code == 200 and content_type.startswith('application/json'):
            return response.json()
        return {
            'success': False,
            'connected': False,
            'status': 'disconnected',
            'qrCode': None,
            'error': f"WhatsApp service returned status code {response.status_code}"
        }
    except Exception as exc:
        logger.error(f"[Django WhatsApp Client] Failed to fetch status from whatsapp_service for session {session_id}: {exc}")
        return {
            'success': False,
            'connected': False,
            'status': 'disconnected',
            'qrCode': None,
            'error': str(exc)
        }


def reset_whatsapp_session(session_id: str = None, tenant=None) -> dict:
    """
    Client function in Django to request whatsapp_service to reset session and regenerate QR code.
    """
    if not session_id and tenant:
        account = getattr(tenant, 'whatsapp_account', None)
        if account:
            session_id = account.session_id

    if not session_id:
        session_id = 'default'

    base_url = getattr(settings, 'WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3001').rstrip('/')
    url = f"{base_url}/whatsapp/reset-session"
    secret = getattr(settings, 'INTERNAL_API_SECRET', '')

    headers = {
        'Content-Type': 'application/json',
        'X-Internal-API-Secret': secret
    }
    payload = {
        'sessionId': session_id
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return {
            'success': response.status_code == 200,
            'data': response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
        }
    except Exception as exc:
        logger.error(f"[Django WhatsApp Client] Failed to reset session {session_id}: {exc}")
        return {
            'success': False,
            'error': str(exc)
        }
