import asyncio
import cv2
import torch
import numpy as np
import base64
from fastapi import WebSocket, WebSocketDisconnect
from camera_manager import camera_manager
from model_loader import model
from config import DETECTION_THRESHOLDS  # Import the thresholds from config

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
                            results, driver_lane_hazard_count, vis_frame = process_frame_with_model(frame)
                            
                            # Send processed frame and results
                            _, jpeg = cv2.imencode('.jpg', vis_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                            await websocket.send_bytes(jpeg.tobytes())
                            
                            # Count all hazards after filtering
                            total_hazard_count = len(results[0].boxes.data)
                            await websocket.send_json({
                                "hazard_count": total_hazard_count,
                                "driver_lane_hazard_count": driver_lane_hazard_count
                            })
                        
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
                results, driver_lane_hazard_count, vis_frame = process_frame_with_model(frame)
                
                # Send processed frame and results
                _, jpeg = cv2.imencode('.jpg', vis_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                await websocket.send_bytes(jpeg.tobytes())
                
                # Send both total and driver lane hazard counts
                total_hazard_count = len(results[0].boxes.data)
                await websocket.send_json({
                    "hazard_count": total_hazard_count,
                    "driver_lane_hazard_count": driver_lane_hazard_count
                })
            
            await asyncio.sleep(0.033)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {str(e)}")

def process_frame_with_model(frame):
    """Process a frame with the YOLO model and apply filtering"""
    # Get frame dimensions
    frame_height, frame_width = frame.shape[:2]
    
    # Calculate lane boundaries (middle 50%)
    left_boundary = int(frame_width * 0.25)
    right_boundary = int(frame_width * 0.75)
    
    # Process detection
    results = model.predict(
        frame,
        imgsz=640,
        device="cuda" if torch.cuda.is_available() else "cpu",
        half=torch.cuda.is_available(),
        verbose=False
    )

    # Apply threshold filtering using values from config
    filtered_results = []
    driver_lane_hazards = []  # Hazards in the middle 50% (driver's lane)
    
    for r in results[0].boxes.data:
        x1, y1, x2, y2, conf, cls = r.tolist()
        cls_int = int(cls)
        threshold_key = f"class_{cls_int}"
        
        if threshold_key in DETECTION_THRESHOLDS and conf >= DETECTION_THRESHOLDS[threshold_key]:
            filtered_results.append(r.unsqueeze(0))
            
            # Check if hazard is in driver's lane (middle 50%)
            box_center_x = (x1 + x2) / 2
            if left_boundary <= box_center_x <= right_boundary:
                driver_lane_hazards.append(r.unsqueeze(0))

    # Ensure results[0].boxes.data is updated correctly
    if filtered_results:
        results[0].boxes.data = torch.cat(filtered_results, dim=0)
    else:
        results[0].boxes.data = torch.empty((0, 6))
    
    # Count hazards in driver's lane
    driver_lane_hazard_count = len(driver_lane_hazards)
    
    # Add lane boundaries to the frame for visualization
    vis_frame = results[0].plot(conf=False, labels=True, boxes=True).copy()
    cv2.line(vis_frame, (left_boundary, 0), (left_boundary, frame_height), (0, 255, 0), 2)
    cv2.line(vis_frame, (right_boundary, 0), (right_boundary, frame_height), (0, 255, 0), 2)
    
    return results, driver_lane_hazard_count, vis_frame