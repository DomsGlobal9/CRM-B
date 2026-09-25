from rest_framework import viewsets, views
from rest_framework.response import Response
from django.utils.dateparse import parse_date

from core.permissions import OwnerOnly

from . import payments as payment_service
from . import services
from .models import Expense, Payment
from .serializers import ExpenseSerializer, PaymentSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    """Manual business costs. Owner-only, every method.

    Costs are the owner's private view of the business -- what rent runs to,
    what was paid a supplier off the books of a PO -- and no staff role has a
    reason to read or write them, so this uses OwnerOnly rather than the
    looser RolePermission that governs the order book.
    """

    serializer_class = ExpenseSerializer
    permission_classes = [OwnerOnly]

    def get_queryset(self):
        qs = Expense.objects.all()
        since = parse_date(self.request.query_params.get('since') or '')
        until = parse_date(self.request.query_params.get('until') or '')
        if since:
            qs = qs.filter(incurred_on__gte=since)
        if until:
            qs = qs.filter(incurred_on__lte=until)
        if category := self.request.query_params.get('category'):
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProfitLossView(views.APIView):
    """Revenue minus every cost, for a window. Owner-only.

    A computed report, not a resource -- its own path rather than a router
    action, the same shape apps.staff uses for the timesheet and performance
    reports.
    """

    permission_classes = [OwnerOnly]

    def get(self, request):
        return Response(services.profit_and_loss(**_window_args(request)))


def _window_args(request):
    """The period the caller asked for, in the shape the service expects.

    The frontend sends a period NAME; the dates are resolved here so the two
    cannot disagree about what "this week" means.
    """
    return {
        'period': request.query_params.get('period') or None,
        'since': parse_date(request.query_params.get('since') or ''),
        'until': parse_date(request.query_params.get('until') or ''),
    }


class TrendView(views.APIView):
    """The P&L over time, bucketed by the period it is on. Owner-only."""

    permission_classes = [OwnerOnly]

    def get(self, request):
        return Response(services.trend(**_window_args(request)))


class PaymentViewSet(viewsets.ModelViewSet):
    """Money received against an order, with the date it arrived.

    Create is the point of it: recording a payment here is the only way to
    give one a date that is not the day it was typed. The order's snapshot is
    brought up to the ledger by the service, so the order book stays right.
    """

    serializer_class = PaymentSerializer
    permission_classes = [OwnerOnly]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = Payment.objects.select_related('order', 'order__customer')
        since = parse_date(self.request.query_params.get('since') or '')
        until = parse_date(self.request.query_params.get('until') or '')
        if since:
            qs = qs.filter(received_on__gte=since)
        if until:
            qs = qs.filter(received_on__lte=until)
        if order := self.request.query_params.get('order'):
            qs = qs.filter(order_id=order)
        return qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        serializer.instance = payment_service.record(
            data['order'],
            amount=data['amount'],
            received_on=data.get('received_on'),
            method=data.get('method'),
            reference=data.get('reference', ''),
            note=data.get('note', ''),
            user=self.request.user,
        )
