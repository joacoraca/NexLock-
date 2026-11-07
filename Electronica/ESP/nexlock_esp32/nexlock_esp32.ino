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
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Preferences.h>
#include "mbedtls/sha256.h"

// ── REDES WIFI PRECONFIGURADAS (Seleccionables con tecla 'D') ───────────────
struct WiFiRed {
  const char* nombreOled;
  const char* ssid;
  const char* password;
};

const WiFiRed REDES_WIFI[4] = {
  { "Wifi ETRR",       "ETRRAR",    "" },             // Opción 1 (abierta)
  { "Casa (Papa)",     "Racamatos", "Ateyalfa2026" }, // Opción 2
  { "Casa (Mama)",     "Ozzy",      "19312305" },     // Opción 3
  { "Mobile Hotspot",  "Joaco",     "Joaco2008" }     // Opción 4
};

Preferences prefs;
int redSeleccionada = 1; // 1 = Casa (Papá) por defecto (índice 0 a 3)
bool enMenuWiFi = false;

// Si tenés "secrets.h", se cargan tus credenciales automáticamente.
#if __has_include("secrets.h")
  #include "secrets.h"
#elif __has_include("../secrets.h")
  #include "../secrets.h"
#else
  #warning "No se encontro secrets.h. Usando valores por defecto configurados."
  #define WIFI_SSID           "Racamatos"
  #define WIFI_PASSWORD       "Ateyalfa2026"
  #define FIREBASE_PROJECT_ID "nexlock-24aed"
  #define FIREBASE_API_KEY    "AIzaSyBLiRX-M-1dqJ7VlJ8LlGutS9fjVlr8H3g"
  #define DEVICE_ID           "door_1"
  #define DEVICE_AUTH_EMAIL   "door_1@nexlock.device"
  #define DEVICE_AUTH_PASS    "NexLockDevice2026!"
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

// Pantalla OLED 1.30" IIC V2.2 (Controlador SH1106 128x64)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_SDA 21
#define OLED_SCL 22
Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool oledOk = false;

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

const char* FW_VERSION = "1.2.0";

// ── Estructura de Veredicto Facial ──────────────────────────────────────────
struct FaceVerdict {
  String result;      // "match", "no_match", "no_face", "not_enrolled", "timeout", "error"
  float confidence;   // 0.0 a 100.0 (-1 si no aplica)
};

// ── Prototipos ──────────────────────────────────────────────────────────────
void   conectarWiFi();
void   conectarWiFiRed(int indiceRed);
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

// Prototipos UI OLED
void   oledHeader(const char* title);
void   oledMostrarInicio();
void   oledMostrarWiFiOk(const String& ip);
void   oledMostrarEnEspera();
void   oledMostrarVerificandoPin();
void   oledMostrarPidiendoRostro(const String& userName);
void   oledMostrarAccesoPermitido(const String& userName, float conf);
void   oledMostrarAccesoDenegado(const String& motivo);
void   oledMostrarMenuWiFi();

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

  // Inicializar Pantalla OLED 1.30" (Controlador SH1106 en SDA:21, SCL:22)
  delay(250); // Tiempo para estabilizar alimentación del módulo OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (display.begin(0x3C, true)) {
    oledOk = true;
    Serial.println("[OLED] Pantalla SH1106 1.3\" detectada en direccion 0x3C");
  } else if (display.begin(0x3D, true)) {
    oledOk = true;
    Serial.println("[OLED] Pantalla SH1106 1.3\" detectada en direccion 0x3D");
  } else {
    Serial.println("[OLED] Advertencia: No se detecto pantalla SH1106 en 0x3C ni 0x3D.");
  }

  if (oledOk) {
    display.clearDisplay();
    display.setTextColor(SH110X_WHITE);
    oledMostrarInicio();
  }

  // Inicializar UART con ESP32-CAM
  CamSerial.begin(115200, SERIAL_8N1, CAM_RX, CAM_TX);
  Serial.println("[NexLock] UART hacia ESP32-CAM inicializado (RX:19, TX:5)");

  // Cargar red WiFi guardada en memoria no volátil (NVS)
  prefs.begin("nexlock", false);
  redSeleccionada = prefs.getInt("wifi_idx", 1); // 1 = Casa (Papá) por defecto
  if (redSeleccionada < 0 || redSeleccionada > 3) redSeleccionada = 1;

  // Conectar a Internet con la red seleccionada
  conectarWiFiRed(redSeleccionada);
  firebaseLogin();

  if (WiFi.status() == WL_CONNECTED && oledOk) {
    oledMostrarWiFiOk(WiFi.localIP().toString());
    delay(1200);
  }

  // Notificar a la cámara el índice de red actual
  CamSerial.printf("NL,WIFI,%d\n", redSeleccionada + 1);

  // Comprobar estado de la cámara
  pingCamara();
  if (camOnline) {
    Serial.println("[ESP32-CAM] Camara en linea! Firmware: " + camFwVersion);
  } else {
    Serial.println("[ESP32-CAM] Advertencia: La camara aun no responde (verificar alimentacion y cableado RX:19 <-> TX, TX:5 <-> RX, GND <-> GND)");
  }

  beepCorto(2400, 150);
  Serial.println("\n=============================================");
  Serial.println("  NexLock Listo: Ingresa PIN y presiona #");
  Serial.println("  Presiona * para borrar.");
  Serial.println("  Presiona D para cambiar red WiFi.");
  Serial.println("=============================================");

  // Mostrar pantalla de espera lista para recibir PIN
  oledMostrarEnEspera();
}

