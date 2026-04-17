import asyncio
import httpx
import random
import time

API_URL = "http://localhost:8000" # Change this to your deployed URL when demoing

async def simulate_user(client, name, email):
    try:
        priority = 1 if random.random() < 0.1 else 0 # 10% VIPs
        response = await client.post(
            f"{API_URL}/join-queue?name={name}&email={email}&priority={priority}"
        )
        if response.status_code == 200:
            print(f"[+] User {name} joined queue successfully.")
        else:
            print(f"[-] Failed: {response.text}")
    except Exception as e:
        print(f"[-] Error: {e}")

async def main():
    print("🚀 Starting Crowd Simulation...")
    print("This will send 200 users to the queue rapidly.")
    time.sleep(2)
    
    async with httpx.AsyncClient() as client:
        tasks = []
        for i in range(1, 201):
            name = f"TestUser_{i}"
            email = f"testuser_{i}@smartqx.demo"
            tasks.append(simulate_user(client, name, email))
            
            # Briefly pause occasionally to simulate realistic burst traffic
            if i % 20 == 0:
                await asyncio.sleep(0.5)
                
        # Run all requests
        await asyncio.gather(*tasks)
        
    print("✅ Simulation complete! Check the Admin Dashboard to see the PID working.")

if __name__ == "__main__":
    asyncio.run(main())
