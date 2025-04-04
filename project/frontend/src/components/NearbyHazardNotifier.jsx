import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

export default function NearbyHazardNotifier({ currentLocation }) {
  const [nearbyPotholes, setNearbyPotholes] = useState([]);
  const nearbyPotholeAlertRef = useRef(null);
  const potholeCheckIntervalRef = useRef(null);

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

  return null; // This component doesn't render anything, it just handles notifications
}