from django.shortcuts import render

# Create your views here.

def video_call_view(request, username):
    
    return render(request, "chat/call.html", {
        "other_user": username  # Just pass the name so the template knows who to connect to
    })