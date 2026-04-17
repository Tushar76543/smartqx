import requests
import json

def get_token():
    res = requests.post("http://127.0.0.1:8000/auth/login", json={
        "email": "asd@gmail.com",
        "password": "asd" # Assuming password is asd based on common dev practices, or we can create a new user
    })
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def test_join():
    token = get_token()
    if not token:
        # Let's try to signup
        res = requests.post("http://127.0.0.1:8000/auth/signup", json={
            "email": "test99@gmail.com",
            "name": "Test User",
            "password": "password123"
        })
        print("Signup:", res.text)
        res = requests.post("http://127.0.0.1:8000/auth/login", json={
            "email": "test99@gmail.com",
            "password": "password123"
        })
        token = res.json().get("access_token")
        
    print("Token:", token)
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get active events
    events = requests.get("http://127.0.0.1:8000/events/active", headers=headers).json()
    print("Events:", events)
    event_id = events[0]["id"] if events else None
    print("Using event_id:", event_id)
    
    # Try joining queue
    res = requests.post("http://127.0.0.1:8000/join-queue", json={
        "role": "general",
        "event_id": event_id
    }, headers=headers)
    print("Join response:", res.status_code)
    print(res.text)

if __name__ == "__main__":
    test_join()
