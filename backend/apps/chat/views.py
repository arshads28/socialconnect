from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import Message
from django.db.models import Q, Max
from django.shortcuts import render
from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.shortcuts import render, get_object_or_404
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

@login_required
def chat_history(request, username):
    user = request.user
    page_number = request.GET.get('page', 1)

    other_user = get_object_or_404(User, username=username)

    last_seen_text = get_last_seen_text(other_user)


    messages = Message.objects.filter(
        Q(sender=user, receiver__username=username) |
        Q(sender__username=username, receiver=user)
    ).order_by("-timestamp")

    
    paginator = Paginator(messages, 12)
    page_obj = paginator.get_page(page_number)
    page_message = list(page_obj)

    # Mark these specific messages as read
    Message.objects.filter(
        sender__username=username, 
        receiver=user, 
        is_read=False,
        id__in=[msg.id for msg in page_message] 
    ).update(is_read=True)

    # deleting the message to save data base and privacy
    # Message.objects.filter(
    #     Q(sender=user, receiver__username=username) |
    #     Q(sender__username=username, receiver=user),
    #     is_read=True
    # ).delete()


    data = [
        {   
            "id": msg.id,
            "sender": msg.sender.username,
            "message": msg.content,
            "is_read": msg.is_read,
            "timestamp": timezone.localtime(msg.timestamp).strftime("%I:%M %p"), 
        }
        for msg in reversed(page_message)
    ]

    online_status = is_user_online(other_user.id)

    # Return data + has_next flag so JS knows if it should keep scrolling
    return JsonResponse({
        "messages": data, 
        "has_next": page_obj.has_next(),
        "user_data":{
            "username": other_user.username,
            "is_online":online_status,
            "status_text":"Active now" if online_status else last_seen_text

        }
    })




@login_required
def chat_view(request, username):
    # Get the actual User object (needed for is_online/last_seen)
    other_user_obj = get_object_or_404(User, username=username)

    # 2. Get the formatted text
    is_online = is_user_online(other_user_obj.id)
    last_seen_text = "Active now" if is_online else get_last_seen_text(other_user_obj)

    messages = Message.objects.filter(
        Q(sender=request.user, receiver=other_user_obj) |
        Q(sender=other_user_obj, receiver=request.user)
    ).order_by("timestamp")

    return render(request, "chat/chat.html", {
        "messages": messages,
        "other_user": other_user_obj,  # Passing Object, not just string
        "last_seen_text": last_seen_text, # Passing the text
    })




def is_user_online(user_id):
    """Check RAM (Cache) to see if user is online"""
    return cache.get(f'user_online_{user_id}', False)



def get_last_seen_text(user):
    # If no last_seen data exists

    if is_user_online(user.id):
        return "Active now"
        
    if not user.last_seen:
        return "Offline"
        
    now = timezone.now()
    # Ensure last_seen is timezone-aware if your project uses timezones
    last_seen = user.last_seen 
    
    # Calculate difference
    delta = now - last_seen
    
    # Logic for text formatting
    if delta < timedelta(minutes=1):
        return "Last seen just now"
    
    # convert to local
    last_seen_local = timezone.localtime(last_seen)
    
    if last_seen.date() == now.date():
        return f"Last seen today at {last_seen_local.strftime('%I:%M %p')}"
    
    if last_seen.date() == (now - timedelta(days=1)).date():
        return f"Last seen yesterday at {last_seen_local.strftime('%I:%M %p')}"
        
    # Default: Show full date
    return f"Last seen {last_seen_local.strftime('%d/%m/%Y')}"

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
            try:
                other_user_obj = User.objects.get(id=other_id)
                
                # Format status text
                is_online = is_user_online(other_user_obj.id)
                status_text = "Online" if is_online else get_last_seen_text(other_user_obj)

                unread_count = Message.objects.filter(
                    sender=other_user_obj, 
                    receiver=user, 
                    is_read=False
                ).count()

                chat_users.append({
                    "id": str(other_user_obj.id), 
                    "username": other_user_obj.username,
                    "avatar_url": other_user_obj.avatar.url if other_user_obj.avatar else None,
                    "is_online": is_online,
                    "status_text": status_text,
                    "unread_count": unread_count,
                })
            except User.DoesNotExist:
                continue

    return JsonResponse({"users": chat_users})


def search_user(request):
    query = request.GET.get('q', '')
    data = []

    if query:
       
        users = User.objects.filter(
            username__icontains=query
        ).exclude(id=request.user.id)[:20] 
        
        
        for u in users:
            avatar_url = ""
            if hasattr(u, 'profile') and u.profile.image:
                avatar_url = u.profile.image.url
                
            data.append({
                "username": u.username,
                "avatar_url": avatar_url,
                "bio": u.profile.bio[:40] + "..." if hasattr(u, 'profile') and u.profile.bio else ""
            })

    return JsonResponse({"results": data})