// ============================================================================
// LOOP PRINCIPAL
// ============================================================================
void loop() {
  // 1. Mantener WiFi conectado (solo fuera del menú)
  if (WiFi.status() != WL_CONNECTED && !enMenuWiFi) {
    conectarWiFiRed(redSeleccionada);
  }

  // 2. Procesar mensajes asíncronos del ESP32-CAM (ej: arranque inicial o PONG)
  while (CamSerial.available()) {
    String line = CamSerial.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (line.startsWith("NL,READY,")) {
        camFwVersion = line.substring(9);
        camOnline = true;
        Serial.println("[ESP32-CAM] Detectado y listo! Firmware: " + camFwVersion);
        CamSerial.printf("NL,WIFI,%d\n", redSeleccionada + 1);
      } else if (line.startsWith("NL,PONG,")) {
        camFwVersion = line.substring(8);
        camOnline = true;
      } else {
        Serial.println("[ESP32-CAM] " + line);
      }
    }
  }

  // 3. Heartbeat periódico a Firestore (cada 60 segundos)
  if (!enMenuWiFi && (millis() - lastHeartbeat >= 60000 || lastHeartbeat == 0)) {
    lastHeartbeat = millis();
    pingCamara();
    enviarHeartbeat();
  }

  // 4. Lectura de teclado matricial
  char key = keypad.getKey();
  if (!key) return;

  beepCorto(1800, 40);

  // --- SUBMENÚ DE SELECCIÓN DE REDES WIFI (Activado con tecla 'D') ---
  if (enMenuWiFi) {
    if (key >= '1' && key <= '4') {
      int idx = key - '1';
      redSeleccionada = idx;
      prefs.putInt("wifi_idx", redSeleccionada);
      Serial.printf("\n[WiFi] Cambiando a Red #%d: %s (%s)\n", idx + 1, REDES_WIFI[idx].nombreOled, REDES_WIFI[idx].ssid);

      // Notificar a la cámara para que se conecte a la misma red
      CamSerial.printf("NL,WIFI,%d\n", idx + 1);

      if (oledOk) {
        display.clearDisplay();
        oledHeader("Cambio de Red");
        display.setCursor(0, 18);
        display.setTextSize(1);
        display.println("Conectando a:");
        display.print("> ");
        display.println(REDES_WIFI[idx].nombreOled);
        display.println("\nPor favor espere...");
        display.display();
      }

      conectarWiFiRed(redSeleccionada);

      if (WiFi.status() == WL_CONNECTED) {
        firebaseLogin();
        if (oledOk) {
          oledMostrarWiFiOk(WiFi.localIP().toString());
          delay(1500);
        }
      } else {
        if (oledOk) {
          display.clearDisplay();
          oledHeader("Error WiFi");
          display.setCursor(0, 22);
          display.setTextSize(1);
          display.println("Fallo conexion con:");
          display.print("> ");
          display.println(REDES_WIFI[idx].ssid);
          display.display();
          tonoError();
          delay(2000);
        }
      }

      enMenuWiFi = false;
      oledMostrarEnEspera();
      return;

    } else if (key == '*' || key == 'D' || key == '#') {
      Serial.println("\n[WiFi] Menu cancelado.");
      enMenuWiFi = false;
      oledMostrarEnEspera();
      return;
    }
    return; // Ignorar otras teclas dentro del menú
  }

  // Tecla 'D' abre el menú de selección de WiFi
  if (key == 'D') {
    pinIngresado = "";
    enMenuWiFi = true;
    Serial.println("\n[Teclado] Tecla 'D' -> Abriendo menu de WiFi...");
    oledMostrarMenuWiFi();
    return;
  }

  if (key == '*') {
    pinIngresado = "";
    Serial.println("\n[Teclado] PIN borrado.");
    oledMostrarEnEspera();
    digitalWrite(PIN_LED_RED, HIGH);
    delay(100);
    digitalWrite(PIN_LED_RED, LOW);

  } else if (key == '#') {
    if (pinIngresado.length() < 4) {
      Serial.println("\n[Teclado] PIN muy corto (minimo 4 digitos).");
      oledMostrarAccesoDenegado("PIN muy corto");
      tonoError();
      pinIngresado = "";
      delay(1500);
      oledMostrarEnEspera();
      return;
    }

    Serial.println("\n[Proceso] 1er Factor: Verificando PIN...");
    oledMostrarVerificandoPin();
    String pinHash = sha256Hash(pinIngresado);
    pinIngresado = "";

    String userName = "", userId = "";
    bool faceEnrolled = false;
    bool pinValido = buscarUsuarioPorPin(pinHash, userName, userId, faceEnrolled);

    if (!pinValido) {
      Serial.println("[Acceso] DENEGADO: PIN incorrecto.");
      oledMostrarAccesoDenegado("PIN incorrecto");
      tonoError();
      guardarLog("fail", "", "", "fail", "", -1);
      delay(2000);
      oledMostrarEnEspera();
      return;
    }

    Serial.println("[Acceso] PIN correcto para usuario: " + userName + " (ID: " + userId + ")");
    beepCorto(2500, 100);

    // Si el usuario no tiene rostro enrolado en la web, la doble validación no puede completarse
    if (!faceEnrolled) {
      Serial.println("[Acceso] DENEGADO: El usuario no tiene rostro registrado en el sistema.");
      oledMostrarAccesoDenegado("Sin rostro reg.");
      tonoError();
      guardarLog("fail", userId, userName, "ok", "not_enrolled", -1);
      delay(2500);
      oledMostrarEnEspera();
      return;
    }

    // 2do Factor: Validación de rostro con el ESP32-CAM
    Serial.println("[Proceso] 2do Factor: Solicitando reconocimiento facial a la camara...");
    oledMostrarPidiendoRostro(userName);
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_RED, HIGH); // Ambos LEDs titilando indican "mirando a cámara"

    FaceVerdict veredicto = solicitarVerificacionFacial(userId, 15000);

    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_RED, LOW);

    if (veredicto.result == "match") {
      Serial.printf("[Acceso] PERMITIDO: Rostro validado con %.1f%% de coincidencia!\n", veredicto.confidence);
      oledMostrarAccesoPermitido(userName, veredicto.confidence);
      tonoExito();
      abrirCerradura();
      guardarLog("success", userId, userName, "ok", "match", veredicto.confidence);
      oledMostrarEnEspera();

    } else {
      Serial.println("[Acceso] DENEGADO: Fallo reconocimiento facial -> " + veredicto.result);
      String motivo = "Rostro invalido";
      if (veredicto.result == "timeout")       motivo = "Camara sin resp.";
      else if (veredicto.result == "no_face")  motivo = "Sin rostro cam.";
      else if (veredicto.result == "no_match") motivo = "No coincide";
      oledMostrarAccesoDenegado(motivo);
      tonoError();
      guardarLog("fail", userId, userName, "ok", veredicto.result, veredicto.confidence);
      delay(2500);
      oledMostrarEnEspera();
    }

  } else if (pinIngresado.length() < 8 && (key >= '0' && key <= '9')) {
    pinIngresado += key;
    Serial.print(key);
    oledMostrarEnEspera();
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
        if (buffer.length() > 0) {
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
          } else {
            Serial.println("[ESP32-CAM] " + buffer);
          }
        }
        buffer = "";
      } else {
        if (buffer.length() < 256) buffer += c;
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

void conectarWiFiRed(int indiceRed) {
  if (indiceRed < 0 || indiceRed > 3) indiceRed = 1;
  const WiFiRed& red = REDES_WIFI[indiceRed];

  Serial.printf("\n[WiFi] Conectando a %s (SSID: %s)...\n", red.nombreOled, red.ssid);
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);

  if (strlen(red.password) == 0) {
    WiFi.begin(red.ssid); // Red abierta (sin contraseña)
  } else {
    WiFi.begin(red.ssid, red.password);
  }

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(350);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Conectado exitosamente. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Advertencia: Error de conexion a " + String(red.ssid));
  }
}

