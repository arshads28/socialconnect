from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login,  logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm

from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import ProfileSerializer, ProfileUpdateSerializer
from rest_framework import status
# from django.db.models import Q

# from .models import Connection
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
    """
    User Profile API

    Endpoints:
    - GET    /profile/{username}/        → View public profile
    - GET    /profile/me/                → View own profile
    - PATCH  /profile/me/                → Edit own profile
    - POST   /profile/{username}/block/  → Block user
    - POST   /profile/{username}/unblock/→ Unblock user
    """

    queryset = User.objects.all()
    permission_classes = [IsAuthenticated]
    lookup_field = "username"
    http_method_names = ["get", "patch", "post"]

    # -----------------------------
    # Queryset filtering (BLOCKING)
    # -----------------------------
    def get_queryset(self):
        user = self.request.user
        queryset = User.objects.all()

        #If we are blocking/unblocking, we MUST see the user
        if self.action in ['block', 'unblock']:
            return queryset

        # For normal profile viewing:
        # HIDE users who are blocking ME.
        # (A.blocking contains B -> A is blocking B)
        return queryset.exclude(blocking=user)

    # -----------------------------
    # Serializer selection
    # -----------------------------
    def get_serializer_class(self):
        if self.action in ["update", "partial_update", "me"]:
            return ProfileUpdateSerializer
        return ProfileSerializer

    # -----------------------------
    # Prevent editing other users
    # -----------------------------
    def update(self, request, *args, **kwargs):
        if self.get_object() != request.user:
            return Response(
                {"detail": "You can only edit your own profile."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    partial_update = update  # PATCH behaves same as PUT protection

    # -----------------------------
    # /users/me/
    # -----------------------------
    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request):
        if request.method == "GET":
            serializer = ProfileSerializer(
                request.user, context={"request": request}
            )
            return Response(serializer.data)

        serializer = ProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # -----------------------------
    # BLOCK USER
    # -----------------------------
    @action(detail=True, methods=["post"])
    def block(self, request, username=None):
        user_to_block = self.get_object()

        if user_to_block == request.user:
            return Response(
                {"error": "You cannot block yourself."},
                status=status.HTTP_400_BAD_REQUEST
            )

        request.user.blocking.add(user_to_block)
        return Response(
            {"status": f"You blocked {user_to_block.username}"},
            status=status.HTTP_200_OK
        )

    # -----------------------------
    # UNBLOCK USER
    # -----------------------------
    @action(detail=True, methods=["post"])
    def unblock(self, request, username=None):
        user_to_unblock = self.get_object()

        request.user.blocking.remove(user_to_unblock)
        return Response(
            {"status": f"You unblocked {user_to_unblock.username}"},
            status=status.HTTP_200_OK
        )





# class ConnectionViewSet(ModelViewSet):
#     queryset = Connection.objects.all()
#     permission_classes = [IsAuthenticated]
#     http_method_names = ['post', 'delete']

#     def create(self, request, username=None):
#         target = get_object_or_404(User, username=username)

#         if request.user == target:
#             return Response({"error": "Cannot connect with yourself"}, status=400)

#         conn = Connection.objects.filter(
#             sender=request.user, receiver=target
#         ).first()

#         if conn:
#             return Response({"status": conn.status})

#         Connection.objects.create(
#             sender=request.user,
#             receiver=target,
#             status=Connection.Status.PENDING
#         )
#         return Response({"status": "PENDING"})

#     def destroy(self, request, username=None):
#         target = get_object_or_404(User, username=username)
#         Connection.objects.filter(
#             sender=request.user,
#             receiver=target
#         ).delete()
#         return Response({"status": "NONE"})

#     @action(detail=False, methods=['post'], url_path=r'(?P<username>[^/.]+)/respond/(?P<action>accept|reject|block)')
#     def respond(self, request, username=None, action=None):
#         sender = get_object_or_404(User, username=username)

#         conn = get_object_or_404(
#             Connection,
#             sender=sender,
#             receiver=request.user
#         )

#         if action == 'accept':
#             conn.accept()
#         elif action == 'reject':
#             conn.delete()
#         elif action == 'block':
#             conn.block()

#         return Response({"status": action.upper()})














from django.contrib.auth.forms import SetPasswordForm
from django.contrib import messages



def password_reset_request_view(request):
    """ Step 1: Verify Username & Email """
    if request.method == "POST":
        username = request.POST.get('username')
        # email = request.POST.get('email')

        try:
            # Check if user exists with BOTH matching
            user = User.objects.get(username=username )
            
            # Store user ID in session securely to use in next step
            request.session['reset_user_id'] = str(user.id)
            return redirect('password_reset_confirm')
            
        except User.DoesNotExist:
            messages.error(request, "Invalid username or email combination.")

    return render(request, "auth/reset_manual.html", {'step': 'request'})


def password_reset_confirm_view(request):
    """ Step 2: Set New Password """
    # Get user ID from session
    user_id = request.session.get('reset_user_id')

    if not user_id:
        messages.error(request, "Session expired. Please try again.")
        return redirect('password_reset_request')

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return redirect('password_reset_request')

    if request.method == "POST":
        form = SetPasswordForm(user, request.POST)
        if form.is_valid():
            form.save()
            # Clear session for security
            del request.session['reset_user_id']
            messages.success(request, "Password changed successfully. Please login.")
            return redirect('login')
    else:
        form = SetPasswordForm(user)

    return render(request, "auth/reset_manual.html", {'step': 'confirm', 'form': form})