from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

# Models
from apps.chat.models import Message
from apps.accounts.models import PushDevice

# Get the secret from settings.py
# (It returns None if you forgot to set it, which is safe)
CRON_SECRET = getattr(settings, "CRON_SECRET", None)

@api_view(['GET'])
@permission_classes([AllowAny])
async def system_health_check(request):
    """
    Async Health Check.
    Ping this every 14 mins to keep Render & Redis alive.
    """
    status_report = {"render": "OK"}

    # 1. Check Redis (Async)
    try:
        # Use native async cache methods
        await cache.aset('heartbeat', 'ok', timeout=5)
        val = await cache.aget('heartbeat')
        
        if val == 'ok':
            status_report['redis'] = "OK"
        else:
            status_report['redis'] = "Write Failed"
    except Exception as e:
        status_report['redis'] = f"Error: {str(e)}"

    # 2. Check Database (Native Async)
    try:
        # .afirst() is the async version of .first()
        await Message.objects.afirst()
        status_report['database'] = "OK"
    except Exception as e:
        status_report['database'] = f"Error: {str(e)}"

    return JsonResponse(status_report)


@api_view(['POST'])
@permission_classes([AllowAny])
async def run_cleanup_job(request):
    """
    Async Daily Cleanup.
    Uses .adelete() to clean up data without blocking the server.
    """
    # 1. Check Server Configuration
    if not CRON_SECRET:
        return JsonResponse({"error": "Server misconfiguration: CRON_SECRET missing"}, status=500)

    # 2. Security Check
    incoming_secret = request.headers.get("X-Cron-Secret")
    if incoming_secret != CRON_SECRET:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        # --- TASK 1: Clean Old Messages (24 Hours) ---
        msg_cutoff = timezone.now() - timedelta(hours=24)
        
        # .adelete() returns (total_deleted, {details})
        deleted_msgs_info = await Message.objects.filter(timestamp__lt=msg_cutoff).adelete()
        deleted_msgs_count = deleted_msgs_info[0]

        # --- TASK 2: Clean Old Push Devices (60 Days) ---
        device_cutoff = timezone.now() - timedelta(days=60)
        
        deleted_devices_info = await PushDevice.objects.filter(last_seen_at__lt=device_cutoff).adelete()
        deleted_devices_count = deleted_devices_info[0]

        return JsonResponse({
            "status": "success", 
            "deleted_messages": deleted_msgs_count, 
            "deleted_devices": deleted_devices_count,
            "timestamp": timezone.now().isoformat()
        })

    except Exception as e:
        # Return error as JSON so you can see it in cron logs
        return JsonResponse({"status": "error", "message": str(e)}, status=500)