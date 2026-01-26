from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import Message
from django.db.models import Count, OuterRef, Subquery, Q, Max
# from django.shortcuts import render
from django.contrib.auth import get_user_model
# from django.core.paginator import Paginator
# from django.shortcuts import render, get_object_or_404
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from rest_framework import viewsets, mixins
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import api_view
from .serializers import InboxSerializer, MessageSerializer
from django.utils.dateparse import parse_datetime
from django.db import IntegrityError

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from rest_framework.views import APIView
from rest_framework import status

from rest_framework.parsers import MultiPartParser, FormParser

User = get_user_model()

# @api_view(['GET'])
# @permission_classes([IsAuthenticated])
# def chat_history(request, username):
#     user = request.user
#     page_number = request.GET.get('page', 1)

#     other_user = get_object_or_404(User, username=username)

#     last_seen_text = get_last_seen_text(other_user)


#     messages = Message.objects.filter(
#         Q(sender=user, receiver__username=username) |
#         Q(sender__username=username, receiver=user)
#     ).order_by("-timestamp")

    
#     paginator = Paginator(messages, 12)
#     page_obj = paginator.get_page(page_number)
#     page_message = list(page_obj)

#     # Mark these specific messages as read
#     Message.objects.filter(
#         sender__username=username, 
#         receiver=user, 
#         is_read=False,
#         id__in=[msg.id for msg in page_message] 
#     ).update(is_read=True)

#     # deleting the message to save data base and privacy
#     # Message.objects.filter(
#     #     Q(sender=user, receiver__username=username) |
#     #     Q(sender__username=username, receiver=user),
#     #     is_read=True
#     # ).delete()


#     data = [
#         {   
#             "id": msg.id,
#             "sender": msg.sender.username,
#             "message": msg.content,
#             "is_read": msg.is_read,
#             "timestamp": timezone.localtime(msg.timestamp).strftime("%I:%M %p"), 
#         }
#         for msg in reversed(page_message)
#     ]

#     online_status = is_user_online(other_user.id)

#     # Return data + has_next flag so JS knows if it should keep scrolling
#     return JsonResponse({
#         "messages": data, 
#         "has_next": page_obj.has_next(),
#         "user_data":{
#             "username": other_user.username,
#             "is_online":online_status,
#             "status_text":"Active now" if online_status else last_seen_text

#         }
#     })




# @login_required
# def chat_view(request, username):
#     # Get the actual User object (needed for is_online/last_seen)
#     other_user_obj = get_object_or_404(User, username=username)

#     # 2. Get the formatted text
#     is_online = is_user_online(other_user_obj.id)
#     last_seen_text = "Active now" if is_online else get_last_seen_text(other_user_obj)

#     messages = Message.objects.filter(
#         Q(sender=request.user, receiver=other_user_obj) |
#         Q(sender=other_user_obj, receiver=request.user)
#     ).order_by("timestamp")

#     return render(request, "chat/chat.html", {
#         "messages": messages,
#         "other_user": other_user_obj,  # Passing Object, not just string
#         "last_seen_text": last_seen_text, # Passing the text
#     })




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



@api_view(['GET'])
def search_user(request):
    query = request.GET.get('q', '').strip().lower()
    data = []

    if len(query) < 2:
        return JsonResponse({"results": []})
    
    user_id = str(request.user.id)

    rate_key = f"search_rate:{user_id}"
    cache.add(rate_key, 0, timeout=60)
    requests = cache.get(rate_key, 0)

    if requests >= 10:
        return JsonResponse(
            {"error": "Too many search requests. Please slow down."},
            status=429,
        )

    cache.incr(rate_key)
    

    search_key = f"search:user:{user_id}:{query}"
    cached_data = cache.get(search_key)

    if cached_data is not None:
        return JsonResponse({"results": cached_data})

    users = (
        User.objects
        .filter(username__icontains=query)
        .exclude(id=request.user.id)
        .only("id", "username", "avatar", "bio")[:20]
    )
    

    results = [
        {
            "id": str(u.id),
            "username": u.username,
            "avatar_url": u.avatar.url if u.avatar else "",
            "bio": (u.bio[:40] + "...") if u.bio else "",
        }
        for u in users
    ]

    cache.set(search_key, results, timeout=120)

    return JsonResponse({"results": results})


class InboxViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = InboxSerializer

    def get_queryset(self):
        user = self.request.user

        # Subquery: Find last message
        last_msg_qs = Message.objects.filter(
            Q(sender=OuterRef('pk'), receiver=user) | 
            Q(sender=user, receiver=OuterRef('pk'))
        ).order_by('-timestamp')

        # Main Query: Find Users involved in ANY message with me
        return User.objects.annotate(
            last_message=Subquery(last_msg_qs.values('encrypted_content')[:1]),
            last_message_time=Subquery(last_msg_qs.values('timestamp')[:1]),
            unread_count=Count(
                'sent_messages', 
                filter=Q(
                    sent_messages__receiver=user, 
                    sent_messages__status__in=['sent', 'delivered'] 
                )
            )
        ).filter(last_message_time__isnull=False
        ).order_by('-last_message_time')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        # We still need to check cache for 'is_online'
        # To keep this O(1) or O(N) without DB hits, we use cache.get_many
        user_ids = [str(u.id) for u in queryset]
        online_statuses = cache.get_many([f"user_online_{uid}" for uid in user_ids])

        # Serialize
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True, context={
                'online_statuses': online_statuses,
                'request': request
            })
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True, context={
            'online_statuses': online_statuses,
            'request': request
        })
        return Response(serializer.data)
    



@api_view(['GET'])
def sync_messages(request):
    """
    Syncs messages for the authenticated user based on last_sync timestamp.
    Excludes messages deleted by the user locally.
    """
    user = request.user
    last_sync_str = request.GET.get('last_sync')
    user_id_str = str(user.id) # ✅ Fix: Convert UUID to string
    
    # 1. Base Query: Messages sent to me OR by me
    messages = Message.objects.filter(
        Q(receiver=user) | Q(sender=user)
    )

    # 2. Exclude messages I deleted locally
    # We query using the string representation of the ID
    messages = messages.exclude(deleted_for__contains=user_id_str)

    # 3. Filter by Time
    if last_sync_str and last_sync_str != 'null':
        last_sync = parse_datetime(last_sync_str)
        if last_sync:
            messages = messages.filter(timestamp__gt=last_sync)

    # 4. Limit and Serialize
    messages = messages.order_by('timestamp')[:100] 
    
    serializer = MessageSerializer(messages, many=True, context={'request': request})

    return Response({
        "messages": serializer.data, 
        "count": len(serializer.data),
        "server_time": timezone.now().isoformat()
    })

@api_view(['GET'])
def chat_history(request, username):
    """
    Fetches full chat history with a specific user.
    """
    try:
        target_user = User.objects.get(username=username)
        user_id_str = str(request.user.id) 
        
        messages = Message.objects.filter(
            Q(sender=request.user, receiver=target_user) | 
            Q(sender=target_user, receiver=request.user)
        ).exclude(
            deleted_for__contains=user_id_str 
        ).order_by('timestamp')
        
        serializer = MessageSerializer(messages, many=True, context={'request': request})
        return Response(serializer.data)
        
    except User.DoesNotExist:
        return Response([], status=404)


@api_view(['POST'])
def clear_chat_history(request, username):
    """
    Hard delete or Soft delete depending on requirements.
    Here we do a HARD delete for the specific conversation.
    """
    try:
        target_user = User.objects.get(username=username)
        
        # Hard delete logic
        deleted_count, _ = Message.objects.filter(
            Q(sender=request.user, receiver=target_user) | 
            Q(sender=target_user, receiver=request.user)
        ).delete()
        
        return Response({"status": "success", "deleted": deleted_count})
        
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

# ============================================================================
#  SENDING & UPLOAD
# ============================================================================

class SendMessageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sender = request.user
        recipient_id = request.data.get('recipient_id')
        ciphertext = request.data.get('ciphertext')
        client_id = request.data.get('client_id')

        if not all([recipient_id, ciphertext, client_id]):
            return Response({"error": "Missing fields"}, status=status.HTTP_400_BAD_REQUEST)

        # Idempotency
        if Message.objects.filter(client_id=client_id).exists():
            existing = Message.objects.get(client_id=client_id)
            return Response({"status": "sent", "id": existing.id}, status=status.HTTP_200_OK)

        try:
            try:
                receiver = User.objects.get(id=recipient_id)
            except:
                receiver = User.objects.get(username=recipient_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            message = Message.objects.create(
                sender=sender,
                receiver=receiver,
                encrypted_content=ciphertext,
                client_id=client_id,
                status='sent'
            )
            
            # WebSocket Push
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"user_{receiver.id}", 
                    {
                        "type": "chat_message",
                        "id": str(message.id),
                        "client_id": str(client_id),
                        "sender": sender.username,
                        "sender_id": str(sender.id),
                        "ciphertext": ciphertext,
                        "timestamp": message.timestamp.isoformat(),
                        "conversation_id": f"{min(sender.username, receiver.username)}__{max(sender.username, receiver.username)}"
                    }
                )

            return Response({"status": "sent", "id": message.id}, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ChatUploadAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        client_id = request.data.get('id')
        
        # Idempotency check
        if Message.objects.filter(client_id=client_id).exists():
            msg = Message.objects.get(client_id=client_id)
            return Response({
                "status": "success",
                "media_url": request.build_absolute_uri(msg.media.url) if msg.media else "",
                "media_type": msg.media_type,
                "id": msg.id
            }, status=200)

        file_obj = request.data.get('media')
        recipient_id = request.data.get('recipient_id')

        if not file_obj:
            return Response({"error": "No media provided"}, status=400)
        
        try:
            try:
                receiver = User.objects.get(id=recipient_id)
            except:
                receiver = User.objects.get(username=recipient_id)
        except User.DoesNotExist:
            return Response({"error": "Recipient not found"}, status=404)

        media_type = Message.MediaType.IMAGE
        if file_obj.content_type.startswith('video'):
            media_type = Message.MediaType.VIDEO

        try:
            message = Message.objects.create(
                sender=request.user,
                receiver=receiver, 
                client_id=client_id,
                media=file_obj,
                media_type=media_type,
                encrypted_content="[Media Upload]", 
                status='sent'
            )
            
            media_url = request.build_absolute_uri(message.media.url)
            
            return Response({
                "status": "success",
                "media_url": media_url,
                "media_type": media_type,
                "id": message.id
            }, status=201)
            
        except IntegrityError:
            return Response({"status": "exists"}, status=200)

# ============================================================================
#  DELETE LOGIC (NEW)
# ============================================================================

@api_view(["POST"])
def delete_for_me(request):
    """
    User wants to hide specific messages from their own history.
    """
    client_ids = request.data.get("client_ids", [])
    if not client_ids:
        return Response({"error": "No IDs provided"}, status=400)

    user_id_str = str(request.user.id) # ✅ Fix: Convert UUID to string

    msgs = Message.objects.filter(client_id__in=client_ids)
    
    for msg in msgs:
        # Check if ID (as string) is already in the list
        if user_id_str not in msg.deleted_for:
            msg.deleted_for.append(user_id_str)
            msg.save(update_fields=['deleted_for'])

    return Response({"status": "ok"})

@api_view(["POST"])
def delete_for_everyone(request):
    """
    User wants to delete messages they sent, for everyone.
    Constraint: Within 6 hours.
    """
    client_ids = request.data.get("client_ids", [])
    if not client_ids:
        return Response({"error": "No IDs provided"}, status=400)

    cutoff = timezone.now() - timedelta(hours=6)

    # 1. Filter: Valid IDs, Sent by Me, Sent recently
    qs = Message.objects.filter(
        client_id__in=client_ids,
        sender=request.user,
        timestamp__gte=cutoff
    )

    # 2. Update DB: Clear content, mark global delete
    updated_count = qs.update(
        deleted_globally=True,
        encrypted_content="", 
        media=None,
        media_type="none", 
        status='deleted'
    )

    # 3. Notify Receiver via WebSocket
    receivers = qs.values_list('receiver_id', flat=True).distinct()
    channel_layer = get_channel_layer()
    if channel_layer:
        for receiver_id in receivers:
            async_to_sync(channel_layer.group_send)(
                f"user_{receiver_id}",
                {
                    "type": "messages_deleted",
                    "client_ids": client_ids,
                    "conversation_id": request.user.username 
                }
            )

    return Response({
        "status": "ok",
        "deleted_count": updated_count
    })