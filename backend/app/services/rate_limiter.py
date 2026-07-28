from slowapi import Limiter
from slowapi.util import get_remote_address

# NOTE: keyed by IP for now. Fine at MVP scale, but IP-based limiting can be
# bypassed with rotating proxies/VPNs. For stricter abuse prevention later,
# add a second key_func that limits by authenticated user_id on top of this.
limiter = Limiter(key_func=get_remote_address)
