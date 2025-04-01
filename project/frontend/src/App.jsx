import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import LiveMode from './components/LiveMode';
import PotholeMap from './components/PotholeMap';
import './App.css';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <div className="home-container">
              <h1>Welcome to Road Hazard Detection</h1>
              <p>This application detects road hazards using YOLO-based object detection.</p>
              <div className="button-container">
                <Link to="/live">
                  <button className="live-mode-btn">Go to Live Mode</button>
                </Link>
                <Link to="/pothole-map">
                  <button className="pothole-map-btn">View Pothole Map</button>
                </Link>
              </div>
            </div>
          }
        />
        <Route path="/live" element={<LiveMode />} />
        <Route path="/pothole-map" element={<PotholeMap />} />
      </Routes>
    </Router>
  );
}
