// ============================================================================
// NexLock — ESP32 WROOM (Firmware Principal)
// Doble Validación: PIN (Teclado 4x4) + Reconocimiento Facial (ESP32-CAM)
// Conexión segura a Firebase (Firestore REST API + Firebase Auth)
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include "mbedtls/sha256.h"

// Si tenés "secrets.h", se cargan tus credenciales automáticamente.
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #warning "No se encontro secrets.h. Usando valores por defecto de ejemplo."
  #define WIFI_SSID           "TU_WIFI"
  #define WIFI_PASSWORD       "TU_PASSWORD"
  #define FIREBASE_PROJECT_ID "nexlock-24aed"
  #define FIREBASE_API_KEY    "AIzaSyBLiRX-M-1dqJ7VlJ8LlGutS9fjVlr8H3g"
  #define DEVICE_ID           "door_1"
  #define DEVICE_AUTH_EMAIL   "door_1@nexlock.device"
  #define DEVICE_AUTH_PASS    "PasswordDispositivo123!"
#endif

// ── PINES DE HARDWARE (Segun esquematico NexLock) ────────────────────────────
// Teclado 4x4
const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
// Filas: FIL1 -> IO18, FIL2 -> IO33, FIL3 -> IO25, FIL4 -> IO26
byte rowPins[ROWS] = {18, 33, 25, 26};
// Columnas: COL1 -> IO27, COL2 -> IO14, COL3 -> IO13, COL4 -> IO23 (NO usar 22: es I2C SCL)
byte colPins[COLS] = {27, 14, 13, 23};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// Indicadores y actuadores
const int PIN_LED_GREEN = 2;   // LEDV
const int PIN_LED_RED   = 15;  // LEDR
const int PIN_BUZZER    = 32;  // BUZZ

// Driver Motor L298N (Cerradura electromecánica)
const int PIN_MOTOR_ENA = 4;   // ENa
const int PIN_MOTOR_IN1 = 16;  // IN1
const int PIN_MOTOR_IN2 = 17;  // IN2

// Enlace UART con ESP32-CAM
#define CAM_RX 19  // IO19 (RX2) <- Conecta a GPIO1 (TX) del ESP32-CAM
#define CAM_TX 5   // IO5  (TX2) -> Conecta a GPIO3 (RX) del ESP32-CAM
HardwareSerial CamSerial(2);

// ── Variables de Estado ─────────────────────────────────────────────────────
String pinIngresado = "";
String idToken = "";
uint32_t tokenExpiresAt = 0;
uint32_t lastHeartbeat = 0;
String camFwVersion = "desconocida";
bool camOnline = false;

const char* FW_VERSION = "1.1.0";

// ── Estructura de Veredicto Facial ──────────────────────────────────────────
struct FaceVerdict {
  String result;      // "match", "no_match", "no_face", "not_enrolled", "timeout", "error"
  float confidence;   // 0.0 a 100.0 (-1 si no aplica)
};

// ── Prototipos ──────────────────────────────────────────────────────────────
void   conectarWiFi();
bool   firebaseLogin();
String getAuthHeader();
String sha256Hash(const String& input);
bool   buscarUsuarioPorPin(const String& pinHash, String& outName, String& outId, bool& outFaceEnrolled);
FaceVerdict solicitarVerificacionFacial(const String& userId, uint32_t timeoutMs = 15000);
void   guardarLog(const String& result, const String& userId, const String& userName,
                  const String& pinResult, const String& faceResult, float faceConfidence);
void   enviarHeartbeat();
void   pingCamara();
void   abrirCerradura();
void   beepCorto(int frec = 2000, int dur = 100);
void   tonoError();
void   tonoExito();

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[NexLock] Iniciando controlador central...");

  // Configurar Pines
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_MOTOR_ENA, OUTPUT);
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);

  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_MOTOR_ENA, LOW);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);

  // Inicializar UART con ESP32-CAM
  CamSerial.begin(115200, SERIAL_8N1, CAM_RX, CAM_TX);
  Serial.println("[NexLock] UART hacia ESP32-CAM inicializado (RX:19, TX:5)");

  // Conectar a Internet
  conectarWiFi();
  firebaseLogin();

  beepCorto(2400, 150);
  Serial.println("\n=============================================");
  Serial.println("  NexLock Listo: Ingresa PIN y presiona #");
  Serial.println("  Presiona * para borrar.");
  Serial.println("=============================================");
}

