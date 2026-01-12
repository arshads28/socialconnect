import os
from io import BytesIO
from PIL import Image, ImageOps
import pillow_heif
from django.core.files.base import ContentFile
from django.db import close_old_connections
from .models import Post


pillow_heif.register_heif_opener()

def process_post_image_background(post_id):
    
    close_old_connections()

    try:
        # Re-fetch post from DB to get the file
        post = Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        return

    if not post.media:
        return

    try:
        
        img = Image.open(post.media)
        
        img = ImageOps.exif_transpose(img)

        if img.mode != "RGB":
            img = img.convert("RGB")


        max_width = 1080
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

        # Save optimized JPEG to memory
        buffer = BytesIO()
        img.save(
            buffer,
            format="JPEG",
            quality=80, 
            optimize=True,
            progressive=True
        )

        # Save back to Django
        filename = os.path.splitext(os.path.basename(post.media.name))[0] + ".jpg"
        
        post.media.save(filename, ContentFile(buffer.getvalue()), save=False)
        
        # Update flags
        post.media_type = Post.MediaType.IMAGE
        post.save(update_fields=["media", "media_type"])

    except Exception as e:
        print(f"Error processing image for Post {post_id}: {e}")
        
    finally:
        # Ensure connection is closed after thread work
        close_old_connections()