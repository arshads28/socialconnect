from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import Message


@login_required
def chat_history(request, username):
    user = request.user

    messages = Message.objects.filter(
        sender__username__in=[user.username, username],
        receiver__username__in=[user.username, username]
    ).order_by("timestamp")

    data = [
        {
            "sender": msg.sender.username,
            "message": msg.content,
        }
        for msg in messages
    ]

    return JsonResponse(data, safe=False)
