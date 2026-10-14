
// NexLock — ESP32 WROOM
// Validación de PIN contra Firestore
// SHA-256 con mbedtls (nativo del ESP32)

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include "mbedtls/sha256.h"

//  Configuración 
const char* SSID        = "TU_WIFI";
const char* PASSWORD    = "TU_PASSWORD";
const char* PROJECT_ID  = "nexlock-24aed";
const char* DEVICE_ID   = "door_1";
//FACE++ CONFIGURACION Todavia no esta aplicado
const char* FACE_API_KEY = "b4XLQKMe-WwhS2qiQtNTlNn0EehW3nrc"
const char* SECRET_FACE_API_KEY = "7m3JgGTxeG5-7qjdmo4We9s6_19AZnsg"

//  Certificado raíz de Google (válido para Firestore) ─
// Google Trust Services — GTS Root R1
const char* GOOGLE_ROOT_CA = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw\n" \
"CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU\n" \
"MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw\n" \
"MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp\n" \
"Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA\n" \
"A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo\n" \
"27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7\n" \
"wCl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUj\n" \
"wTcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUTXlv1+5\n" \
"R6RYc9YaWtrasdfgFGD6Yx0ufRVGGeZ2uy4y7Wkxkx7QEzCLpOuDB4r8CtqH8KI\n" \
"ma9RmPQMTTyMxz78j4GGKB3fKMzRqgIKADxSEMlEM9M1BqCDjRjeAfBdBrjK5Xr\n" \
"hVFqSBkJhNMbPJBGWKKFnVOhThiUNnN1MRSSSbkTnL7E3j0MXtNit4jAMk2QIMGM\n" \
"icp5DXB4GHM9QIDAQAB\n" \
"-----END CERTIFICATE-----\n";

// Teclado 4x4 
const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {18, 33, 25, 26};
byte colPins[COLS] = {27, 14, 13, 22};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

String pinIngresado = "";

//  Prototipos ─
void   conectarWiFi();
String sha256Hash(const String& input);
bool   buscarUsuario(const String& pinHash, String& outName, String& outId);
void   guardarLog(const String& result, const String& userId, const String& userName);

//  Setup 
void setup() {
  Serial.begin(115200);
  delay(500);
  conectarWiFi();
  Serial.println("\nSistema listo. Ingresá el PIN y presioná #");
  Serial.println("(* para borrar)");
}

//  Loop ─
void loop() {
  char key = keypad.getKey();
  if (!key) return;

  if (key == '*') {
    pinIngresado = "";
    Serial.println("Borrado");

  } else if (key == '#') {
    if (pinIngresado.length() < 4) {
      Serial.println("PIN muy corto (mínimo 4 dígitos)");
      pinIngresado = "";
      return;
    }

    Serial.println("\nVerificando...");
    String pinHash = sha256Hash(pinIngresado);
    Serial.println("Hash: " + pinHash);

    String userName = "", userId = "";
    bool acceso = buscarUsuario(pinHash, userName, userId);

    if (acceso) {
      Serial.println("ACCESO PERMITIDO" + userName);
    } else {
      Serial.println("ACCESO DENEGADO");
    }

    guardarLog(acceso ? "success" : "fail", userId, userName);
    pinIngresado = "";

  } else if (pinIngresado.length() < 8) {
    pinIngresado += key;
    String mask = "";
    for (int i = 0; i < (int)pinIngresado.length(); i++) mask += "*";
    Serial.println("PIN: " + mask);
  }
}

// WiFi
void conectarWiFi() {
  Serial.print("Conectando WiFi");
  WiFi.begin(SSID, PASSWORD);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    Serial.print(".");
    intentos++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConectado — IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nNo se pudo conectar al WiFi");
  }
}

// SHA-256  mismo algoritmo que el navegador
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

// Buscar usuario en Firestore por hash de PIN
bool buscarUsuario(const String& pinHash, String& outName, String& outId) {
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
    return false;
  }

  WiFiClientSecure client;
  client.setCACert(GOOGLE_ROOT_CA);

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += PROJECT_ID;
  url += "/databases/(default)/documents:runQuery";

  // Consulta estructurada: WHERE pin == pinHash
  String body = "{\"structuredQuery\":{"
    "\"from\":[{\"collectionId\":\"users\"}],"
    "\"where\":{\"fieldFilter\":{"
      "\"field\":{\"fieldPath\":\"pin\"},"
      "\"op\":\"EQUAL\","
      "\"value\":{\"stringValue\":\"" + pinHash + "\"}}}}}";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);

  if (code != 200) {
    Serial.println("Error Firestore: " + String(code));
    http.end();
    return false;
  }

  String response = http.getString();
  http.end();

  // Parsear respuesta JSON
  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.println("Error JSON: " + String(err.c_str()));
    return false;
  }

  // Si no hay documento, el array viene sin campo "document"
  if (doc[0]["document"].isNull()) {
    return false;
  }

  outName = doc[0]["document"]["fields"]["name"]["stringValue"].as<String>();
  String fullPath = doc[0]["document"]["name"].as<String>();
  outId = fullPath.substring(fullPath.lastIndexOf('/') + 1);

  return outName.length() > 0;
}

// Guardar log en Firestore
void guardarLog(const String& result, const String& userId, const String& userName) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setCACert(GOOGLE_ROOT_CA);

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += PROJECT_ID;
  url += "/databases/(default)/documents/logs";

  String body = "{\"fields\":{"
    "\"result\":{\"stringValue\":\"" + result + "\"},"
    "\"device_id\":{\"stringValue\":\"" + String(DEVICE_ID) + "\"},"
    "\"userId\":{\"stringValue\":\"" + userId + "\"},"
    "\"userName\":{\"stringValue\":\"" + userName + "\"},"
    "\"faceResult\":{\"stringValue\":\"\"}"
  "}}";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);

  if (code == 200 || code == 201) {
    Serial.println("Log guardado en Firestore ✓");
  } else {
    Serial.println("Error guardando log: " + String(code));
    Serial.println(http.getString());
  }
  http.end();
}
