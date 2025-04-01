from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import uvicorn

from camera_manager import camera_manager
from websocket_server import websocket_endpoint
from model_loader import model  # Ensure model loads on startup
from notification_service import router as notification_router

app = FastAPI()

# API Routes
app.include_router(notification_router, prefix="/api")

# WebSocket Route
app.websocket("/ws")(websocket_endpoint)

# Static Files and SPA Fallback
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")
    
    @app.get("/{filename}")
    async def get_file(filename: str):
        file_path = frontend_dist / filename
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist / "index.html"))
    
    @app.get("/{full_path:path}")
    async def serve_spa():
        return FileResponse(str(frontend_dist / "index.html"))

# Start Camera Stream (Fixed to Camera 2)
camera_manager.start_stream()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