// ============================================================================
// LOOP PRINCIPAL
// ============================================================================
void loop() {
  // 1. Mantener WiFi conectado
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  // 2. Procesar mensajes asíncronos del ESP32-CAM (ej: arranque inicial o PONG)
  while (CamSerial.available()) {
    String line = CamSerial.readStringUntil('\n');
    line.trim();
    if (line.startsWith("NL,READY,")) {
      camFwVersion = line.substring(9);
      camOnline = true;
      Serial.println("[ESP32-CAM] Detectado y listo! Firmware: " + camFwVersion);
    }
  }

  // 3. Heartbeat periódico a Firestore (cada 60 segundos)
  if (millis() - lastHeartbeat >= 60000 || lastHeartbeat == 0) {
    lastHeartbeat = millis();
    pingCamara();
    enviarHeartbeat();
  }

  // 4. Lectura de teclado matricial
  char key = keypad.getKey();
  if (!key) return;

  beepCorto(1800, 40);

  if (key == '*') {
    pinIngresado = "";
    Serial.println("\n[Teclado] PIN borrado.");
    digitalWrite(PIN_LED_RED, HIGH);
    delay(100);
    digitalWrite(PIN_LED_RED, LOW);

  } else if (key == '#') {
    if (pinIngresado.length() < 4) {
      Serial.println("\n[Teclado] PIN muy corto (minimo 4 digitos).");
      tonoError();
      pinIngresado = "";
      return;
    }

    Serial.println("\n[Proceso] 1er Factor: Verificando PIN...");
    String pinHash = sha256Hash(pinIngresado);
    pinIngresado = "";

    String userName = "", userId = "";
    bool faceEnrolled = false;
    bool pinValido = buscarUsuarioPorPin(pinHash, userName, userId, faceEnrolled);

    if (!pinValido) {
      Serial.println("[Acceso] DENEGADO: PIN incorrecto.");
      tonoError();
      guardarLog("fail", "", "", "fail", "", -1);
      return;
    }

    Serial.println("[Acceso] PIN correcto para usuario: " + userName + " (ID: " + userId + ")");
    beepCorto(2500, 100);

    // Si el usuario no tiene rostro enrolado en la web, la doble validación no puede completarse
    if (!faceEnrolled) {
      Serial.println("[Acceso] DENEGADO: El usuario no tiene rostro registrado en el sistema.");
      tonoError();
      guardarLog("fail", userId, userName, "ok", "not_enrolled", -1);
      return;
    }

    // 2do Factor: Validación de rostro con el ESP32-CAM
    Serial.println("[Proceso] 2do Factor: Solicitando reconocimiento facial a la camara...");
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_RED, HIGH); // Ambos LEDs titilando indican "mirando a cámara"

    FaceVerdict veredicto = solicitarVerificacionFacial(userId, 15000);

    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_RED, LOW);

    if (veredicto.result == "match") {
      Serial.printf("[Acceso] PERMITIDO: Rostro validado con %.1f%% de coincidencia!\n", veredicto.confidence);
      tonoExito();
      abrirCerradura();
      guardarLog("success", userId, userName, "ok", "match", veredicto.confidence);

    } else {
      Serial.println("[Acceso] DENEGADO: Fallo reconocimiento facial -> " + veredicto.result);
      tonoError();
      guardarLog("fail", userId, userName, "ok", veredicto.result, veredicto.confidence);
    }

  } else if (pinIngresado.length() < 8 && (key >= '0' && key <= '9')) {
    pinIngresado += key;
    Serial.print(key);
  }
}

// ============================================================================
// COMUNICACIÓN CON ESP32-CAM (UART PROTOCOLO NL)
// ============================================================================

void pingCamara() {
  while (CamSerial.available()) CamSerial.read(); // limpiar buffer
  CamSerial.println("NL,PING");

  uint32_t t0 = millis();
  camOnline = false;
  while (millis() - t0 < 1500) {
    if (CamSerial.available()) {
      String line = CamSerial.readStringUntil('\n');
      line.trim();
      if (line.startsWith("NL,PONG,")) {
        camFwVersion = line.substring(8);
        camOnline = true;
        break;
      }
    }
    delay(10);
  }
}

FaceVerdict solicitarVerificacionFacial(const String& userId, uint32_t timeoutMs) {
  // Limpiar posibles bytes residuales en el puerto serie
  while (CamSerial.available()) CamSerial.read();

  // Enviar comando: NL,VERIFY,<userId>
  CamSerial.print("NL,VERIFY,");
  CamSerial.println(userId);

  uint32_t t0 = millis();
  String buffer = "";

  while (millis() - t0 < timeoutMs) {
    while (CamSerial.available()) {
      char c = CamSerial.read();
      if (c == '\r') continue;
      if (c == '\n') {
        buffer.trim();
        if (buffer.startsWith("NL,BUSY,")) {
          Serial.println("[ESP32-CAM] Procesando imagen y consultando Face++...");
        } else if (buffer.startsWith("NL,RESULT,")) {
          // Formato esperado: NL,RESULT,<userId>,<result>,<confidence>
          int idx1 = buffer.indexOf(',', 10);
          int idx2 = buffer.indexOf(',', idx1 + 1);
          if (idx1 > 0 && idx2 > 0) {
            String resUserId = buffer.substring(10, idx1);
            String resVerdict = buffer.substring(idx1 + 1, idx2);
            float  resConf   = buffer.substring(idx2 + 1).toFloat();
            if (resUserId == userId) {
              return { resVerdict, resConf };
            }
          }
        }
        buffer = "";
      } else {
        if (buffer.length() < 128) buffer += c;
      }
    }
    delay(5);
  }

  Serial.println("[ESP32-CAM] Timeout esperando respuesta de la camara.");
  return { "timeout", -1.0 };
}

