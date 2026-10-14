# NexLock — Integración PIN + Rostro (Web ↔ ESP32 ↔ ESP32-CAM)

Este documento es el **contrato** entre la página (Firebase) y el firmware.
La web ya está lista: si el ESP32 y el ESP32-CAM respetan lo de acá, todo encaja.

---

## 1. Cómo funciona

```mermaid
sequenceDiagram
    autonumber
    participant W as Panel web
    participant F as Firestore
    participant E as ESP32 (teclado)
    participant C as ESP32-CAM
    participant P as Face++

    Note over W,F: Alta (una sola vez por usuario)
    W->>F: users/{id} = nombre, hash del PIN, faceEnrolled
    W->>F: faces/{id} = JPEG 320x320 en base64

    Note over E,P: Acceso (cada vez)
    E->>E: Usuario tipea PIN + '#', SHA-256
    E->>F: runQuery users where pin == hash
    F-->>E: userId, name, faceEnrolled
    E->>C: UART "NL,VERIFY,userId"
    C->>F: GET faces/userId (foto de referencia)
    C->>C: Saca foto
    C->>P: compare(foto, referencia)
    P-->>C: confidence + thresholds
    C-->>E: UART "NL,RESULT,userId,match,92.4"
    E->>E: Abre la cerradura solo si PIN OK y rostro = match
    E->>F: logs (pinResult, faceResult, faceConfidence, timestamp)
    F-->>W: El dashboard se actualiza en vivo
```

**Validación doble:** el PIN identifica al usuario y el rostro confirma que es esa persona.
Si cualquiera de las dos falla, la puerta no se abre.

---

## 2. Modelo de datos en Firestore

### `users/{userId}`: lo escribe la web y lo lee el ESP32
| Campo | Tipo | Descripción |
|---|---|---|
| `name` | string | Nombre visible |
| `pin` | string | SHA-256 en hex (64 caracteres) del PIN. **Único** (la web no deja repetirlo) |
| `role` | string | `"user"` o `"admin"` |
| `faceEnrolled` | boolean | `true` si tiene rostro cargado en `faces/{userId}` |
| `faceUpdatedAt` | timestamp | Última vez que se actualizó el rostro |
| `createdAt` | timestamp | |

### `faces/{userId}`: lo escribe la web y lo lee el ESP32-CAM
| Campo | Tipo | Descripción |
|---|---|---|
| `image` | string | **JPEG en base64, sin el prefijo `data:`**. Cuadrado de 320x320, recortado alrededor de la cara (~25-40 KB) |
| `mime` | string | `"image/jpeg"` |
| `width`, `height` | number | 320 |
| `detectorScore` | number | Confianza del detector del navegador (0-1) |
| `updatedAt` | timestamp | |
| `updatedBy` | string | Email del admin que lo cargó |

> [!NOTE]
> La imagen está en un documento **aparte** del usuario a propósito: así la consulta del ESP32 a `users` sigue siendo chica (no supera el `DynamicJsonDocument(4096)`).

### `logs/{autoId}`: lo escribe el ESP32 y lo lee la web
| Campo | Tipo | Valores |
|---|---|---|
| `result` | string | `"success"` \| `"fail"` |
| `device_id` | string | ej. `"door_1"` |
| `userId` | string | `""` si el PIN no existe |
| `userName` | string | `""` si el PIN no existe |
| `method` | string | `"pin+face"` |
| `pinResult` | string | `"ok"` \| `"fail"` |
| `faceResult` | string | `"match"` \| `"no_match"` \| `"no_face"` \| `"not_enrolled"` \| `"timeout"` \| `"error"` \| `""` (no se llegó a probar) |
| `faceConfidence` | number \| null | 0-100 (lo que devuelve Face++) |
| `timestamp` | timestamp | **Obligatorio.** Si falta, el log no aparece en el dashboard (la consulta ordena por este campo) |

### `devices/{DEVICE_ID}`: heartbeat del ESP32 (tarjeta "Dispositivos" del dashboard)
| Campo | Tipo | Descripción |
|---|---|---|
| `name` | string | ej. `"Puerta principal"` |
| `lastSeen` | timestamp | Hora del servidor (online si es de hace < 3 min) |
| `ip` | string | IP local |
| `rssi` | integer | Señal WiFi en dBm |
| `fw` | string | Versión del firmware del ESP32 |
| `camStatus` | string | `"ok"` \| `"no_response"` \| `"error"` (resultado del `PING` por UART) |
| `camFw` | string | Versión del firmware del ESP32-CAM (viene en el `PONG`) |

