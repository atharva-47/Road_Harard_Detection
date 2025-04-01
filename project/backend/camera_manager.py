import cv2
import threading
import queue

class CameraManager:
    def __init__(self):
        self.active_camera = 2  # Permanently set to Camera 2
        self.frame_queue = queue.Queue(maxsize=1)
        self.running = False
        self.thread = None
        self.cap = None

    def start_stream(self):
        if self.thread and self.thread.is_alive():
            self.stop_stream()
        
        self.running = True
        self.thread = threading.Thread(target=self._capture_frames, daemon=True)
        self.thread.start()

    def stop_stream(self):
        self.running = False
        if self.thread:
            self.thread.join()
        if self.cap and self.cap.isOpened():
            self.cap.release()

    def _capture_frames(self):
        self.cap = cv2.VideoCapture(self.active_camera)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                self.cap.release()
                self.cap = cv2.VideoCapture(self.active_camera)  # Reconnect
                continue
                
            if not self.frame_queue.empty():
                self.frame_queue.get_nowait()
            self.frame_queue.put(frame)

# Create a global instance
camera_manager = CameraManager()
