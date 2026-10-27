# NexLock — Modelado 3D del Gabinete y Mecanismo de Cerradura

Este directorio contiene el diseño paramétrico 3D completo para el sistema **NexLock**, disponible en dos formatos:
1. **[Onshape](https://cad.onshape.com/)**: Archivo FeatureScript (`nexlock_featurescript.fs`) para modelar directamente en la nube.
2. **[OpenSCAD](https://openscad.org/)**: Archivo paramétrico estándar (`nexlock_gabinete.scad`).

---

## 📐 Distribución de Componentes en el Gabinete

```
  ┌──────────────────────────────────────────────┐
  │  [○ Flash]                                   │
  │  (◎ Lente Cámara OV2640)                     │  <- ESP32-CAM pegado a la cara interna
  │                                              │
  │  [LED Verde]  ┌──────────────┐  [LED Rojo]   │
  │               │ Pantalla     │               │  <- OLED 1.30'' IIC V2.2 (SH1106)
  │  (( Buzzer )) │ OLED 1.30"   │               │     Ventana: 32x18mm | M2: 30.5x28.5mm
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
  │ [Cerrojo Cremallera ◄══►]                    │  <- Dientes encarando hacia abajo
  │               [Engranaje Piñón engranado]    │  <- Engranaje debajo de la cremallera
  │               [Motorreductor DC]             │
  └──────────────────────────────────────────────┘
```

---

## ☁️ Opción 1: Cómo usar FeatureScript en Onshape

1. Entra a tu cuenta en [Onshape](https://cad.onshape.com/) y abre tu documento de trabajo.
2. En la esquina inferior izquierda, haz clic en el botón **`+`** (Insert new element) y selecciona **Create Feature Studio**.
3. Se abrirá una pestaña de código. Borra el código de plantilla que viene por defecto.
4. Abre el archivo [`nexlock_featurescript.fs`](file:///C:/Users/Administrator/.gemini/antigravity/worktrees/nexlock-firebase/connect_to_github/Modelado3D/nexlock_featurescript.fs), copia todo su contenido y pégalo en la pestaña de Onshape.
5. Haz clic en el botón superior de **Commit** (ícono de tilde verde o guardar).
6. Regresa a tu pestaña de **Part Studio**. En la barra de herramientas superior verás el nuevo botón de operación personalizada: **"NexLock Gabinete y Mecanismo"**.
7. Al hacer clic, se abre una ventana donde puedes elegir en el menú desplegable:
   * **Tapa Frontal**
   * **Caja Base**
   * **Barra Cremallera**
   * **Piñon Motor**
8. ¡Listo! Se genera la geometría sólida exacta en tu Part Studio lista para editar, ensamblar o exportar a STL.

---

## 🛠️ Opción 2: Cómo usar OpenSCAD

1. Abre [`nexlock_gabinete.scad`](file:///C:/Users/Administrator/.gemini/antigravity/worktrees/nexlock-firebase/connect_to_github/Modelado3D/nexlock_gabinete.scad) en **OpenSCAD**.
2. En la línea 24 del archivo, modifica la variable `PIEZA`:
   * `"todo_explosion"`: Muestra el ensamble completo en 3D con colores diferenciados.
   * `"tapa_frontal"`: Genera la tapa delantera.
   * `"caja_base"`: Genera la caja base trasera con la cuna del motor y los rieles guía.
   * `"pinon_motor"`: Genera el engranaje para calzar en el eje del motor.
   * `"barra_cremallera"`: Genera el cerrojo móvil con los dientes encarando al piñón.
3. Presiona **F5** para previsualizar.
4. Presiona **F6** para renderizar la pieza seleccionada y luego **F7** (o *File -> Export as STL*) para exportar a `.STL`.

---

## ⚙️ Características Mecánicas Corregidas

1. **Pantalla OLED 1.30'' IIC V2.2 (SH1106):**
   * Ventana visible ajustada a 32 mm x 18 mm.
   * 4 agujeros de anclaje M2 con espaciado exacto de **30.5 mm en X** y **28.5 mm en Y**.
2. **Orientación de la Barra Dentada (Cremallera):**
   * Los dientes de la cremallera están ubicados en la cara inferior encarando directamente hacia el engranaje piñón del motor, permitiendo el engrane directo.
3. **ESP32-CAM (Cable corto del sensor):**
   * Marco de retención interior pegado al frente para que el sensor OV2640 asome por su orificio de 9.2 mm sin someter a esfuerzo el flex corto.

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
