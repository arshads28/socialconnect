from concurrent.futures import ThreadPoolExecutor

# Limit threads (important for Render free tier)
thread_pool_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="post-image-worker",)
