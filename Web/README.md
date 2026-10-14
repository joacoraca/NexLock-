
Web readme · MD
# NexLock - Panel Web
 
Panel de administración web para NexLock, el sistema de control de acceso físico. Permite gestionar usuarios, ver el historial de accesos en tiempo real y monitorear el estado del dispositivo, todo conectado directamente a Firebase.
 
## Stack
 
- **Frontend:** HTML + CSS + JavaScript 
- **Backend:** Firebase (Auth + Firestore), sin Cloud Functions
- **Hosting:** Firebase Hosting
- **Hardware:** ESP32 y ESP32-CAM (autenticación y lectura de eventos)
## Estructura
 
```
Web/
└── nexlock-firebase/
    ├── firebase.json          ← configuración de hosting + firestore
    ├── firestore.rules        ← reglas de seguridad
    ├── public/
    │   ├── index.html
    │   ├── style.css
    │   └── app.js              ← frontend con Firebase SDK
    └── nexlock_esp32.ino       ← código del ESP32
```
 
## Funcionalidades
 
- **Dashboard:** estadísticas en vivo (intentos totales, accesos correctos, fallidos, tasa de éxito), feed en tiempo real con chips de verificación doble (PIN + Rostro), y estado de conexión de los dispositivos (ESP32 y ESP32-CAM).
- **Historial:** registro completo de intentos de acceso con detalle de resultado de PIN y reconocimiento facial, filtrable por exitosos/fallidos.
- **Usuarios & Biometría Facial:** alta de usuarios con PIN (4 a 8 dígitos), rol y captura de rostro asistida por IA (MediaPipe Face Detection en el navegador) recortada a 320×320 px para comparación biométrica. Posibilidad de registrar o actualizar el rostro en cualquier momento.
- **Autenticación:** login con email y contraseña vía Firebase Auth.
- **Seguridad:** el PIN se hashea con SHA-256 en el cliente antes de guardarse; los rostros de referencia se almacenan de forma protegida en Firestore (`faces/{userId}`) accesibles únicamente para administradores y dispositivos autorizados.
## Cómo levantarlo
 
La guía de instalación completa (configuración de Firebase, índices de Firestore, deploy y setup del ESP32) está en [`nexlock-firebase/README.md`](./nexlock-firebase/README.md).
 
En resumen:
 
```bash
cd nexlock-firebase
firebase deploy
```
(Tenes que tener instalado las firebase tools.)
## Nota de seguridad
 
El `firebaseConfig` (apiKey, projectId, etc.) que está en `app.js` es información pública del cliente de Firebase. La seguridad real la dan las **Firestore rules**. Vale la pena revisar que `firestore.rules` esté bien restringido antes de dar por cerrado el proyecto.
