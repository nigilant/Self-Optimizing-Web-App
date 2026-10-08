import asyncio
import httpx
import time
import random
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

API_URL = "http://127.0.0.1:8000"

async def simulate_user_session(client, user_id):
    """Simulates a user browsing the site."""
    try:
        # User hits the main page
        await client.get(f"{API_URL}/")
        
        # User browses some products
        for _ in range(random.randint(1, 5)):
            page = random.randint(1, 10)
            await client.get(f"{API_URL}/products?page={page}")
            # Think time
            await asyncio.sleep(random.uniform(0.1, 1.0))
            
    except Exception as e:
        pass # Ignore connection errors if server is overwhelmed

async def load_test_phase(phase_name, duration_sec, users_per_sec):
    logging.info(f"--- Starting Phase: {phase_name} ({users_per_sec} users/sec for {duration_sec}s) ---")
    start_time = time.time()
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        while time.time() - start_time < duration_sec:
            # Spawn users for this second
            tasks = [simulate_user_session(client, i) for i in range(users_per_sec)]
            await asyncio.gather(*tasks)
            # Sleep remainder of the second to maintain rate (approx)
            await asyncio.sleep(1)

async def main():
    logging.info("Starting Load Simulation...")
    # Give server time to start
    await asyncio.sleep(2)
    
    # Phase 1: Normal Traffic
    await load_test_phase("Normal Traffic", duration_sec=30, users_per_sec=2)
    
    # Phase 2: Moderate Increase
    await load_test_phase("Moderate Traffic", duration_sec=30, users_per_sec=10)
    
    # Phase 3: Heavy Spike (This should cause our API to slow down naturally)
    await load_test_phase("Spike", duration_sec=45, users_per_sec=30)
    
    # Phase 4: Cool down
    await load_test_phase("Cool down", duration_sec=20, users_per_sec=2)
    
    logging.info("Load Simulation Complete. Exporting data...")
    
    # Tell the API to export the data it recorded
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{API_URL}/export_data")
        logging.info(f"Export Result: {resp.json()}")

if __name__ == "__main__":
    asyncio.run(main())