// ============================================================================
// ACCIONES FÍSICAS (CERRADURA, LEDS, BUZZER)
// ============================================================================

void abrirCerradura() {
  digitalWrite(PIN_LED_GREEN, HIGH);
  Serial.println("[Actuador] Activando solenoide / motor de cerradura...");
  // Pulso para activar motor en L298N
  digitalWrite(PIN_MOTOR_IN1, HIGH);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  digitalWrite(PIN_MOTOR_ENA, HIGH);

  delay(3500); // 3.5 segundos con la puerta destrabada

  digitalWrite(PIN_MOTOR_ENA, LOW);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  digitalWrite(PIN_LED_GREEN, LOW);
  Serial.println("[Actuador] Cerradura bloqueada nuevamente.");
}

void beepCorto(int frec, int dur) {
  tone(PIN_BUZZER, frec, dur);
}

void tonoError() {
  digitalWrite(PIN_LED_RED, HIGH);
  tone(PIN_BUZZER, 400, 300);
  delay(350);
  tone(PIN_BUZZER, 300, 400);
  delay(400);
  digitalWrite(PIN_LED_RED, LOW);
}

void tonoExito() {
  tone(PIN_BUZZER, 1800, 100);
  delay(120);
  tone(PIN_BUZZER, 2400, 150);
  delay(160);
  tone(PIN_BUZZER, 3000, 250);
}

// ============================================================================
// CONECTIVIDAD & FIREBASE (REST API)
// ============================================================================

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[WiFi] Conectando a ");
  Serial.print(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 25) {
    delay(400);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Conectado exitosamente. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Error de conexion.");
  }
}

// Login con cuenta de dispositivo para obtener ID Token de Firestore
bool firebaseLogin() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure(); // Para simplificar handshake SSL en ESP32

  HTTPClient http;
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
  url += FIREBASE_API_KEY;

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> reqDoc;
  reqDoc["email"] = DEVICE_AUTH_EMAIL;
  reqDoc["password"] = DEVICE_AUTH_PASS;
  reqDoc["returnSecureToken"] = true;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  int code = http.POST(reqBody);
  if (code != 200) {
    Serial.println("[Auth] Error autenticando dispositivo en Firebase: " + String(code));
    http.end();
    return false;
  }

  String resBody = http.getString();
  http.end();

  DynamicJsonDocument resDoc(2048);
  deserializeJson(resDoc, resBody);

  idToken = resDoc["idToken"].as<String>();
  int expiresIn = resDoc["expiresIn"].as<String>().toInt();
  tokenExpiresAt = millis() + ((expiresIn > 300 ? expiresIn - 300 : expiresIn) * 1000UL);

  Serial.println("[Auth] Dispositivo autenticado con Firebase Auth ✓");
  return true;
}

String getAuthHeader() {
  if (idToken.length() == 0 || (int32_t)(millis() - tokenExpiresAt) >= 0) {
    firebaseLogin();
  }
  return idToken.length() > 0 ? ("Bearer " + idToken) : "";
}

// SHA-256 idéntico al SubtleCrypto del navegador
String sha256Hash(const String& input) {
  byte hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  mbedtls_sha256_update(&ctx, (const unsigned char*)input.c_str(), input.length());
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);

  String result = "";
  for (int i = 0; i < 32; i++) {
    if (hash[i] < 16) result += "0";
    result += String(hash[i], HEX);
  }
  return result;
}

