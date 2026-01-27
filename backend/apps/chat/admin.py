from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import Message, Device, SignedPreKey, OneTimePreKey

# ==========================================
#  MESSAGE ADMIN
# ==========================================

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = (
        'id', 
        'timestamp_short', 
        'sender_info', 
        'arrow', 
        'receiver_info', 
        'media_type_badge', 
        'status_badge', 
        'is_encrypted',
        'is_deleted_globally'
    )
    
    list_filter = (
        'status', 
        'media_type', 
        'deleted_globally', 
        'timestamp',
        'processing'
    )
    
    search_fields = (
        'sender__username', 
        'receiver__username', 
        'client_id', 
        'encrypted_content'
    )
    
    readonly_fields = ('client_id', 'timestamp', 'deleted_for')
    
    # Optimization for Foreign Keys with many users
    autocomplete_fields = ['sender', 'receiver']
    
    # Organize the detail view
    fieldsets = (
        ('Metadata', {
            'fields': ('client_id', 'timestamp', 'status', 'processing')
        }),
        ('Participants', {
            'fields': ('sender', 'receiver')
        }),
        ('Content & Media', {
            'fields': ('encrypted_content', 'media', 'media_type')
        }),
        ('Deletion Status', {
            'fields': ('deleted_globally', 'deleted_for'),
            'classes': ('collapse',)
        }),
    )

    def sender_info(self, obj):
        return obj.sender.username
    sender_info.short_description = "From"
    sender_info.admin_order_field = 'sender__username'

    def receiver_info(self, obj):
        return obj.receiver.username
    receiver_info.short_description = "To"
    receiver_info.admin_order_field = 'receiver__username'

    def arrow(self, obj):
        return "→"
    arrow.short_description = ""

    def timestamp_short(self, obj):
        return obj.timestamp.strftime("%b %d, %H:%M")
    timestamp_short.short_description = "Time"
    timestamp_short.admin_order_field = 'timestamp'

    def media_type_badge(self, obj):
        """Visual badge for media type."""
        colors = {
            'image': '#e67e22', # Orange
            'video': '#8e44ad', # Purple
            'audio': '#16a085', # Teal
            'none': '#bdc3c7',  # Grey
        }
        color = colors.get(obj.media_type, 'grey')
        if obj.media_type == 'none':
            return "-"
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">{}</span>',
            color, obj.get_media_type_display().upper()
        )
    media_type_badge.short_description = "Type"

    def status_badge(self, obj):
        """Color-coded status indicators."""
        colors = {
            'sent': '#95a5a6',      # Grey
            'delivered': '#3498db', # Blue
            'read': '#2ecc71',      # Green
            'deleted': '#e74c3c',   # Red
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<strong style="color: {};">{}</strong>',
            color, obj.get_status_display()
        )
    status_badge.short_description = "Status"

    def is_encrypted(self, obj):
        """Boolean icon showing if content is encrypted."""
        return bool(obj.encrypted_content)
    is_encrypted.boolean = True
    is_encrypted.short_description = "E2EE"

    def is_deleted_globally(self, obj):
        return obj.deleted_globally
    is_deleted_globally.boolean = True
    is_deleted_globally.short_description = "Del All"


# ==========================================
#  E2EE KEYS ADMIN (Signal Protocol)
# ==========================================

class SignedPreKeyInline(admin.TabularInline):
    """
    Shows signed keys inside the Device page.
    """
    model = SignedPreKey
    extra = 0
    readonly_fields = ('key_id', 'short_public_key', 'created_at')
    can_delete = True
    show_change_link = True
    fields = ('key_id', 'short_public_key', 'created_at')

    def short_public_key(self, obj):
        return f"{obj.public_key[:16]}..."
    short_public_key.short_description = "Public Key"


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('user', 'device_id', 'registration_id', 'short_identity_key', 'last_seen_formatted', 'key_health')
    list_filter = ('last_seen', 'device_id')
    search_fields = ('user__username', 'user__email', 'registration_id')
    readonly_fields = ('last_seen',)
    autocomplete_fields = ['user']
    
    inlines = [SignedPreKeyInline]

    def short_identity_key(self, obj):
        if obj.identity_key:
            return f"{obj.identity_key[:12]}..."
        return "-"
    short_identity_key.short_description = "Identity Key"

    def last_seen_formatted(self, obj):
        return obj.last_seen.strftime("%Y-%m-%d %H:%M")
    last_seen_formatted.short_description = "Last Seen"

    def key_health(self, obj):
        """Monitors the number of remaining One-Time PreKeys."""
        count = obj.onetime_prekeys.count()
        # Signal spec recommends keeping ~100 keys.
        # < 10 is critical, < 50 is warning.
        if count == 0:
            color = "#c0392b" # Dark Red
            status = "CRITICAL (0)"
        elif count < 20:
            color = "#e67e22" # Orange
            status = f"LOW ({count})"
        else:
            color = "#27ae60" # Green
            status = f"OK ({count})"
            
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, status
        )
    key_health.short_description = "One-Time Keys"


@admin.register(SignedPreKey)
class SignedPreKeyAdmin(admin.ModelAdmin):
    list_display = ('key_id', 'get_device', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('device__user__username', 'key_id')
    readonly_fields = ('created_at',)
    
    def get_device(self, obj):
        return f"{obj.device.user.username} (Dev {obj.device.device_id})"
    get_device.short_description = "Device"


@admin.register(OneTimePreKey)
class OneTimePreKeyAdmin(admin.ModelAdmin):
    """
    Admin view for disposable keys.
    """
    list_display = ('key_id', 'get_user', 'get_device_id', 'short_public_key')
    search_fields = ('device__user__username', 'key_id')
    list_select_related = ('device', 'device__user')
    
    # Pagination optimization for high volume tables
    list_per_page = 50

    def get_user(self, obj):
        return obj.device.user.username
    get_user.short_description = "User"
    get_user.admin_order_field = 'device__user__username'

    def get_device_id(self, obj):
        return f"ID: {obj.device.device_id}"
    get_device_id.short_description = "Device"

    def short_public_key(self, obj):
        return f"{obj.public_key[:20]}..."
    short_public_key.short_description = "Public Key"