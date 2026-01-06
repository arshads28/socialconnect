from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import Message
from django.db.models import Q, Max
from django.shortcuts import render
from django.contrib.auth import get_user_model

User = get_user_model()

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



@login_required
def inbox_view(request):
    user = request.user

    # Get latest message per conversation
    conversations = (
        Message.objects
        .filter(Q(sender=user) | Q(receiver=user))
        .values("sender", "receiver")
        .annotate(last_time=Max("timestamp"))
        .order_by("-last_time")
    )

    chat_users = []
    seen = set()

    for convo in conversations:
        other_id = convo["receiver"] if convo["sender"] == user.id else convo["sender"]
        if other_id not in seen:
            seen.add(other_id)
            chat_users.append(
                User.objects.get(id=other_id)
            )

    return render(request, "chat/inbox.html", {
        "chat_users": chat_users
    })