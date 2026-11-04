FeatureScript 3112;
import(path : "onshape/std/geometry.fs", version : "3112.0");

/**
 * ============================================================================
 * NexLock - Smart Lock Vertical Column (Diseno Pro Slim)
 * ============================================================================
 *
 * Diseno ajustado a los componentes fisicos reales:
 *  1. FORMATO: Gabinete de 80 mm ancho x 240 mm alto x 36 mm profundidad total
 *     (Tapa frontal: 14 mm de prof. / Caja base trasera: 22 mm de prof.).
 *  2. PANTALLA OLED 1.30'' IIC V2.2 (SH1106):
 *     - Ventana visible: 32 mm x 18 mm (centrada en los pixeles activos).
 *     - 4 orificios traseros M2 separados a 30.5 mm (X) x 28.5 mm (Y).
 *  3. ESP32-CAM:
 *     - Orificio de lente de 9.5 mm (para sensor OV2640 de 8.5-9.0 mm).
 *     - Orificio superior para sensor/flash a 8.5 mm del centro del lente.
 *     - Cuna interior que aloja el PCB de 27x40 mm pegado al frente.
 *  4. TECLADO MATRICIAL 4x4 (MEMBRANA):
 *     - Rebaje plano para pegar el sticker autoadhesivo al ras.
 *     - Ranura pasacables (22 mm x 2.5 mm) para pasar la cinta flex ("lengua").
 *  5. CERROJO Y MOTOR:
 *     - Barra cremallera mvil saliendo por la izquierda.
 *     - Pinon con calce para el eje macho del motorreductor.
 *     - Caja base completa con pared trasera, riel de deslizamiento y soporte motor.
 */

