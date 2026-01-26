from cryptography.fernet import Fernet
from django.conf import settings
import base64

# This should use the SAME key logic as your frontend/other utils
# Usually provided via environment variables
SECRET_KEY = "super_secret_postman_key"

FERNET_KEY = base64.urlsafe_b64encode(SECRET_KEY)
cipher_suite = Fernet(FERNET_KEY)

def encrypt_for_storage(text: str) -> str:
    """
    Encrypts a string for storage in the database.
    Used for generating tombstones.
    """
    if not text:
        return ""
    encrypted_text = cipher_suite.encrypt(text.encode('utf-8'))
    return encrypted_text.decode('utf-8')

def decrypt_from_storage(ciphertext: str) -> str:
    """
    Decrypts a string from the database.
    """
    try:
        decrypted_text = cipher_suite.decrypt(ciphertext.encode('utf-8'))
        return decrypted_text.decode('utf-8')
    except Exception:
        return ""