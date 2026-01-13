from concurrent.futures import ThreadPoolExecutor

# Global executor instance
thread_pool_executor = ThreadPoolExecutor(
    max_workers=2, 
    thread_name_prefix="post_worker"
)