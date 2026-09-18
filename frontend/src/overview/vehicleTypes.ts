/**
 * The vehicle fleet, transcribed from sumo/vehicles/vehicle_types.add.xml.
 *
 * That file is frozen, and every dimension and colour below is copied
 * from it rather than invented — `length` and `width` are the SUMO
 * values in metres, and `colour` is its `color="r,g,b"` triple converted
 * to hex. Heights are the one thing SUMO does not model (it is a 2D
 * microsimulator), so those are chosen to look right at this scale and
 * are marked as such.
 *
 * Holding the table here rather than sending it per-vehicle keeps the
 * snapshot small: the type id travels, the static dimensions do not.
 */

export type VehicleClass = 'car' | 'motorcycle' | 'rickshaw' | 'bus' | 'truck' | 'emergency'

export interface VehicleShape {
  kind: VehicleClass
  /** Metres, from the vType definition. */
  length: number
  width: number
  /** Metres. Not modelled by SUMO — chosen for the 3D view. */
  height: number
  /** The vType's own `color`, as hex. */
  colour: string
  label: string
}

const CAR_BODY = { kind: 'car' as const, length: 4.5, width: 1.8, height: 1.5 }
const BIKE_BODY = { kind: 'motorcycle' as const, length: 2.0, width: 0.7, height: 1.3 }

export const VEHICLE_TYPES: Record<string, VehicleShape> = {
  car_cautious: { ...CAR_BODY, colour: '#d9d9e6', label: 'Car' },
  car_normal: { ...CAR_BODY, colour: '#e6e6e6', label: 'Car' },
  car_aggressive: { ...CAR_BODY, colour: '#b32626', label: 'Car' },

  motorcycle_cautious: { ...BIKE_BODY, colour: '#262699', label: 'Motorcycle' },
  motorcycle_normal: { ...BIKE_BODY, colour: '#3333cc', label: 'Motorcycle' },
  motorcycle_aggressive: { ...BIKE_BODY, colour: '#4d4dff', label: 'Motorcycle' },

  auto_rickshaw: { kind: 'rickshaw', length: 2.6, width: 1.4, height: 1.75, colour: '#ffcc00', label: 'Auto rickshaw' },
  bus: { kind: 'bus', length: 10.5, width: 2.5, height: 3.2, colour: '#e66600', label: 'Bus' },
  truck: { kind: 'truck', length: 8.0, width: 2.5, height: 3.0, colour: '#4d734d', label: 'Truck' },

  ambulance: { kind: 'emergency', length: 5.5, width: 2.0, height: 2.3, colour: '#99ff00', label: 'Ambulance' },
  police_vehicle: { kind: 'emergency', length: 4.8, width: 1.9, height: 1.6, colour: '#000099', label: 'Police' },
  fire_engine: { kind: 'emergency', length: 9.0, width: 2.5, height: 3.2, colour: '#ff0000', label: 'Fire engine' },
}

/**
 * The roof light bar an emergency type carries, as the two lamp colours
 * that alternate: ambulance red/blue, fire engine red/red, police
 * blue/red. Undefined for everything else.
 */
export const BEACONS: Record<string, [string, string]> = {
  ambulance: ['#ff2a2a', '#2a6dff'],
  fire_engine: ['#ff2a2a', '#ff2a2a'],
  police_vehicle: ['#2a6dff', '#ff2a2a'],
}

/** What an unrecognised type is drawn as — a plain car, not nothing. */
export const DEFAULT_SHAPE: VehicleShape = { ...CAR_BODY, colour: '#e6e6e6', label: 'Vehicle' }

export function shapeOf(typeId: string | undefined): VehicleShape {
  if (!typeId) return DEFAULT_SHAPE
  return VEHICLE_TYPES[typeId] ?? DEFAULT_SHAPE
}
