FeatureScript 3112;
import(path : "onshape/std/geometry.fs", version : "3112.0");

/**
 * ============================================================================
 * NexLock - Smart Lock Vertical Column (Diseno Pro Slim)
 * ============================================================================
 *
 * Basado en el diseno visual moderno de cerradura vertical:
 *  1. FORMATO: Gabinete esbelto y vertical (80 mm x 240 mm x 34 mm).
 *  2. SUPERIOR: Lente de camara OV2640 con bisel concentrico decorativo y
 *     orificio sensor/flash superior.
 *  3. CENTRO: Pantalla OLED 1.30'' IIC V2.2 (SH1106) con marco rebajado +
 *     2 LEDs de estado verticales a su derecha (Verde arriba, Rojo abajo).
 *  4. LATERAL IZQUIERDO: Cerrojo motorizado movil (pestillo) saliendo por su
 *     ranura lateral entre el display y el teclado.
 *  5. INFERIOR: Teclado matricial 4x4 integrado en cajera rebajada con 16 teclas
 *     tactiles en relieve (1,2,3,A / 4,5,6,B / 7,8,9,C / *,0,#,D).
 *  6. INTERIOR: Cunas precisas para ESP32-CAM, guias lineales para la barra
 *     cremallera y soporte motorreductor.
 */

// -- ENUM SELECTOR DE PIEZAS ------------------------------------------------
export enum TipoPiezaNexLock
{
    annotation { "Name" : "Ensamble Completo (Vista Modelo 3D)" }
    ENSAMBLE_COMPLETO,
    annotation { "Name" : "Tapa Frontal (Camara, OLED 1.3, Teclado 4x4, LEDs)" }
    TAPA_FRONTAL,
    annotation { "Name" : "Caja Base (Rieles Guia, Cuna Motor y ESP32)" }
    CAJA_BASE,
    annotation { "Name" : "Pestillo Cerrojo (Barra Cremallera dentada)" }
    BARRA_CREMALLERA,
    annotation { "Name" : "Pinon Motor (Engranaje circular con eje D)" }
    PINON_MOTOR
}

// -- DEFINICION DEL CUSTOM FEATURE ------------------------------------------
annotation { "Feature Type Name" : "NexLock Smart Lock 3D" }
export const nexlockSmartLock = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Pieza a Generar" }
        definition.pieza is TipoPiezaNexLock;

        annotation { "Name" : "Espesor de Pared" }
        isLength(definition.espesorPared, { (millimeter) : [1.8, 2.6, 4.5] } as LengthBoundSpec);
    }
    {
        if (definition.pieza == TipoPiezaNexLock.ENSAMBLE_COMPLETO)
        {
            generarTapaFrontal(context, id + "tapa", definition);
            generarCajaBase(context, id + "base", definition);
            generarBarraCremallera(context, id + "cerrojo", definition, true);
        }
        else if (definition.pieza == TipoPiezaNexLock.TAPA_FRONTAL)
        {
            generarTapaFrontal(context, id, definition);
        }
        else if (definition.pieza == TipoPiezaNexLock.CAJA_BASE)
        {
            generarCajaBase(context, id, definition);
        }
        else if (definition.pieza == TipoPiezaNexLock.BARRA_CREMALLERA)
        {
            generarBarraCremallera(context, id, definition, false);
        }
        else if (definition.pieza == TipoPiezaNexLock.PINON_MOTOR)
        {
            generarPinonMotor(context, id, definition);
        }
    });

// -- FILTRO AUXILIAR: BORDES VERTICALES --------------------------------------
function filtrarBordesVerticales(context is Context, queryBordes is Query) returns Query
{
    var verticales = [];
    var worldZ = vector(0, 0, 1);
    for (var borde in evaluateQuery(context, queryBordes))
    {
        var linea = evLine(context, { "edge" : borde });
        if (parallelVectors(linea.direction, worldZ))
        {
            verticales = append(verticales, borde);
        }
    }
    return qUnion(verticales);
}


