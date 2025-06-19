from django import template
from django.utils.timezone import now

register = template.Library()

@register.filter
def duration(start_time, end_time=None):
    if end_time is None:
        end_time = now()
    delta = end_time - start_time
    hours, remainder = divmod(delta.total_seconds(), 3600)
    minutes, seconds = divmod(remainder, 60)
    return f'{int(hours)}h {int(minutes)}m {int(seconds)}s'
