import httpx
import asyncio
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.post('/join-queue?name=Test&email=test@example.com&role=general')
print("First attempt:")
print(response.status_code)
print(response.json())

response2 = client.post('/join-queue?name=Test&email=test@example.com&role=general')
print("Second attempt:")
print(response2.status_code)
print(response2.json())
