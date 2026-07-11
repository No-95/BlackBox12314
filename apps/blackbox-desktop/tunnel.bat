@echo off
REM Start an SSH tunnel from Windows to the Ubuntu host.
REM The app will use localhost:5178 to reach the dashboard through this tunnel.
"C:\Windows\System32\OpenSSH\ssh.exe" -N -L 5178:localhost:5178 n00bie@171.225.204.101
