// ============================================================================
// NexLock — Smart Lock Vertical Column (OpenSCAD 3D)
// ============================================================================
// Modelo basado fielmente en los componentes fisicos reales y el diseno vertical:
//  - Gabinete esbelto (80 mm x 240 mm x 36 mm total)
//  - Lente de camara OV2640 con bisel concentrico decorativo y orificio flash
//  - Pantalla OLED 1.30" IIC V2.2 (SH1106) con marco rebajado
//  - 2 LEDs de estado en columna vertical a la derecha del OLED (Verde / Rojo)
//  - Ranura pasacables y cajera plana para teclado 4x4 de membrana autoadhesivo
//  - Cerrojo motorizado movil (pestillo cremallera) saliendo por el lateral izquierdo
//  - Pinon con acople D para el eje macho del motorreductor
// ============================================================================

$fn = 40;

// Selector de pieza:
// "todo_ensamble"    -> Vista ensamblada con caja cerrada, cerrojo y pinon
// "tapa_frontal"     -> Tapa frontal lista para imprimir
// "caja_base"        -> Base trasera con pared de fondo y rieles
// "barra_cremallera" -> Pestillo movil de cerradura
// "pinon_motor"      -> Engranaje circular para eje macho de motor
PIEZA = "todo_ensamble";

ANCHO_EXT   = 80;   // Ancho frontal
ALTO_EXT    = 240;  // Altura frontal esbelta
PROF_TAPA   = 14;   // Profundidad de tapa
PROF_BASE   = 22;   // Profundidad de base
ESPESOR_PAR = 2.6;  // Espesor de pared solida
RADIO_ESQ   = 8.0;  // Radio de esquinas exteriores

OLED_W = 32.0;
OLED_H = 18.0;
CAM_D  = 9.5;

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
            prisma_redondeado(ANCHO_EXT, ALTO_EXT, PROF_TAPA, RADIO_ESQ);

            // Labio perimetral de encastre con la base
            translate([ESPESOR_PAR + 0.3, ESPESOR_PAR + 0.3, PROF_TAPA])
                difference() {
                    prisma_redondeado(ANCHO_EXT - (ESPESOR_PAR + 0.3)*2, ALTO_EXT - (ESPESOR_PAR + 0.3)*2, 2.5, RADIO_ESQ - 1.5);
                    translate([1.5, 1.5, -0.1])
                        prisma_redondeado(ANCHO_EXT - (ESPESOR_PAR + 0.3)*2 - 3, ALTO_EXT - (ESPESOR_PAR + 0.3)*2 - 3, 3.0, RADIO_ESQ - 2);
                }

            // Cuna interior para sujetar el PCB del ESP32-CAM (27x40mm)
            translate([ANCHO_EXT/2 - 14, 196 - 20, 0]) {
                difference() {
                    cube([28, 41, 6.0]);
                    translate([1.5, 1.5, ESPESOR_PAR]) cube([25, 38, 5.0]);
                }
            }

            // Postes M2 para pantalla OLED 1.30" (30.5mm x 28.5mm)
            for (dx = [-15.25, 15.25]) {
                for (dy = [-14.25, 14.25]) {
                    translate([ANCHO_EXT/2 + dx, 148 + dy, 0]) cylinder(d=5.0, h=5.5);
                }
            }

            // Torres para tornillos M3 de union
            for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
                translate([pos[0], pos[1], 0]) cylinder(d=7.5, h=PROF_TAPA);
            }
        }

        // Vaciado interior
        translate([ESPESOR_PAR, ESPESOR_PAR, ESPESOR_PAR])
            prisma_redondeado(ANCHO_EXT - ESPESOR_PAR*2, ALTO_EXT - ESPESOR_PAR*2, PROF_TAPA + 5, RADIO_ESQ - 1);

        // Bisel (chaflan) perimetral frontal
        translate([-1, -1, -1]) {
            difference() {
                translate([-2, -2, -0.1]) cube([ANCHO_EXT + 6, ALTO_EXT + 6, 3.0]);
                translate([2.5, 2.5, -0.2]) prisma_redondeado(ANCHO_EXT - 1, ALTO_EXT - 1, 4.0, RADIO_ESQ - 1);
            }
        }

        // Orificios superiores de camara y sensor
        translate([ANCHO_EXT/2, 214, -1]) cylinder(d=3.6, h=ESPESOR_PAR + 2);
        translate([ANCHO_EXT/2, 196, -1]) cylinder(d=CAM_D, h=ESPESOR_PAR + 2);
        translate([ANCHO_EXT/2, 196, -0.1]) cylinder(d=18.0, h=0.8);

        // Pantalla OLED 1.30" (SH1106) y marco
        translate([ANCHO_EXT/2 - OLED_W/2, 148 - OLED_H/2, -1]) cube([OLED_W, OLED_H, ESPESOR_PAR + 2]);
        translate([ANCHO_EXT/2 - 18, 148 - 11, -0.1]) cube([36, 22, 1.0]);

        for (dx = [-15.25, 15.25]) {
            for (dy = [-14.25, 14.25]) {
                translate([ANCHO_EXT/2 + dx, 148 + dy, -1]) cylinder(d=1.8, h=7.0);
            }
        }

        // LEDs de estado en columna vertical
        translate([ANCHO_EXT/2 + 24, 148 + 6, -1]) cylinder(d=3.2, h=ESPESOR_PAR + 2);
        translate([ANCHO_EXT/2 + 24, 148 - 6, -1]) cylinder(d=3.2, h=ESPESOR_PAR + 2);

        // Teclado 4x4 de membrana: Cajera plana + Ranura para cinta ("lengua")
        translate([ANCHO_EXT/2 - 34, 58 - 36, -0.1]) cube([68, 74, 0.8]);
        translate([ANCHO_EXT/2 - 11, 58 - 33, -1]) cube([22, 2.5, ESPESOR_PAR + 2]);

        // Ranura lateral izquierda para cerrojo
        translate([-1, 118 - 8, ESPESOR_PAR + 1]) cube([ESPESOR_PAR + 2, 16, 11]);

        // Tornillos M3 avellanados
        for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
            translate([pos[0], pos[1], -1]) {
                cylinder(d=3.2, h=PROF_TAPA + 2);
                cylinder(d=6.2, h=2.8);
            }
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 2. CAJA BASE TRASERA
// ────────────────────────────────────────────────────────────────────────────
module caja_base() {
    difference() {
        union() {
            prisma_redondeado(ANCHO_EXT, ALTO_EXT, PROF_BASE, RADIO_ESQ);

            // Torres de atornillado
            for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
                translate([pos[0], pos[1], 0]) cylinder(d=7.5, h=PROF_BASE);
            }

            // Guia lineal para la barra cremallera
            translate([ESPESOR_PAR, 118 - 8, ESPESOR_PAR]) {
                difference() {
                    cube([ANCHO_EXT - ESPESOR_PAR*2 - 20, 16, 12]);
                    translate([-1, 2, 1.5]) cube([ANCHO_EXT, 12.5, 11]);
                }
            }

            // Cuna para motorreductor
            translate([ANCHO_EXT - 32, 118 - 36, ESPESOR_PAR]) {
                difference() {
                    cube([24, 28, 15]);
                    translate([2, 2, 2]) cube([20, 24, 15]);
                }
            }
        }

