"""
The physical rig (an acrylic scale model of junction C with four signal
heads, 16 WS2811 pixels on an ESP32 over USB serial). This package is a
read-only side-channel, like the database logger and the dashboard: it
watches the live signal state and never influences control.
"""
