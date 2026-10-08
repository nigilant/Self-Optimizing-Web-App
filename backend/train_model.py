import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

# Window size: How many past ticks to look at
WINDOW_SIZE = 5

def generate_timeseries_data(episodes=50, max_ticks=200):
    """
    Generates sequential time-series data.
    Simulates traffic curves: stable, ramping up, or suddenly spiking.
    """
    data = []
    
    for _ in range(episodes):
        scenario = np.random.choice(["stable", "ramp_up", "spike"])
        
        cpu = 30.0
        mem = 40.0
        users = 50.0
        
        for tick in range(max_ticks):
            if scenario == "stable":
                cpu += np.random.normal(0, 1)
                users += np.random.normal(0, 2)
            elif scenario == "ramp_up":
                cpu += np.random.normal(0.5, 1)
                users += np.random.normal(2, 2)
            elif scenario == "spike":
                if tick > 50 and tick < 100:
                    cpu += np.random.normal(5, 2)
                    users += np.random.normal(20, 5)
                else:
                    cpu += np.random.normal(-1, 1) # cooldown
                    users += np.random.normal(-5, 2)

            # Bound values
            cpu = max(5, min(100, cpu))
            users = max(10, users)
            mem = 40 + (cpu * 0.4) + np.random.normal(0, 2)
            mem = max(10, min(100, mem))
            resp_time = 20 + (cpu * 2) + (users * 0.5) + np.random.normal(0, 10)
            
            # Define actual state at this exact moment
            if cpu > 85 or users > 300:
                current_state = 2 # Critical
            elif cpu > 60 or users > 150:
                current_state = 1 # Warning
            else:
                current_state = 0 # Normal
                
            data.append([cpu, mem, users, resp_time, current_state])
            
    df = pd.DataFrame(data, columns=['cpu', 'memory', 'active_users', 'response_time_ms', 'current_state'])
    return df

def create_lagged_dataset(df, window_size, forecast_horizon=3):
    """
    Creates a dataset where X = [t-4, t-3, t-2, t-1, t]
    And y = state at [t + forecast_horizon]
    This predicts the future!
    """
    X, y = [], []
    features = ['cpu', 'memory', 'active_users', 'response_time_ms']
    
    # We want to predict the state `forecast_horizon` ticks in the future
    for i in range(window_size, len(df) - forecast_horizon):
        window_data = df.iloc[i-window_size:i][features].values.flatten()
        
        # Target is the state in the future
        future_state = df.iloc[i + forecast_horizon]['current_state']
        
        X.append(window_data)
        y.append(future_state)
        
    return np.array(X), np.array(y)

if __name__ == "__main__":
    print("Generating time-series performance dataset...")
    df = generate_timeseries_data()
    
    # We are forecasting 3 intervals ahead (e.g., 6 seconds into the future)
    print(f"Creating rolling windows (size={WINDOW_SIZE}, forecasting 3 steps ahead)...")
    X, y = create_lagged_dataset(df, WINDOW_SIZE, forecast_horizon=3)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Time-Series Forecasting Model (Random Forest on Lagged Features)...")
    model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train, y_train)
    
    print("\nForecast Evaluation:")
    print(classification_report(y_test, model.predict(X_test)))
    
    joblib.dump(model, "optimization_model.pkl")
    print("Time-Series Model saved as optimization_model.pkl")