---

## 3. Autenticación de los dispositivos

Las reglas (`firestore.rules`) **no dejan leer `users` ni `faces` sin login**: los hashes de PIN y las fotos son datos sensibles.
Cada placa entra con una cuenta de Firebase Auth cuyo email termina en **`@nexlock.device`**:

1. Firebase Console → **Authentication → Usuarios → Agregar usuario**
   - `door_1@nexlock.device` (ESP32)
   - `door_1-cam@nexlock.device` (ESP32-CAM)
2. Firebase Console → **Authentication → Configuración → Acciones del usuario** → **desactivar "Habilitar creación (registro)"** (si no, cualquiera con la apiKey puede crearse una cuenta).

En el firmware, con la cuenta se pide un `idToken`, que dura 1 hora, y se manda en cada request a Firestore:

```cpp
// secrets.h  (agregalo al .gitignore, NO lo subas al repo)
#define WIFI_SSID      "..."
#define WIFI_PASS      "..."
#define FB_API_KEY     "AIzaSyBLiRX-M-1dqJ7VlJ8LlGutS9fjVlr8H3g"   // la misma del app.js (es pública)
#define DEVICE_EMAIL   "door_1@nexlock.device"
#define DEVICE_PASS    "..."
// Solo en el ESP32-CAM:
#define FACEPP_KEY     "..."
#define FACEPP_SECRET  "..."
```

```cpp
String   idToken;
uint32_t tokenExpiresAt = 0;

bool firebaseLogin() {
  WiFiClientSecure client; client.setInsecure();   // ver sección 7 (certificados)
  HTTPClient http;
  http.begin(client, String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FB_API_KEY);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> req;
  req["email"] = DEVICE_EMAIL; req["password"] = DEVICE_PASS; req["returnSecureToken"] = true;
  String body; serializeJson(req, body);

  int code = http.POST(body);
  if (code != 200) { http.end(); return false; }

  StaticJsonDocument<64> filter; filter["idToken"] = true; filter["expiresIn"] = true;
  DynamicJsonDocument res(3072);
  deserializeJson(res, http.getStream(), DeserializationOption::Filter(filter));
  http.end();

  idToken = res["idToken"].as<String>();
  tokenExpiresAt = millis() + (res["expiresIn"].as<String>().toInt() - 300) * 1000UL; // renueva 5 min antes
  return idToken.length() > 0;
}

String authHeader() {
  if (idToken.isEmpty() || (int32_t)(millis() - tokenExpiresAt) >= 0) firebaseLogin();
  return "Bearer " + idToken;
}
// En cada request a Firestore:  http.addHeader("Authorization", authHeader());
```

---

## 4. Protocolo UART ESP32 ↔ ESP32-CAM

Según el esquemático:

| ESP32 | Red | ESP32-CAM |
|---|---|---|
| IO19 (RX2) | `GPIO1CAM` | GPIO1 (U0TXD) |
| IO5 (TX2) | `GPIO3CAM` | GPIO3 (U0RXD) |
| GND | GND | GND |

- **115200 baudios, 8N1**, líneas de texto terminadas en `\n`.
- Todas las líneas válidas empiezan con **`NL,`**. Cualquier otra cosa (mensajes de arranque del ROM del CAM, basura) se ignora.
- `userId` es el ID de Firestore (20 caracteres alfanuméricos, no tiene comas).

| Dirección | Mensaje | Significado |
|---|---|---|
| CAM → ESP32 | `NL,READY,<fw>` | El CAM arrancó, tiene WiFi y la cámara funciona |
| ESP32 → CAM | `NL,PING` | ¿Estás vivo? (cada 60 s, para el heartbeat) |
| CAM → ESP32 | `NL,PONG,<fw>` | Respuesta al ping |
| ESP32 → CAM | `NL,VERIFY,<userId>` | Verificá que la persona frente a la cámara sea `<userId>` |
| CAM → ESP32 | `NL,BUSY,<userId>` | (opcional) Recibido, procesando. Sirve para mostrar "Mirá a la cámara" en el OLED |
| CAM → ESP32 | `NL,RESULT,<userId>,<faceResult>,<confidence>` | Resultado final. `faceResult` usa **los mismos valores que `logs.faceResult`**. `confidence` es `-1` si no aplica |

