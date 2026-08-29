"""
RQ Worker — runs background jobs (like workspace indexing) using Redis.
"""

import os
import logging
from redis import Redis
from rq import Worker, Queue

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis Connection URL (default for Docker)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_conn = Redis.from_url(REDIS_URL)

if __name__ == '__main__':
    logger.info("Starting RQ worker for background indexing...")
    queue = Queue('default', connection=redis_conn)
    worker = Worker([queue], connection=redis_conn)
    worker.work()
