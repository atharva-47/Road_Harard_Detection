import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from pymongo import MongoClient
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
mongo_client = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
db = mongo_client["road_hazards"]
hazard_reports = db["hazard_reports"]

# Email configuration
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USER = os.getenv("EMAIL_USER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
AUTHORITY_EMAIL = os.getenv("AUTHORITY_EMAIL", "local.authority@example.com")

# Create router
router = APIRouter()

# Update the model at the top of the file
class HazardNotification(BaseModel):
    location: Dict[str, float]
    timestamp: datetime
    type: str
    severity: str
    image_url: Optional[str] = None
    hazard_count: Optional[int] = 1

@router.post("/hazard-notification")
async def send_hazard_notification(notification: HazardNotification = Body(...)):
    try:
        # Only process pothole notifications (class 0)
        if notification.type.lower() != "pothole":
            return {"success": False, "message": "Only pothole hazards are reported to authorities"}
            
        # Check if we've already reported a hazard at this location
        # Using approximately 100 meter radius (0.001 degrees ≈ 111 meters)
        existing_report = hazard_reports.find_one({
            "location.lat": {"$gte": notification.location["lat"] - 0.001, "$lte": notification.location["lat"] + 0.001},
            "location.lng": {"$gte": notification.location["lng"] - 0.001, "$lte": notification.location["lng"] + 0.001},
        })
        
        # Count nearby hazards in a slightly larger area (500m radius)
        nearby_count = hazard_reports.count_documents({
            "location.lat": {"$gte": notification.location["lat"] - 0.005, "$lte": notification.location["lat"] + 0.005},
            "location.lng": {"$gte": notification.location["lng"] - 0.005, "$lte": notification.location["lng"] + 0.005},
            "timestamp": {"$gte": datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=30)}
        })
        
        if existing_report:
            # If the report is less than 7 days old, don't send a new notification
            report_time = existing_report.get("timestamp", datetime.min)
            if isinstance(report_time, str):
                report_time = datetime.fromisoformat(report_time.replace('Z', '+00:00'))
            
            days_difference = (datetime.now() - report_time).days
            if days_difference < 7:
                return {"success": False, "message": "Recent report exists for this location"}
        
        # Store in MongoDB
        report_id = hazard_reports.insert_one({
            "location": notification.location,
            "timestamp": notification.timestamp,
            "type": notification.type,
            "severity": notification.severity,
            "image_url": notification.image_url,
            "status": "reported",
            "hazard_count": notification.hazard_count if hasattr(notification, 'hazard_count') else 1
        }).inserted_id
        
        # Send email notification with nearby count
        send_email_to_authority(notification, str(report_id), nearby_count)
        
        return {"success": True, "report_id": str(report_id)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process notification: {str(e)}")

def send_email_to_authority(notification: HazardNotification, report_id: str, nearby_count: int = 0):
    """Send email to local authority about the pothole"""
    if not EMAIL_USER or not EMAIL_PASSWORD:
        print("Email credentials not configured. Skipping email notification.")
        return
    
    # Create email
    msg = MIMEMultipart()
    msg['From'] = os.getenv("SENDER_EMAIL", "artis0012@proton.me")  # Use your verified sender email
    msg['To'] = AUTHORITY_EMAIL
    msg['Subject'] = f"Pothole Detected - {notification.severity} - ID: {report_id}"
    
    # Get hazard count from notification or default to 1
    hazard_count = getattr(notification, 'hazard_count', 1)
    
    # Email body
    body = f"""
    Dear Local Authority,
    
    Our Road Hazard Detection System has identified a {notification.severity} pothole at the following location:
    
    Latitude: {notification.location['lat']}
    Longitude: {notification.location['lng']}
    
    Google Maps Link: https://www.google.com/maps?q={notification.location['lat']},{notification.location['lng']}
    
    Detected at: {notification.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
    Report ID: {report_id}
    
    Pothole Details:
    - Number of potholes detected in current frame: {hazard_count}
    - Total potholes reported in this area (500m radius) in the last 30 days: {nearby_count}
    
    This suggests this area may require priority attention for road maintenance.
    
    Please take appropriate action to address this road hazard.
    
    Regards,
    Road Hazard Detection System
    """
    
    msg.attach(MIMEText(body, 'plain'))
    
    # Send email
    try:
        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"Email notification sent for hazard {report_id}")
    except Exception as e:
        print(f"Failed to send email: {str(e)}")

# Add this new endpoint to your existing notification_service.py file

@router.get("/hazard-reports")
async def get_hazard_reports():
    """Get all hazard reports from the database"""
    try:
        # Fetch all reports, sort by timestamp descending (newest first)
        reports = list(hazard_reports.find({}, {'_id': 0}).sort('timestamp', -1))
        
        # Convert ObjectId to string for JSON serialization
        for report in reports:
            if '_id' in report:
                report['_id'] = str(report['_id'])
            
            # Ensure timestamp is serializable
            if 'timestamp' in report and isinstance(report['timestamp'], datetime):
                report['timestamp'] = report['timestamp'].isoformat()
        
        return reports
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard reports: {str(e)}")

@router.delete("/cleanup-resolved-hazards")
async def cleanup_resolved_hazards():
    """Remove hazard reports that are older than 7 days and have no recent reports in the same location"""
    try:
        # Get the cutoff date (7 days ago)
        cutoff_date = datetime.now() - timedelta(days=7)
        
        # Find all reports older than 7 days
        old_reports = list(hazard_reports.find({
            "timestamp": {"$lt": cutoff_date}
        }))
        
        removed_count = 0
        
        for report in old_reports:
            # For each old report, check if there's a newer report within 100m
            has_newer_report = hazard_reports.find_one({
                "location.lat": {"$gte": report["location"]["lat"] - 0.001, "$lte": report["location"]["lat"] + 0.001},
                "location.lng": {"$gte": report["location"]["lng"] - 0.001, "$lte": report["location"]["lng"] + 0.001},
                "timestamp": {"$gte": cutoff_date}
            })
            
            # If no newer report exists, remove this old report
            if not has_newer_report:
                hazard_reports.delete_one({"_id": report["_id"]})
                removed_count += 1
        
        return {
            "success": True, 
            "message": f"Removed {removed_count} resolved hazards",
            "removed_count": removed_count
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cleanup resolved hazards: {str(e)}")

# Also add a specific endpoint to delete a single hazard by ID
@router.delete("/hazard-reports/{report_id}")
async def delete_hazard_report(report_id: str):
    """Delete a specific hazard report by ID"""
    try:
        from bson.objectid import ObjectId
        
        # Convert string ID to MongoDB ObjectId
        result = hazard_reports.delete_one({"_id": ObjectId(report_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"Hazard report with ID {report_id} not found")
        
        return {"success": True, "message": f"Hazard report {report_id} deleted successfully"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete hazard report: {str(e)}")