// Búsqueda de usuario en Firestore por hash de PIN
bool buscarUsuarioPorPin(const String& pinHash, String& outName, String& outId, bool& outFaceEnrolled) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += FIREBASE_PROJECT_ID;
  url += "/databases/(default)/documents:runQuery";

  String body = "{\"structuredQuery\":{"
    "\"from\":[{\"collectionId\":\"users\"}],"
    "\"select\":{\"fields\":[{\"fieldPath\":\"name\"},{\"fieldPath\":\"faceEnrolled\"}]},"
    "\"where\":{\"fieldFilter\":{"
      "\"field\":{\"fieldPath\":\"pin\"},"
      "\"op\":\"EQUAL\","
      "\"value\":{\"stringValue\":\"" + pinHash + "\"}}},"
    "\"limit\":1}}";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  String authH = getAuthHeader();
  if (authH.length() > 0) http.addHeader("Authorization", authH);

  int code = http.POST(body);
  if (code != 200) {
    Serial.println("[Firestore] Error runQuery: " + String(code));
    http.end();
    return false;
  }

  String response = http.getString();
  http.end();

  DynamicJsonDocument doc(3072);
  DeserializationError err = deserializeJson(doc, response);
  if (err || doc.size() == 0 || doc[0]["document"].isNull()) {
    return false;
  }

  JsonObject fields = doc[0]["document"]["fields"];
  outName = fields["name"]["stringValue"].as<String>();
  outFaceEnrolled = fields["faceEnrolled"]["booleanValue"].as<bool>();

  String fullPath = doc[0]["document"]["name"].as<String>();
  outId = fullPath.substring(fullPath.lastIndexOf('/') + 1);

  return outName.length() > 0;
}

// Generador de ID aleatorio para documentos de Firestore
String randomDocId() {
  const char chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  String id = "";
  for (int i = 0; i < 20; i++) {
    id += chars[esp_random() % (sizeof(chars) - 1)];
  }
  return id;
}

// Guardado de Log con Timestamp del Servidor (REQUEST_TIME)
void guardarLog(const String& result, const String& userId, const String& userName,
                const String& pinResult, const String& faceResult, float faceConfidence) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += FIREBASE_PROJECT_ID;
  url += "/databases/(default)/documents:commit";

  DynamicJsonDocument doc(2048);
  JsonObject write = doc["writes"].createNestedArray().add<JsonObject>();
  write["update"]["name"] = String("projects/") + FIREBASE_PROJECT_ID +
                            "/databases/(default)/documents/logs/" + randomDocId();

  JsonObject fields = write["update"].createNestedObject("fields");
  fields["result"]["stringValue"]     = result;
  fields["device_id"]["stringValue"]  = DEVICE_ID;
  fields["userId"]["stringValue"]     = userId;
  fields["userName"]["stringValue"]   = userName;
  fields["method"]["stringValue"]     = "pin+face";
  fields["pinResult"]["stringValue"]  = pinResult;
  fields["faceResult"]["stringValue"] = faceResult;

  if (faceConfidence >= 0.0) {
    fields["faceConfidence"]["doubleValue"] = faceConfidence;
  } else {
    fields["faceConfidence"]["nullValue"] = nullptr;
  }

  JsonObject transform = write.createNestedArray("updateTransforms").createNestedObject();
  transform["fieldPath"] = "timestamp";
  transform["setToServerValue"] = "REQUEST_TIME";

  String body;
  serializeJson(doc, body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  String authH = getAuthHeader();
  if (authH.length() > 0) http.addHeader("Authorization", authH);

  int code = http.POST(body);
  if (code == 200) {
    Serial.println("[Firestore] Log guardado con timestamp de servidor ✓");
  } else {
    Serial.println("[Firestore] Error guardando log: " + String(code));
  }
  http.end();
}

// Envío de estado y presencia periódica a Firestore
void enviarHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += FIREBASE_PROJECT_ID;
  url += "/databases/(default)/documents:commit";

  DynamicJsonDocument doc(2048);
  JsonObject write = doc["writes"].createNestedArray().add<JsonObject>();
  write["update"]["name"] = String("projects/") + FIREBASE_PROJECT_ID +
                            "/databases/(default)/documents/devices/" + DEVICE_ID;

  JsonObject fields = write["update"].createNestedObject("fields");
  fields["name"]["stringValue"]      = "Puerta Principal";
  fields["ip"]["stringValue"]        = WiFi.localIP().toString();
  fields["rssi"]["integerValue"]     = String(WiFi.RSSI());
  fields["fw"]["stringValue"]        = FW_VERSION;
  fields["camStatus"]["stringValue"] = camOnline ? "ok" : "no_response";
  fields["camFw"]["stringValue"]     = camFwVersion;

  JsonArray mask = write.createNestedObject("updateMask").createNestedArray("fieldPaths");
  mask.add("name");
  mask.add("ip");
  mask.add("rssi");
  mask.add("fw");
  mask.add("camStatus");
  mask.add("camFw");

  JsonObject transform = write.createNestedArray("updateTransforms").createNestedObject();
  transform["fieldPath"] = "lastSeen";
  transform["setToServerValue"] = "REQUEST_TIME";

  String body;
  serializeJson(doc, body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  String authH = getAuthHeader();
  if (authH.length() > 0) http.addHeader("Authorization", authH);

  int code = http.POST(body);
  if (code == 200) {
    Serial.println("[Heartbeat] Estado del dispositivo y camara sincronizado ✓");
  } else {
    Serial.println("[Heartbeat] Error actualizando heartbeat: " + String(code));
  }
  http.end();
}
