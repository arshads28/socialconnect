# apps/chat/crypto.py

import base64
import hashlib
from cryptography.fernet import Fernet
from django.conf import settings

# ============================================================
#   KEY DERIVATION (SAFE + DETERMINISTIC)
# ============================================================

def derive_fernet_key(secret: str) -> bytes:
    """
    Convert Django SECRET_KEY (string) into a valid Fernet key.
    Fernet requires 32 url-safe base64-encoded bytes.
    """
    #  Convert string → bytes
    secret_bytes = secret.encode("utf-8")

    # Hash to fixed 32 bytes
    digest = hashlib.sha256(secret_bytes).digest()

    # Base64-url encode
    return base64.urlsafe_b64encode(digest)


FERNET_KEY = derive_fernet_key(settings.SECRET_KEY)
fernet = Fernet(FERNET_KEY)

# ============================================================
# ENCRYPTED TOMBSTONES
# ============================================================

TOMBSTONE_MARKER = "__TOMBSTONE__"


def encrypt_for_storage(plain_text: str) -> str:
    """
    Encrypt content for DB storage.
    Used for messages AND encrypted tombstones.
    """
    if not plain_text:
        return ""

    token = fernet.encrypt(plain_text.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_from_storage(cipher_text: str) -> str:
    """
    Decrypt content from DB.
    """
    if not cipher_text:
        return ""

    try:
        plain = fernet.decrypt(cipher_text.encode("utf-8"))
        return plain.decode("utf-8")
    except Exception:
        return ""
