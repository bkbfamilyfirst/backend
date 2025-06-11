API Specification Document - Family First 
Overview 
This document outlines the backend API requirements for "Family First", a parental control and device 
management solution. It supports: 
 Hierarchical key distribution (Admin > ND > SS > DB > Retailer) 
 Android MDM app (child’s device) 
 Parent mobile app 
 Admin & intermediary panels 
 Device and key management 
All APIs will follow RESTful conventions. Use token-based authentication (JWT) and role-based access control. 
Follow best practices, error handling, standard industry practices.
Don't use placeholders or dummy data.

Module 1: Authentication APIs 
1.1 POST /auth/login 
 Purpose: Login for Admin, ND, SS, DB, Retailer 
 Request: 
{ 
} 
{ 
"email": "string", 
"password": "string" 
 Response: 
"token": "JWT", 
"user": { 
"id": "string", 
"role": "admin | nd | ss | db | retailer", 
"name": "string" 
} 
} 
Module 2: Hierarchy Management (Key Distribution) 
Each level can: 
 Add the next level 
 View keys and usage 
 Transfer keys 
2.1 POST /nd/create 
2.2 POST /ss/create 
2.3 POST /db/create 
2.4 POST /retailer/create 
All of the above have similar fields: 
{ 
} 
"name": "string", 
"email": "string", 
"phone": "string", 
"password": "string", 
"assignedKeys": 50 
2.5 POST /keys/transfer 
 Transfer keys to sub-user 
{ 
} 
"toUserId": "string", 
"count": 5 
2.6 GET /keys/status 
 Returns: 
{ 
"totalKeys": 100, 
"used": 75, 
"remaining": 25, 
"transferredTo": [ 
{ "id": "string", "name": "DB1", "count": 30 } 
] 
} 
Module 3: Parent & Device Management 
3.1 POST /parent/create 
 Retailer creates parent profile 
{ 
} 
"name": "string", 
"phone": "string", 
"email": "string", 
"deviceImei": "string", 
"assignedKey": "xxxxxx" 
3.2 GET /parent/list 
 List all parents created by the retailer 
Module 4: Parent App Features 
4.1 POST /device/lock 
{ 
} 
"deviceId": "string", 
"message": "Time for Homework" 
4.2 POST /device/unlock 
{ 
} 
"deviceId": "string" 
4.3 GET /device/location 
 Latest location and last sync time 
{ 
} 
"deviceId": "string" 
4.4 POST /device/reminder-lock 
{ 
} 
"deviceId": "string", 
"type": "daily | weekly", 
"time": "19:00" 
4.5 POST /device/sim-info 
{ 
} 
"deviceId": "string" 
4.6 POST /device/data-toggle 
{ 
} 
"deviceId": "string", 
"action": "enable" // or "disable" 
4.7 POST /device/location-toggle 
{ 
"deviceId": "string", 
"action": "enable" 
} 
4.8 POST /device/app-lock 
{ 
} 
"deviceId": "string", 
"apps": ["com.youtube.app"] 
4.9 POST /device/app-unlock 
4.10 POST /device/hide-app 
4.11 POST /device/unhide-app 
Module 5: Device Registration (from Android App) 
5.1 POST /device/register 
 Called on initial app install from child’s device 
{ 
} 
"imei": "string", 
"simNumber": "string", 
"fcmToken": "string", 
"deviceModel": "string", 
"osVersion": "string" 
5.2 POST /device/sync-location 
 From device to backend 
{ 
"latitude": 23.123, 
"longitude": 77.123, 
"imei": "string", 
"battery": 78, 
"network": "WiFi" 
} 
5.3 POST /device/sync-apps 
 Optional: Sync installed apps 
{ 
} 
"imei": "string", 
"apps": ["com.instagram.android", "com.whatsapp"] 
5.4 POST /device/status-update 
 Online/offline, locked/unlocked 
Module 6: Retailer Dashboard Stats 
6.1 GET /retailer/summary 
 Today’s activations, total activations, active devices, pending, etc. 
Module 7: Admin Dashboard & User Hierarchy 
7.1 GET /admin/summary 
 Count of all users at each level 
7.2 GET /users/hierarchy 
 Complete tree view of: Admin > ND > SS > DB > Retailer > Parent