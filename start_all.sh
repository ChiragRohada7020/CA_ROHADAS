#!/bin/bash
export PATH=/tmp/node-v22.11.0-linux-arm64/bin:$PATH

# Start backend
cd /home/ubuntu/CA_ROHADAS/backend
nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /home/ubuntu/CA_ROHADAS/logs/backend.log 2>&1 &
echo "Backend PID: $!"

# Start frontend  
cd /home/ubuntu/CA_ROHADAS/frontend
nohup npm start -- --hostname 0.0.0.0 --port 3000 > /home/ubuntu/CA_ROHADAS/logs/frontend.log 2>&1 &
echo "Frontend PID: $!"

# Start WhatsApp gateway
cd /home/ubuntu/CA_ROHADAS/baileys-gateway
nohup node server.js > /home/ubuntu/CA_ROHADAS/baileys-gateway/gateway.log 2>&1 &
echo "Gateway PID: $!"
