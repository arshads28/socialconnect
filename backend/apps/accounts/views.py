from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm

import logging
logger = logging.getLogger(__name__)

from django import forms
from django.contrib.auth import get_user_model

User = get_user_model()


class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("username",)


# class CustomAuthenticationForm(AuthenticationForm):
#     username = forms.CharField(
#         widget=forms.TextInput(attrs={"placeholder": "Username"})
#     )
#     password = forms.CharField(
#         widget=forms.PasswordInput(attrs={"placeholder": "Password"})
#     )


def signup_view(request):
    if request.method == "POST":
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("home")
    else:
        form = CustomUserCreationForm()

    return render(request, "auth/signup.html", {"form": form})


def login_view(request):
    if request.method == "POST":
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            return redirect("home")
    else:
        form = AuthenticationForm()

    return render(request, "auth/login.html", {"form": form})



@login_required
def logout_view(request):
    if request.method == "POST":
        logout(request)
        return redirect("login")
    




class ProfileUpdateForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["avatar", "bio", "interests"]

        widgets = {
            "bio": forms.Textarea(attrs={
                "placeholder": "Tell something about yourself",
                "rows": 3,
            }),
            "interests": forms.Textarea(attrs={
                "placeholder": "Your interests (comma separated)",
                "rows": 3,
            }),
        }


@login_required
def profile_view(request):
    return render(request, "profile/profile.html", {"user_obj": request.user})


@login_required
def edit_profile_view(request):
    user = request.user

    if request.method == "POST":
        form = ProfileUpdateForm(request.POST,request.FILES,instance=user)
        if form.is_valid():
            form.save()
            return redirect("profile")
    else:
        form = ProfileUpdateForm(instance=user)

    return render(request, "profile/edit_profile.html", {
        "form": form
    })