        // Vaciado interior (deja la pared de fondo solida de 2.6 mm)
        translate([ESPESOR_PAR, ESPESOR_PAR, ESPESOR_PAR])
            prisma_redondeado(ANCHO_EXT - ESPESOR_PAR*2, ALTO_EXT - ESPESOR_PAR*2, PROF_BASE + 5, RADIO_ESQ - 1);

        // Ranura lateral izquierda para cerrojo
        translate([-1, 118 - 8, ESPESOR_PAR + 1]) cube([ESPESOR_PAR + 2, 16, 11]);

        // Rosca M3 en las 4 esquinas
        for (pos = [[8, 10], [ANCHO_EXT - 8, 10], [8, ALTO_EXT - 10], [ANCHO_EXT - 8, ALTO_EXT - 10]]) {
            translate([pos[0], pos[1], PROF_BASE - 12]) cylinder(d=2.6, h=14);
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 3. BARRA CREMALLERA (Pestillo)
// ────────────────────────────────────────────────────────────────────────────
module barra_cremallera() {
    difference() {
        union() {
            cube([78, 12, 10]);
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

        for (j = [0:10]) {
            translate([22 + j * 4.71, 1.2, -1])
                rotate([0, 0, 45])
                    cube([2.2, 2.2, 12]);
        }
    }
}


// ────────────────────────────────────────────────────────────────────────────
// 4. PINON DEL MOTOR (Engranaje circular con calce D)
// ────────────────────────────────────────────────────────────────────────────
module pinon_motor() {
    difference() {
        cylinder(r=12, h=7);
        for (i = [0:13]) {
            rotate([0, 0, i * (360/14)])
                translate([11.0, 0, -1])
                    rotate([0, 0, 45])
                        cube([2.2, 2.2, 9], center=true);
        }
        // Calce tipo D para el eje macho del motor (5.4 mm TT o N20)
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
    // Tapa frontal
    color([0.18, 0.18, 0.18, 1.0])
        translate([0, 0, 0]) tapa_frontal();

    // Pantalla OLED de muestra
    color([0.1, 0.15, 0.25])
        translate([ANCHO_EXT/2 - 16, 148 - 9, -0.5]) cube([32, 18, 1.0]);

    // LEDs de muestra
    color("LimeGreen") translate([ANCHO_EXT/2 + 24, 148 + 6, -0.5]) sphere(r=1.5);
    color("Crimson")   translate([ANCHO_EXT/2 + 24, 148 - 6, -0.5]) sphere(r=1.5);

    // Cerrojo metalico saliendo por la izquierda
    color([0.8, 0.8, 0.82])
        translate([-16, 118 - 6, ESPESOR_PAR + 1]) barra_cremallera();

    // Pinon del motor
    color("Gold")
        translate([ANCHO_EXT - 26, 118 - 18, ESPESOR_PAR + 2]) pinon_motor();

    // Caja base trasera cerrando la caja por detras
    color([0.13, 0.13, 0.13, 0.95])
        translate([0, 0, -PROF_BASE]) caja_base();

} else if (PIEZA == "tapa_frontal") {
    tapa_frontal();
} else if (PIEZA == "caja_base") {
    caja_base();
} else if (PIEZA == "barra_cremallera") {
    barra_cremallera();
} else if (PIEZA == "pinon_motor") {
    pinon_motor();
}