void conectarWiFi() {
  conectarWiFiRed(redSeleccionada);
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
    String resErr = http.getString();
    Serial.println("[Auth] Detalle del servidor: " + resErr);
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

// ============================================================================
// FUNCIONES DE CONTROL DE PANTALLA OLED 1.3" (SH1106 128x64)
// ============================================================================

void oledHeader(const char* title) {
  if (!oledOk) return;
  display.clearDisplay();
  display.fillRect(0, 0, SCREEN_WIDTH, 12, SH110X_WHITE);
  display.setTextColor(SH110X_BLACK, SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(4, 2);
  display.print(title);
  display.setTextColor(SH110X_WHITE);
}

void oledMostrarInicio() {
  if (!oledOk) return;
  oledHeader("NexLock System");
  display.setCursor(0, 20);
  display.setTextSize(1);
  display.println("Iniciando...");
  display.println("Conectando WiFi...");
  display.display();
}

void oledMostrarWiFiOk(const String& ip) {
  if (!oledOk) return;
  oledHeader("NexLock Conectado");
  display.setCursor(0, 18);
  display.setTextSize(1);
  display.println("WiFi: Conectado OK");
  display.print("IP: ");
  display.println(ip);
  display.println("Firebase: Listo");
  display.display();
}

void oledMostrarEnEspera() {
  if (!oledOk) return;
  oledHeader("NexLock 2FA Guard");

  display.setCursor(0, 18);
  display.setTextSize(1);
  display.print("Ingrese PIN:");

  // Asteriscos grandes centrados
  display.setCursor(16, 32);
  display.setTextSize(2);
  if (pinIngresado.length() == 0) {
    display.print("[    ]");
  } else {
    String masked = "";
    for (size_t i = 0; i < pinIngresado.length(); i++) masked += "*";
    display.print(masked);
  }

  // Guía en pie de pantalla
  display.setTextSize(1);
  display.setCursor(0, 54);
  display.print("*Clr  #Ok  [D]WiFi");
  display.display();
}

void oledMostrarVerificandoPin() {
  if (!oledOk) return;
  oledHeader("1er Factor: PIN");
  display.setCursor(0, 22);
  display.setTextSize(1);
  display.println("Verificando PIN...");
  display.println("Consultando Firestore...");
  display.display();
}

void oledMostrarPidiendoRostro(const String& userName) {
  if (!oledOk) return;
  oledHeader("2do Factor: ROSTRO");
  display.setCursor(0, 18);
  display.setTextSize(1);
  display.print("Usuario: ");
  display.println(userName);
  display.println("Mire a la camara...");
  display.setCursor(14, 46);
  display.print("[ Reconociendo ]");
  display.display();
}

void oledMostrarAccesoPermitido(const String& userName, float conf) {
  if (!oledOk) return;
  display.clearDisplay();
  display.fillRect(0, 0, SCREEN_WIDTH, 14, SH110X_WHITE);
  display.setTextColor(SH110X_BLACK, SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(14, 3);
  display.print("ACCESO PERMITIDO");
  display.setTextColor(SH110X_WHITE);

  display.setCursor(0, 22);
  display.setTextSize(1);
  display.print("Bienvenido:");
  display.setCursor(0, 34);
  display.println(userName);

  display.setCursor(0, 50);
  display.print("Puerta abierta...");
  if (conf >= 0) {
    display.setCursor(84, 50);
    display.print(String((int)conf) + "%");
  }
  display.display();
}

void oledMostrarAccesoDenegado(const String& motivo) {
  if (!oledOk) return;
  display.clearDisplay();
  display.fillRect(0, 0, SCREEN_WIDTH, 14, SH110X_WHITE);
  display.setTextColor(SH110X_BLACK, SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(18, 3);
  display.print("ACCESO DENEGADO");
  display.setTextColor(SH110X_WHITE);

  display.setCursor(0, 24);
  display.setTextSize(1);
  display.println("Motivo:");
  display.setCursor(0, 36);
  display.println(motivo);
  display.setCursor(0, 52);
  display.println("Reintente de nuevo");
  display.display();
}

void oledMostrarMenuWiFi() {
  if (!oledOk) return;
  display.clearDisplay();
  oledHeader("Elegir Red WiFi");

  display.setTextSize(1);
  const int yPositions[4] = {15, 25, 35, 45};
  for (int i = 0; i < 4; i++) {
    display.setCursor(0, yPositions[i]);
    if (i == redSeleccionada) {
      display.print(">");
    } else {
      display.print(" ");
    }
    display.print(String(i + 1) + ":" + REDES_WIFI[i].nombreOled);
  }

  display.setCursor(14, 56);
  display.print("[*] Cancelar");
  display.display();
}
