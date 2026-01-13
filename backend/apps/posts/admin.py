from django.contrib import admin, messages
from django.utils.html import format_html

from .models import Post, PostLike, Comment
from .background import process_post_image_background
from .threadpool import thread_pool_executor


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "author",
        "media_preview",
        "media_type",
        "processing",
        "created_at",
    )
    list_filter = ("media_type", "processing", "created_at")
    search_fields = ("author__username", "content")
    readonly_fields = ("created_at",)

    actions = ["reprocess_images"]

    def media_preview(self, obj):
        if obj.media and obj.media_type == "image":
            return format_html(
                '<img src="{}" style="height:60px;border-radius:6px;" />',
                obj.media.url,
            )
        return "—"

    media_preview.short_description = "Preview"

    @admin.action(description="🔄 Reprocess selected images")
    def reprocess_images(self, request, queryset):
        count = 0

        for post in queryset:
            if post.media and post.media_type == Post.MediaType.IMAGE:
                # mark as processing again
                Post.objects.filter(pk=post.pk).update(processing=True)

                # enqueue background task
                thread_pool_executor.submit(
                    process_post_image_background,
                    post.pk,
                )
                count += 1

        self.message_user(
            request,
            f"{count} image(s) sent for reprocessing.",
            level=messages.SUCCESS,
        )


@admin.register(PostLike)
class PostLikeAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "created_at")
    search_fields = ("user__username",)
    list_filter = ("created_at",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("post", "author", "short_content", "created_at")
    search_fields = ("author__username", "content")
    list_filter = ("created_at",)

    def short_content(self, obj):
        return obj.content[:40] + ("…" if len(obj.content) > 40 else "")

    short_content.short_description = "Comment"
