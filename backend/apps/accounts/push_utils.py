from exponent_server_sdk import PushClient, PushMessage, DeviceNotRegisteredError
from .models import PushToken

def send_push_notification(tokens, title, body, data=None):
    """Send push notification to multiple tokens"""
    if not tokens:
        return
    
    try:
        messages = []
        for token in tokens:
            messages.append(
                PushMessage(
                    to=token,
                    title=title,
                    body=body,
                    data=data,
                    priority='high',
                    sound='default',
                )
            )

        # Send to Expo
        responses = PushClient().publish_multiple(messages)

        #CLEANUP DEAD TOKENS
        #zip the tokens with their responses to check which one failed
        for token, response in zip(tokens, responses):
            try:
                # If Expo says "DeviceNotRegistered", the user uninstalled the app.
                if response.status == 'error':
                    details = response.details
                    if details.get('error') == 'DeviceNotRegistered':
                        print(f"🗑️ Deleting dead token: {token}")
                        PushToken.objects.filter(token = token).delete()

            except Exception as e:
                print(f"Error checking token status: {e}")

    except Exception as e:
        print(f" Push token Error: {e}")

    


