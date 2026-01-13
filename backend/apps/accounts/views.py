from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login,  logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm

from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import ProfileSerializer, ProfileUpdateSerializer
# from django.db.models import Q

from .models import Connection
from django.contrib.auth import get_user_model


import logging
logger = logging.getLogger(__name__)

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
    




# class ProfileUpdateForm(forms.ModelForm):
#     class Meta:
#         model = User
#         fields = ["avatar", "bio", "interests"]

#         widgets = {
#             "bio": forms.Textarea(attrs={
#                 "placeholder": "Tell something about yourself",
#                 "rows": 3,
#             }),
#             "interests": forms.Textarea(attrs={
#                 "placeholder": "Your interests (comma separated)",
#                 "rows": 3,
#             }),
#         }


# @login_required
# def profile_view(request):
#     return render(request, "profile/profile.html", {"user_obj": request.user})


# @login_required
# def edit_profile_view(request):
#     user = request.user

#     if request.method == "POST":
#         form = ProfileUpdateForm(request.POST,request.FILES,instance=user)
#         if form.is_valid():
#             form.save()
#             return redirect("profile")
#     else:
#         form = ProfileUpdateForm(instance=user)

#     return render(request, "profile/edit_profile.html", {
#         "form": form
#     })

# @login_required
# def public_profile(request,username):
#     user_obj = get_object_or_404(User,username= username)

#     return render(request, "profile/profile.html",{"user_obj": user_obj})


# @login_required
# def profile_data_api(request, username):
#     user_obj = get_object_or_404(User, username=username)
    
#     return JsonResponse({
#         "username": user_obj.username,
#         "email": user_obj.email,
#         "bio": user_obj.bio,
#         "interests": user_obj.interests,
#         "avatar_url": user_obj.avatar.url if user_obj.avatar else None,
#         "is_own_profile": (request.user == user_obj)
#     })


# @login_required
# def edit_profile_api(request):
#     if request.method == "POST":
#         form = ProfileUpdateForm(request.POST, request.FILES, instance=request.user)
#         if form.is_valid():
#             form.save()
#             return JsonResponse({"status": "success"})
#         else:
#             return JsonResponse({"status": "error", "errors": form.errors}, status=400)
#     return JsonResponse({"status": "error", "message": "Invalid method"}, status=405)


class ProfileViewSet(ModelViewSet):
    queryset = User.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'username'
    http_method_names = ['get', 'patch']

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update'] or (self.action == 'me' and self.request.method =='PATCH'):
            return ProfileUpdateSerializer
        return ProfileSerializer

    @action(detail=False, methods=['get', 'patch'], url_path='me')
    def me(self, request):
        if request.method == 'GET':
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)

        serializer = self.get_serializer(
            request.user,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    




class ConnectionViewSet(ModelViewSet):
    queryset = Connection.objects.all()
    permission_classes = [IsAuthenticated]
    http_method_names = ['post', 'delete']

    def create(self, request, username=None):
        target = get_object_or_404(User, username=username)

        if request.user == target:
            return Response({"error": "Cannot connect with yourself"}, status=400)

        conn = Connection.objects.filter(
            sender=request.user, receiver=target
        ).first()

        if conn:
            return Response({"status": conn.status})

        Connection.objects.create(
            sender=request.user,
            receiver=target,
            status=Connection.Status.PENDING
        )
        return Response({"status": "PENDING"})

    def destroy(self, request, username=None):
        target = get_object_or_404(User, username=username)
        Connection.objects.filter(
            sender=request.user,
            receiver=target
        ).delete()
        return Response({"status": "NONE"})

    @action(detail=False, methods=['post'], url_path=r'(?P<username>[^/.]+)/respond/(?P<action>accept|reject|block)')
    def respond(self, request, username=None, action=None):
        sender = get_object_or_404(User, username=username)

        conn = get_object_or_404(
            Connection,
            sender=sender,
            receiver=request.user
        )

        if action == 'accept':
            conn.accept()
        elif action == 'reject':
            conn.delete()
        elif action == 'block':
            conn.block()

        return Response({"status": action.upper()})