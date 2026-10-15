// ============================================================================
// NexLock — ESP32-CAM (Módulo Biométrico de Reconocimiento Facial)
// Modelo de placa: AI-Thinker ESP32-CAM (Sensor OV2640)
// Conexión UART al ESP32 central + API Face++ v3 Compare
// ============================================================================

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

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
  #define DEVICE_CAM_AUTH_EMAIL "door_1-cam@nexlock.device"
  #define DEVICE_CAM_AUTH_PASS  "NexLockDevice2026!"
  #define FACEPP_API_KEY      "b4XLQKMe-WwhS2qiQtNTlNn0EehW3nrc"
  #define FACEPP_API_SECRET   "7m3JgGTxeG5-7qjdmo4We9s6_19AZnsg"
  #define FACEPP_SERVER       "https://api-us.faceplusplus.com"
#endif

// Definición de credenciales de la cámara para Auth
#if defined(DEVICE_CAM_AUTH_EMAIL)
  #define CAM_AUTH_EMAIL DEVICE_CAM_AUTH_EMAIL
  #define CAM_AUTH_PASS  DEVICE_CAM_AUTH_PASS
#else
  #define CAM_AUTH_EMAIL "door_1-cam@nexlock.device"
  #define CAM_AUTH_PASS  "NexLockDevice2026!"
#endif

// ── PINES DE CÁMARA (AI-Thinker ESP32-CAM) ──────────────────────────────────
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// Pines auxiliares de la placa
#define PIN_FLASH_LED      4   // Flash de alto brillo
#define PIN_STATUS_LED    33   // LED rojo pequeño trasero (Activo en LOW)

const char* FW_VERSION = "1.0.0";

// ── Variables de autenticación y estado ─────────────────────────────────────
String   idToken = "";
uint32_t tokenExpiresAt = 0;
bool     cameraInitialized = false;

// ── Prototipos ──────────────────────────────────────────────────────────────
void   conectarWiFi();
bool   firebaseLogin();
String getAuthHeader();
bool   iniciarCamara();
void   procesarComandoUART(const String& cmd);
void   verificarUsuarioContraFacePP(const String& userId);
String descargarRostroReferencia(const String& userId);

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  // Desactivar detector de brownout para evitar reinicios por picos de consumo en cables jumper
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  // Puerto Serie (GPIO 1 TX, GPIO 3 RX): enlace bidireccional con el ESP32 central
  Serial.begin(115200);

  pinMode(PIN_FLASH_LED, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);
  digitalWrite(PIN_STATUS_LED, HIGH); // Apagado (activo en LOW)

  // Feedback visual inicial: 2 destellos cortos del LED rojo trasero
  digitalWrite(PIN_STATUS_LED, LOW); delay(80); digitalWrite(PIN_STATUS_LED, HIGH); delay(80);
  digitalWrite(PIN_STATUS_LED, LOW); delay(80); digitalWrite(PIN_STATUS_LED, HIGH);

  Serial.println("[CAM] Iniciando hardware de camara OV2640...");
  cameraInitialized = iniciarCamara();
  if (cameraInitialized) {
    Serial.println("[CAM] Sensor OV2640 inicializado con exito ✓");
  } else {
    Serial.println("[CAM] ERROR CRITICO: Fallo inicializacion del sensor de camara!");
  }

  Serial.println("[CAM] Conectando a red WiFi...");
  conectarWiFi();

  Serial.println("[CAM] Autenticando en Firebase...");
  if (firebaseLogin()) {
    Serial.println("[CAM] Autenticado en Firebase exitosamente ✓");
  } else {
    Serial.println("[CAM] Advertencia: Error en login de Firebase Auth");
  }

  // Avisar al ESP32 central que la cámara está viva y lista
  Serial.print("NL,READY,");
  Serial.println(FW_VERSION);

  // Destello largo: completamente listo para operar
  digitalWrite(PIN_STATUS_LED, LOW);
  delay(400);
  digitalWrite(PIN_STATUS_LED, HIGH);
}

// ============================================================================
// LOOP PRINCIPAL
// ============================================================================
void loop() {
  // Mantener WiFi
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  // Escuchar comandos del ESP32 central
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.startsWith("NL,")) {
      procesarComandoUART(cmd);
    }
  }
}

// ============================================================================
// PROTOCOLO UART (ESP32 <-> ESP32-CAM)
// ============================================================================
void procesarComandoUART(const String& cmd) {
  // 1. Ping / Heartbeat
  if (cmd == "NL,PING") {
    Serial.print("NL,PONG,");
    Serial.println(FW_VERSION);
    return;
  }

  // 2. Solicitud de Verificación: NL,VERIFY,<userId>
  if (cmd.startsWith("NL,VERIFY,")) {
    String userId = cmd.substring(10);
    userId.trim();
    if (userId.length() > 0) {
      // Confirmar recepción al ESP32 inmediatamente
      Serial.print("NL,BUSY,");
      Serial.println(userId);

      verificarUsuarioContraFacePP(userId);
    }
  }
}

