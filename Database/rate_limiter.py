import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

class IPRateLimiter:
    def __init__(self, max_requests: int = 5, window_seconds: int = 300):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)

    def check_rate_limit(self, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        
        # Keep only timestamps within the last 5 minutes (300 seconds)
        valid_timestamps = [
            ts for ts in self.requests[client_ip] 
            if now - ts < self.window_seconds
        ]
        self.requests[client_ip] = valid_timestamps

        if len(valid_timestamps) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - valid_timestamps[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many PIN verification attempts from this network. Please retry in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)}
            )
        
        self.requests[client_ip].append(now)

pin_ip_limiter = IPRateLimiter(max_requests=5, window_seconds=300)
