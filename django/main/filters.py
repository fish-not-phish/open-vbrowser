# filters.py
import django_filters
from .models import *

class ContainerFilter(django_filters.FilterSet):
    user_email = django_filters.CharFilter(field_name='user__email', lookup_expr='icontains', label='User Email')
    active = django_filters.BooleanFilter(field_name='active', label='Active')
    category = django_filters.CharFilter(field_name='category', lookup_expr='iexact', label='Category')
    capacity_provider = django_filters.CharFilter(field_name='capacity_provider', lookup_expr='iexact', label='Capacity Provider')

    class Meta:
        model = Container
        fields = ['user_email', 'active', 'category', 'capacity_provider']
