from exponent_server_sdk import (
    PushClient,
    PushMessage,
    PushServerError,
    DeviceNotRegisteredError
)
from requests.exceptions import ConnectionError, HTTPError
from .models import PushDevice

def send_push_notification(user, title, body, data=None):
    """
    Sends a push notification to ALL active devices belonging to a specific user.
    """
    devices = user.push_devices.filter(is_active=True)
    
    if not devices.exists():
        return

    messages = []
    
    for device in devices:
        try:
            message = PushMessage(
                to=device.token,
                title=title,
                body=body,
                data=data,
                sound="default",
                priority="high",
                channel_id="social_alerts" 
            )
            messages.append(message)
        except Exception as e:
            print(f"⚠️ Error creating push message for {device.token}: {e}")

    if messages:
        send_push_notifications_batch(messages)


def send_push_notifications_batch(messages):
    """
    Takes a list of PushMessage objects and sends them in a single batch (max 100).
    """
    if not messages:
        return

    try:
        responses = PushClient().publish_multiple(messages)
        
        for response in responses:
            try:
                response.validate_response()
            except DeviceNotRegisteredError:
                PushDevice.objects.filter(token=response.push_message.to).update(is_active=False)
                print(f"⚠️ Device marked inactive: {response.push_message.to}")
            except PushServerError as exc:
                print(f"⚠️ Push Server Error: {exc.errors}")
                
    except (ConnectionError, HTTPError) as exc:
        print(f"❌ Network Error sending push batch: {exc}")


def verify_delivery_receipts(receipt_ids):
    if not receipt_ids: return
    try:
        client = PushClient()
        receipts = client.get_push_notification_receipts(receipt_ids)
        for receipt_id, status in receipts.items():
            if status.get('status') == 'error':
                 if status.get('details', {}).get('error') == 'DeviceNotRegistered':
                     PushDevice.objects.filter(id=receipt_id).update(is_active=False)
    except Exception as e:
        print(f"Error verifying receipts: {e}")