import os
from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import close_old_connections
from .models import Message

def process_chat_image_background(message_id):
    close_old_connections()
    print(f"Chat Image processing start: {message_id}")

    try:
        message = Message.objects.only('media').filter(pk=message_id).first()
        
        if not message or not message.media:
            return

        old_path = message.media.name
        
        with message.media.open('rb') as f:
            image_data = f.read()

        img = Image.open(BytesIO(image_data))
        img = ImageOps.exif_transpose(img)

        if img.mode != "RGB":
            img = img.convert("RGB")

        # Resize (Standard Chat Max Width)
        max_width = 1080 
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.BICUBIC)

        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=80, optimize=True, progressive=True)
        buffer.seek(0)
        
        filename_base = os.path.splitext(os.path.basename(old_path))[0]
        new_filename = f"{filename_base}.jpg"
        
        dir_name = os.path.dirname(old_path)
        new_path = os.path.join(dir_name, new_filename)

        # Delete file if it exists so Django reuses the filename
        if default_storage.exists(new_path):
            default_storage.delete(new_path)

        saved_path = default_storage.save(new_path, ContentFile(buffer.read()))

        # Update DB
        Message.objects.filter(pk=message.pk).update(
            media=saved_path,
            media_type=Message.MediaType.IMAGE,
            processing=False,
        )

        # Cleanup (Only delete old path if it was different, e.g. png -> jpg)
        # Note: If new_path == old_path, we already deleted it above, so this check is safe.
        if old_path != saved_path and default_storage.exists(old_path):
            default_storage.delete(old_path)
            
        print(f"Chat Image Converted: {message_id}")

    except Exception as e:
        print(f" Failed processing chat image {message_id}: {e}")
        Message.objects.filter(pk=message_id).update(processing=False)

    finally:
        close_old_connections()