# context_processors.py
from django.db.models import Max, Q
from django.contrib.auth import get_user_model
from .models import Message
# Import get_last_seen_text helper if needed, or duplicate logic
from .views import get_last_seen_text, get_unread_count
User = get_user_model()

def global_inbox_list(request):
    if not request.user.is_authenticated:
        return {}

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
                # Simple formatting for context processor (you can refine this)
                other_user_obj = User.objects.get(id=other_id)

                # ATTACH FORMATTED TEXT TO USER OBJECT TEMPORARILY
                other_user_obj.last_seen_formatted = get_last_seen_text(other_user_obj)

                other_user_obj.unread_count = get_unread_count(other_user_obj)
                
                chat_users.append(other_user_obj)
            except User.DoesNotExist:
                continue

    return {'chat_users': chat_users}