Ejemplos:
```
NL,VERIFY,Xb3kQ9pLmZ2aT7uVw1Yc
NL,RESULT,Xb3kQ9pLmZ2aT7uVw1Yc,match,92.41
NL,RESULT,Xb3kQ9pLmZ2aT7uVw1Yc,no_match,41.08
NL,RESULT,Xb3kQ9pLmZ2aT7uVw1Yc,no_face,-1
NL,RESULT,Xb3kQ9pLmZ2aT7uVw1Yc,not_enrolled,-1
NL,RESULT,Xb3kQ9pLmZ2aT7uVw1Yc,error,-1
```
Si el ESP32 no recibe `RESULT` en **15 s**, registra `faceResult = "timeout"` y deniega.

> [!WARNING]
> GPIO1/GPIO3 del ESP32-CAM son **el mismo UART que se usa para programarlo**:
> - Desconectá IO19/IO5 del ESP32 mientras flasheás el CAM.
> - En el firmware del CAM **no uses `Serial.print` para debug**: todo lo que imprimas le llega al ESP32. Si necesitás debug, hacé que empiece con `#` (el ESP32 lo ignora porque no empieza con `NL,`).

---

## 5. ESP32 (teclado): qué hay que agregar

### 5.1 UART hacia el CAM
```cpp
HardwareSerial CamSerial(2);
#define CAM_RX 19   // <- GPIO1 (TX) del ESP32-CAM
#define CAM_TX 5    // -> GPIO3 (RX) del ESP32-CAM

void setup() {
  // ...
  CamSerial.begin(115200, SERIAL_8N1, CAM_RX, CAM_TX);
}
```

### 5.2 Buscar al usuario (traer solo los campos necesarios)
Agregá `select` y `limit` al `runQuery` que ya tenés, y leé `faceEnrolled`:
```cpp
String body =
  "{\"structuredQuery\":{"
    "\"from\":[{\"collectionId\":\"users\"}],"
    "\"select\":{\"fields\":[{\"fieldPath\":\"name\"},{\"fieldPath\":\"faceEnrolled\"}]},"
    "\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"pin\"},\"op\":\"EQUAL\","
      "\"value\":{\"stringValue\":\"" + pinHash + "\"}}},"
    "\"limit\":1}}";
http.addHeader("Authorization", authHeader());
// ...
bool faceEnrolled = doc[0]["document"]["fields"]["faceEnrolled"]["booleanValue"] | false;
```

### 5.3 Pedirle la verificación al CAM
```cpp
struct FaceVerdict { String result; float confidence; };

FaceVerdict verificarRostro(const String& userId, uint32_t timeoutMs = 15000) {
  while (CamSerial.available()) CamSerial.read();          // vaciar buffer
  CamSerial.print("NL,VERIFY,"); CamSerial.println(userId);

  String line; uint32_t t0 = millis();
  while (millis() - t0 < timeoutMs) {
    while (CamSerial.available()) {
      char c = CamSerial.read();
      if (c == '\r') continue;
      if (c != '\n') { if (line.length() < 160) line += c; continue; }

      if (line.startsWith("NL,BUSY,")) {
        // mostrar "Mirá a la cámara" en el OLED
      } else if (line.startsWith("NL,RESULT,")) {
        // NL,RESULT,<userId>,<result>,<confidence>
        int a = line.indexOf(',', 10), b = line.indexOf(',', a + 1);
        if (a > 0 && b > 0 && line.substring(10, a) == userId) {
          return { line.substring(a + 1, b), line.substring(b + 1).toFloat() };
        }
      }
      line = "";
    }
    delay(5);
  }
  return { "timeout", -1 };
}
```

### 5.4 Lógica de acceso
```cpp
// después de tipear PIN + '#'
String pinHash = sha256Hash(pinIngresado);
String userName, userId; bool faceEnrolled = false;

if (!buscarUsuario(pinHash, userName, userId, faceEnrolled)) {
  guardarLog("fail", "", "", "fail", "", -1);                         // PIN incorrecto
} else if (!faceEnrolled) {
  guardarLog("fail", userId, userName, "ok", "not_enrolled", -1);     // falta cargar el rostro en la web
} else {
  FaceVerdict v = verificarRostro(userId);
  bool ok = (v.result == "match");
  if (ok) abrirCerradura();
  guardarLog(ok ? "success" : "fail", userId, userName, "ok", v.result, v.confidence);
}
```

