# NexLock — Setup Firebase (sin Functions)

## Estructura del proyecto
```
nexlock-firebase/
├── firebase.json        ← configuración hosting + firestore
├── firestore.rules      ← reglas de seguridad
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js           ← frontend con Firebase SDK
└── nexlock_esp32.ino    ← código del ESP32
```

---

## 1. Obtener configuración de Firebase

1. Entrá a https://console.firebase.google.com → tu proyecto
2. Ícono engranaje → **Configuración del proyecto**
3. En "Tus apps" → click **</>** → registrá la app como "nexlock-web"
4. Copiá el objeto `firebaseConfig` que te da

Pegá esos valores en `public/app.js` donde dice `TU_API_KEY`, etc.

---

## 2. Crear índices en Firestore

Para que las consultas con filtro funcionen, necesitás crear índices compuestos.

1. En Firebase Console → **Firestore** → pestaña **Índices**
2. Crear índice compuesto → colección `logs`:
   - Campo 1: `result` (Ascending)
   - Campo 2: `timestamp` (Descending)
3. Repetir para la misma colección con solo `timestamp` (Descending)

(Firebase también te avisa en la consola del navegador si falta algún índice con un link directo para crearlo)

---

## 3. Actualizar .firebaserc

Abrí `.firebaserc` y reemplazá `TU-PROJECT-ID` con tu Project ID real.

---

## 4. Deploy

```bash
firebase deploy
```

Te da una URL tipo: `https://nexlock-xxxxx.web.app`

---

## 5. Configurar ESP32

En `nexlock_esp32.ino` cambiá:
```cpp
const char* SSID       = "TU_WIFI";
const char* PASSWORD   = "TU_PASSWORD";
const char* PROJECT_ID = "TU_PROJECT_ID";
```

El Project ID es el mismo que usaste antes (ej: `nexlock-24aed`).

---

## Cómo funciona el PIN

1. El usuario crea un PIN desde el panel web (ej: `1234`)
2. El frontend lo hashea con SHA-256 → `03ac674...` y lo guarda en Firestore
3. Cuando el ESP32 recibe el PIN del teclado, lo hashea con el mismo algoritmo
4. Busca en Firestore un usuario cuyo campo `pin` coincida con ese hash
5. Si encuentra → acceso permitido, si no → denegado

El PIN original nunca se guarda ni se transmite.
