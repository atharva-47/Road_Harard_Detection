import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './PotholeMap.css';

export default function PotholeMap() {
  const mapRef = useRef(null);
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Fetch pothole data from our API
    const fetchPotholes = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/hazard-reports');
        setPotholes(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching pothole data:', err);
        setError('Failed to load pothole data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchPotholes();
  }, []);
  
  useEffect(() => {
    // Initialize TomTom map
    const initMap = async () => {
      if (!mapRef.current || potholes.length === 0) return;
      
      // Load TomTom SDK
      if (!window.tt) {
        const script = document.createElement('script');
        script.src = 'https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.23.0/maps/maps-web.min.js';
        script.async = true;
        script.onload = createMap;
        document.body.appendChild(script);
        
        // Load CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.23.0/maps/maps.css';
        document.head.appendChild(link);
      } else {
        createMap();
      }
    };
    
    const createMap = () => {
      // Calculate center point from all potholes
      let centerLat = 0;
      let centerLng = 0;
      
      potholes.forEach(pothole => {
        centerLat += pothole.location.lat;
        centerLng += pothole.location.lng;
      });
      
      centerLat /= potholes.length;
      centerLng /= potholes.length;
      
      // Create map instance
      const map = window.tt.map({
        key: 'HONwvVKmEJdNAPsO358cGA7AhakHmuPV', // Replace with your TomTom API key
        container: mapRef.current,
        center: [centerLng, centerLat],
        zoom: 13
      });
      
      // Add markers for each pothole
      potholes.forEach(pothole => {
        const marker = new window.tt.Marker()
          .setLngLat([pothole.location.lng, pothole.location.lat])
          .addTo(map);
          
        // Create popup with pothole info
        const popup = new window.tt.Popup({ offset: 30 })
          .setHTML(`
            <div class="pothole-popup">
              <h3>Road Hazard</h3>
              <p>Type: ${pothole.type}</p>
              <p>Severity: ${pothole.severity}</p>
              <p>Reported: ${new Date(pothole.timestamp).toLocaleString()}</p>
              <p>Status: ${pothole.status}</p>
            </div>
          `);
          
        marker.setPopup(popup);
      });
      
      // Add heat map layer if there are many potholes
      if (potholes.length > 10) {
        const points = potholes.map(pothole => ({
          lng: pothole.location.lng,
          lat: pothole.location.lat,
          value: 1
        }));
        
        const heatmapLayer = new window.tt.HeatMap({
          data: points,
          radius: 40
        });
        
        map.addLayer(heatmapLayer);
      }
    };
    
    initMap();
  }, [potholes]);
  
  return (
    <div className="pothole-map-container">
      <h1>Pothole Map</h1>
      
      {loading && <div className="loading">Loading pothole data...</div>}
      {error && <div className="error">{error}</div>}
      
      <div className="map-stats">
        <div className="stat-box">
          <h3>Total Potholes</h3>
          <p>{potholes.length}</p>
        </div>
        <div className="stat-box">
          <h3>Recent Reports</h3>
          <p>{potholes.filter(p => new Date(p.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}</p>
        </div>
      </div>
      
      <div ref={mapRef} className="map-container"></div>
    </div>
  );
}