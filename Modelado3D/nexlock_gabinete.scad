// ============================================================================
// NexLock — Smart Lock Vertical Column (OpenSCAD 3D)
// ============================================================================
// Modelo basado fielmente en el diseño visual de cerradura inteligente vertical:
//  - Gabinete esbelto (80 mm x 240 mm x 36 mm total) con bordes biselados (chaflán)
//  - Lente de cámara OV2640 con bisel concéntrico decorativo y orificio sensor/flash
//  - Pantalla OLED 1.30" IIC V2.2 (SH1106) con marco rebajado
//  - 2 LEDs de estado en columna vertical a la derecha del OLED (Verde / Rojo)
//  - Cerrojo motorizado móvil (pestillo cremallera) saliendo por el lateral izquierdo
//  - Teclado matricial 4x4 integrado en cajera rebajada con 16 teclas táctiles
//  - Guías internas para cremallera, cuna para motorreductor y cuna para ESP32-CAM
// ============================================================================

$fn = 40;

// Selector de pieza:
// "todo_ensamble"    -> Vista ensamblada con todos los módulos y colores
// "tapa_frontal"     -> Tapa frontal lista para imprimir en 3D
// "caja_base"        -> Base trasera con rieles y cuna de motor
// "barra_cremallera" -> Pestillo móvil de cerradura
// "pinon_motor"      -> Engranaje circular con calce de eje tipo D
PIEZA = "todo_ensamble";

// Dimensiones principales
ANCHO_EXT   = 80;   // Ancho frontal
ALTO_EXT    = 240;  // Altura frontal esbelta
PROF_TAPA   = 14;   // Profundidad de tapa
PROF_BASE   = 22;   // Profundidad de base
ESPESOR_PAR = 2.6;  // Espesor de pared sólida
RADIO_ESQ   = 8.0;  // Radio de esquinas exteriores

