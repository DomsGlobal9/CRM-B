"""A to-do made from an order step follows that step.

When the step moves -- from My work, the Workshop or anywhere else that saves
it -- its open to-dos move with it: started there, in progress here; finished
there, closed here. Listening to the step's own save keeps the order code
untouched. The to-do whose change is moving the step (see views) records that
itself, so it is left out here.
"""
from contextvars import ContextVar

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

#: The to-do whose own status change is moving its step right now.
moving_todo = ContextVar('moving_todo', default=None)

FINISHED = ('COMPLETED', 'SKIPPED')
STARTED = ('IN_PROGRESS', 'PENDING_VERIFICATION')


@receiver(pre_save, sender='crm_api.OrderStage')
def remember_status(sender, instance, update_fields=None, **kwargs):
    instance._todo_old_status = None
    if instance.pk and (update_fields is None or 'status' in update_fields):
        instance._todo_old_status = (sender.objects.filter(pk=instance.pk)
                                     .values_list('status', flat=True).first())


@receiver(post_save, sender='crm_api.OrderStage')
def follow_step(sender, instance, created, **kwargs):
    old, new = getattr(instance, '_todo_old_status', None), instance.status
    if created or old is None or old == new:
        return
    from .models import Todo, TodoUpdate

    linked = Todo.objects.filter(order_stage=instance).exclude(status=Todo.STATUS_CLOSED)
    if moving_todo.get() is not None:
        linked = linked.exclude(pk=moving_todo.get())
    name = instance.stage_name or instance.stage_key
    if new in FINISHED:
        target = Todo.STATUS_CLOSED
        text = f"Closed automatically · {name} {'completed' if new == 'COMPLETED' else 'skipped'} in the workflow"
    elif new in STARTED:
        linked = linked.filter(status=Todo.STATUS_OPEN)
        target = Todo.STATUS_IN_PROGRESS
        text = f"In progress automatically · {name} started in the workflow"
    else:
        return
    now = timezone.now()
    for todo in linked:
        todo.status = target
        todo.closed_at = now if target == Todo.STATUS_CLOSED else None
        todo.save(update_fields=['status', 'closed_at', 'updated_at'])
        TodoUpdate.objects.create(todo=todo, kind=TodoUpdate.KIND_STATUS, author=None,
                                  author_name='Workflow', status_to=target, text=text)
