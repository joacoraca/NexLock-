// ============================================================================
// NexLock — Gabinete y Mecanismo 3D Paramétrico (OpenSCAD)
// Componentes integrados:
//  1. Pantalla OLED 1.30" (SH1106 / I2C) con marco protector
//  2. ESP32-CAM (montaje frontal directo por cable plano corto) + lente + flash
//  3. Teclado matricial 4x4 (rebaje y ranura pasa-cables)
//  4. LEDs de estado (Verde / Rojo) y rejilla acústica para Buzzer
//  5. Interruptor de encendido (switch balancín 15x10mm)
//  6. Mecanismo de cerradura: Engranaje piñón + Barra cremallera (cerrojo móvil)
//  7. Cuna soporte para motorreductor (N20 / TT DC) y guías lineales
// ============================================================================

$fn = 40; // Calidad de curvas y círculos

// ────────────────────────────────────────────────────────────────────────────
// SELECTOR DE VISTA / PIEZA A EXPORTAR A .STL
// ────────────────────────────────────────────────────────────────────────────
// Cambiar el valor de PIEZA para visualizar o exportar individualmente:
//  "todo_explosion"     -> Vista de ensamble explotada con todos los módulos
//  "tapa_frontal"       -> Tapa delantera con huecos de pantalla, cámara, teclado, leds
//  "caja_base"          -> Base trasera con guías de cremallera, cuna motor y postes
//  "pinon_motor"        -> Engranaje circular para encastrar en el eje del motor
//  "barra_cremallera"   -> Barra dentada móvil (pestillo cerrojo de cerradura)
PIEZA = "todo_explosion"; 


// ────────────────────────────────────────────────────────────────────────────
// PARÁMETROS DIMENSIONALES PRINCIPALES (en milímetros)
// ────────────────────────────────────────────────────────────────────────────

// Dimensiones de la caja
ANCHO_EXT     = 108;  // Ancho exterior
ALTO_EXT      = 178;  // Alto exterior
PROF_BASE     = 28;   // Profundidad de la caja base
PROF_TAPA     = 12;   // Profundidad de la tapa frontal
ESPESOR_PAR   = 2.6;  // Espesor de pared (óptimo para boquilla 0.4mm, 6-7 perímetros)
RADIO_ESQ     = 6.0;  // Radio de redondeo de esquinas

// ESP32-CAM (Montado directamente contra la cara interna para el cable corto)
CAM_ANCHO     = 27.4;
CAM_ALTO      = 40.8;
CAM_ESP_PCB   = 1.6;
LENTE_DIAM    = 9.2;  // Diámetro orificio lente OV2640
FLASH_DIAM    = 4.5;  // Orificio para el LED flash blanco

// Pantalla OLED 1.3" (PCB ~35.4 x 33.5mm)
OLED_VENT_ANCHO = 32.0; // Ventana visible activa
OLED_VENT_ALTO  = 17.5;
OLED_PCB_ANCHO  = 35.8;
OLED_PCB_ALTO   = 34.0;
OLED_POSTE_DIST_X = 30.5;
OLED_POSTE_DIST_Y = 28.5;

// Teclado matricial 4x4 (Membrana con adhesivo)
TECLADO_ANCHO   = 70.0;
TECLADO_ALTO    = 77.0;
TECLADO_RANURA_X = 22.0; // Ranura para la cinta flex de 8 pines
TECLADO_RANURA_Y = 2.5;

// LEDs y Buzzer
LED_DIAM        = 5.2; // Para LED 5mm
BUZZER_ORIF     = 2.2; // Diámetro orificios rejilla buzzer

// Switch de Encendido (Lateral)
SWITCH_ANCHO    = 15.2;
SWITCH_ALTO     = 10.6;

// Tornillos de Ensamble de la Caja (M3)
TORNILLO_M3_DIAM = 3.2;
TORNILLO_CABEZA_D = 6.2;
POSTE_EXT_DIAM   = 8.0;

