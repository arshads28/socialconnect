from exponent_server_sdk import (
    PushClient,
    PushMessage,
    PushServerError,
    DeviceNotRegisteredError
)
from requests.exceptions import ConnectionError, HTTPError
from .models import UserDevice


# ==========================================
#  THE FIX: Wrapper for Immutable NamedTuple
# ==========================================
class CustomPushMessage(PushMessage):
    """
    Wraps the standard PushMessage. Since PushMessage is a namedtuple (immutable),
    we cannot add 'collapse_id' directly.
    
    Instead, we hide 'collapse_id' inside the 'data' dictionary and extract it 
    just before sending.
    """
    def get_payload(self):
        payload = super().get_payload()
        current_data = self.data or {}
        
        if '_collapse_id' in current_data:
            payload['collapseId'] = current_data['_collapse_id']
            
            if 'data' in payload:
                clean_data = payload['data'].copy()
                del clean_data['_collapse_id']
                payload['data'] = clean_data
            
        print(f"the payload is {payload} ")    
        return payload

# ==========================================
# SEND LOGIC
# ==========================================

def send_push_notification(user, title, body, data=None):
    """
    Send push notification to ALL active devices for a user.
    """
    user_devices = UserDevice.objects.filter(
        user=user,
        is_active=True
    ).only('token')

    if not user_devices.exists():
        return

    collapse_id = data.get('collapse_key') if data else None
    
    push_data = data.copy() if data else {}
    if collapse_id:
        push_data['_collapse_id'] = collapse_id

    messages = []

    for ud in user_devices:
        try:
            msg = CustomPushMessage(
                to=ud.token,
                title=title,
                body=body,
                data=push_data,
                sound="default",
                priority="high",
                channel_id="social_alerts"
            )
            
            messages.append(msg)

        except Exception as e:
            print(f"Push message creation error: {e}")

    if messages:
        print(f"sending messages to batch is  {messages}")
        _send_push_batch(messages)


def _send_push_batch(messages):
    try:
        responses = PushClient().publish_multiple(messages)

        for message, response in zip(messages, responses):
            try:
                response.validate_response()
                
            except DeviceNotRegisteredError:
                print(f"Device not registered, deactivating: {message.to}")
                UserDevice.objects.filter(token=message.to).update(is_active=False)

            except PushServerError as exc:
                print(f" Push server error for {message.to}: {exc.errors}")

    except (ConnectionError, HTTPError) as exc:
        print(f" Push network error: {exc}")