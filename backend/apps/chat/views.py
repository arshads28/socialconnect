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
    permission_classes = [IsAuthenticated]
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
    user = request.user
    last_sync_str = request.GET.get('last_sync')
    
    # 1. Base Query (Uses Index: receiver_id + timestamp)
    pending_messages = Message.objects.filter(receiver=user)

    if last_sync_str and last_sync_str != 'null':
        last_sync = parse_datetime(last_sync_str)
        if last_sync:
            pending_messages = pending_messages.filter(timestamp__gt=last_sync)


    pending_messages = pending_messages.order_by('timestamp')[:60] 

    # 3. Optimized Serialization (Values List is faster than Model Instantiation)
    data = list(pending_messages.values(
        'id', 'client_id', 'sender__username', 'encrypted_content', 'timestamp'
    ))

    # Rename keys to match frontend expectation if needed
    formatted_data = [
        {
            "id": msg['id'],
            "client_id": str(msg['client_id']),
            "sender": msg['sender__username'], # accessing joined field
            "ciphertext": msg['encrypted_content'],
            "timestamp": msg['timestamp'].isoformat()
        } 
        for msg in data
    ]

    return Response({"messages": formatted_data, "count": len(formatted_data)})



@api_view(['POST'])
def clear_chat_history(request, username):
    """
    Deletes all messages between the authenticated user and the target 'username'.
    This clears the 'Server Queue' so messages don't re-sync.
    """
    try:
        target_user = User.objects.get(username=username)
        
        # Delete messages where:
        # 1. I sent it to them (sender=me, receiver=them)
        # 2. They sent it to me (sender=them, receiver=me)
        deleted_count, _ = Message.objects.filter(
            Q(sender=request.user, receiver=target_user) | 
            Q(sender=target_user, receiver=request.user)
        ).delete()
        
        return Response({"status": "success", "deleted": deleted_count})
        
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
    


@api_view(['GET'])
def chat_history(request, username):
    """
    Fetches full chat history with a specific user.
    UPDATED: Uses MessageSerializer to correctly handle Media URLs.
    """
    try:
        target_user = User.objects.get(username=username)
        
        # Get all messages between Me and Target (Both directions)
        messages = Message.objects.filter(
            Q(sender=request.user, receiver=target_user) | 
            Q(sender=target_user, receiver=request.user)
        ).order_by('timestamp')
        
        # passing context={'request': request} is CRITICAL for building full media URLs
        serializer = MessageSerializer(messages, many=True, context={'request': request})
            
        return Response(serializer.data)
        
    except User.DoesNotExist:
        return Response([], status=404)
    



class SendMessageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sender = request.user
        recipient_id = request.data.get('recipient_id')
        ciphertext = request.data.get('ciphertext')
        client_id = request.data.get('client_id')

        # 1. Validation
        if not all([recipient_id, ciphertext, client_id]):
            return Response({"error": "Missing fields"}, status=status.HTTP_400_BAD_REQUEST)

        # 2. IDEMPOTENCY CHECK (Prevents Offline Duplicates)
        if Message.objects.filter(client_id=client_id).exists():
            existing = Message.objects.get(client_id=client_id)
            return Response({"status": "sent", "id": existing.id}, status=status.HTTP_200_OK)

        # 3. Get Receiver
        try:
            receiver = User.objects.get(id=recipient_id)
        except (User.DoesNotExist, ValueError):
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        if receiver.blocking.filter(id=sender.id).exists() or sender.blocking.filter(id=receiver.id).exists():
             return Response({"error": "You cannot message this user."}, status=status.HTTP_403_FORBIDDEN)

        # 5. SAVE TO DB (Corrected Field Name)
        try:
            message = Message.objects.create(
                sender=sender,
                receiver=receiver,
                encrypted_content=ciphertext,
                client_id=client_id,
                status='sent'
            )
        except Exception as e:
            print(f"❌ DB Error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 6. PUSH TO WEBSOCKET
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"user_{receiver.id}", 
                    {
                        "type": "chat_message",
                        "id": str(message.id),
                        "client_id": client_id,
                        "sender": sender.username,
                        "sender_id": str(sender.id),
                        "ciphertext": ciphertext,
                        "timestamp": message.timestamp.isoformat()
                    }
                )
        except Exception as e:
            print(f"❌ WebSocket Error: {e}")
            # Do NOT crash. Return success because DB save worked.

        return Response({"status": "sent", "id": message.id}, status=status.HTTP_200_OK)
    



class SendMessageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        client_id = request.data.get('client_id')
        recipient_id = request.data.get('recipient_id')
        ciphertext = request.data.get('ciphertext')

        if not all([client_id, recipient_id, ciphertext]):
            return Response({"error": "Missing fields"}, status=400)

        # ✅ HARD IDEMPOTENCY: If message exists, return it immediately.
        # This makes offline retries safe.
        if Message.objects.filter(client_id=client_id).exists():
            return Response({"status": "sent", "id": Message.objects.get(client_id=client_id).id}, status=200)

        try:
            receiver = User.objects.get(id=recipient_id)
            
            # Use get_or_create as a secondary safety net against race conditions
            message, created = Message.objects.get_or_create(
                client_id=client_id,
                defaults={
                    "sender": request.user,
                    "receiver": receiver,
                    "encrypted_content": ciphertext,
                    "status": "sent"
                }
            )
            return Response({"status": "sent", "id": message.id}, status=201)

        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

class ChatUploadAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        client_id = request.data.get('id')
        
        # Check before processing file
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
            receiver = User.objects.get(id=recipient_id)
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