// Mecanismo Cremallera y Piñón (Módulo 1.5)
MODULO_ENG       = 1.5;
DIENTES_PINON    = 14;
DIAM_PRIMITIVO   = MODULO_ENG * DIENTES_PINON; // 21 mm
PASO_DIENTE      = 3.141592 * MODULO_ENG;      // ~4.71 mm
EJE_MOTOR_DIAM   = 5.4; // Con plano D para eje TT (o 3.1mm para N20)
ESPESOR_ENGRANAJE= 7.0;

ANCHO_CREMALLERA = 12.0;
LARGO_CREMALLERA = 85.0;
ALTURA_CREMALLERA= 10.0;
DIENTES_CREMALLERA = 12;


// ────────────────────────────────────────────────────────────────────────────
// FUNCIONES AUXILIARES GEOMÉTRICAS
// ────────────────────────────────────────────────────────────────────────────

// Prisma rectangular con esquinas redondeadas
module prisma_redondeado(x, y, z, r) {
    hull() {
        translate([r, r, 0]) cylinder(r=r, h=z);
        translate([x - r, r, 0]) cylinder(r=r, h=z);
        translate([r, y - r, 0]) cylinder(r=r, h=z);
        translate([x - r, y - r, 0]) cylinder(r=r, h=z);
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 1. TAPA FRONTAL
// ────────────────────────────────────────────────────────────────────────────
module tapa_frontal() {
    difference() {
        union() {
            // Cuerpo exterior de la tapa
            prisma_redondeado(ANCHO_EXT, ALTO_EXT, PROF_TAPA, RADIO_ESQ);

            // Labio interno de encastre y sellado
            translate([ESPESOR_PAR + 0.3, ESPESOR_PAR + 0.3, PROF_TAPA])
                difference() {
                    prisma_redondeado(ANCHO_EXT - (ESPESOR_PAR + 0.3)*2, 
                                      ALTO_EXT  - (ESPESOR_PAR + 0.3)*2, 
                                      2.5, RADIO_ESQ - 1.5);
                    translate([1.5, 1.5, -0.1])
                        prisma_redondeado(ANCHO_EXT - (ESPESOR_PAR + 0.3)*2 - 3, 
                                          ALTO_EXT  - (ESPESOR_PAR + 0.3)*2 - 3, 
                                          3.0, RADIO_ESQ - 2);
                }

            // Postes internos para sujetar ESP32-CAM bien pegado al frente
            // (Posición superior: X=ANCHO_EXT/2, Y=146)
            translate([ANCHO_EXT/2 - CAM_ANCHO/2 - 2, 146 - CAM_ALTO/2 - 2, 0]) {
                // Marco perimetral donde encaja el PCB del ESP32-CAM
                difference() {
                    cube([CAM_ANCHO + 4, CAM_ALTO + 4, 6.0]);
                    translate([2, 2, ESPESOR_PAR])
                        cube([CAM_ANCHO, CAM_ALTO, 5.0]);
                    // Espacio para la antena y conector
                    translate([4, -0.5, ESPESOR_PAR])
                        cube([CAM_ANCHO - 8, 4, 5.0]);
                }
            }

            // Postes para sujetar el OLED 1.3"
            // (Posición media-alta: X=ANCHO_EXT/2, Y=98)
            for (dx = [-OLED_POSTE_DIST_X/2, OLED_POSTE_DIST_X/2]) {
                for (dy = [-OLED_POSTE_DIST_Y/2, OLED_POSTE_DIST_Y/2]) {
                    translate([ANCHO_EXT/2 + dx, 98 + dy, 0])
                        cylinder(d=5.5, h=5.5);
                }
            }

            // Torres para tornillos M3 de unión con la base
            for (pos = [[10, 10], [ANCHO_EXT - 10, 10], 
                        [10, ALTO_EXT - 10], [ANCHO_EXT - 10, ALTO_EXT - 10]]) {
                translate([pos[0], pos[1], 0])
                    cylinder(d=POSTE_EXT_DIAM, h=PROF_TAPA);
            }
        }

        // Vaciado interno de la tapa
        translate([ESPESOR_PAR, ESPESOR_PAR, ESPESOR_PAR])
            prisma_redondeado(ANCHO_EXT - ESPESOR_PAR*2, ALTO_EXT - ESPESOR_PAR*2, PROF_TAPA + 5, RADIO_ESQ - 1);

        // ── HUECOS Y CALADOS EN EL FRENTE ────────────────────────────────────

        // 1. Orificio Lente ESP32-CAM y Flash (Y=146)
        translate([ANCHO_EXT/2, 146 + 6, -1])
            cylinder(d=LENTE_DIAM, h=ESPESOR_PAR + 2); // Lente
        translate([ANCHO_EXT/2, 146 + 14, -1])
            cylinder(d=FLASH_DIAM, h=ESPESOR_PAR + 2); // Flash

        // 2. Ventana para OLED 1.3" (Y=98) con bisel estético
        translate([ANCHO_EXT/2 - OLED_VENT_ANCHO/2, 98 - OLED_VENT_ALTO/2, -1])
            cube([OLED_VENT_ANCHO, OLED_VENT_ALTO, ESPESOR_PAR + 2]);
        // Orificios rosca M2 para postes del OLED
        for (dx = [-OLED_POSTE_DIST_X/2, OLED_POSTE_DIST_X/2]) {
            for (dy = [-OLED_POSTE_DIST_Y/2, OLED_POSTE_DIST_Y/2]) {
                translate([ANCHO_EXT/2 + dx, 98 + dy, -1])
                    cylinder(d=1.8, h=7); // Para roscar tornillo M2
            }
        }

        // 3. LEDs Indicadores (Verde: Acceso OK, Rojo: Error/Bloqueo)
        translate([ANCHO_EXT/2 - 28, 98, -1])
            cylinder(d=LED_DIAM, h=ESPESOR_PAR + 2); // LED Verde
        translate([ANCHO_EXT/2 + 28, 98, -1])
            cylinder(d=LED_DIAM, h=ESPESOR_PAR + 2); // LED Rojo

        // 4. Rejilla acústica para Buzzer (debajo del OLED, Y=78)
        for (r_ang = [0:60:300]) {
            translate([ANCHO_EXT/2 - 28 + 4*cos(r_ang), 78 + 4*sin(r_ang), -1])
                cylinder(d=BUZZER_ORIF, h=ESPESOR_PAR + 2);
        }
        translate([ANCHO_EXT/2 - 28, 78, -1])
            cylinder(d=BUZZER_ORIF, h=ESPESOR_PAR + 2);

        // 5. Rebaje y Ranura para Teclado Matricial 4x4 (Y=42)
        // Rebaje de 0.8mm para que la membrana quede al ras
        translate([ANCHO_EXT/2 - TECLADO_ANCHO/2, 42 - TECLADO_ALTO/2, -0.1])
            cube([TECLADO_ANCHO, TECLADO_ALTO, 0.8]);
        // Ranura pasacables hacia el interior
        translate([ANCHO_EXT/2 - TECLADO_RANURA_X/2, 42 + TECLADO_ALTO/2 - 8, -1])
            cube([TECLADO_RANURA_X, TECLADO_RANURA_Y, ESPESOR_PAR + 2]);

        // 6. Hueco para Switch / Interruptor de encendido (Lateral Derecho)
        translate([ANCHO_EXT - ESPESOR_PAR - 1, 130, PROF_TAPA/2 - SWITCH_ALTO/2])
            cube([ESPESOR_PAR + 2, SWITCH_ANCHO, SWITCH_ALTO]);

        // 7. Orificios avellanados para tornillos M3 en las 4 esquinas
        for (pos = [[10, 10], [ANCHO_EXT - 10, 10], 
                    [10, ALTO_EXT - 10], [ANCHO_EXT - 10, ALTO_EXT - 10]]) {
            translate([pos[0], pos[1], -1]) {
                cylinder(d=TORNILLO_M3_DIAM, h=PROF_TAPA + 2);
                cylinder(d=TORNILLO_CABEZA_D, h=3.0); // Avellanado
            }
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 2. CAJA BASE TRASERA (Aloja Motor, Guías de Cerrojo, ESP32 y Fuente)
// ────────────────────────────────────────────────────────────────────────────
module caja_base() {
    difference() {
        union() {
            // Cuerpo exterior de la base
            prisma_redondeado(ANCHO_EXT, ALTO_EXT, PROF_BASE, RADIO_ESQ);

            // Torres para atornillar la tapa (con núcleo para tornillo M3)
            for (pos = [[10, 10], [ANCHO_EXT - 10, 10], 
                        [10, ALTO_EXT - 10], [ANCHO_EXT - 10, ALTO_EXT - 10]]) {
                translate([pos[0], pos[1], 0])
                    cylinder(d=POSTE_EXT_DIAM, h=PROF_BASE);
            }

            // ── MECANISMO: GUÍAS LINEALES PARA LA BARRA DENTADA (CERROJO) ───
            // El cerrojo se desplaza horizontalmente sobre X, saliendo por la izquierda
            translate([ESPESOR_PAR, 55, ESPESOR_PAR]) {
                // Riel guía inferior y superior con pestaña de retención
                difference() {
                    cube([LARGO_CREMALLERA + 10, ANCHO_CREMALLERA + 6, 12]);
                    // Canal central donde corre la cremallera
                    translate([-1, 3, 2])
                        cube([LARGO_CREMALLERA + 15, ANCHO_CREMALLERA + 0.6, 11]);
                }
            }

            // ── CUNA / SOPORTE DEL MOTORREDUCTOR ────────────────────────────
            // Posicionado exactamente para engranar con la cremallera
            translate([ANCHO_EXT - 42, 55 - 28, ESPESOR_PAR]) {
                difference() {
                    cube([34, 32, 18]); // Bloque soporte
                    // Vaciado para el cuerpo del motor
                    translate([3, 3, 3])
                        cube([28, 26, 20]);
                    // Hueco para paso del eje del motor hacia el piñón
                    translate([17, 30, 9])
                        rotate([-90, 0, 0])
                            cylinder(d=9.0, h=10);
                }
            }

            // Postes para sujetar el ESP32 Central (NodeMCU / DevKit)
            // Ubicado en la zona media-superior
            translate([ANCHO_EXT/2, 115, ESPESOR_PAR]) {
                for (dx = [-26, 26]) {
                    for (dy = [-14, 14]) {
                        translate([dx, dy, 0])
                            cylinder(d=5.5, h=6.0);
                    }
                }
            }
        }

        // Vaciado interno general de la base
        translate([ESPESOR_PAR, ESPESOR_PAR, ESPESOR_PAR])
            prisma_redondeado(ANCHO_EXT - ESPESOR_PAR*2, ALTO_EXT - ESPESOR_PAR*2, PROF_BASE + 5, RADIO_ESQ - 1);

        // Ranura lateral por donde SALE el cerrojo hacia el marco de la puerta
        translate([-1, 55 + 3, ESPESOR_PAR + 2])
            cube([ESPESOR_PAR + 3, ANCHO_CREMALLERA + 1.0, 9.0]);

        // Orificios roscados M3 en las 4 torres
        for (pos = [[10, 10], [ANCHO_EXT - 10, 10], 
                    [10, ALTO_EXT - 10], [ANCHO_EXT - 10, ALTO_EXT - 10]]) {
            translate([pos[0], pos[1], PROF_BASE - 14])
                cylinder(d=2.6, h=16); // Diámetro óptimo para autorroscar M3 en plástico
        }

        // Orificios para los postes del ESP32 central
        translate([ANCHO_EXT/2, 115, ESPESOR_PAR]) {
            for (dx = [-26, 26]) {
                for (dy = [-14, 14]) {
                    translate([dx, dy, 2])
                        cylinder(d=1.8, h=6.0);
                }
            }
        }

        // Salida de cables traseros para alimentación (12V / 5V exterior)
        translate([ANCHO_EXT/2 - 6, ALTO_EXT - ESPESOR_PAR - 2, 8])
            cube([12, ESPESOR_PAR + 4, 8]);
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 3. PIÑÓN DEL MOTOR (Engranaje cilíndrico)
// ────────────────────────────────────────────────────────────────────────────
module pinon_motor() {
    difference() {
        union() {
            // Cuerpo del engranaje con dientes
            cylinder(r=DIAM_PRIMITIVO/2 + MODULO_ENG, h=ESPESOR_ENGRANAJE);

            // Cubo central de refuerzo
            cylinder(d=EJE_MOTOR_DIAM + 6, h=ESPESOR_ENGRANAJE + 4);
        }

        // Dientes generados mediante sustracción simétrica
        for (i = [0:DIENTES_PINON-1]) {
            rotate([0, 0, i * (360 / DIENTES_PINON)]) {
                translate([DIAM_PRIMITIVO/2 + MODULO_ENG*0.7, 0, -1])
                    rotate([0, 0, 45])
                        cube([MODULO_ENG*1.5, MODULO_ENG*1.5, ESPESOR_ENGRANAJE + 6], center=true);
            }
        }

        // Orificio para eje motor tipo D (plano antideslizamiento)
        translate([0, 0, -1])
            difference() {
                cylinder(d=EJE_MOTOR_DIAM, h=ESPESOR_ENGRANAJE + 7);
                // Cara plana (corte tipo D)
                translate([EJE_MOTOR_DIAM/2 - 0.8, -EJE_MOTOR_DIAM/2, 0])
                    cube([2, EJE_MOTOR_DIAM, ESPESOR_ENGRANAJE + 8]);
            }

        // Prisionero lateral (opcional, tornillo M3 para fijar al eje)
        translate([0, 0, ESPESOR_ENGRANAJE + 2])
            rotate([0, 90, 0])
                cylinder(d=2.8, h=10);
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 4. BARRA CREMALLERA (Cerrojo Móvil de la Cerradura)
// ────────────────────────────────────────────────────────────────────────────
module barra_cremallera() {
    difference() {
        union() {
            // Barra sólida base del cerrojo
            cube([LARGO_CREMALLERA, ANCHO_CREMALLERA, ALTURA_CREMALLERA]);

            // Punta biselada para facilitar el pestillo al cerrar la puerta
            translate([0, 0, 0])
                polyhedron(
                    points = [
                        [0, 0, 0], [-10, 3, 0], [-10, ANCHO_CREMALLERA, 0], [0, ANCHO_CREMALLERA, 0],
                        [0, 0, ALTURA_CREMALLERA], [-10, 3, ALTURA_CREMALLERA], 
                        [-10, ANCHO_CREMALLERA, ALTURA_CREMALLERA], [0, ANCHO_CREMALLERA, ALTURA_CREMALLERA]
                    ],
                    faces = [
                        [0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0]
                    ]
                );
        }

        // Ranura de cremallera: Dientes tallados para engranar con el piñón
        for (j = [0:DIENTES_CREMALLERA-1]) {
            translate([35 + j * PASO_DIENTE, ANCHO_CREMALLERA - 1.5, -1])
                rotate([0, 0, 45])
                    cube([MODULO_ENG*1.5, MODULO_ENG*1.5, ALTURA_CREMALLERA + 2]);
        }

        // Ranura de tope de carrera (evita que el cerrojo se salga de la caja)
        translate([20, 2, 2])
            cube([35, 2.5, ALTURA_CREMALLERA - 4]);
    }
}


// ────────────────────────────────────────────────────────────────────────────
// RENDERIZADO SEGÚN EL SELECTOR 'PIEZA'
// ────────────────────────────────────────────────────────────────────────────

if (PIEZA == "todo_explosion") {
    // 1. Tapa frontal flotando arriba
    color("LightSteelBlue", 0.9)
        translate([0, 0, 45])
            tapa_frontal();

    // 2. Caja base abajo
    color("DimGray", 0.95)
        caja_base();

    // 3. Barra cremallera situada en su guía
    color("OrangeRed")
        translate([15, 58, ESPESOR_PAR + 2])
            barra_cremallera();

    // 4. Piñón motor engranado sobre la cremallera
    color("Gold")
        translate([65, 58 - DIAM_PRIMITIVO/2 - 0.5, ESPESOR_PAR + 3])
            pinon_motor();

} else if (PIEZA == "tapa_frontal") {
    // Para imprimir la tapa (orientada plana sobre la cama)
    tapa_frontal();

} else if (PIEZA == "caja_base") {
    // Para imprimir la base
    caja_base();

} else if (PIEZA == "pinon_motor") {
    // Para imprimir el engranaje
    pinon_motor();

} else if (PIEZA == "barra_cremallera") {
    // Para imprimir el cerrojo
    barra_cremallera();
}
