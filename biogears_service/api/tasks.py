import os
import logging
from celery import Celery
from biogears_service.simulation import engine_runner

logger = logging.getLogger(__name__)

# Configure Celery with Redis broker and backend
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("biogears", broker=REDIS_URL, backend=REDIS_URL)

# Fallback to eager mode (synchronous execution on current thread) if Redis is not running
# or if explicitly set to true.
CELERY_ALWAYS_EAGER = os.environ.get("CELERY_ALWAYS_EAGER", "True").lower() == "true"
celery_app.conf.update(
    task_always_eager=CELERY_ALWAYS_EAGER,
    task_eager_propagates=True,
)

@celery_app.task(name="biogears.run_simulation")
def run_simulation_task(scenario_path: str, user_id: str = "unknown"):
    """Celery task to run the BioGears simulation subprocess."""
    logger.info(f"🚀 [Celery Worker] Starting simulation task for scenario: {scenario_path} (user: {user_id})")
    result = engine_runner.run_biogears(scenario_path, user_id=user_id)
    return {
        "success": result.success,
        "return_code": result.return_code,
        "log_path": result.log_path,
    }

