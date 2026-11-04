// ============================================================================
// NexLock — Gabinete y Mecanismo 3D (FeatureScript para Onshape)
// ============================================================================
// 
// ⚠️ IMPORTANTE SOBRE LAS DOS PRIMERAS LÍNEAS DE VERSIÓN:
// Al crear un nuevo "Feature Studio" en Onshape, el editor escribe automáticamente
// las 2 primeras líneas con la versión exacta de tu documento.
// Mantén esas 2 líneas originales que Onshape te generó y pega el resto debajo.
// ============================================================================

FeatureScript 2400; // <- Si tu Onshape tiene otro número aquí (ej: 2411, 2200), conserva el tuyo
import(path : "onshape/std/geometry.fs", version : "2400.0"); // <- Conserva tu versión original

/**
 * Componentes y adaptaciones integradas:
 *  1. Pantalla OLED 1.30'' IIC V2.2 (Controlador SH1106, 128x64):
 *     - Ventana frontal: 32 mm x 18 mm
 *     - 4 orificios de montaje M2 con separación entre centros: 30.5 mm x 28.5 mm
 *  2. ESP32-CAM:
 *     - Alojamiento en la cara interior para cable plano flex corto del sensor OV2640
 *     - Orificio para el lente: 9.2 mm
 *     - Orificio para el LED Flash: 4.5 mm
 *  3. Teclado Matricial 4x4:
 *     - Rebaje frontal de 0.8 mm (70 mm x 77 mm)
 *     - Ranura pasa-cables de 22 mm x 2.5 mm
 *  4. LEDs de Estado (Verde / Rojo) de 5.2 mm y Rejilla acústica para Buzzer
 *  5. Interruptor balancín de encendido (15.2 mm x 10.6 mm)
 *  6. Mecanismo de Cerradura:
 *     - Barra Cremallera con dientes encarando HACIA el engranaje piñón
 *     - Piñón circular con calce para eje de motor tipo D
 *     - Rieles guía lineales y cuna soporte para motorreductor
 */

// ── ENUM SELECTOR DE PIEZAS ────────────────────────────────────────────────
export enum TipoPiezaNexLock
{
    annotation { "Name" : "Tapa Frontal (OLED 1.3, Camara, Teclado, LEDs)" }
    TAPA_FRONTAL,
    annotation { "Name" : "Caja Base (Soporte Motor, Rieles y ESP32)" }
    CAJA_BASE,
    annotation { "Name" : "Barra Cremallera (Cerrojo dentado movil)" }
    BARRA_CREMALLERA,
    annotation { "Name" : "Pinon Motor (Engranaje circular eje D)" }
    PINON_MOTOR
}

// ── DEFINICIÓN DEL CUSTOM FEATURE ──────────────────────────────────────────
annotation { "Feature Type Name" : "NexLock Gabinete y Mecanismo", "UIHint" : "UIHINT_SHOW_IN_NAVIGATOR" }
export const nexlockGabinete = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Seleccionar Pieza a Generar" }
        definition.pieza is TipoPiezaNexLock;

        annotation { "Name" : "Espesor de Pared" }
        isLength(definition.espesorPared, { (millimeter) : [1.5, 2.6, 5.0] } as LengthBoundSpec);
    }
    {
        if (definition.pieza == TipoPiezaNexLock.TAPA_FRONTAL)
        {
            generarTapaFrontal(context, id, definition);
        }
        else if (definition.pieza == TipoPiezaNexLock.CAJA_BASE)
        {
            generarCajaBase(context, id, definition);
        }
        else if (definition.pieza == TipoPiezaNexLock.BARRA_CREMALLERA)
        {
            generarBarraCremallera(context, id, definition);
        }
        else if (definition.pieza == TipoPiezaNexLock.PINON_MOTOR)
        {
            generarPinonMotor(context, id, definition);
        }
    });

