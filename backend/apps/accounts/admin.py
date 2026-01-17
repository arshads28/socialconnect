from django.contrib import admin
from .models import User
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html

from .models import User,PushToken


# ============================
# Custom Forms
# ============================
class CustomUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User


class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "email")


# ============================
# Admin
# ============================
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm

    # ======================
    # LIST VIEW
    # ======================
    list_display = (
        "avatar_preview",
        "username",
        "email",
        "is_staff",
        "is_active",
        "last_seen",
        "date_joined",
    )
    list_filter = (
        "is_staff",
        "is_superuser",
        "is_active",
        "groups",
    )
    search_fields = ("username", "email")
    ordering = ("-date_joined",)

    # ======================
    # FIELDSETS
    # ======================
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (_("Personal info"), {
            "fields": (
                "avatar",
                "avatar_preview",
                "first_name",
                "last_name",
                "email",
                "bio",
                "interests",
            )
        }),
        (_("Blocking"), {
            "fields": ("blocking",),
            "description": "Select users that this user has blocked.",
        }),
        (_("Permissions"), {
            "fields": (
                "is_active",
                "is_staff",
                "is_superuser",
                "groups",
                "user_permissions",
            )
        }),
        (_("Important dates"), {
            "fields": (
                "last_login",
                "last_seen",
                "date_joined",
            )
        }),
    )

    # ======================
    # ADD USER
    # ======================
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "password1",
                    "password2",
                    "is_staff",
                    "is_active",
                ),
            },
        ),
    )

    # ======================
    # MANY TO MANY UX
    # ======================
    filter_horizontal = (
        "groups",
        "user_permissions",
        "blocking",
    )

    # 🚫 DO NOT use raw_id_fields for blocking (UUID problem)

    readonly_fields = (
        "avatar_preview",
        "date_joined",
        "last_login",
    )

    # ======================
    # AVATAR PREVIEW
    # ======================
    def avatar_preview(self, obj):
        if obj.pk and obj.avatar:
            return format_html(
                '<img src="{}" width="60" height="60" '
                'style="border-radius:50%; object-fit:cover;" />',
                obj.avatar.url,
            )
        return "—"

    avatar_preview.short_description = "Avatar"

    # ======================
    # PREVENT SELF-BLOCKING
    # ======================
    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if db_field.name == "blocking":
            object_id = request.resolver_match.kwargs.get("object_id")
            if object_id:
                kwargs["queryset"] = User.objects.exclude(pk=object_id)
        return super().formfield_for_manytomany(db_field, request, **kwargs)






# admin.site.register(Connection)













@admin.register(PushToken)
class PushTokenAdmin(admin.ModelAdmin):
    # 1. Show these columns in the list
    list_display = ('user', 'platform', 'device_name', 'short_token', 'last_used_at', 'created_at')
    
    # 2. Add Filters on the right side
    list_filter = ('platform', 'created_at', 'last_used_at')
    
    # 3. Add Search (Search by Username or Token)
    search_fields = ('user__username', 'user__email', 'token', 'device_name')
    
    # 4. Make dates read-only so you don't accidentally change history
    readonly_fields = ('created_at', 'last_used_at')

    # 5. Helper to show just the first 20 chars of the token
    def short_token(self, obj):
        if obj.token:
            return f"{obj.token[:20]}..."
        return "-"
    short_token.short_description = "Token Preview"

    # 6. Default sorting (Newest first)
    ordering = ('-created_at',)