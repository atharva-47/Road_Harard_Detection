import asyncio
import cv2
import torch
import numpy as np
import base64
from fastapi import WebSocket, WebSocketDisconnect
from camera_manager import camera_manager
from model_loader import model

async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Track the source of frames (backend camera or browser)
        frame_source = "backend"
        
        while True:
            # First check if there's any message from client
            try:
                # Set a very small timeout to avoid blocking
                data = await asyncio.wait_for(websocket.receive(), timeout=0.01)
                
                # Client has sent a message - could be a command or a frame
                if "text" in data and data["text"]:
                    message = data["text"]
                    
                    # Handle camera mode switch command
                    if message == "camera_mode:backend":
                        frame_source = "backend"
                        print("Switched to backend camera")
                        continue
                    elif message == "camera_mode:browser":
                        frame_source = "browser"
                        print("Switched to browser camera")
                        continue
                
                # Handle incoming frame from browser
                if "text" in data and data["text"] and frame_source == "browser":
                    # Extract base64 image data
                    if data["text"].startswith("data:image"):
                        # Strip the data URL prefix and get the base64 part
                        img_data = data["text"].split(",")[1]
                        
                        # Decode base64 to image
                        img_bytes = base64.b64decode(img_data)
                        img_np = np.frombuffer(img_bytes, dtype=np.uint8)
                        frame = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
                        
                        if frame is not None:
                            # Process the frame with YOLO
                            results = process_frame_with_model(frame)
                            
                            # Send processed frame and results
                            _, jpeg = cv2.imencode('.jpg', results[0].plot(), [cv2.IMWRITE_JPEG_QUALITY, 80])
                            await websocket.send_bytes(jpeg.tobytes())
                            
                            # Count hazards after filtering
                            hazard_count = len(results[0].boxes.data)
                            await websocket.send_json({"hazard_count": hazard_count})
                        
                        continue
                
            except asyncio.TimeoutError:
                # No message from client, continue with the backend camera if active
                pass
            except Exception as e:
                print(f"Error receiving message: {str(e)}")
            
            # Process backend camera frame if that's the current source
            if frame_source == "backend" and not camera_manager.frame_queue.empty():
                frame = camera_manager.frame_queue.get()
                
                # Process the frame with YOLO
                results = process_frame_with_model(frame)
                
                # Send processed frame and results
                _, jpeg = cv2.imencode('.jpg', results[0].plot(), [cv2.IMWRITE_JPEG_QUALITY, 80])
                await websocket.send_bytes(jpeg.tobytes())
                
                # Count hazards after filtering
                hazard_count = len(results[0].boxes.data)
                await websocket.send_json({"hazard_count": hazard_count})
            
            await asyncio.sleep(0.033)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {str(e)}")

def process_frame_with_model(frame):
    """Process a frame with the YOLO model and apply filtering"""
    # Process detection
    results = model.predict(
        frame,
        imgsz=640,
        device="cuda" if torch.cuda.is_available() else "cpu",
        half=torch.cuda.is_available(),
        verbose=False
    )

    # Apply threshold filtering
    filtered_results = []
    for r in results[0].boxes.data:
        x1, y1, x2, y2, conf, cls = r.tolist()
        if (cls == 0 and conf >= 0.35) or (cls == 1 and conf >= 0.80):
            filtered_results.append(r.unsqueeze(0))

    # Ensure results[0].boxes.data is updated correctly
    if filtered_results:
        results[0].boxes.data = torch.cat(filtered_results, dim=0)
    else:
        results[0].boxes.data = torch.empty((0, 6))
    
    return results