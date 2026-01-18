from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from datetime import timedelta
from django.core.cache import cache
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from apps.chat.models import Message

# Security Key (Set this in your environment variables later!)
# In cron-job.org, you will add a header: "X-Cron-Secret: my-super-secret-key"
CRON_SECRET = getattr(settings, "CRON_SECRET", "my-super-secret-key")

@api_view(['GET'])
@permission_classes([AllowAny])
def system_health_check(request):
    """
    1. Keeps Render/Heroku alive (prevents sleeping).
    2. Keeps Redis connection active.
    3. Verifies Database connection.
    """
    status_report = {"render": "OK"}

    # 1. Check Redis (Write & Read)
    try:
        cache.set('heartbeat', 'ok', timeout=30)
        if cache.get('heartbeat') == 'ok':
            status_report['redis'] = "OK"
        else:
            status_report['redis'] = "Write Failed"
    except Exception as e:
        status_report['redis'] = f"Error: {str(e)}"

    # 2. Check Database (Simple lightweight query)
    try:
        # Check count is faster than fetching objects
        msg_count = Message.objects.count() 
        status_report['database'] = f"OK ({msg_count} msgs)"
    except Exception as e:
        status_report['database'] = f"Error: {str(e)}"

    return JsonResponse(status_report)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def run_cleanup_job(request):
    """
    Deletes messages older than 24 hours.
    Protected by a secret header so random users can't trigger it.
    """
    # 1. Security Check
    secret = request.headers.get("X-Cron-Secret")
    if secret != CRON_SECRET:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    # 2. The Logic (Your 'handle' code adapted for a View)
    cutoff = timezone.now() - timedelta(hours=24)
    deleted_count = 0
    
    # Process in chunks of 1000 to prevent Database Locking
    while True:
        # Fetch IDs to delete
        ids = list(Message.objects.filter(timestamp__lt=cutoff).values_list('pk', flat=True)[:1000])
        
        if not ids:
            break # Nothing left to delete
            
        # Delete the chunk
        count, _ = Message.objects.filter(pk__in=ids).delete()
        deleted_count += count

    return JsonResponse({
        "status": "success", 
        "deleted_messages": deleted_count, 
        "timestamp": timezone.now().isoformat()
    })