import os
from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import close_old_connections
from .models import Post


def process_post_image_background(post_id):
    close_old_connections()

    try:
        post = Post.objects.get(pk=post_id)
    except Post.DoesNotExist:
        return

    if not post.media:
        return

    old_path = post.media.name  # original (heic/png/etc)

    try:
        img = Image.open(post.media)
        img = ImageOps.exif_transpose(img)

        if img.mode != "RGB":
            img = img.convert("RGB")

        max_width = 1080
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize(
                (max_width, int(img.height * ratio)),
                Image.Resampling.LANCZOS,
            )

        buffer = BytesIO()
        img.save(
            buffer,
            format="JPEG",
            quality=80,
            optimize=True,
            progressive=True,
        )

        buffer.seek(0)

        new_path = os.path.splitext(old_path)[0] + ".jpg"

        # SAVE JPG FIRST
        saved_path = default_storage.save(
            new_path,
            ContentFile(buffer.read()),
        )

        # ONLY NOW update DB
        Post.objects.filter(pk=post.pk).update(
            media=saved_path,
            media_type=Post.MediaType.IMAGE,
            processing=False,
        )

        # DELETE original file AFTER success
        if default_storage.exists(old_path) and old_path != saved_path:
            default_storage.delete(old_path)

    except Exception as e:
        print(f"Image processing failed for post {post_id}: {e}")
        Post.objects.filter(pk=post.pk).update(processing=False)

    finally:
        close_old_connections()