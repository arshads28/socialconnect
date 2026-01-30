from exponent_server_sdk import PushClient, DeviceNotRegisteredError, PushServerError
from requests.exceptions import ConnectionError, HTTPError
from .models import UserDevice

# ==========================================
#  THE FIX: Standalone Class (No Inheritance)
# ==========================================
class BarePushMessage:
    """
    A lightweight replacement for the rigid PushMessage namedtuple.
    This class allows us to send ANY field to Expo (like 'collapseId')
    without the library blocking us.
    """
    def __init__(self, to, title=None, body=None, data=None, sound='default', 
                 channel_id=None, collapse_id=None, priority='high'):
        self.to = to
        self.title = title
        self.body = body
        self.data = data
        self.sound = sound
        self.channel_id = channel_id
        self.collapse_id = collapse_id
        self.priority = priority

    def get_payload(self):
        payload = {
            'to': self.to,
            'sound': self.sound,
            'priority': self.priority,
        }
        if self.title:
            payload['title'] = self.title
        if self.body:
            payload['body'] = self.body
        
        if self.data:
            payload['data'] = self.data.copy()
        else:
            payload['data'] = {}
        
        # CRITICAL: categoryIdentifier for iOS notification replacement
        if self.collapse_id:
            payload['categoryIdentifier'] = self.collapse_id
            payload['data']['tag'] = self.collapse_id
            
        if self.channel_id:
            payload['channelId'] = self.channel_id
            
        return payload

# ==========================================
# SEND LOGIC
# ==========================================

def send_push_notification(user, title, body, data=None):
    user_devices = UserDevice.objects.filter(user=user, is_active=True).only('token')
    if not user_devices.exists():
        return

    collapse_id = data.get('collapse_key') if data else None
    messages = []

    for ud in user_devices:
        try:
            msg = BarePushMessage(
                to=ud.token,
                title=title,
                body=body,
                data=data,
                sound="default",
                channel_id="social_alerts",
                collapse_id=collapse_id 
            )
            messages.append(msg)
        except Exception as e:
            print(f"Push message creation error: {e}")

    if messages:
        _send_push_batch(messages)


def _send_push_batch(messages):
    try:
        responses = PushClient().publish_multiple(messages)
        for message, response in zip(messages, responses):
            try:
                response.validate_response()
            except DeviceNotRegisteredError:
                UserDevice.objects.filter(token=message.to).update(is_active=False)
            except PushServerError as exc:
                print(f"Push server error: {exc.errors}")
    except (ConnectionError, HTTPError) as exc:
        print(f"Push network error: {exc}")