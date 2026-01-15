from exponent_server_sdk import PushClient, PushMessage, PushServerError
from requests.exceptions import ConnectionError, HTTPError

def send_push_notification(tokens, title, body, data=None):
    """Send push notification to multiple tokens"""
    if not tokens:
        return
    
    messages = []
    for token in tokens:
        try:
            messages.append(PushMessage(
                to=token,
                title=title,
                body=body,
                data=data or {},
                sound='default',
                priority='high',
                channel_id='default',  # <--- CRITICAL FIX FOR ANDROID
            ))
        except Exception as e:
            print(f"Error creating message for {token}: {e}")
    
    try:
        response = PushClient().publish_multiple(messages)
        print(f"✅ Expo Delivery Result: {response}") # <--- NOW WE WILL SEE IF EXPO ACCEPTED IT
    except (PushServerError, ConnectionError, HTTPError) as e:
        print(f"Push notification error: {e}")
