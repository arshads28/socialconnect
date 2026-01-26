import os
from django.conf import settings
from apps.posts.threadpool import thread_pool_executor 

def delete_physical_file(file_path):
    """Actual OS-level deletion"""
    if file_path:
        full_path = os.path.join(settings.MEDIA_ROOT, file_path)
        if os.path.isfile(full_path):
            try:
                os.remove(full_path)
                print(f"🗑️ Physically deleted: {file_path}")
            except Exception as e:
                print(f"❌ Failed to delete {file_path}: {e}")

def schedule_media_deletion(file_paths):
    """Offload deletion to thread pool"""
    for path in file_paths:
        thread_pool_executor.submit(delete_physical_file, path)