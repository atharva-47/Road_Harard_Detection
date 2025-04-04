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
              <div className="hero-section">
                <div className="hero-content">
                  <h1>Road Hazard Detection</h1>
                  <p className="tagline">Enhancing road safety with AI-powered detection</p>
                  
                  <div className="features-grid">
                    <div className="feature-card">
                      <div className="feature-icon">🔍</div>
                      <h3>Real-time Detection</h3>
                      <p>Identify road hazards instantly using advanced YOLO technology</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">🗺️</div>
                      <h3>Interactive Mapping</h3>
                      <p>View and track hazards on an interactive map interface</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">⚠️</div>
                      <h3>Alert System</h3>
                      <p>Receive notifications when approaching known hazards</p>
                    </div>
                  </div>
                  
                  <div className="button-container">
                    <Link to="/live">
                      <button className="live-mode-btn">
                        <span className="btn-icon">▶️</span>
                        <span className="btn-text">Live Detection</span>
                      </button>
                    </Link>
                    <Link to="/pothole-map">
                      <button className="pothole-map-btn">
                        <span className="btn-icon">🗺️</span>
                        <span className="btn-text">View Hazard Map</span>
                      </button>
                    </Link>
                  </div>
                </div>
                <div className="hero-image">
                  <div className="image-container">
                    <div className="overlay-text">AI-Powered Road Safety</div>
                  </div>
                </div>
              </div>
              
              <footer className="home-footer">
                <p>© 2025 Road Hazard Detection System | Powered by YOLO Object Detection</p>
              </footer>
            </div>
          }
        />
        <Route path="/live" element={<LiveMode />} />
        <Route path="/pothole-map" element={<PotholeMap />} />
      </Routes>
    </Router>
  );
}