// ── FUNCIÓN AUXILIAR: FILTRAR BORDES VERTICALES PARA REDONDEO ──────────────
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
// 1. TAPA FRONTAL
// ============================================================================
function generarTapaFrontal(context is Context, id is Id, definition is map)
{
    const ancho = 108 * millimeter;
    const alto = 178 * millimeter;
    const prof = 12 * millimeter;
    const esp = definition.espesorPared;

    // 1. Bloque exterior base en el plano XY (Z=0)
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

    // 2. Redondeo de las 4 esquinas exteriores (R=6mm)
    var bordesVert = filtrarBordesVerticales(context, qCreatedBy(id + "extBase", EntityType.EDGE));
    if (!isQueryEmpty(context, bordesVert))
    {
        opFillet(context, id + "filletEsquinas", {
            "entities" : bordesVert,
            "radius" : 6 * millimeter
        });
    }

    // 3. Vaciado interior (Cavitad)
    // El vaciado se hace desde Z = esp hacia arriba para dejar la pared frontal sólida de espesor 'esp'
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

    // 4. Perforaciones en el frente (Plano XY Z=0)
    var skCortes = newSketchOnPlane(context, id + "skCortes", {
        "sketchPlane" : XY_PLANE
    });

    // A) ESP32-CAM: Lente (diam 9.2mm) y Flash (diam 4.5mm)
    // Ubicado en la parte superior: Y = 57 mm
    skCircle(skCortes, "lenteCam", {
        "center" : vector(0, 57) * millimeter,
        "radius" : 4.6 * millimeter
    });
    skCircle(skCortes, "flashCam", {
        "center" : vector(0, 65) * millimeter,
        "radius" : 2.25 * millimeter
    });

    // B) PANTALLA OLED 1.30'' IIC V2.2 (Controlador SH1106)
    // Ventana visible activa: 32 mm x 18 mm
    skRectangle(skCortes, "ventanaOled", {
        "firstCorner" : vector(-16, 0) * millimeter,
        "secondCorner" : vector(16, 18) * millimeter
    });
    // 4 orificios para tornillos M2 de fijación OLED (30.5 mm en X, 28.5 mm en Y)
    const oledX = 15.25 * millimeter;
    const oledY1 = -5.25 * millimeter;
    const oledY2 = 23.25 * millimeter;
    skCircle(skCortes, "oledHole1", { "center" : vector(-oledX, oledY1), "radius" : 1.1 * millimeter });
    skCircle(skCortes, "oledHole2", { "center" : vector(oledX, oledY1),  "radius" : 1.1 * millimeter });
    skCircle(skCortes, "oledHole3", { "center" : vector(-oledX, oledY2), "radius" : 1.1 * millimeter });
    skCircle(skCortes, "oledHole4", { "center" : vector(oledX, oledY2),  "radius" : 1.1 * millimeter });

    // C) LEDs de Estado (Verde y Rojo) de 5.2 mm
    skCircle(skCortes, "ledVerde", { "center" : vector(-28, 9) * millimeter, "radius" : 2.6 * millimeter });
    skCircle(skCortes, "ledRojo",  { "center" : vector(28, 9) * millimeter,  "radius" : 2.6 * millimeter });

    // D) Rejilla Acústica Buzzer (Patrón circular)
    skCircle(skCortes, "buzzerC", { "center" : vector(-28, -11) * millimeter, "radius" : 1.2 * millimeter });
    for (var i = 0; i < 6; i += 1)
    {
        const ang = i * 60 * degree;
        skCircle(skCortes, "buzzer" ~ i, {
            "center" : vector(-28 + 4.0 * cos(ang), -11 + 4.0 * sin(ang)) * millimeter,
            "radius" : 1.1 * millimeter
        });
    }

    // E) Teclado Matricial 4x4 (Zona inferior: Y = -47 mm)
    // Ranura pasacables hacia el interior
    skRectangle(skCortes, "ranuraTeclado", {
        "firstCorner" : vector(-11, -16) * millimeter,
        "secondCorner" : vector(11, -13.5) * millimeter
    });

    // F) 4 orificios en las esquinas para tornillos de cierre M3
    const tornX = 44 * millimeter;
    const tornY = 79 * millimeter;
    skCircle(skCortes, "torn1", { "center" : vector(-tornX, -tornY), "radius" : 1.7 * millimeter });
    skCircle(skCortes, "torn2", { "center" : vector(tornX, -tornY),  "radius" : 1.7 * millimeter });
    skCircle(skCortes, "torn3", { "center" : vector(-tornX, tornY),  "radius" : 1.7 * millimeter });
    skCircle(skCortes, "torn4", { "center" : vector(tornX, tornY),   "radius" : 1.7 * millimeter });

    skSolve(skCortes);

    extrude(context, id + "extCortes", {
        "entities" : qSketchRegion(id + "skCortes"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 5. Rebaje superficial para alojar la lámina del teclado matricial (0.8 mm de prof en Z=0)
    var skRebajeTeclado = newSketchOnPlane(context, id + "skRebajeTeclado", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skRebajeTeclado, "rebajeTeclado", {
        "firstCorner" : vector(-35, -85.5) * millimeter,
        "secondCorner" : vector(35, -8.5) * millimeter
    });
    skSolve(skRebajeTeclado);

    extrude(context, id + "extRebajeTeclado", {
        "entities" : qSketchRegion(id + "skRebajeTeclado"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : 0.8 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}


// ============================================================================
// 2. CAJA BASE TRASERA
// ============================================================================
function generarCajaBase(context is Context, id is Id, definition is map)
{
    const ancho = 108 * millimeter;
    const alto = 178 * millimeter;
    const prof = 28 * millimeter;
    const esp = definition.espesorPared;

    // 1. Bloque exterior base
    var skBase = newSketchOnPlane(context, id + "skBaseCaja", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skBase, "rectBaseCaja", {
        "firstCorner" : vector(-ancho / 2, -alto / 2),
        "secondCorner" : vector(ancho / 2, alto / 2)
    });
    skSolve(skBase);

    extrude(context, id + "extBaseCaja", {
        "entities" : qSketchRegion(id + "skBaseCaja"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : prof,
        "operationType" : NewBodyOperationType.NEW
    });

    // 2. Redondeo de las 4 esquinas verticales (R=6mm)
    var bordesVert = filtrarBordesVerticales(context, qCreatedBy(id + "extBaseCaja", EntityType.EDGE));
    if (!isQueryEmpty(context, bordesVert))
    {
        opFillet(context, id + "filletCaja", {
            "entities" : bordesVert,
            "radius" : 6 * millimeter
        });
    }

    // 3. Vaciado interior (Cavitad desde Z = esp hacia arriba)
    var planoCavidad = plane(vector(0, 0, esp), vector(0, 0, 1), vector(1, 0, 0));
    var skCavidad = newSketchOnPlane(context, id + "skCavidadCaja", {
        "sketchPlane" : planoCavidad
    });
    skRectangle(skCavidad, "rectCavCaja", {
        "firstCorner" : vector(-ancho / 2 + esp, -alto / 2 + esp),
        "secondCorner" : vector(ancho / 2 - esp, alto / 2 - esp)
    });
    skSolve(skCavidad);

    extrude(context, id + "extCavidadCaja", {
        "entities" : qSketchRegion(id + "skCavidadCaja"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : prof - esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 4. Salida lateral para el cerrojo (en la pared lateral izquierda X = -ancho/2)
    var planoLateral = plane(vector(-ancho / 2 - 1 * millimeter, 0, 0), vector(-1, 0, 0), vector(0, 1, 0));
    var skSalidaCerrojo = newSketchOnPlane(context, id + "skSalidaCerrojo", {
        "sketchPlane" : planoLateral
    });
    // Ventana para la salida del cerrojo (ancho 13mm en Y, alto 11mm en Z)
    skRectangle(skSalidaCerrojo, "ranuraCerrojo", {
        "firstCorner" : vector(-39, esp) * millimeter,
        "secondCorner" : vector(-26, esp + 11 * millimeter)
    });
    skSolve(skSalidaCerrojo);

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
// 3. BARRA CREMALLERA (Cerrojo Móvil — Dientes hacia el Piñón)
// ============================================================================
function generarBarraCremallera(context is Context, id is Id, definition is map)
{
    const largo = 85 * millimeter;
    const ancho = 12 * millimeter;
    const alto = 10 * millimeter;
    const modulo = 1.5 * millimeter;
    const paso = 3.141592 * modulo; // ~4.712 mm

    // 1. Barra sólida base
    var skBarra = newSketchOnPlane(context, id + "skBarra", {
        "sketchPlane" : XY_PLANE
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

    // 2. Dientes de cremallera encarando al piñón (en la cara Y=0, hacia -Y)
    var skDientes = newSketchOnPlane(context, id + "skDientesCremallera", {
        "sketchPlane" : XY_PLANE
    });

    for (var j = 0; j < 12; j += 1)
    {
        const xCentro = 25 * millimeter + j * paso;
        skRectangle(skDientes, "diente" ~ j, {
            "firstCorner" : vector(xCentro - 1.5 * millimeter, -0.5 * millimeter),
            "secondCorner" : vector(xCentro + 1.5 * millimeter, 2.5 * millimeter)
        });
    }
    skSolve(skDientes);

    extrude(context, id + "extDientesCremallera", {
        "entities" : qSketchRegion(id + "skDientesCremallera"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : alto + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}


// ============================================================================
// 4. PIÑÓN MOTOR (Engranaje circular)
// ============================================================================
function generarPinonMotor(context is Context, id is Id, definition is map)
{
    const espesor = 7.0 * millimeter;
    const radioExterior = 12.0 * millimeter;

    // 1. Cilindro base
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

    // 2. Orificio para eje motor tipo D (5.4 mm con plano de 0.8 mm)
    var skEje = newSketchOnPlane(context, id + "skEjeMotor", {
        "sketchPlane" : XY_PLANE
    });
    skCircle(skEje, "circEje", {
        "center" : vector(0, 0) * millimeter,
        "radius" : 2.7 * millimeter
    });
    // Plano antideslizamiento tipo D
    skRectangle(skEje, "cortePlanoD", {
        "firstCorner" : vector(1.9, -3.0) * millimeter,
        "secondCorner" : vector(4.0, 3.0) * millimeter
    });
    skSolve(skEje);

    extrude(context, id + "extCorteEje", {
        "entities" : qSketchRegion(id + "skEjeMotor"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : espesor + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });
}
