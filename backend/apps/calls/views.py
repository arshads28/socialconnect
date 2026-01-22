from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta
from django.core.cache import cache
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

# Models
from apps.chat.models import Message
from apps.accounts.models import PushDevice

# Get the secret
CRON_SECRET = getattr(settings, "CRON_SECRET", None)

# ----------------------------------------------------------------
# 1. ASYNC HEALTH CHECK
# ----------------------------------------------------------------
async def system_health_check(request):
    """
    Pure Async View.
    Non-blocking. No DRF overhead.
    """
    if request.method != 'GET':
        return JsonResponse({"error": "Method Not Allowed"}, status=405)

    status_report = {"render": "OK"}

    # 1. Check Redis (Async)
    try:
        await cache.aset('heartbeat', 'ok', timeout=5)
        val = await cache.aget('heartbeat')
        status_report['redis'] = "OK" if val == 'ok' else "Write Failed"
    except Exception as e:
        status_report['redis'] = f"Error: {str(e)}"

    # 2. Check Database (Native Async)
    # try:
    #     # afirst() is non-blocking
    #     await Message.objects.afirst()
    #     status_report['database'] = "OK"
    # except Exception as e:
    #     status_report['database'] = f"Error: {str(e)}"

    return JsonResponse(status_report)


# ----------------------------------------------------------------
# 2. ASYNC CLEANUP JOB
# ----------------------------------------------------------------
@csrf_exempt
async def run_cleanup_job(request):
    """
    Pure Async Cleanup.
    Deletes data using .adelete() so the server stays responsive.
    """
    if request.method != 'POST':
        return JsonResponse({"error": "Method Not Allowed (Use POST)"}, status=405)

    # 1. Server Config Check
    if not CRON_SECRET:
        return JsonResponse({"error": "Server misconfiguration: CRON_SECRET missing"}, status=500)

    # 2. Security Check
    incoming_secret = request.headers.get("X-Cron-Secret")
    if incoming_secret != CRON_SECRET:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        # --- TASK 1: Clean Messages (Async) ---
        msg_cutoff = timezone.now() - timedelta(hours=24)
        deleted_msgs_info = await Message.objects.filter(timestamp__lt=msg_cutoff).adelete()
        
        # --- TASK 2: Clean Devices (Async) ---
        device_cutoff = timezone.now() - timedelta(days=60)
        deleted_devices_info = await PushDevice.objects.filter(last_seen_at__lt=device_cutoff).adelete()

        return JsonResponse({
            "status": "success", 
            "deleted_messages": deleted_msgs_info[0], 
            "deleted_devices": deleted_devices_info[0],
            "timestamp": timezone.now().isoformat()
        })

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)