### 5.5 Guardar el log con `timestamp` del servidor
Usamos `:commit` con `REQUEST_TIME` para que Firestore ponga la hora (no hace falta NTP):
```cpp
String randomId() {
  const char* a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  String s; for (int i = 0; i < 20; i++) s += a[esp_random() % 62]; return s;
}

void guardarLog(const String& result, const String& userId, const String& userName,
                const String& pinResult, const String& faceResult, float faceConfidence) {
  DynamicJsonDocument d(2048);
  JsonObject w = d["writes"].createNestedArray().add<JsonObject>();   // ArduinoJson 6.21+
  w["update"]["name"] = String("projects/") + PROJECT_ID + "/databases/(default)/documents/logs/" + randomId();
  JsonObject f = w["update"].createNestedObject("fields");
  f["result"]["stringValue"]     = result;
  f["device_id"]["stringValue"]  = DEVICE_ID;
  f["userId"]["stringValue"]     = userId;
  f["userName"]["stringValue"]   = userName;
  f["method"]["stringValue"]     = "pin+face";
  f["pinResult"]["stringValue"]  = pinResult;
  f["faceResult"]["stringValue"] = faceResult;
  if (faceConfidence >= 0) f["faceConfidence"]["doubleValue"] = faceConfidence;
  else                     f["faceConfidence"]["nullValue"]   = nullptr;
  JsonObject t = w.createNestedArray("updateTransforms").createNestedObject();
  t["fieldPath"] = "timestamp"; t["setToServerValue"] = "REQUEST_TIME";
  w["currentDocument"]["exists"] = false;

  String body; serializeJson(d, body);
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String("https://firestore.googleapis.com/v1/projects/") + PROJECT_ID +
                     "/databases/(default)/documents:commit");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", authHeader());
  int code = http.POST(body);
  Serial.println(code == 200 ? "Log guardado" : "Error log: " + String(code) + " " + http.getString());
  http.end();
}
```

### 5.6 Heartbeat (cada 60 s)
```cpp
// 1) PING al CAM: si responde "NL,PONG,<fw>" en < 2 s -> camStatus = "ok", si no "no_response"
// 2) commit a devices/DEVICE_ID:
{
  "writes": [{
    "update": {
      "name": "projects/nexlock-24aed/databases/(default)/documents/devices/door_1",
      "fields": {
        "name":      {"stringValue": "Puerta principal"},
        "ip":        {"stringValue": "192.168.0.50"},
        "rssi":      {"integerValue": "-61"},
        "fw":        {"stringValue": "1.1.0"},
        "camStatus": {"stringValue": "ok"},
        "camFw":     {"stringValue": "1.0.0"}
      }
    },
    "updateMask": {"fieldPaths": ["name", "ip", "rssi", "fw", "camStatus", "camFw"]},
    "updateTransforms": [{"fieldPath": "lastSeen", "setToServerValue": "REQUEST_TIME"}]
  }]
}
```

---

## 6. ESP32-CAM: flujo sugerido

```
setup():
  Serial.begin(115200)            // UART0 = enlace con el ESP32 (sin prints de debug)
  WiFi + firebaseLogin()          // cuenta door_1-cam@nexlock.device
  esp_camera_init(...)            // AI-Thinker, PIXFORMAT_JPEG, FRAMESIZE_VGA, jpeg_quality 12, fb_count 1, PSRAM
  Serial.println("NL,READY,1.0.0")

loop():
  leer líneas de Serial
  "NL,PING"            -> Serial.println("NL,PONG,1.0.0")
  "NL,VERIFY,<userId>" -> Serial.println("NL,BUSY,<userId>")
                          r = verificar(userId)
                          Serial.printf("NL,RESULT,%s,%s,%.2f\n", userId, r.result, r.confidence)
```

### 6.1 Bajar la foto de referencia
```cpp
// GET con máscara para traer SOLO el campo image
String url = String("https://firestore.googleapis.com/v1/projects/") + PROJECT_ID +
             "/databases/(default)/documents/faces/" + userId + "?mask.fieldPaths=image";
http.addHeader("Authorization", authHeader());
int code = http.GET();
if (code == 404) return {"not_enrolled", -1};
if (code != 200) return {"error", -1};
String json = http.getString();                 // ~40 KB, va a PSRAM
int k = json.indexOf("\"stringValue\": \"");    // Firestore devuelve "stringValue": "<base64>"
if (k < 0) return {"not_enrolled", -1};
k += 16;
String refB64 = json.substring(k, json.indexOf('"', k));
```

### 6.2 Sacar la foto
```cpp
digitalWrite(4, HIGH);                          // flash (opcional, si hay poca luz)
camera_fb_t* fb = esp_camera_fb_get(); esp_camera_fb_return(fb);   // descartar frame viejo
fb = esp_camera_fb_get();
digitalWrite(4, LOW);
if (!fb) return {"error", -1};
```

