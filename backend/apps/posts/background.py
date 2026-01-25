import os
from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import close_old_connections
from .models import Post

def process_post_image_background(post_id):
    # Close old DB connections to prevent "InterfaceError" in worker threads
    close_old_connections()
    print("Image processing start")

    try:
        # Fetch only the fields we need
        post = Post.objects.only('media').filter(pk=post_id).first()
        
        if not post or not post.media:
            return

        old_path = post.media.name
        
        # Open file safely
        with post.media.open('rb') as f:
            image_data = f.read()

        # 1 Open Image (Supports PNG, JPG, HEIC automatically now)
        img = Image.open(BytesIO(image_data))

        # 2 Fix Rotation (iPhone/Samsung photos are often rotated)
        img = ImageOps.exif_transpose(img)

        # 3 Convert to RGB (Drop Alpha channel for JPEG)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # 4 Resize (Optimization: Use BICUBIC for speed)
        max_width = 1080
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.BICUBIC)

        # 5. Compress
        buffer = BytesIO()
        img.save(
            buffer,
            format="JPEG",
            quality=80,
            optimize=True,
            progressive=True 
        )
        
        buffer.seek(0)
        
        # 6. Save new file
        # Rename .heic/.png -> .jpg
        filename_base = os.path.splitext(os.path.basename(old_path))[0]
        new_filename = f"{filename_base}.jpg"
        
        # Ensure we save in the same directory (S3/Local)
        dir_name = os.path.dirname(old_path)
        new_path = os.path.join(dir_name, new_filename)

        # Delete file if it exists so Django reuses the filename
        if default_storage.exists(new_path):
            default_storage.delete(new_path)

        saved_path = default_storage.save(
            new_path,
            ContentFile(buffer.read())
        )

        # 7. Update DB
        Post.objects.filter(pk=post.pk).update(
            media=saved_path,
            media_type=Post.MediaType.IMAGE,
            processing=False,
        )

        # 8. Cleanup Original (Delete the massive HEIC/PNG)
        if old_path != saved_path and default_storage.exists(old_path):
            default_storage.delete(old_path)
            
        print(f" Success: converted to JPG")

    except Exception as e:
        print(f"❌ Failed processing {post_id}: {e}")
        # Always unflag processing so the user isn't stuck loading forever
        Post.objects.filter(pk=post_id).update(processing=False)

    finally:
        close_old_connections()