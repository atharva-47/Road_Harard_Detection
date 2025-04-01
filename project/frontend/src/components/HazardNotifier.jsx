import { useEffect, useRef } from 'react';
import axios from 'axios';

export default function HazardNotifier({ 
  isConnected, 
  hazardDetected, 
  currentLocation,
  onNotificationSent 
}) {
  const lastNotificationRef = useRef(null);
  const notificationCooldownRef = useRef(30 * 60 * 1000); // 30 minutes cooldown
  const pendingNotificationsRef = useRef([]);
  
  // Process notifications with cooldown
  useEffect(() => {
    if (!isConnected || !hazardDetected) return;
    
    // Add to pending notifications if we have location data
    if (currentLocation && currentLocation.lat && currentLocation.lng) {
      const newHazard = {
        location: currentLocation,
        timestamp: new Date(),
        type: 'pothole', // Default type
        severity: 'medium', // Default severity
      };
      
      // Check if we already have a similar location in pending
      const isDuplicate = pendingNotificationsRef.current.some(hazard => 
        Math.abs(hazard.location.lat - currentLocation.lat) < 0.0001 && 
        Math.abs(hazard.location.lng - currentLocation.lng) < 0.0001
      );
      
      if (!isDuplicate) {
        pendingNotificationsRef.current.push(newHazard);
      }
    }
  }, [hazardDetected, currentLocation, isConnected]);
  
  // Periodically check if we can send notifications
  useEffect(() => {
    if (!isConnected) return;
    
    const checkInterval = setInterval(() => {
      const now = new Date();
      
      // If we have pending notifications and cooldown period has passed
      if (pendingNotificationsRef.current.length > 0 && 
          (!lastNotificationRef.current || 
           now - lastNotificationRef.current > notificationCooldownRef.current)) {
        
        // Send up to 3 notifications at once after cooldown
        const batchSize = Math.min(3, pendingNotificationsRef.current.length);
        const hazardsToReport = pendingNotificationsRef.current.splice(0, batchSize);
        
        // Send notifications to backend
        hazardsToReport.forEach(hazard => {
          sendHazardNotification(hazard);
        });
        
        // Update last notification time
        lastNotificationRef.current = new Date();
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(checkInterval);
  }, [isConnected]);
  
  const sendHazardNotification = async (hazard) => {
    try {
      const response = await axios.post('/api/hazard-notification', hazard);
      
      if (response.data.success) {
        lastNotificationRef.current = new Date();
        if (onNotificationSent) {
          onNotificationSent(hazard, response.data);
        }
        console.log('Hazard notification sent successfully', hazard);
      }
    } catch (error) {
      console.error('Failed to send hazard notification:', error);
      // Put back in the queue to try again later
      pendingNotificationsRef.current.unshift(hazard);
    }
  };
  
  // This component doesn't render anything
  return null;
}