// -- ENUM SELECTOR DE PIEZAS ------------------------------------------------
export enum TipoPiezaNexLock
{
    annotation { "Name" : "Ensamble Completo (Caja Cerrada con Cerrojo)" }
    ENSAMBLE_COMPLETO,
    annotation { "Name" : "Tapa Frontal (Camara, OLED 1.3, Ranura Teclado, LEDs)" }
    TAPA_FRONTAL,
    annotation { "Name" : "Caja Base (Soporte Motor, Rieles, Pared Trasera)" }
    CAJA_BASE,
    annotation { "Name" : "Pestillo Cerrojo (Barra Cremallera dentada)" }
    BARRA_CREMALLERA,
    annotation { "Name" : "Pinon Motor (Engranaje circular eje motor)" }
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
            // Tapa frontal en Z = 0 a Z = 14 mm
            generarTapaFrontal(context, id + "tapa", definition);
            // Caja base montada exactamente detras en Z = -22 mm a Z = 0 mm
            generarCajaBase(context, id + "base", definition, true);
            // Cerrojo ubicado dentro de su guia lateral
            generarBarraCremallera(context, id + "cerrojo", definition, true);
            // Pinon colocado sobre el eje del motor
            generarPinonMotor(context, id + "pinon", definition, true);
        }
        else if (definition.pieza == TipoPiezaNexLock.TAPA_FRONTAL)
        {
            generarTapaFrontal(context, id, definition);
        }
        else if (definition.pieza == TipoPiezaNexLock.CAJA_BASE)
        {
            generarCajaBase(context, id, definition, false);
        }
        else if (definition.pieza == TipoPiezaNexLock.BARRA_CREMALLERA)
        {
            generarBarraCremallera(context, id, definition, false);
        }
        else if (definition.pieza == TipoPiezaNexLock.PINON_MOTOR)
        {
            generarPinonMotor(context, id, definition, false);
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

    // 1. Bloque base exterior (Z = 0 a Z = 14 mm)
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

    // 2. Redondeo de las 4 esquinas exteriores (R = 8 mm)
    var bordesVert = filtrarBordesVerticales(context, qCreatedBy(id + "extBase", EntityType.EDGE));
    if (!isQueryEmpty(context, bordesVert))
    {
        opFillet(context, id + "filletEsquinas", {
            "entities" : bordesVert,
            "radius" : 8 * millimeter
        });
    }

    // 3. Vaciado interior de la tapa (de Z = esp hacia arriba)
    var planoCavidad = plane(vector(0 * millimeter, 0 * millimeter, esp), vector(0, 0, 1), vector(1, 0, 0));
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

    //  CALADOS FRONTALES (Z = 0) 

    // 4. A) CAMARA OV2640 & SENSOR TOP (Y = +76 mm)
    var skCam = newSketchOnPlane(context, id + "skCam", {
        "sketchPlane" : XY_PLANE
    });
    // Orificio superior (flash o microfono)
    skCircle(skCam, "holeFlashTop", {
        "center" : vector(0, 94) * millimeter,
        "radius" : 1.8 * millimeter
    });
    // Orificio pasante para el lente de camara (diametro 9.5 mm)
    skCircle(skCam, "holeLente", {
        "center" : vector(0, 76) * millimeter,
        "radius" : 4.75 * millimeter
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

    // Bisel concentrico decorativo alrededor de la camara (rebaje 0.8 mm)
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
    // Ventana visible centrada en Y = +28 mm (32 mm ancho x 18 mm alto)
    var skOled = newSketchOnPlane(context, id + "skOled", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skOled, "ventOled", {
        "firstCorner" : vector(-16, 19) * millimeter,
        "secondCorner" : vector(16, 37) * millimeter
    });
    // LED Verde Superior (Acceso Permitido)
    skCircle(skOled, "ledVerde", {
        "center" : vector(24, 34) * millimeter,
        "radius" : 1.6 * millimeter
    });
    // LED Rojo Inferior (Bloqueo / Denegado)
    skCircle(skOled, "ledRojo", {
        "center" : vector(24, 22) * millimeter,
        "radius" : 1.6 * millimeter
    });
    // 4 orificios traseros para tornillos M2 del OLED (30.5 mm x 28.5 mm)
    skCircle(skOled, "m2_1", { "center" : vector(-15.25, 13.75) * millimeter, "radius" : 1.1 * millimeter });
    skCircle(skOled, "m2_2", { "center" : vector(15.25, 13.75) * millimeter,  "radius" : 1.1 * millimeter });
    skCircle(skOled, "m2_3", { "center" : vector(-15.25, 42.25) * millimeter, "radius" : 1.1 * millimeter });
    skCircle(skOled, "m2_4", { "center" : vector(15.25, 42.25) * millimeter,  "radius" : 1.1 * millimeter });
    skSolve(skOled);

    extrude(context, id + "extOledHoles", {
        "entities" : qSketchRegion(id + "skOled"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // Marco exterior rebajado del display OLED (36 mm x 22 mm x 1.0 mm)
    var skMarcoOled = newSketchOnPlane(context, id + "skMarcoOled", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skMarcoOled, "rectMarcoOled", {
        "firstCorner" : vector(-18, 17) * millimeter,
        "secondCorner" : vector(18, 39) * millimeter
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

    // 6. C) TECLADO MATRICIAL 4x4 (MEMBRANA PLANA):
    // Cajera rebajada de 0.8 mm para pegar el sticker autoadhesivo al ras
    // + Ranura pasacables para que entre la cinta ("lengua") al interior
    var skTeclado = newSketchOnPlane(context, id + "skTeclado", {
        "sketchPlane" : XY_PLANE
    });
    // Bolsillo plano para pegar la membrana del teclado (68 mm x 74 mm)
    skRectangle(skTeclado, "cajeraMembrana", {
        "firstCorner" : vector(-34, -98) * millimeter,
        "secondCorner" : vector(34, -24) * millimeter
    });
    skSolve(skTeclado);

    // 1. Rebaje superficial para el sticker (0.8 mm)
    extrude(context, id + "extCajeraMembrana", {
        "entities" : qSketchRegion(id + "skTeclado"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : 0.8 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 2. Ranura pasante hacia el interior solo para la cinta flexible ("lengua")
    var skSlotFlex = newSketchOnPlane(context, id + "skSlotFlex", {
        "sketchPlane" : XY_PLANE
    });
    skRectangle(skSlotFlex, "slotFlexPuro", {
        "firstCorner" : vector(-11, -95) * millimeter,
        "secondCorner" : vector(11, -92) * millimeter
    });
    skSolve(skSlotFlex);

    extrude(context, id + "extSlotFlexPasante", {
        "entities" : qSketchRegion(id + "skSlotFlex"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : esp + 2 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 7. D) RANURA LATERAL IZQUIERDA PARA EL CERROJO (X = -ancho/2)
    var planoLateral = plane(vector(-ancho / 2 - 1 * millimeter, 0 * millimeter, 0 * millimeter), vector(1, 0, 0), vector(0, 1, 0));
    var skRanuraCerrojo = newSketchOnPlane(context, id + "skRanuraCerrojo", {
        "sketchPlane" : planoLateral
    });
    skRectangle(skRanuraCerrojo, "slotCerrojo", {
        "firstCorner" : vector(-8 * millimeter, 0 * millimeter),
        "secondCorner" : vector(8 * millimeter, 4.5 * millimeter)
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
// 2. CAJA BASE TRASERA COMPLETA (CON PARED DE FONDO, RIELES Y SOPORTES)
// ============================================================================
function generarCajaBase(context is Context, id is Id, definition is map, enPosicion is boolean)
{
    const ancho = 80 * millimeter;
    const alto = 240 * millimeter;
    const profBase = 22 * millimeter;
    const esp = definition.espesorPared;

    // En ensamble, la caja base se genera por detras de la tapa (de Z = -profBase a Z = 0)
    var planoBase = XY_PLANE;
    var dirExtrude = vector(0, 0, 1);
    if (enPosicion)
    {
        planoBase = plane(vector(0 * millimeter, 0 * millimeter, -profBase), vector(0, 0, 1), vector(1, 0, 0));
    }

    // 1. Bloque exterior completo con pared de fondo
    var skBase = newSketchOnPlane(context, id + "skCajaBase", {
        "sketchPlane" : planoBase
    });
    skRectangle(skBase, "rectCajaBase", {
        "firstCorner" : vector(-ancho / 2, -alto / 2),
        "secondCorner" : vector(ancho / 2, alto / 2)
    });
    skSolve(skBase);

    extrude(context, id + "extCajaBase", {
        "entities" : qSketchRegion(id + "skCajaBase"),
        "direction" : dirExtrude,
        "endBound" : BoundingType.BLIND,
        "depth" : profBase,
        "operationType" : NewBodyOperationType.NEW
    });

    // 2. Redondeo de las 4 esquinas exteriores (R = 8 mm)
    var bordesVert = filtrarBordesVerticales(context, qCreatedBy(id + "extCajaBase", EntityType.EDGE));
    if (!isQueryEmpty(context, bordesVert))
    {
        opFillet(context, id + "filletBase", {
            "entities" : bordesVert,
            "radius" : 8 * millimeter
        });
    }

    // 3. Vaciado interior (deja la pared de fondo solida de espesor 'esp')
    var zCavidad = esp;
    if (enPosicion)
    {
        zCavidad = -profBase + esp;
    }
    var planoCav = plane(vector(0 * millimeter, 0 * millimeter, zCavidad), vector(0, 0, 1), vector(1, 0, 0));
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
        "direction" : dirExtrude,
        "endBound" : BoundingType.BLIND,
        "depth" : profBase - esp + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 4. Salida lateral izquierda para el cerrojo (coincidente con la ranura de la tapa)
    var zTopRim = profBase;
    if (enPosicion)
    {
        zTopRim = 0 * millimeter;
    }
    var planoLateralBase = plane(vector(-ancho / 2 - 1 * millimeter, 0 * millimeter, 0 * millimeter), vector(1, 0, 0), vector(0, 1, 0));
    var skSalida = newSketchOnPlane(context, id + "skSalidaCerrojo", {
        "sketchPlane" : planoLateralBase
    });
    skRectangle(skSalida, "ranuraSalida", {
        "firstCorner" : vector(-8 * millimeter, zTopRim - 8.5 * millimeter),
        "secondCorner" : vector(8 * millimeter, zTopRim + 0.5 * millimeter)
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

    // 5. Torres de fijacion en las 4 esquinas (bosses con orificio piloto M3)
    var skBosses = newSketchOnPlane(context, id + "skBosses", {
        "sketchPlane" : planoCav
    });
    const xB = 28 * millimeter;
    const yB = 108 * millimeter;
    const radioBoss = 3.8 * millimeter;
    const radioHole = 1.5 * millimeter;

    // Boss 1 (+X, +Y)
    skCircle(skBosses, "boss1Out", { "center" : vector(xB, yB), "radius" : radioBoss });
    skCircle(skBosses, "boss1In",  { "center" : vector(xB, yB), "radius" : radioHole });
    // Boss 2 (-X, +Y)
    skCircle(skBosses, "boss2Out", { "center" : vector(-xB, yB), "radius" : radioBoss });
    skCircle(skBosses, "boss2In",  { "center" : vector(-xB, yB), "radius" : radioHole });
    // Boss 3 (+X, -Y)
    skCircle(skBosses, "boss3Out", { "center" : vector(xB, -yB), "radius" : radioBoss });
    skCircle(skBosses, "boss3In",  { "center" : vector(xB, -yB), "radius" : radioHole });
    // Boss 4 (-X, -Y)
    skCircle(skBosses, "boss4Out", { "center" : vector(-xB, -yB), "radius" : radioBoss });
    skCircle(skBosses, "boss4In",  { "center" : vector(-xB, -yB), "radius" : radioHole });
    skSolve(skBosses);

    extrude(context, id + "extBosses", {
        "entities" : qSketchRegion(id + "skBosses"),
        "direction" : dirExtrude,
        "endBound" : BoundingType.BLIND,
        "depth" : profBase - esp,
        "operationType" : NewBodyOperationType.ADD,
        "defaultScope" : true
    });

    // 6. Rieles guia para el deslizamiento horizontal del cerrojo
    var skGuias = newSketchOnPlane(context, id + "skGuias", {
        "sketchPlane" : planoCav
    });
    // Riel superior (Y = +7.5 a +9.5 mm)
    skRectangle(skGuias, "guiaSup", {
        "firstCorner" : vector(-38 * millimeter, 7.5 * millimeter),
        "secondCorner" : vector(10 * millimeter, 9.5 * millimeter)
    });
    // Riel inferior (Y = -9.5 a -7.5 mm)
    skRectangle(skGuias, "guiaInf", {
        "firstCorner" : vector(-38 * millimeter, -9.5 * millimeter),
        "secondCorner" : vector(10 * millimeter, -7.5 * millimeter)
    });
    skSolve(skGuias);

    extrude(context, id + "extGuias", {
        "entities" : qSketchRegion(id + "skGuias"),
        "direction" : dirExtrude,
        "endBound" : BoundingType.BLIND,
        "depth" : 7.0 * millimeter,
        "operationType" : NewBodyOperationType.ADD,
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
        // Posicionado asomando 18 mm por el lateral izquierdo (X = -ancho/2)
        planoInicio = plane(vector(-58 * millimeter, -6 * millimeter, -7 * millimeter), vector(0, 0, 1), vector(1, 0, 0));
    }

    var skBarra = newSketchOnPlane(context, id + "skBarra", {
        "sketchPlane" : planoInicio
    });
    skRectangle(skBarra, "rectBarra", {
        "firstCorner" : vector(0, 0) * millimeter,
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
// 4. PINON DEL MOTOR (Engranaje macho para eje de motorreductor)
// ============================================================================
function generarPinonMotor(context is Context, id is Id, definition is map, enPosicion is boolean)
{
    const espesor = 7.0 * millimeter;
    const radioExterior = 12.0 * millimeter;

    var planoPinon = XY_PLANE;
    if (enPosicion)
    {
        // Alineado exactamente engrane con la cremallera en la caja base
        planoPinon = plane(vector(-18 * millimeter, -17 * millimeter, -5 * millimeter), vector(0, 0, 1), vector(1, 0, 0));
    }

    var skPinon = newSketchOnPlane(context, id + "skPinonBase", {
        "sketchPlane" : planoPinon
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

    // 2. Tallado de 14 dientes de engranaje (Modulo 1.5, perimetro dentado)
    var skDientesPinon = newSketchOnPlane(context, id + "skDientesPinon", {
        "sketchPlane" : planoPinon
    });
    for (var k = 0; k < 14; k += 1)
    {
        const ang = (k * 25.714) * degree;
        const xGroove = 11.8 * millimeter * cos(ang);
        const yGroove = 11.8 * millimeter * sin(ang);
        skCircle(skDientesPinon, "groove" ~ k, {
            "center" : vector(xGroove, yGroove),
            "radius" : 1.6 * millimeter
        });
    }
    skSolve(skDientesPinon);

    extrude(context, id + "extDientesPinon", {
        "entities" : qSketchRegion(id + "skDientesPinon"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : espesor + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 3. Orificio central del eje macho del motor (diametro 5.4 mm)
    var skEjeHole = newSketchOnPlane(context, id + "skEjeHole", {
        "sketchPlane" : planoPinon
    });
    skCircle(skEjeHole, "circEje", {
        "center" : vector(0, 0) * millimeter,
        "radius" : 2.7 * millimeter
    });
    skSolve(skEjeHole);

    extrude(context, id + "extEjeHole", {
        "entities" : qSketchRegion(id + "skEjeHole"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : espesor + 1 * millimeter,
        "operationType" : NewBodyOperationType.REMOVE,
        "defaultScope" : true
    });

    // 4. Cara plana de chavetero en D para acople antigiro con el motor
    var skFlat = newSketchOnPlane(context, id + "skFlat", {
        "sketchPlane" : planoPinon
    });
    skRectangle(skFlat, "rectFlat", {
        "firstCorner" : vector(1.9 * millimeter, -2.0 * millimeter),
        "secondCorner" : vector(2.7 * millimeter, 2.0 * millimeter)
    });
    skSolve(skFlat);

    extrude(context, id + "extFlat", {
        "entities" : qSketchRegion(id + "skFlat"),
        "direction" : vector(0, 0, 1),
        "endBound" : BoundingType.BLIND,
        "depth" : espesor,
        "operationType" : NewBodyOperationType.ADD,
        "defaultScope" : true
    });
}
