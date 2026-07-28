
Web readme · MD
# NexLock — Panel Web
 
Panel de administración web para NexLock, el sistema de control de acceso físico. Permite gestionar usuarios, ver el historial de accesos en tiempo real y monitorear el estado del dispositivo, todo conectado directamente a Firebase.
 
## Stack
 
- **Frontend:** HTML + CSS + JavaScript 
- **Backend:** Firebase (Auth + Firestore), sin Cloud Functions
- **Hosting:** Firebase Hosting
- **Hardware:** ESP32 (autenticación y lectura de eventos)
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
 
- **Dashboard:** estadísticas en vivo (intentos totales, accesos correctos, fallidos, tasa de éxito) y feed de últimos accesos.
- **Historial:** registro completo de intentos de acceso, filtrable por exitosos/fallidos.
- **Usuarios:** alta de usuarios con PIN (4 a 8 dígitos) y rol (usuario/administrador).
- **Autenticación:** login con email y contraseña vía Firebase Auth.
- **Seguridad del PIN:** el PIN se hashea con SHA-256 en el cliente antes de guardarse; nunca se transmite ni se almacena en texto plano. El ESP32 hashea de la misma forma y compara contra Firestore.
## Cómo levantarlo
 
La guía de instalación completa (configuración de Firebase, índices de Firestore, deploy y setup del ESP32) está en [`nexlock-firebase/README.md`](./nexlock-firebase/README.md).
 
En resumen:
 
```bash
cd nexlock-firebase
firebase deploy
```
 
## Nota de seguridad
 
El `firebaseConfig` (apiKey, projectId, etc.) que está en `app.js` es información pública del cliente de Firebase — no es un secreto, y es normal que esté en el frontend. La seguridad real la dan las **Firestore rules**. Vale la pena revisar que `firestore.rules` esté bien restringido antes de dar por cerrado el proyecto.
