from exponent_server_sdk import (
    PushClient,
    PushMessage,
    PushServerError,
    DeviceNotRegisteredError
)
from requests.exceptions import ConnectionError, HTTPError

from .models import UserDevice


def send_push_notification(user, title, body, data=None):
    """
    Send push notification to ALL active devices for a user.
    """
    user_devices = UserDevice.objects.filter(
        user=user,
        is_active=True
    )

    if not user_devices.exists():
        return

    messages = []

    for ud in user_devices:
        try:
            messages.append(
                PushMessage(
                    to=ud.token,
                    title=title,
                    body=body,
                    data=data,
                    sound="default",
                    priority="high",
                    channel_id="social_alerts"
                )
            )
        except Exception as e:
            print(f"⚠️ Push message error: {e}")

    if messages:
        _send_push_batch(messages)


def _send_push_batch(messages):
    try:
        responses = PushClient().publish_multiple(messages)

        for response in responses:
            try:
                response.validate_response()
            except DeviceNotRegisteredError:
                UserDevice.objects.filter(
                    token=response.push_message.to
                ).update(is_active=False)

            except PushServerError as exc:
                print(f"⚠️ Push server error: {exc.errors}")

    except (ConnectionError, HTTPError) as exc:
        print(f"❌ Push network error: {exc}")
