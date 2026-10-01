/**
 * The joyride's shared notes: which view the Overview twin shows (written
 * by TwinViewport, demo only) and which vehicle Blinky is riding in 3D
 * (written by ride.ts, cleared by Junction3D when that vehicle leaves).
 */
export const rideBus: { view: 'plan' | '3d' | null; vehicleId: string | null } = { view: null, vehicleId: null }