### 6.3 Comparar con Face++ (multipart, sin pasar la foto a base64)
Endpoint: `POST https://api-us.faceplusplus.com/facepp/v3/compare`
(si tu cuenta es de la versión china, `api-cn.faceplusplus.com`).

```cpp
String bnd  = "----nexlock" + String(esp_random(), HEX);
String head = "--" + bnd + "\r\nContent-Disposition: form-data; name=\"api_key\"\r\n\r\n"    + String(FACEPP_KEY)    + "\r\n"
            + "--" + bnd + "\r\nContent-Disposition: form-data; name=\"api_secret\"\r\n\r\n" + String(FACEPP_SECRET) + "\r\n"
            + "--" + bnd + "\r\nContent-Disposition: form-data; name=\"image_base64_2\"\r\n\r\n";
String mid  = "\r\n--" + bnd + "\r\nContent-Disposition: form-data; name=\"image_file1\"; filename=\"cap.jpg\"\r\n"
              "Content-Type: image/jpeg\r\n\r\n";
String tail = "\r\n--" + bnd + "--\r\n";

size_t len = head.length() + refB64.length() + mid.length() + fb->len + tail.length();
uint8_t* body = (uint8_t*)ps_malloc(len);
size_t p = 0;
memcpy(body + p, head.c_str(),   head.length());   p += head.length();
memcpy(body + p, refB64.c_str(), refB64.length()); p += refB64.length();
memcpy(body + p, mid.c_str(),    mid.length());    p += mid.length();
memcpy(body + p, fb->buf,        fb->len);         p += fb->len;
memcpy(body + p, tail.c_str(),   tail.length());
esp_camera_fb_return(fb);

http.begin(client, "https://api-us.faceplusplus.com/facepp/v3/compare");
http.addHeader("Content-Type", "multipart/form-data; boundary=" + bnd);
int code = http.POST(body, len);
free(body);
String res = http.getString();
```

### 6.4 Interpretar la respuesta
```cpp
DynamicJsonDocument r(4096);
deserializeJson(r, res);
if (r.containsKey("error_message")) {
  // "CONCURRENCY_LIMIT_EXCEEDED" es común con la API key gratuita: reintentá 1 vez después de ~1 s
  return {"error", -1};
}
if (!r.containsKey("confidence")) return {"no_face", -1};     // no encontró cara en alguna imagen

float conf = r["confidence"];
float thr  = r["thresholds"]["1e-4"];   // 1 en 10.000 de falso positivo (usá "1e-5" para ser más estricto)
return { conf >= thr ? "match" : "no_match", conf };
```

---

## 7. Checklist de puesta en marcha

1. **Desplegar reglas e índices** (el workflow de GitHub solo despliega el hosting):
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
2. Crear las cuentas `door_1@nexlock.device` y `door_1-cam@nexlock.device` en Authentication.
3. Desactivar el registro público en Authentication → Configuración.
4. En la web: **Usuarios →** crear un usuario con PIN + **Capturar rostro**.
5. Flashear el ESP32 y el ESP32-CAM con `secrets.h`.
6. En el dashboard deberían aparecer el dispositivo en línea y los intentos con los chips `PIN ✓` / `Rostro ✓ · 92%`.

---

## 8. Cosas a corregir en `nexlock_esp32.ino` actual

| # | Problema | Qué hacer |
|---|---|---|
| 1 | **Las claves de Face++ (`FACE_API_KEY` / `SECRET_FACE_API_KEY`) están subidas a un repo público.** | Regeneralas en la consola de Face++ y movelas a `secrets.h` (en `.gitignore`). Van **solo** en el ESP32-CAM. |
| 2 | Faltan `;` en las líneas 19 y 20 → no compila. | Agregarlos (o sacar esas líneas del ESP32). |
| 3 | El certificado `GOOGLE_ROOT_CA` está incompleto o corrupto (es muy corto y tiene texto como `asdfg`) → la conexión TLS falla. | Para probar: `client.setInsecure()`. Después pegá el PEM real de GTS Root R1: <https://pki.goog/repo/certs/gtsr1.pem>. |
| 4 | El log no manda `timestamp` → **no aparece en el dashboard** (la consulta ordena por `timestamp`). | Usar `guardarLog` de la sección 5.5. |
| 5 | Lee `users` sin autenticarse → Firestore responde **403** (ya pasaba con las reglas anteriores). | Login de dispositivo (sección 3). |
| 6 | Teclado: `colPins` usa **GPIO22** para COL4, pero en el esquemático COL4 es **IO23** y GPIO22 es `SCLOLED`. | Cambiar a `{27, 14, 13, 23}`. |