// ============================================================================
// FLUJO DE VERIFICACIÓN BIOMÉTRICA CON FACE++
// ============================================================================
void verificarUsuarioContraFacePP(const String& userId) {
  if (!cameraInitialized) {
    Serial.println("[CAM] Error: Camara no inicializada.");
    Serial.printf("NL,RESULT,%s,error,-1.0\n", userId.c_str());
    return;
  }

  // Encender LED trasero de estado mientras dure el proceso
  digitalWrite(PIN_STATUS_LED, LOW);

  // 1. Descargar foto de referencia (JPEG base64) desde Firestore
  Serial.println("[CAM] Descargando rostro de referencia desde Firestore...");
  String refBase64 = descargarRostroReferencia(userId);
  if (refBase64.length() == 0) {
    Serial.println("[CAM] Error: No se encontro rostro de referencia para este usuario");
    digitalWrite(PIN_STATUS_LED, HIGH);
    Serial.printf("NL,RESULT,%s,not_enrolled,-1.0\n", userId.c_str());
    return;
  }
  Serial.printf("[CAM] Rostro de referencia obtenido (%d bytes base64) ✓\n", refBase64.length());

  // 2. Capturar frame actual de la cámara
  Serial.println("[CAM] Capturando imagen del usuario...");
  // Descartar frame viejo del buffer interno
  camera_fb_t* fbOld = esp_camera_fb_get();
  if (fbOld) esp_camera_fb_return(fbOld);

  delay(60);
  camera_fb_t* fb = esp_camera_fb_get();

  if (!fb) {
    Serial.println("[CAM] Error: Fallo al capturar frame de camara");
    digitalWrite(PIN_STATUS_LED, HIGH);
    Serial.printf("NL,RESULT,%s,error,-1.0\n", userId.c_str());
    return;
  }
  Serial.printf("[CAM] Frame capturado con exito (%d bytes JPEG) ✓\n", fb->len);

  // 3. Preparar petición multipart/form-data a Face++ Compare
  Serial.println("[CAM] Preparando paquete Face++ Compare...");
  String boundary = "----NexLock" + String(esp_random(), HEX);

  String head = "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"api_key\"\r\n\r\n" + String(FACEPP_API_KEY) + "\r\n"
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"api_secret\"\r\n\r\n" + String(FACEPP_API_SECRET) + "\r\n"
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"image_base64_2\"\r\n\r\n";

  String mid = "\r\n--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"image_file1\"; filename=\"cam.jpg\"\r\n"
    "Content-Type: image/jpeg\r\n\r\n";

  String tail = "\r\n--" + boundary + "--\r\n";

  size_t totalLen = head.length() + refBase64.length() + mid.length() + fb->len + tail.length();

  // Asignar memoria en PSRAM (o RAM interna si PSRAM no está disponible)
  uint8_t* reqBody = (uint8_t*)ps_malloc(totalLen);
  if (!reqBody) {
    reqBody = (uint8_t*)malloc(totalLen);
  }
  if (!reqBody) {
    Serial.println("[CAM] Error: Memoria insuficiente para armar multipart");
    esp_camera_fb_return(fb);
    digitalWrite(PIN_STATUS_LED, HIGH);
    Serial.printf("NL,RESULT,%s,error,-1.0\n", userId.c_str());
    return;
  }

  size_t offset = 0;
  memcpy(reqBody + offset, head.c_str(), head.length()); offset += head.length();
  memcpy(reqBody + offset, refBase64.c_str(), refBase64.length()); offset += refBase64.length();
  memcpy(reqBody + offset, mid.c_str(), mid.length()); offset += mid.length();
  memcpy(reqBody + offset, fb->buf, fb->len); offset += fb->len;
  memcpy(reqBody + offset, tail.c_str(), tail.length());

  // Liberar el frame buffer de la cámara
  esp_camera_fb_return(fb);

  // 4. Enviar request a Face++
  Serial.println("[CAM] Consultando API Face++ Compare...");
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String faceUrl = String(FACEPP_SERVER) + "/facepp/v3/compare";
  http.begin(client, faceUrl);
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
  http.setTimeout(12000);

  int httpCode = http.POST(reqBody, totalLen);
  free(reqBody);

  digitalWrite(PIN_STATUS_LED, HIGH); // Apagar LED

  if (httpCode != 200) {
    Serial.printf("[CAM] Error Face++ HTTP %d\n", httpCode);
    String errDetail = http.getString();
    Serial.println("[CAM] Detalle: " + errDetail);
    http.end();
    Serial.printf("NL,RESULT,%s,error,-1.0\n", userId.c_str());
    return;
  }

  String response = http.getString();
  http.end();

  // 5. Parsear respuesta JSON de Face++
  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.println("[CAM] Error deserializando JSON de Face++");
    Serial.printf("NL,RESULT,%s,error,-1.0\n", userId.c_str());
    return;
  }

  if (doc.containsKey("error_message")) {
    String errMsg = doc["error_message"].as<String>();
    Serial.println("[CAM] Face++ respondio con error: " + errMsg);
    Serial.printf("NL,RESULT,%s,error,-1.0\n", userId.c_str());
    return;
  }

  // Si no se detectó rostro en alguna de las dos imágenes:
  if (!doc.containsKey("confidence")) {
    Serial.println("[CAM] No se detecto un rostro claro frente a la camara");
    Serial.printf("NL,RESULT,%s,no_face,-1.0\n", userId.c_str());
    return;
  }

  float confidence = doc["confidence"].as<float>();
  // Umbral de seguridad 1e-4 (falso positivo < 0.01%)
  float threshold = doc["thresholds"]["1e-4"] | 65.0f;

  Serial.printf("[CAM] Face++: Confianza = %.1f%% (Umbral minimo = %.1f%%)\n", confidence, threshold);

  bool coincide = (confidence >= threshold);
  String veredicto = coincide ? "match" : "no_match";

  // Enviar veredicto al ESP32: NL,RESULT,<userId>,<match|no_match>,<confidence>
  Serial.printf("NL,RESULT,%s,%s,%.2f\n", userId.c_str(), veredicto.c_str(), confidence);
}

