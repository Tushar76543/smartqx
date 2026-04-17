import httpx
import asyncio
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.post('/join-queue?name=Test&email=test@example.com&role=general')
print(response.status_code)
print(response.json())