// ============================================================================
// 1. TAPA FRONTAL SLIM
// ============================================================================
function generarTapaFrontal(context is Context, id is Id, definition is map)
{
    const ancho = 80 * millimeter;
    const alto = 240 * millimeter;
    const prof = 14 * millimeter;
    const esp = definition.espesorPared;

    // 1. Bloque principal
    var skBase = newSketchOnPlane(context, id + "skBase", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skBase, "rectBase", {
        "firstCorner" : vector(-ancho / 2, -alto / 2),
        "secondCorner" : vector(ancho / 2, alto / 2)
    });
    skSolve(skBase);

    extrude(context, id + "extBase", {
        "entities" : qSketchRegion(id + "skBase"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : prof,
        "operationType" : NewBodyOperationType.NEW
    });

    // 2. Redondeo de las 4 esquinas verticales exteriores (R=8mm)
    var bordesVert = filtrarBordesVerticales(context, qCreatedBy(id + "extBase", EntityType.EDGE));
    if (!isQueryEmpty(context, bordesVert))
    {
        opFillet(context, id + "filletEsquinas", {
            "entities" : bordesVert,
            "radius" : 8 * millimeter
        });
    }

    // 3. Vaciado interior para alojar los modulos electronicos
    var planoCavidad = plane(vector(0, 0, esp), vector(0, 0, 1), vector(1, 0, 0));
    var skCavidad = newSketchOnPlane(context, id + "skCavidad", {
        "sketchPlane" : planoCavidad
    });
    skRectangle(skCavidad, "rectCav", {
        "firstCorner" : vector(-ancho / 2 + esp, -alto / 2 + esp),
        "secondCorner" : vector(ancho / 2 - esp, alto / 2 - esp)
    });
    skSolve(skCavidad);

    extrude(context, id + "extCavidad", {
        "entities" : qSketchRegion(id + "skCavidad"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : prof - esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // -- PERFORACIONES Y RELIEVES FRONTALES (Z = 0) --------------------------

    // 4. A) SENSOR SUPERIOR / FLASH & CAMARA OV2640 (Y = +76 mm)
    var skCam = newSketchOnPlane(context, id + "skCam", {
        "sketchPlane" : XY_PLANE
    });
    skCircle(skCam, "holeSensorTop", {
        "center" : vector(0, 94) * millimeter,
        "radius" : 1.8 * millimeter
    });
    skCircle(skCam, "holeLente", {
        "center" : vector(0, 76) * millimeter,
        "radius" : 4.8 * millimeter
    });
    skSolve(skCam);

    extrude(context, id + "extCamHoles", {
        "entities" : qSketchRegion(id + "skCam"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // Bisel concentrico decorativo exterior de la camara
    var skBiselCam = newSketchOnPlane(context, id + "skBiselCam", {
        "sketchPlane" : XY_PLANE
    });
    skCircle(skBiselCam, "anilloCam", {
        "center" : vector(0, 76) * millimeter,
        "radius" : 9.0 * millimeter
    });
    skSolve(skBiselCam);

    extrude(context, id + "extBiselCam", {
        "entities" : qSketchRegion(id + "skBiselCam"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : 0.8 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 5. B) PANTALLA OLED 1.30'' IIC V2.2 (SH1106) + 2 LEDs LATERALES
    var skOled = newSketchOnPlane(context, id + "skOled", {
        "sketchPlane" : XY_PLANE
    });
    // Ventana visible: 34 mm x 19 mm
    skRectangle(skOled, "ventOled", {
        "firstCorner" : vector(-17, 18.5) * millimeter,
        "secondCorner" : vector(17, 37.5) * millimeter
    });
    // LED Verde Superior
    skCircle(skOled, "ledVerde", {
        "center" : vector(24, 34) * millimeter,
        "radius" : 1.6 * millimeter
    });
    // LED Rojo Inferior
    skCircle(skOled, "ledRojo", {
        "center" : vector(24, 22) * millimeter,
        "radius" : 1.6 * millimeter
    });
    // Orificios traseros M2 del PCB OLED (30.5mm x 28.5mm)
    skCircle(skOled, "oledM2_1", { "center" : vector(-15.25, 13.75) * millimeter, "radius" : 1.1 * millimeter });
    skCircle(skOled, "oledM2_2", { "center" : vector(15.25, 13.75) * millimeter,  "radius" : 1.1 * millimeter });
    skCircle(skOled, "oledM2_3", { "center" : vector(-15.25, 42.25) * millimeter, "radius" : 1.1 * millimeter });
    skCircle(skOled, "oledM2_4", { "center" : vector(15.25, 42.25) * millimeter,  "radius" : 1.1 * millimeter });
    skSolve(skOled);

    extrude(context, id + "extOledHoles", {
        "entities" : qSketchRegion(id + "skOled"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // Marco rebajado decorativo del OLED (1.0 mm)
    var skMarcoOled = newSketchOnPlane(context, id + "skMarcoOled", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skMarcoOled, "rectMarcoOled", {
        "firstCorner" : vector(-19, 16.5) * millimeter,
        "secondCorner" : vector(19, 39.5) * millimeter
    });
    skSolve(skMarcoOled);

    extrude(context, id + "extMarcoOled", {
        "entities" : qSketchRegion(id + "skMarcoOled"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : 1.0 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 6. C) TECLADO MATRICIAL 4x4 EMBEBIDO (Y = -62 mm)
    var skCajeraTeclado = newSketchOnPlane(context, id + "skCajeraTeclado", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skCajeraTeclado, "cajeraTeclado", {
        "firstCorner" : vector(-31, -95) * millimeter,
        "secondCorner" : vector(31, -29) * millimeter
    });
    skSolve(skCajeraTeclado);

    extrude(context, id + "extCajeraTeclado", {
        "entities" : qSketchRegion(id + "skCajeraTeclado"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : 1.4 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 16 Teclas cuadradas tactiles modeladas
    var skTeclas = newSketchOnPlane(context, id + "skTeclas", {
        "sketchPlane" : XY_PLANE
    });
    const xCols = [-20.5, -6.8, 6.8, 20.5];
    const yFilas = [-37.5, -51.2, -64.9, -78.6];

    for (var c = 0; c < 4; c += 1)
    {
        for (var f = 0; f < 4; f += 1)
        {
            skRectangle(skTeclas, "tecla_" ~ c ~ "_" ~ f, {
                "firstCorner" : vector(xCols[c] - 5.5, yFilas[f] - 5.5) * millimeter,
                "secondCorner" : vector(xCols[c] + 5.5, yFilas[f] + 5.5) * millimeter
            });
        }
    }
    skRectangle(skTeclas, "flexPasacables", {
        "firstCorner" : vector(-12, -90) * millimeter,
        "secondCorner" : vector(12, -87) * millimeter
    });
    skSolve(skTeclas);

    extrude(context, id + "extFlexSlot", {
        "entities" : qSketchRegion(id + "skTeclas"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 7. D) RANURA LATERAL IZQUIERDA PARA EL CERROJO (X = -ancho/2)
    var planoLateral = plane(vector(-ancho / 2 - 1 * millimeter, 0, 0), vector(-1, 0, 0), vector(0, 1, 0));
    var skRanuraCerrojo = newSketchOnPlane(context, id + "skRanuraCerrojo", {
        "sketchPlane" : planoLateral
    });
    skRectangle(skRanuraCerrojo, "slotCerrojo", {
        "firstCorner" : vector(-16, esp + 1 * millimeter),
        "secondCorner" : vector(16, esp + 11 * millimeter)
    });
    skSolve(skRanuraCerrojo);

    extrude(context, id + "extSlotCerrojo", {
        "entities" : qSketchRegion(id + "skRanuraCerrojo"),
        "direction" : vector(1, 0, 0),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 3 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}


// ============================================================================
// 2. CAJA BASE TRASERA SLIM
// ============================================================================
function generarCajaBase(context is Context, id is Id, definition is map)
{
    const ancho = 80 * millimeter;
    const alto = 240 * millimeter;
    const profBase = 22 * millimeter;
    const esp = definition.espesorPared;

    // 1. Bloque base exterior
    var skBase = newSketchOnPlane(context, id + "skCajaBase", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skBase, "rectCajaBase", {
        "firstCorner" : vector(-ancho / 2, -alto / 2),
        "secondCorner" : vector(ancho / 2, alto / 2)
    });
    skSolve(skBase);

    extrude(context, id + "extCajaBase", {
        "entities" : qSketchRegion(id + "skCajaBase"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : profBase,
        "operationType" : NewBodyOperationType.NEW
    });

    // 2. Redondeo de las 4 esquinas exteriores (R=8mm)
    var bordesVert = filtrarBordesVerticales(context, qCreatedBy(id + "extCajaBase", EntityType.EDGE));
    if (!isQueryEmpty(context, bordesVert))
    {
        opFillet(context, id + "filletBase", {
            "entities" : bordesVert,
            "radius" : 8 * millimeter
        });
    }

    // 3. Vaciado interior
    var planoCav = plane(vector(0, 0, esp), vector(0, 0, 1), vector(1, 0, 0));
    var skCav = newSketchOnPlane(context, id + "skCavBase", {
        "sketchPlane" : planoCav
    });
    skRectangle(skCav, "rectCavBase", {
        "firstCorner" : vector(-ancho / 2 + esp, -alto / 2 + esp),
        "secondCorner" : vector(ancho / 2 - esp, alto / 2 - esp)
    });
    skSolve(skCav);

    extrude(context, id + "extCavBase", {
        "entities" : qSketchRegion(id + "skCavBase"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : profBase - esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 4. Salida lateral izquierda para el cerrojo
    var planoLateral = plane(vector(-ancho / 2 - 1 * millimeter, 0, 0), vector(-1, 0, 0), vector(0, 1, 0));
    var skSalida = newSketchOnPlane(context, id + "skSalidaCerrojo", {
        "sketchPlane" : planoLateral
    });
    skRectangle(skSalida, "ranuraSalida", {
        "firstCorner" : vector(-16, esp + 1 * millimeter),
        "secondCorner" : vector(16, esp + 11 * millimeter)
    });
    skSolve(skSalida);

    extrude(context, id + "extSalidaCerrojo", {
        "entities" : qSketchRegion(id + "skSalidaCerrojo"),
        "direction" : vector(1, 0, 0),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 3 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}


// ============================================================================
// 3. BARRA CREMALLERA (Pestillo / Cerrojo Movil)
// ============================================================================
function generarBarraCremallera(context is Context, id is Id, definition is map, enPosicion is boolean)
{
    const largo = 78 * millimeter;
    const ancho = 12 * millimeter;
    const alto = 10 * millimeter;
    const modulo = 1.5 * millimeter;
    const paso = 3.141592 * modulo;

    var planoInicio = XY_PLANE;
    if (enPosicion)
    {
        planoInicio = plane(vector(-55, -2, 5) * millimeter, vector(0, 0, 1), vector(1, 0, 0));
    }

    var skBarra = newSketchOnPlane(context, id + "skBarra", {
        "sketchPlane" : planoInicio
    });
    skRectangle(skBarra, "rectBarra", {
        "firstCorner" : vector(0, 0),
        "secondCorner" : vector(largo, ancho)
    });
    skSolve(skBarra);

    extrude(context, id + "extBarra", {
        "entities" : qSketchRegion(id + "skBarra"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : alto,
        "operationType" : NewBodyOperationType.NEW
    });

    // Dientes de cremallera encarando hacia el motor (en Y = 0 hacia abajo)
    var skDientes = newSketchOnPlane(context, id + "skDientes", {
        "sketchPlane" : planoInicio
    });
    for (var j = 0; j < 11; j += 1)
    {
        const xCentro = 22 * millimeter + j * paso;
        skRectangle(skDientes, "diente" ~ j, {
            "firstCorner" : vector(xCentro - 1.5 * millimeter, -0.5 * millimeter),
            "secondCorner" : vector(xCentro + 1.5 * millimeter, 2.4 * millimeter)
        });
    }
    skSolve(skDientes);

    extrude(context, id + "extDientes", {
        "entities" : qSketchRegion(id + "skDientes"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : alto + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}


// ============================================================================
// 4. PINON DEL MOTOR
// ============================================================================
function generarPinonMotor(context is Context, id is Id, definition is map)
{
    const espesor = 7.0 * millimeter;
    const radioExterior = 12.0 * millimeter;

    var skPinon = newSketchOnPlane(context, id + "skPinonBase", {
        "sketchPlane" : XY_PLANE
    });
    skCircle(skPinon, "circPinon", {
        "center" : vector(0, 0) * millimeter,
        "radius" : radioExterior
    });
    skSolve(skPinon);

    extrude(context, id + "extPinonBase", {
        "entities" : qSketchRegion(id + "skPinonBase"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : espesor,
        "operationType" : NewBodyOperationType.NEW
    });

    // Calce tipo D para eje de motorreductor (5.4 mm)
    var skEje = newSketchOnPlane(context, id + "skEje", {
        "sketchPlane" : XY_PLANE
    });
    skCircle(skEje, "circEje", {
        "center" : vector(0, 0) * millimeter,
        "radius" : 2.7 * millimeter
    });
    skRectangle(skEje, "corteD", {
        "firstCorner" : vector(1.9, -3.0) * millimeter,
        "secondCorner" : vector(4.0, 3.0) * millimeter
    });
    skSolve(skEje);

    extrude(context, id + "extCorteEje", {
        "entities" : qSketchRegion(id + "skEje"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : espesor + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}
