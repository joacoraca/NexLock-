# Electrónica 
Acá se documentan todos los planos y firmware para el armado físico del sistema:
- **Esquemático y PCB (KiCad):** Diagrama circuital, asignación de pines y ruteo de pistas.
- **ESP central ([`nexlock_esp32.ino`](file:///C:/Users/Administrator/.gemini/antigravity/worktrees/nexlock-firebase/connect_to_github/Electronica/ESP/nexlock_esp32.ino)):** Control de teclado 4x4, validación de PIN en Firestore, comunicación UART con la cámara, control de motor L298N, LEDs y buzzer.
- **ESP32-CAM ([`nexlock_esp32_cam.ino`](file:///C:/Users/Administrator/.gemini/antigravity/worktrees/nexlock-firebase/connect_to_github/Electronica/ESP/nexlock_esp32_cam.ino)):** Captura de imagen OV2640, descarga de rostro de referencia desde Firestore y comparación biométrica en la nube vía API Face++ v3.
- **Guía de integración ([`INTEGRACION_ROSTRO.md`](file:///C:/Users/Administrator/.gemini/antigravity/worktrees/nexlock-firebase/connect_to_github/Electronica/ESP/INTEGRACION_ROSTRO.md)):** Protocolo UART, estructura de colecciones en Firestore y checklist de puesta en marcha.
- **Plantilla de credenciales ([`secrets.h.example`](file:///C:/Users/Administrator/.gemini/antigravity/worktrees/nexlock-firebase/connect_to_github/Electronica/ESP/secrets.h.example)):** Modelo para configurar WiFi y credenciales de Firebase / Face++.

