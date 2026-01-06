from django.contrib import admin

# Register your models here.
from .models import Room, RoomMember

admin.site.register(Room)
admin.site.register(RoomMember)