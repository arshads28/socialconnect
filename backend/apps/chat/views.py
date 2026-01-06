from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import Message
from django.db.models import Q
from django.shortcuts import render


@login_required
def chat_history(request, username):
    user = request.user

    messages = Message.objects.filter(
        Q(sender=user, receiver__username=username) |
        Q(sender__username=username, receiver=user)
    ).order_by("timestamp")

    #MARK RECEIVED MESSAGES AS READ
    Message.objects.filter(
        sender__username=username,
        receiver=user,
        is_read=False
    ).update(is_read=True)

    data = [
        {
            "sender": msg.sender.username,
            "message": msg.content,
            "is_read": msg.is_read,
        }
        for msg in messages
    ]

    return JsonResponse(data, safe=False)




@login_required
def chat_view(request, username):
    messages = Message.objects.filter(
        Q(sender=request.user, receiver__username=username) |
        Q(sender__username=username, receiver=request.user)
    ).order_by("timestamp")

    return render(request, "chat/chat.html", {
        "messages": messages,
        "other_user": username,
    })


def get_unread_count(user):
    return Message.objects.filter(
        receiver=user,
        is_read=False
    ).count()

def unread_messages(request):
    if request.user.is_authenticated:
        return {
            "unread_count": get_unread_count(request.user)
        }
    return {}