// Módulos
OLED_W = 34.0;
OLED_H = 19.0;
CAM_D  = 9.6;

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
            // Cuerpo base con esquinas redondeadas
            prisma_redondeado(ANCHO_EXT, ALTO_EXT, PROF_TAPA, RADIO_ESQ);

            // Labio perimetral de encastre con la base
            translate([ESPESOR_PAR + 0.3, ESPESOR_PAR + 0.3, PROF_TAPA])
                difference() {
                    prisma_redondeado(ANCHO_EXT - (ESPESOR_PAR + 0.3)*2, ALTO_EXT - (ESPESOR_PAR + 0.3)*2, 2.5, RADIO_ESQ - 1.5);
                    translate([1.5, 1.5, -0.1])
                        prisma_redondeado(ANCHO_EXT - (ESPESOR_PAR + 0.3)*2 - 3, ALTO_EXT - (ESPESOR_PAR + 0.3)*2 - 3, 3.0, RADIO_ESQ - 2);
                }

            // Cuna interna para sujetar el ESP32-CAM pegado a la pared frontal
            translate([ANCHO_EXT/2 - 14, 196 - 20, 0]) {
                difference() {
                    cube([28, 41, 6.0]);
                    translate([1.5, 1.5, ESPESOR_PAR]) cube([25, 38, 5.0]);
                }
            }

            // Postes de anclaje para tornillos M2 del OLED (30.5mm x 28.5mm)
            for (dx = [-15.25, 15.25]) {
                for (dy = [-14.25, 14.25]) {
                    translate([ANCHO_EXT/2 + dx, 148 + dy, 0]) cylinder(d=5.0, h=5.5);
                }
            }

            // Torres para tornillos M3 de unión de esquinas
            for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
                translate([pos[0], pos[1], 0]) cylinder(d=7.5, h=PROF_TAPA);
            }
        }

        // Vaciado interior de la tapa
        translate([ESPESOR_PAR, ESPESOR_PAR, ESPESOR_PAR])
            prisma_redondeado(ANCHO_EXT - ESPESOR_PAR*2, ALTO_EXT - ESPESOR_PAR*2, PROF_TAPA + 5, RADIO_ESQ - 1);

        // Bisel (chaflán) perimetral frontal de 45°
        translate([-1, -1, -1]) {
            difference() {
                translate([-2, -2, -0.1]) cube([ANCHO_EXT + 6, ALTO_EXT + 6, 3.0]);
                translate([2.5, 2.5, -0.2]) prisma_redondeado(ANCHO_EXT - 1, ALTO_EXT - 1, 4.0, RADIO_ESQ - 1);
            }
        }

        // ── ABERTURAS FRONTALES ─────────────────────────────────────────────

        // A) Sensor superior / Flash (Y=214)
        translate([ANCHO_EXT/2, 214, -1]) cylinder(d=3.6, h=ESPESOR_PAR + 2);

        // B) Cámara OV2640 (Y=196) con anillo concéntrico estético
        translate([ANCHO_EXT/2, 196, -1]) cylinder(d=CAM_D, h=ESPESOR_PAR + 2);
        translate([ANCHO_EXT/2, 196, -0.1]) cylinder(d=18.0, h=0.8);

        // C) Pantalla OLED 1.30" (Y=148) + bisel decorativo
        translate([ANCHO_EXT/2 - OLED_W/2, 148 - OLED_H/2, -1]) cube([OLED_W, OLED_H, ESPESOR_PAR + 2]);
        translate([ANCHO_EXT/2 - 19, 148 - 11.5, -0.1]) cube([38, 23, 1.0]);

        // Orificios rosca M2 OLED
        for (dx = [-15.25, 15.25]) {
            for (dy = [-14.25, 14.25]) {
                translate([ANCHO_EXT/2 + dx, 148 + dy, -1]) cylinder(d=1.8, h=7.0);
            }
        }

        // D) Dos LEDs verticales a la derecha del display (X=ANCHO/2 + 24)
        translate([ANCHO_EXT/2 + 24, 148 + 6, -1]) cylinder(d=3.2, h=ESPESOR_PAR + 2); // LED Verde
        translate([ANCHO_EXT/2 + 24, 148 - 6, -1]) cylinder(d=3.2, h=ESPESOR_PAR + 2); // LED Rojo

        // E) Teclado Matricial 4x4 (Y=58): Cajera rebajada de 1.4mm
        translate([ANCHO_EXT/2 - 31, 58 - 32, -0.1]) cube([62, 64, 1.4]);
        // Ranura pasacables de la cinta flex
        translate([ANCHO_EXT/2 - 11, 58 - 30, -1]) cube([22, 2.5, ESPESOR_PAR + 2]);

        // F) Ranura lateral izquierda para salida del cerrojo (Y=118)
        translate([-1, 118 - 8, ESPESOR_PAR + 1]) cube([ESPESOR_PAR + 2, 16, 11]);

        // G) Orificios avellanados para tornillos M3 en las 4 esquinas
        for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
            translate([pos[0], pos[1], -1]) {
                cylinder(d=3.2, h=PROF_TAPA + 2);
                cylinder(d=6.2, h=2.8);
            }
        }
    }

    // Teclas 4x4 táctiles en relieve
    for (col = [-20.5, -6.8, 6.8, 20.5]) {
        for (fila = [41.5, 52.5, 63.5, 74.5]) {
            translate([ANCHO_EXT/2 + col - 5.5, fila - 5.5, 0.4]) {
                difference() {
                    cube([11, 11, 1.6]);
                    translate([1.2, 1.2, 1.2]) cube([8.6, 8.6, 1.0]);
                }
            }
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 2. CAJA BASE TRASERA SLIM
// ────────────────────────────────────────────────────────────────────────────
module caja_base() {
    difference() {
        union() {
            prisma_redondeado(ANCHO_EXT, ALTO_EXT, PROF_BASE, RADIO_ESQ);

            // Torres para atornillar la tapa
            for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
                translate([pos[0], pos[1], 0]) cylinder(d=7.5, h=PROF_BASE);
            }

            // Guías lineales para la barra cremallera (Y=118)
            translate([ESPESOR_PAR, 118 - 8, ESPESOR_PAR]) {
                difference() {
                    cube([ANCHO_EXT - ESPESOR_PAR*2 - 20, 16, 12]);
                    translate([-1, 2, 1.5]) cube([ANCHO_EXT, 12.5, 11]);
                }
            }

            // Cuna para el motorreductor (N20 / DC)
            translate([ANCHO_EXT - 32, 118 - 36, ESPESOR_PAR]) {
                difference() {
                    cube([24, 28, 15]);
                    translate([2, 2, 2]) cube([20, 24, 15]);
                }
            }
        }

        // Vaciado interior
        translate([ESPESOR_PAR, ESPESOR_PAR, ESPESOR_PAR])
            prisma_redondeado(ANCHO_EXT - ESPESOR_PAR*2, ALTO_EXT - ESPESOR_PAR*2, PROF_BASE + 5, RADIO_ESQ - 1);

        // Ranura lateral izquierda para salida del cerrojo
        translate([-1, 118 - 8, ESPESOR_PAR + 1]) cube([ESPESOR_PAR + 2, 16, 11]);

        // Rosca M3 en las 4 torres
        for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
            translate([pos[0], pos[1], PROF_BASE - 12]) cylinder(d=2.6, h=14);
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 3. BARRA CREMALLERA (Pestillo / Cerrojo)
// ────────────────────────────────────────────────────────────────────────────
module barra_cremallera() {
    difference() {
        union() {
            cube([78, 12, 10]);
            // Punta biselada del cerrojo
            translate([0, 0, 0])
                polyhedron(
                    points = [
                        [0,0,0], [-8,3,0], [-8,12,0], [0,12,0],
                        [0,0,10], [-8,3,10], [-8,12,10], [0,12,10]
                    ],
                    faces = [
                        [0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0]
                    ]
                );
        }

        // Dientes encarando hacia abajo (hacia el motor)
        for (j = [0:10]) {
            translate([22 + j * 4.71, 1.2, -1])
                rotate([0, 0, 45])
                    cube([2.2, 2.2, 12]);
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 4. PIÑÓN DEL MOTOR
// ────────────────────────────────────────────────────────────────────────────
module pinon_motor() {
    difference() {
        cylinder(r=11, h=7);
        // Dientes
        for (i = [0:13]) {
            rotate([0, 0, i * (360/14)])
                translate([10.5, 0, -1])
                    rotate([0, 0, 45])
                        cube([2.2, 2.2, 9], center=true);
        }
        // Eje D (5.4mm)
        translate([0, 0, -1])
            difference() {
                cylinder(d=5.4, h=9);
                translate([1.9, -3, 0]) cube([3, 6, 10]);
            }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// RENDERIZADO
// ────────────────────────────────────────────────────────────────────────────
if (PIEZA == "todo_ensamble") {
    // Tapa frontal en gris oscuro / negro satinado
    color([0.18, 0.18, 0.18, 1.0])
        translate([0, 0, 24]) tapa_frontal();

    // Pantalla OLED de muestra
    color([0.1, 0.15, 0.25])
        translate([ANCHO_EXT/2 - 15, 148 - 8, 23.5]) cube([30, 16, 1.0]);

    // LEDs de muestra
    color("LimeGreen") translate([ANCHO_EXT/2 + 24, 148 + 6, 23.5]) sphere(r=1.5);
    color("Crimson")   translate([ANCHO_EXT/2 + 24, 148 - 6, 23.5]) sphere(r=1.5);

    // Cerrojo metálico saliendo por la izquierda
    color([0.8, 0.8, 0.82])
        translate([-8, 118 - 6, ESPESOR_PAR + 2]) barra_cremallera();

    // Base trasera
    color([0.15, 0.15, 0.15, 0.95])
        caja_base();

} else if (PIEZA == "tapa_frontal") {
    tapa_frontal();
} else if (PIEZA == "caja_base") {
    caja_base();
} else if (PIEZA == "barra_cremallera") {
    barra_cremallera();
} else if (PIEZA == "pinon_motor") {
    pinon_motor();
}
