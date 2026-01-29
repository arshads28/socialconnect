from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login,  logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm

from django.db.models import Exists, OuterRef, Value, BooleanField,Q
from django.db.models.functions import Coalesce

from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from .serializers import ProfileSerializer, ProfileUpdateSerializer, LoginSerializer, UserRegistrationSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status
from django import forms
from .models import Device, UserDevice

# from .models import Connection
from django.contrib.auth import get_user_model


import logging
logger = logging.getLogger(__name__)

User = get_user_model()


class CustomUserCreationForm(UserCreationForm):

    email = forms.EmailField(required=True)

    class Meta:
        model = User
        fields = ("username", "email")


# class CustomAuthenticationForm(AuthenticationForm):
#     username = forms.CharField(
#         widget=forms.TextInput(attrs={"placeholder": "Username"})
#     )
#     password = forms.CharField(
#         widget=forms.PasswordInput(attrs={"placeholder": "Password"})
#     )


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }

@api_view(['POST'])
@permission_classes([AllowAny])
def signup_view(request):
    """
    API View for User Registration.
    Accepts JSON: {"username": "arsh", "password": "...", "email": "..."}
    """
    # 1. Pass 'request.data' (JSON), NOT 'request.POST'
    serializer = UserRegistrationSerializer(data=request.data)
    
    if serializer.is_valid():
        user = serializer.save()
        
        # 2. Generate Tokens immediately so user is logged in
        tokens = get_tokens_for_user(user)
        
        return Response({
            "message": "User created successfully",
            "user_id": user.id,
            "tokens": tokens
        }, status=status.HTTP_201_CREATED)
    
    # 3. Return Error JSON if validation fails
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    API View for Login.
    Accepts JSON: {"username": "arsh", "password": "..."}
    Returns: Access & Refresh Tokens
    """
    serializer = LoginSerializer(data=request.data)
    
    if serializer.is_valid():
        user = serializer.validated_data
        tokens = get_tokens_for_user(user)
        
        return Response({
            "message": "Login successful",
            "tokens": tokens,
            "user_id": user.id,
            "username": user.username
        }, status=status.HTTP_200_OK)
        
    return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)



@login_required
def logout_view(request):
    print("logout called now")
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
    # permission_classes = [IsAuthenticated] by default form now 
    lookup_field = "username"
    lookup_value_regex = r'[\w.@+-]+'
    http_method_names = ["get", "patch", "post"]

    # -----------------------------
    # Queryset filtering (BLOCKING)
    # -----------------------------
    def get_queryset(self):
        user = self.request.user
        queryset = User.objects.all()

        # Handle visibility logic
        if self.action not in ['block', 'unblock']:
            queryset = queryset.exclude(blocking=user)

        # Annotate 'is_blocked_by_me' to solve N+1
        # This creates a subquery that checks the M2M table in a single SQL query
        if user.is_authenticated:
            # We check if the 'user' (request.user) is in the 'blocked_by' 
            # related name of the profile being viewed (obj)
            is_blocked_subquery = User.blocking.through.objects.filter(
                from_user_id=user.id,
                to_user_id=OuterRef('pk')
            )
            queryset = queryset.annotate(
                is_blocked_by_me=Exists(is_blocked_subquery)
            )
        else:
            queryset = queryset.annotate(
                is_blocked_by_me=Value(False, output_field=BooleanField())
            )

        return queryset


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
    @action(detail=True, methods=['post'])
    def block(self, request, username=None):
        target_user = self.get_object()
        
        if request.user == target_user:
            return Response({"error": "Cannot block yourself"}, status=400)

        # Check if they blocked us first (Optional Rule)
        if request.user.blocked_by.filter(id=target_user.id).exists():
             return Response({"error": "Cannot block a user who blocked you"}, status=400)

        request.user.blocking.add(target_user)
        return Response({"status": "blocked", "is_blocked": True})

    @action(detail=True, methods=['post'])
    def unblock(self, request, username=None):
        target_user = self.get_object()
        request.user.blocking.remove(target_user)
        return Response({"status": "unblocked", "is_blocked": False})
    
    @action(detail=False, methods=['get'])
    def blocked(self, request):
        blocked_users = request.user.blocking.all()

        serializer = self.get_serializer(blocked_users, many=True)

        return Response(serializer.data)


    




@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_push_device(request):
    user = request.user
    data = request.data

    token = data.get('token')
    device_id = data.get('device_id')
    hardware_id = data.get('hardware_id')
    platform = data.get('platform')
    device_name = data.get('device_name')

    if not token or not device_id or not platform or not hardware_id:
        return Response({'error': 'Invalid payload'}, status=400)

    # Resolve physical device ONLY by hardware_id
    device, _ = Device.objects.update_or_create(
        platform=platform,
        hardware_id=hardware_id,
        defaults={
            'device_id': device_id,
            'device_name': device_name,
        }
    )

    # Deactivate same token elsewhere
    UserDevice.objects.filter(token=token).exclude(
        user=user,
        device=device
    ).update(is_active=False)

    # Register user - device
    user_device, created = UserDevice.objects.update_or_create(
        user=user,
        device=device,
        defaults={
            'token': token,
            'is_active': True
        }
    )

    return Response({
        'status': 'ok',
        'action': 'created' if created else 'updated'
    })



@api_view(['POST'])
def logout_push_device(request):
    """
    Deactivates the push notification link for the current user on the specific device.
    """
    user = request.user
    data = request.data

    hardware_id = data.get('hardware_id')
    platform = data.get('platform')

    if not hardware_id or not platform:
        return Response({'error': 'Missing device identifiers'}, status=400)

    try:
        # 1. Find the physical device
        device = Device.objects.get(platform=platform, hardware_id=hardware_id)

        # 2. Deactivate the link for THIS user and THIS device
        # Using filter().update() is safe even if the record doesn't exist
        updated_count = UserDevice.objects.filter(
            user=user,
            device=device
        ).update(is_active=False)

        return Response({'status': 'ok', 'deactivated': updated_count > 0})

    except Device.DoesNotExist:
        # If the device itself doesn't exist, we don't need to do anything
        return Response({'status': 'ok', 'message': 'Device not found, no action needed'})


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