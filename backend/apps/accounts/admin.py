from django.contrib import admin
from .models import User
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html

from .models import User


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