from django.apps import AppConfig

class PostsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.posts'

    def ready(self):
        # This runs exactly once when the app is loaded
        from pillow_heif import register_heif_opener
        register_heif_opener()
