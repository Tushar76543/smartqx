import math
import logging

logger = logging.getLogger(__name__)

class PIDController:
    """
    PID Controller for Adaptive Admission Control.
    Adjusts the `entry_rate` (persons per minute allowed) based on the 
    difference between current crowd size and target crowd size.
    """
    def __init__(self, kp=0.5, ki=0.1, kd=0.05, target_crowd=100, max_rate=30, min_rate=2):
        self.Kp = kp
        self.Ki = ki
        self.Kd = kd
        
        self.target_crowd = target_crowd
        self.max_rate = max_rate # Max people allowed per "tick" (e.g. per minute)
        self.min_rate = min_rate # Min people allowed even under high load to prevent starvation
        
        self.integral = 0
        self.previous_error = 0
        
        # Currently allowed entry rate (number of people allowed in next minute)
        self.current_entry_rate = self.max_rate

    def update(self, current_crowd: int, dt=1) -> float:
        """
        Calculate the new entry rate.
        Error is positive when we have capacity (target > current).
        Error is negative when overcrowded (current > target).
        """
        error = self.target_crowd - current_crowd
        
        # Proportional term
        P = self.Kp * error
        
        # Integral term
        self.integral += error * dt
        # Anti-windup: limit integral to avoid huge overshoots
        self.integral = max(min(self.integral, 100), -100)
        I = self.Ki * self.integral
        
        # Derivative term
        derivative = (error - self.previous_error) / dt
        D = self.Kd * derivative
        
        self.previous_error = error
        
        # Raw entry adjustment
        adjustment = P + I + D
        
        # Calculate new rate based on adjustment
        # If error is positive (room available), adjustment is positive -> increase rate
        # If error is negative (overcrowded), adjustment is negative -> decrease rate
        new_rate = self.current_entry_rate + adjustment
        
        # Clamp between min and max allowed rates
        self.current_entry_rate = max(self.min_rate, min(self.max_rate, new_rate))
        
        logger.info(f"PID Update | Error: {error} | P:{P:.2f} I:{I:.2f} D:{D:.2f} | New Rate: {self.current_entry_rate:.2f}")
        return self.current_entry_rate

pid = PIDController()
