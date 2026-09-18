
import os

workers = int(os.environ.get('WEB_CONCURRENCY', '2'))
threads = int(os.environ.get('GUNICORN_THREADS', '4'))
worker_class = 'gthread'

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"


# 240, not 60: the garment preview (apps/design_studio/generate.py) waits on
# the vendor for 30-95 s measured, and the vendor asks clients for 240.
timeout = int(os.environ.get('GUNICORN_TIMEOUT', '240'))
graceful_timeout = 30

max_requests = 1000
max_requests_jitter = 100

forwarded_allow_ips = '*'

accesslog = '-'
errorlog = '-'
