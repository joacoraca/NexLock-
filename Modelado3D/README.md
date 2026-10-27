# NexLock — Modelado 3D del Gabinete y Mecanismo de Cerradura

Este directorio contiene el diseño paramétrico 3D completo para el sistema **NexLock**, diseñado en **[OpenSCAD](https://openscad.org/)** (software de modelado 3D por código libre y gratuito).

---

## 📐 Distribución de Componentes en el Gabinete

```
  ┌──────────────────────────────────────────────┐
  │  [○ Flash]                                   │
  │  (◎ Lente Cámara OV2640)                     │  <- ESP32-CAM pegado a la cara interna
  │                                              │
  │  [LED Verde]  ┌──────────────┐  [LED Rojo]   │
  │               │ Pantalla     │               │  <- OLED 1.3" SH1106
  │  (( Buzzer )) │ OLED 1.30"   │               │
  │               └──────────────┘               │  [Switch On/Off]
  │                                              │  (en el lateral)
  │  ┌────────────────────────────────────────┐  │
  │  │ [1] [2] [3] [A]                        │  │
  │  │ [4] [5] [6] [B]  Teclado Matricial 4x4 │  │  <- Rebaje para membrana
  │  │ [7] [8] [9] [C]  (Cinta entra por      │  │     y ranura interior
  │  │ [*] [0] [#] [D]   ranura pasacable)    │  │
  │  └────────────────────────────────────────┘  │
  │                                              │
  │ ════════════════════════════════════════════ │
  │ [Cerrojo Cremallera ◄══►] [Engranaje Piñón]  │  <- Mecanismo motorizado
  │                          [Motorreductor DC]  │     en la base inferior
  └──────────────────────────────────────────────┘
```

---

## 🛠️ Archivo Principal: `nexlock_gabinete.scad`

El archivo es 100% paramétrico y autosuficiente (no requiere librerías externas). Para visualizar o exportar cada pieza en **OpenSCAD**:

1. Abre `nexlock_gabinete.scad` en **OpenSCAD**.
2. En la línea 24 del archivo, modifica la variable `PIEZA`:
   * `"todo_explosion"`: Muestra el ensamble completo en 3D con colores diferenciados.
   * `"tapa_frontal"`: Genera únicamente la tapa delantera lista para imprimir.
   * `"caja_base"`: Genera la caja base trasera con la cuna del motor y los rieles guía.
   * `"pinon_motor"`: Genera el engranaje para calzar en el eje del motor.
   * `"barra_cremallera"`: Genera el cerrojo móvil con los dientes y la punta biselada.
3. Presiona **F5** para previsualizar.
4. Presiona **F6** para renderizar la pieza seleccionada y luego **F7** (o *File -> Export as STL*) para guardar el archivo `.STL`.

---

## ⚙️ Características Mecánicas Destacadas

1. **Cámara ultra cercana (ESP32-CAM):**
   * El cable plano FFC del sensor OV2640 tiene apenas ~2 cm de largo. 
   * La tapa incluye un **marco de retención interno** que sujeta el PCB del ESP32-CAM a ras de la pared frontal, permitiendo que el lente asome por el orificio de 9.2 mm sin estirar ni doblar el flex.
2. **Mecanismo Piñón - Cremallera (Módulo 1.5):**
   * El piñón circular tiene 14 dientes y calce tipo **D** para ejes estándar de motorreductores TT amarillos o metálicos N20.
   * La cremallera es una barra sólida de 85 mm con punta biselada para que la puerta tranque suavemente al cerrarse, y una ranura de tope para evitar que el cerrojo se salga de su riel.
3. **Fijación y Ensamble:**
   * 4 torres en las esquinas diseñadas para tornillos **M3**. En la tapa frontal tienen avellanado para que la cabeza del tornillo quede escondida.
   * La pantalla OLED se fija por detrás con 4 tornillitos **M2** en sus 4 esquinas.

---

## 🖨️ Recomendaciones de Impresión 3D

| Parámetro | Valor Recomendado |
| :--- | :--- |
| **Material** | **PETG** o **PLA+** (PETG recomendado por mayor resistencia mecánica y temperatura) |
| **Altura de capa** | `0.20 mm` (o `0.16 mm` para los dientes del piñón y cremallera) |
| **Paredes / Perímetros**| `4 a 6 líneas` (mínimo 1.6 mm a 2.4 mm para rigidez estructural) |
| **Relleno (Infill)** | `25% - 35%` en patrón Giroidal o Cúbico |
| **Soportes** | Solo en los orificios laterales (salida del cerrojo e interruptor) |
| **Lubricación** | Aplicar una capa fina de grasa de litio blanca o vaselina en los rieles de la cremallera para un deslizamiento silencioso y suave con el motor. |
