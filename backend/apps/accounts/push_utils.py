from exponent_server_sdk import (
    PushClient, 
    PushMessage, 
    PushServerError, 
    DeviceNotRegisteredError
)
from requests.exceptions import ConnectionError, HTTPError # ✅ Fix: Import from requests
from .models import PushDevice

def send_push_notification(user, title, body, data=None):
    print("inside push nofificaiton")
    # Select active devices for this user
    devices = PushDevice.objects.filter(user=user, is_active=True)
    
    # Filter out web (Expo Push doesn't support web natively in this flow)
    valid_devices = [d for d in devices if d.platform != 'web']
    
    if not valid_devices:
        print("not valid devices")
        return

    try:
        messages = []
        for device in valid_devices:
            # Basic check to prevent "Invalid Token" errors
            if not device.token.startswith('ExponentPushToken'):
                continue
                
            messages.append(
                PushMessage(
                    to=device.token,
                    title=title,
                    body=body,
                    data=data,
                    priority='high',
                    sound='default',
                    channel_id='default',
                )
            )
        
        if not messages:
            return

        # Send Batch
        responses = PushClient().publish_multiple(messages)
        
        # ✅ FIX: Print 'responses' (plural)
        print(f"Response from Expo: {responses}")

        # Cleanup: Check for errors like "DeviceNotRegistered"
        for i, response in enumerate(responses):
            try:
                # Expo returns status 'error' inside the response object if token is bad
                if response.status == 'error':
                    error_code = response.details.get('error')
                    
                    if error_code == 'DeviceNotRegistered':
                        # The app was uninstalled on this specific device
                        bad_device = valid_devices[i]
                        print(f"🗑️ Deleting dead token for: {bad_device.device_name}")
                        bad_device.delete()
                        
            except Exception as e:
                print(f"Error parsing response: {e}")

    except PushServerError as exc:
        print(f"❌ Expo Server Error: {exc.errors}")
        
    except (ConnectionError, HTTPError) as exc:
        print(f"❌ Network Error sending push: {exc}")
        
    except Exception as e:
        print(f"❌ General Push Error: {e}")