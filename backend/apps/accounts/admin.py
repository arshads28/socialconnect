from django.contrib import admin
from .models import User
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html

from .models import User, Device, UserDevice


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

    filter_horizontal = (
        "groups",
        "user_permissions",
        "blocking",
    )

    readonly_fields = (
        "avatar_preview",
        "date_joined",
        "last_login",
    )

    def avatar_preview(self, obj):
        if obj.pk and obj.avatar:
            return format_html(
                '<img src="{}" width="60" height="60" '
                'style="border-radius:50%; object-fit:cover;" />',
                obj.avatar.url,
            )
        return "—"

    avatar_preview.short_description = "Avatar"

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if db_field.name == "blocking":
            object_id = request.resolver_match.kwargs.get("object_id")
            if object_id:
                kwargs["queryset"] = User.objects.exclude(pk=object_id)
        return super().formfield_for_manytomany(db_field, request, **kwargs)




@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = (
        "platform",
        "device_name",
        "device_id",
        "hardware_id",
        "last_seen_at",
        "created_at",
    )

    list_filter = (
        "platform",
        "created_at",
    )

    search_fields = (
        "device_name",
        "device_id",
        "hardware_id",
    )

    readonly_fields = (
        "created_at",
        "last_seen_at",
    )

    fieldsets = (
        (None, {
            "fields": (
                "platform",
                "device_name",
            )
        }),
        ("Identifiers", {
            "fields": (
                "device_id",
                "hardware_id",
            )
        }),
        ("Timestamps", {
            "fields": (
                "last_seen_at",
                "created_at",
            )
        }),
    )


@admin.register(UserDevice)
class UserDeviceAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "device",
        "short_token",
        "is_active",
        "last_seen_at",
        "created_at",
    )

    list_filter = (
        "is_active",
        "created_at",
        "device__platform",
    )

    search_fields = (
        "user__username",
        "user__email",
        "token",
        "device__device_id",
        "device__hardware_id",
    )

    readonly_fields = (
        "created_at",
        "last_seen_at",
    )

    fieldsets = (
        (None, {
            "fields": (
                "user",
                "device",
                "is_active",
            )
        }),
        ("Push Token", {
            "fields": (
                "token",
            )
        }),
        ("Timestamps", {
            "fields": (
                "last_seen_at",
                "created_at",
            )
        }),
    )

    def short_token(self, obj):
        return f"{obj.token[:25]}..." if obj.token else "—"

    short_token.short_description = "Token"

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "user",
            "device"
        )
