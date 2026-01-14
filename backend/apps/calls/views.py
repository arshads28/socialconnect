from django.shortcuts import render

# Create your views here.

def video_call_view(request, username):
    
    return render(request, "chat/call.html", {
        "other_user": username  # Just pass the name so the template knows who to connect to
    })




from django.http import HttpResponse
from django.core.cache import cache
import redis
from django.conf import settings

def health_check(request):
    # 1. Keep Render Alive (The request itself does this)
    
    # 2. Keep Redis (Aiven/Upstash) Alive
    try:
        # We just try to set a tiny value. 
        # This forces a connection to the Redis server.
        cache.set('heartbeat', 'ok', timeout=30)
        redis_status = "Redis OK"
    except Exception as e:
        redis_status = f"Redis Error: {str(e)}"

    return HttpResponse(f"Render: OK | {redis_status}")