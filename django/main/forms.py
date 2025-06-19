from django import forms
from .models import *
from django.core.exceptions import ValidationError
from django.conf import settings
from allauth.account.forms import SignupForm
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User

class MyCustomSignupForm(SignupForm):
    first_name = forms.CharField(max_length=30, required=True)
    last_name = forms.CharField(max_length=30, required=True)
    extra_field = forms.CharField(required=False, widget=forms.HiddenInput())

    def clean_extra_field(self):
        data = self.cleaned_data['extra_field']
        if data:
            raise forms.ValidationError("This field should be left empty.")
        return data
    
    def clean_email(self):
        email = self.cleaned_data.get('email')

        # Check if email already exists
        if User.objects.filter(email__iexact=email).exists():
            raise ValidationError("A user with this email address already exists.")

        return email
    
    def save(self, request):
        user = super(MyCustomSignupForm, self).save(request)
        user.first_name = self.cleaned_data['first_name']
        user.last_name = self.cleaned_data['last_name']
        user.save()

        extend_profile = ExtendProfile(user=user)
        extend_profile.save()

        return user

class ContactForm(forms.Form):
    fullname = forms.CharField(max_length=100, required=True, label='Full Name')
    email = forms.EmailField(required=True, label='Email')
    phone = forms.CharField(max_length=15, required=False, label='Phone')
    message = forms.CharField(widget=forms.Textarea, required=True, label='Message')