// Descarga la imagen en base64 de Firestore: faces/{userId}
String descargarRostroReferencia(const String& userId) {
  if (WiFi.status() != WL_CONNECTED) return "";

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += FIREBASE_PROJECT_ID;
  url += "/databases/(default)/documents/faces/";
  url += userId;
  url += "?mask.fieldPaths=image";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  String authH = getAuthHeader();
  if (authH.length() > 0) http.addHeader("Authorization", authH);

  int code = http.GET();
  if (code != 200) {
    http.end();
    return "";
  }

  String res = http.getString();
  http.end();

  // Extracción robusta de stringValue sin importar espacios
  int keyIdx = res.indexOf("\"stringValue\"");
  if (keyIdx < 0) return "";

  int colonIdx = res.indexOf(':', keyIdx + 13);
  if (colonIdx < 0) return "";

  int startQuote = res.indexOf('"', colonIdx + 1);
  if (startQuote < 0) return "";
  startQuote++; // Posición inicial del base64

  int endQuote = res.indexOf('"', startQuote);
  if (endQuote < 0) return "";

  return res.substring(startQuote, endQuote);
}

// ============================================================================
// CONFIGURACIÓN DE HARDWARE & INICIALIZACIÓN DE CÁMARA
// ============================================================================
bool iniciarCamara() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Si cuenta con PSRAM (AI-Thinker estándar)
  if (psramFound()) {
    config.frame_size   = FRAMESIZE_VGA; // 640x480 (óptimo para Face++)
    config.jpeg_quality = 12;
    config.fb_count     = 2;
  } else {
    config.frame_size   = FRAMESIZE_QVGA; // 320x240
    config.jpeg_quality = 14;
    config.fb_count     = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  return (err == ESP_OK);
}

// ============================================================================
// CONECTIVIDAD & FIREBASE
// ============================================================================
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[CAM] Conectando a red: ");
  Serial.println(WIFI_SSID);

  // Modo estacion y potencia RF moderada (11dBm) para evitar caidas de tension en cables
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_11dBm);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(400);
    intentos++;
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[CAM] WiFi Conectado! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[CAM] Error de conexion WiFi!");
  }
}

bool firebaseLogin() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
  url += FIREBASE_API_KEY;

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> reqDoc;
  reqDoc["email"] = CAM_AUTH_EMAIL;
  reqDoc["password"] = CAM_AUTH_PASS;
  reqDoc["returnSecureToken"] = true;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  int code = http.POST(reqBody);
  if (code != 200) {
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

  return true;
}

String getAuthHeader() {
  if (idToken.length() == 0 || (int32_t)(millis() - tokenExpiresAt) >= 0) {
    firebaseLogin();
  }
  return idToken.length() > 0 ? ("Bearer " + idToken) : "";
}
