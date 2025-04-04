import { useEffect, useRef, useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './LiveMode.css';
import HazardNotifier from './HazardNotifier';
import NearbyHazardNotifier from './NearbyHazardNotifier';

export default function LiveMode() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const alertRef = useRef(null);
  const cooldownRef = useRef(null);
  const browserStreamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const alertSoundRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('backend'); // 'backend' or 'browser'
  const [isConnected, setIsConnected] = useState(false);
  const [hazardDetected, setHazardDetected] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [nearbyPotholes, setNearbyPotholes] = useState([]);
  const nearbyPotholeAlertRef = useRef(null);
  const potholeCheckIntervalRef = useRef(null);

  // Initialize alert sound
  useEffect(() => {
    alertSoundRef.current = new Audio('/alert.mp3');
    alertSoundRef.current.loop = true;
    
    return () => {
      if (alertSoundRef.current) {
        alertSoundRef.current.pause();
        alertSoundRef.current = null;
      }
    };
  }, []);

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location:", error);
          toast.warning("Location access is needed for hazard reporting");
        }
      );
    } else {
      toast.warning("Geolocation is not supported by this browser");
    }
  }, []);

  // Check for nearby potholes when location changes
  useEffect(() => {
    if (!currentLocation) return;
    
    // Function to check if user is near any potholes
    const checkNearbyPotholes = async () => {
      try {
        const response = await fetch('/api/hazard-reports');
        if (!response.ok) throw new Error('Failed to fetch pothole data');
        
        const potholes = await response.json();
        
        // Calculate distance to each pothole
        const nearby = potholes.filter(pothole => {
          // Calculate distance using Haversine formula
          const distance = calculateDistance(
            currentLocation.lat, 
            currentLocation.lng,
            pothole.location.lat,
            pothole.location.lng
          );
          
          // Return true if within 100 meters
          return distance <= 0.1; // 0.1 km = 100 meters
        });
        
        setNearbyPotholes(nearby);
        
        // Show alert if there are nearby potholes and we haven't shown one recently
        if (nearby.length > 0 && !nearbyPotholeAlertRef.current) {
          nearbyPotholeAlertRef.current = toast.warning(
            `⚠️ Drive carefully! potholes detected nearby.`, 
            {
              autoClose: 7000,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              onClose: () => {
                // Reset the alert ref after it closes
                setTimeout(() => {
                  nearbyPotholeAlertRef.current = null;
                }, 30000); // Don't show another alert for 30 seconds
              }
            }
          );
        }
      } catch (error) {
        console.error("Error checking nearby potholes:", error);
      }
    };
    
    // Calculate distance between two points using Haversine formula
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Radius of the earth in km
      const dLat = deg2rad(lat2 - lat1);
      const dLon = deg2rad(lon2 - lon1);
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
      const distance = R * c; // Distance in km
      return distance;
    };
    
    const deg2rad = (deg) => {
      return deg * (Math.PI/180);
    };
    
    // Check immediately when location changes
    checkNearbyPotholes();
    
    // Set up interval to check periodically (every 30 seconds)
    if (!potholeCheckIntervalRef.current) {
      potholeCheckIntervalRef.current = setInterval(checkNearbyPotholes, 30000);
    }
    
    return () => {
      if (potholeCheckIntervalRef.current) {
        clearInterval(potholeCheckIntervalRef.current);
        potholeCheckIntervalRef.current = null;
      }
    };
  }, [currentLocation]);

  // Handle camera toggle
  const toggleCameraMode = async () => {
    // If currently using backend camera, switch to browser camera
    if (cameraMode === 'backend') {
      try {
        // Request browser camera access
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 } 
        });
        
        // Store the stream reference for cleanup
        browserStreamRef.current = stream;
        
        // Set the video element's srcObject to the stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (err) {
            console.error("Error playing video:", err);
            toast.error("Error starting camera feed");
            throw err;
          }
        }
        
        // Tell the backend we're switching to browser camera
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send("camera_mode:browser");
        }
        
        // Start sending frames to backend
        startSendingFrames();
        
        setCameraMode('browser');
        toast.info("Switched to browser camera");
      } catch (err) {
        console.error("Failed to access browser camera:", err);
        toast.error("Failed to access browser camera. Check permissions.");
        // Fall back to backend camera
        switchToBackendCamera();
      }
    } 
    // If currently using browser camera, switch to backend camera
    else {
      switchToBackendCamera();
    }
  };

  const switchToBackendCamera = () => {
    // Stop sending frames
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    // Stop all tracks from the browser camera stream
    if (browserStreamRef.current) {
      browserStreamRef.current.getTracks().forEach(track => track.stop());
      browserStreamRef.current = null;
    }
    
    // Clear the video element's srcObject
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Tell the backend we're switching to backend camera
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("camera_mode:backend");
    }
    
    setCameraMode('backend');
    toast.info("Switched to backend camera");
  };

  const startSendingFrames = () => {
    // Create canvas for capturing frames if it doesn't exist
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 640;  // Reduced resolution for better performance
      canvasRef.current.height = 480;
    }
    
    // Start interval to send frames
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    
    frameIntervalRef.current = setInterval(() => {
      if (videoRef.current && browserStreamRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Convert canvas to data URL and send to backend
        const dataURL = canvasRef.current.toDataURL('image/jpeg', 0.7);
        wsRef.current.send(dataURL);
      }
    }, 100); // Send ~10 frames per second to reduce load
  };

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsURL = window.location.origin.replace(/^http/, 'ws') + '/ws';
    wsRef.current = new WebSocket(wsURL);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      
      // Send camera mode to backend on connection
      if (cameraMode === 'browser' && browserStreamRef.current) {
        wsRef.current.send("camera_mode:browser");
        startSendingFrames();
      } else {
        wsRef.current.send("camera_mode:backend");
      }
    };

    wsRef.current.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const parsedData = JSON.parse(e.data);
          const hazardCount = parsedData.hazard_count;

          // Update hazard detection state for notification system
          setHazardDetected(hazardCount > 0);

          if (hazardCount > 0) {
            if (!alertRef.current) {
              alertRef.current = toast.warning("⚠️ Road Hazard Detected!", {
                autoClose: false,
                closeOnClick: false,
                draggable: false,
                onOpen: () => {
                  // Play alert sound when notification appears
                  if (alertSoundRef.current) {
                    alertSoundRef.current.play().catch(err => console.error("Error playing sound:", err));
                  }
                },
                onClose: () => {
                  // Stop alert sound when notification is closed
                  if (alertSoundRef.current) {
                    alertSoundRef.current.pause();
                    alertSoundRef.current.currentTime = 0;
                  }
                }
              });
            }
            if (cooldownRef.current) {
              clearTimeout(cooldownRef.current);
              cooldownRef.current = null;
            }
          } else {
            if (!cooldownRef.current) {
              cooldownRef.current = setTimeout(() => {
                if (alertRef.current) {
                  toast.dismiss(alertRef.current);
                  alertRef.current = null;
                  // Stop alert sound when hazard is no longer detected
                  if (alertSoundRef.current) {
                    alertSoundRef.current.pause();
                    alertSoundRef.current.currentTime = 0;
                  }
                }
                cooldownRef.current = null;
              }, 3000);
            }
          }
        } catch (err) {
          console.error("WebSocket JSON Error:", err);
        }
      } else if (e.data instanceof Blob) {
        const url = URL.createObjectURL(e.data);
        // Create or update processed feed image
        let processedImg = document.getElementById('processed-feed');
        if (!processedImg) {
          processedImg = document.createElement('img');
          processedImg.id = 'processed-feed';
          processedImg.className = 'processed-feed';
          videoRef.current.after(processedImg);
        }
        
        if (processedImg.src) {
          URL.revokeObjectURL(processedImg.src);
        }
        processedImg.src = url;
      }
    };

    wsRef.current.onerror = () => {
      console.error("WebSocket error. Attempting to reconnect...");
      setIsConnected(false);
    };

    wsRef.current.onclose = () => {
      console.warn("WebSocket closed. Reconnecting in 3 seconds...");
      setIsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
  };

  useEffect(() => {
    // Initialize with backend camera
    connectWebSocket();

    return () => {
      // Cleanup function
      if (wsRef.current) {
        wsRef.current.close();
      }
      
      // Stop all tracks from the browser camera stream
      if (browserStreamRef.current) {
        browserStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Clear frame sending interval
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      
      // Clean up processed feed image
      const processedImg = document.getElementById('processed-feed');
      if (processedImg) {
        if (processedImg.src) {
          URL.revokeObjectURL(processedImg.src);
        }
        processedImg.remove();
      }
    };
  }, []);

  // Handle notification sent
  const handleNotificationSent = (hazard, response) => {
    if (response.success) {
      toast.success(`Hazard reported to authorities (ID: ${response.report_id.substring(0, 8)})`);
    }
  };

  return (
    <div className="live-container">
      <h1>Live Road Hazard Detection</h1>
      
      {/* Connection Status removed */}
      
      {/* Camera Toggle Button */}
      <div className="camera-toggle">
        <button 
          onClick={toggleCameraMode}
          className={`toggle-button ${cameraMode}`}
          disabled={!isConnected}
        >
          {cameraMode === 'backend' ? 'Switch to Browser Camera' : 'Switch to Backend Camera'}
        </button>
        <div className="camera-status">
          Current: {cameraMode === 'backend' ? 'Backend Camera' : 'Browser Camera'} (YOLO Detection Active)
        </div>
      </div>

      <div className="content-grid">
        {/* Camera Feed Column */}
        <div className="feed-column">
          <div className="video-container">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={cameraMode === 'backend' ? 'live-feed' : 'browser-feed'}
            />
          </div>
        </div>

        {/* Map Column */}
        <div className="map-column">
          <iframe
            src="/Map.html"
            title="Road Hazard Map"
            className="map-iframe"
            allowFullScreen
          />
        </div>
      </div>

      {/* Hazard Notifier Component */}
      <HazardNotifier 
        isConnected={isConnected}
        hazardDetected={hazardDetected}
        currentLocation={currentLocation}
        onNotificationSent={handleNotificationSent}
      />

      {/* Nearby Hazard Notifier Component */}
      <NearbyHazardNotifier currentLocation={currentLocation} />

      <ToastContainer />
    </div>
  );
}
