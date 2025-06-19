import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vbrowser.settings')

app = Celery('vbrowser')

app.config_from_object('django.conf:settings', namespace='CELERY')

app.autodiscover_tasks()

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')

app.conf.beat_schedule = {
    'run-close-containers-every-minute': {
        'task': 'main.tasks.run_close_containers',
        'schedule': 60.0,
    },
}