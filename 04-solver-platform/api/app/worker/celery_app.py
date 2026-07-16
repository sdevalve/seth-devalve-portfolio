"""
Celery application instance — portfolio (async-solver-platform) version.

The broker and result backend both point at Redis.
Override the URL via the CELERY_BROKER_URL / CELERY_RESULT_BACKEND env vars.

To start the worker from the api/ directory:
    celery -A app.worker.celery_app worker --loglevel=info
"""

import os

from celery import Celery
from celery.signals import worker_ready

BROKER_URL  = os.environ.get("CELERY_BROKER_URL",     "redis://localhost:6379/0")
BACKEND_URL = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

celery_app = Celery(
    "nfl_worker",
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=["app.worker.tasks"],
)


@worker_ready.connect
def _warm_worker(sender, **kwargs):
    """No heavy imports needed — mock solver has no compile-time dependencies."""
    print("[worker_ready] mock solver worker ready")


celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)
