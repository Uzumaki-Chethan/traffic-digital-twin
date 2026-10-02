/**
 * The morning city's shaders (Section 48). One sky function colours the
 * dome, hazes every surface into exactly the sky behind it and is what
 * glass reflects; one light function (sun + sky + ground bounce, with the
 * sun's shadow map) lights everything. Colours are linear; every fragment
 * shader ends with three's tone-mapping and colour-space chunks, so the
 * same shaders are right whether the frame goes through the composer (an
 * HDR target, tone-mapped by its OutputPass) or straight to the screen
 * (the light-quality path).
 */

export const COMMON = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uFogDensity;
  uniform sampler2DShadow uShadowMap;
  uniform float uShadowTexel;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // A clear morning: deep blue overhead, a pale haze at the horizon,
  // warm around the low sun.
  vec3 skyColor(vec3 d) {
    float y = d.y;
    vec3 zenith = vec3(0.05, 0.15, 0.46);
    vec3 horizon = vec3(0.46, 0.56, 0.7);
    vec3 col = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.5));
    float sd = max(dot(d, uSunDir), 0.0);
    vec2 h = normalize(d.xz + vec2(1e-5));
    float az = max(dot(h, normalize(uSunDir.xz)), 0.0);
    // the low sun warms its half of the sky, most of all along the horizon
    col += vec3(0.95, 0.55, 0.22) * pow(sd, 4.0) * 0.55;
    col += vec3(1.0, 0.75, 0.45) * pow(sd, 48.0) * 1.1;
    col += vec3(0.62, 0.36, 0.16) * exp(-abs(y) * 6.0) * az * az * 0.7;
    if (y < 0.0) col = mix(col, horizon * 0.8, smoothstep(0.0, -0.2, y));
    return col;
  }

  // The sun's shadow: nine hardware-filtered comparisons (each one already
  // a bilinear 2x2), so edges are soft and smooth; outside the map, full sun.
  float shadowAt(vec4 sc) {
    vec3 p = sc.xyz / sc.w;
    float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0) * step(p.z, 1.0);
    float z = p.z - 0.00018;
    float t = uShadowTexel * 1.25;
    float s = texture(uShadowMap, vec3(p.xy, z));
    s += texture(uShadowMap, vec3(p.xy + vec2(-t, -t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(0.0, -t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(t, -t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(-t, 0.0), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(t, 0.0), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(-t, t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(0.0, t), z));
    s += texture(uShadowMap, vec3(p.xy + vec2(t, t), z));
    return mix(1.0, s / 9.0, inside);
  }

  // Sun (shadowed), the blue sky from above, a warm bounce from the ground.
  vec3 lit(vec3 albedo, vec3 n, float shadow) {
    vec3 sky = vec3(0.2, 0.28, 0.44);
    vec3 bounce = vec3(0.16, 0.13, 0.1);
    vec3 amb = mix(bounce, sky, n.y * 0.5 + 0.5);
    return albedo * (amb + uSunColor * max(dot(n, uSunDir), 0.0) * shadow);
  }

  vec3 haze(vec3 col, vec3 world) {
    vec3 v = world - cameraPosition;
    float d = length(v);
    float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
    return mix(col, skyColor(v / d), clamp(f, 0.0, 1.0));
  }

  // Glass: a dark interior, the sky by Fresnel, the sun's glint.
  vec3 glassColor(vec3 V, vec3 n, float shadow, float tint) {
    vec3 R = reflect(V, n);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
    vec3 refl = R.y > 0.0 ? skyColor(R) : vec3(0.16, 0.15, 0.13);
    vec3 col = mix(vec3(0.02, 0.026, 0.034), refl * 0.8, clamp(0.3 + fres + tint, 0.0, 1.0));
    return col + uSunColor * 5.0 * pow(max(dot(R, uSunDir), 0.0), 350.0) * shadow;
  }
`

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

// ---------------------------------------------------------------- sky

export const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
export const SKY_FRAG = /* glsl */ `
  ${COMMON}
  uniform float uTime;
  uniform float uClouds;
  varying vec3 vDir;
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyColor(d);
    // the sun's disc
    col += vec3(14.0, 11.0, 8.0) * smoothstep(0.99955, 0.99975, dot(d, uSunDir));
    // soft morning cloud, drifting
    if (uClouds > 0.5 && d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.1) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
      float c = fbm(uv);
      float cover = smoothstep(0.55, 0.82, c) * smoothstep(0.0, 0.18, d.y);
      float toward = max(dot(d, uSunDir), 0.0);
      vec3 cloud = mix(vec3(0.66, 0.7, 0.8), vec3(1.35, 1.1, 0.88), 0.25 + 0.75 * pow(toward, 3.0));
      col = mix(col, cloud, cover * 0.8);
    }
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT}
  }
`

// ---------------------------------------------------------------- ground

/** Ground, sidewalks, parks, roads and their paint — all one plane, drawn
 * procedurally from world position (the roads are a regular grid), so no
 * layers overlap and nothing can z-fight at a distance. */
export const GROUND_VERT = /* glsl */ `
  uniform mat4 uShadowMatrix;
  varying vec3 vWorld;
  varying vec4 vShadow;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vShadow = uShadowMatrix * vec4(wp.xyz + vec3(0.0, 0.6, 0.0), 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
export const GROUND_FRAG = /* glsl */ `
  ${COMMON}
  uniform vec4 uParks[4];
  varying vec3 vWorld;
  varying vec4 vShadow;

  const vec3 ASPHALT = vec3(0.075, 0.08, 0.092);
  const vec3 PAINT = vec3(0.86, 0.86, 0.82);
  const vec3 YELLOW = vec3(0.8, 0.5, 0.03);
  const vec3 WALK = vec3(0.44, 0.42, 0.38);
  const vec3 PAVING = vec3(0.3, 0.29, 0.27);
  const vec3 GRASS = vec3(0.09, 0.18, 0.045);

  float half_(float c) { return abs(c) < 1.0 ? 11.0 : 6.0; }
  float line_(float x, float at, float w) { return 1.0 - step(w, abs(x - at)); }

  // Paint on a stretch of road: along runs with the road, across from its
  // centre line; e = distance past the crossing road's edge (< 0 inside it).
  vec3 paint(vec3 base, float along, float across, float hw, float e, bool signalled, float side) {
    float a = abs(across);
    vec3 col = base;
    if (e < 0.0) return col;
    // the zebra and the stop line, at signalled crossings
    if (signalled && e < 5.2) {
      if (e > 1.0 && a < hw - 0.2 && fract(across / 1.3) < 0.55) col = PAINT;
      return col;
    }
    if (signalled && e < 6.0 && e > 5.6 && side > 0.0 && a < hw - 0.2) return PAINT;
    // edge lines
    col = mix(col, PAINT, line_(a, hw - 0.45, 0.1));
    if (hw > 8.0) {
      col = mix(col, YELLOW, line_(a, 0.25, 0.09));
      if (fract(along / 9.0) < 0.34) col = mix(col, PAINT, line_(a, 5.5, 0.08));
    } else if (fract(along / 9.0) < 0.4) col = mix(col, YELLOW, line_(a, 0.0, 0.09));
    return col;
  }

  void main() {
    vec2 p = vWorld.xz;
    float rx = clamp(floor(p.x / 120.0 + 0.5) * 120.0, -1080.0, 1080.0);
    float rz = clamp(floor(p.y / 120.0 + 0.5) * 120.0, -1080.0, 1080.0);
    float dx = p.x - rx;
    float dz = p.y - rz;
    float hx = half_(rx);
    float hz = half_(rz);
    float far = step(1140.0, max(abs(p.x), abs(p.y)));

    // blocks: paving, mottled; parks: lawn with two paths
    float n1 = hash12(floor(p * 0.25));
    vec3 col = PAVING * (0.9 + 0.2 * n1);
    for (int i = 0; i < 4; i++) {
      vec4 k = uParks[i];
      if (p.x > k.x && p.x < k.z && p.y > k.y && p.y < k.w) {
        vec2 c = (k.xy + k.zw) * 0.5;
        col = GRASS * (0.85 + 0.3 * hash12(floor(p * 0.5)));
        if (abs(p.x - c.x) < 2.0 || abs(p.y - c.y) < 2.0) col = WALK * 0.92;
      }
    }

    if (far < 0.5) {
      bool onNS = abs(dx) < hx;
      bool onEW = abs(dz) < hz;
      bool walk = abs(dx) < hx + 4.0 || abs(dz) < hz + 4.0;
      // a crossing is signalled inside the inner grid
      bool signalled = abs(rx) <= 480.0 && abs(rz) <= 480.0;
      if (walk) {
        col = WALK * (0.94 + 0.06 * step(0.5, fract(p.x / 1.5)) * step(0.5, fract(p.y / 1.5)));
      }
      if (onNS || onEW) {
        vec3 road = ASPHALT * (0.9 + 0.16 * hash12(floor(p * 0.7)));
        if (onNS && onEW) col = road;
        else if (onEW) {
          // approach side: the half with traffic heading into the crossing
          float side = dx < 0.0 ? step(0.0, dz) : step(dz, 0.0);
          col = paint(road, p.x, dz, hz, abs(dx) - hx, signalled, side);
        } else {
          float side = dz < 0.0 ? step(dx, 0.0) : step(0.0, dx);
          col = paint(road, p.y, dx, hx, abs(dz) - hz, signalled, side);
        }
      }
    }

    vec3 c = lit(col, vec3(0.0, 1.0, 0.0), shadowAt(vShadow));
    gl_FragColor = vec4(haze(c, vWorld), 1.0);
    ${OUTPUT}
  }
`

// ---------------------------------------------------------------- buildings

export const BUILDING_VERT = /* glsl */ `
  uniform mat4 uShadowMatrix;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vInfo;
  varying float vTop;
  varying vec4 vShadow;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normal;
    vInfo = instanceColor; // r: tone, g: kind (0 tower, 0.5 podium, 1 roof unit), b: glass
    vTop = instanceMatrix[3].y + 0.5 * length(instanceMatrix[1].xyz);
    vShadow = uShadowMatrix * vec4(wp.xyz + normal * 0.9, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
export const BUILDING_FRAG = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vInfo;
  varying float vTop;
  varying vec4 vShadow;

  // Walls: concrete, sandstone, white render, terracotta, grey-blue, warm grey.
  vec3 wallTone(float t) {
    if (t < 0.2) return vec3(0.4, 0.37, 0.32);
    if (t < 0.38) return vec3(0.48, 0.37, 0.24);
    if (t < 0.56) return vec3(0.56, 0.54, 0.5);
    if (t < 0.68) return vec3(0.4, 0.19, 0.11);
    if (t < 0.84) return vec3(0.24, 0.29, 0.35);
    return vec3(0.34, 0.31, 0.28);
  }
  // Roofs: the console's own pale roof tones.
  vec3 roofTone(float t) {
    if (t < 0.2) return vec3(0.6, 0.56, 0.5);
    if (t < 0.4) return vec3(0.55, 0.5, 0.42);
    if (t < 0.6) return vec3(0.64, 0.62, 0.58);
    if (t < 0.8) return vec3(0.5, 0.46, 0.4);
    return vec3(0.58, 0.55, 0.47);
  }

  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(vWorld - cameraPosition);
    float sh = shadowAt(vShadow);
    float tone = vInfo.r;
    float kind = vInfo.g;
    bool glass = vInfo.b > 0.5;
    vec3 col;
    if (n.y > 0.5) {
      col = lit(roofTone(fract(tone * 7.31)) * 0.82, n, sh);
      if (glass) col = mix(col, glassColor(V, n, sh, 0.1), 0.35);
    } else {
      float u = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
      float h = vWorld.y;
      // three kinds of facade: glass curtain wall, office ribbon windows, punched windows
      float style = fract(tone * 13.7);
      bool ribbon = !glass && style < 0.4;
      float bay = glass ? 1.6 : ribbon ? 1.5 : 3.0;
      vec2 cell = vec2(floor(u / bay), floor(h / 3.5));
      vec2 f = vec2(fract(u / bay), fract(h / 3.5));
      float win;
      if (glass) win = step(0.07, f.x) * step(f.x, 0.93) * step(0.1, f.y) * step(f.y, 0.9);
      else if (ribbon) win = step(0.06, f.x) * smoothstep(0.34, 0.38, f.y) * smoothstep(0.86, 0.82, f.y);
      else win = smoothstep(0.24, 0.28, f.x) * smoothstep(0.76, 0.72, f.x) * smoothstep(0.3, 0.34, f.y) * smoothstep(0.84, 0.8, f.y);
      if (kind > 0.75 || h > vTop - 1.2) win = 0.0; // roof units and the parapet are solid
      float rnd = hash12(cell + vec2(tone * 97.0, n.x * 13.0 + n.z * 29.0));
      vec3 wall = wallTone(tone) * (glass ? 0.55 : 1.0);
      vec3 facade = lit(wall, n, sh);
      vec3 pane = glassColor(V, n, sh, (rnd - 0.5) * 0.2);
      if (glass) pane *= vec3(0.78, 0.9, 1.0);
      // a few blinds drawn
      if (!glass && rnd > 0.86) pane = lit(vec3(0.62, 0.6, 0.55), n, sh) * 0.8;
      col = mix(facade, pane, win);
      // a shopfront band at street level, a cornice line at the top
      if (kind < 0.75 && h < 4.4) col = mix(lit(wall * 0.6, n, sh), glassColor(V, n, sh, 0.0) + vec3(0.03, 0.025, 0.015), step(0.6, h) * step(h, 3.9));
      col *= mix(0.62, 1.0, smoothstep(0.0, 9.0, h));
    }
    gl_FragColor = vec4(haze(col, vWorld), 1.0);
    ${OUTPUT}
  }
`

// ---------------------------------------------------------------- vehicles

export const VEHICLE_VERT = /* glsl */ `
  uniform mat4 uShadowMatrix;
  attribute float aPart;
  attribute float aBrake;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vLocal;
  varying vec3 vColor;
  varying float vPart;
  varying float vBrake;
  varying vec4 vShadow;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = mat3(modelMatrix * instanceMatrix) * normal;
    vLocal = position;
    vColor = instanceColor;
    vPart = aPart;
    vBrake = aBrake;
    vShadow = uShadowMatrix * vec4(wp.xyz + normalize(vN) * 0.3, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
export const VEHICLE_FRAG = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vLocal;
  varying vec3 vColor;
  varying float vPart;
  varying float vBrake;
  varying vec4 vShadow;
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(vWorld - cameraPosition);
    float sh = shadowAt(vShadow);
    vec3 col;
    if (vPart < 0.5 || (vPart < 1.5 && n.y > 0.6)) {
      // paint, with a clear-coat reflection; the cabin's roof is paint too
      vec3 R = reflect(V, n);
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
      col = lit(vColor, n, sh) + (R.y > 0.0 ? skyColor(R) : vec3(0.15)) * fres * 0.45;
      col += uSunColor * 1.4 * pow(max(dot(R, uSunDir), 0.0), 90.0) * sh;
    } else if (vPart < 1.5) col = glassColor(V, n, sh, 0.0);
    else if (vPart < 2.5) col = lit(vec3(0.035, 0.035, 0.038), n, sh);
    else if (vPart < 3.5) col = vLocal.x < 0.0 ? vec3(0.42, 0.02, 0.02) + vBrake * vec3(4.2, 0.14, 0.06) : vec3(0.95, 0.92, 0.82);
    else col = lit(vec3(0.76, 0.76, 0.74), n, sh);
    gl_FragColor = vec4(haze(col, vWorld), 1.0);
    ${OUTPUT}
  }
`

// ---------------------------------------------------------------- trees

export const TREE_VERT = /* glsl */ `
  uniform mat4 uShadowMatrix;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying vec4 vShadow;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(instanceMatrix) * normal);
    vColor = instanceColor;
    vShadow = uShadowMatrix * vec4(wp.xyz + vN * 1.2, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
export const TREE_FRAG = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vColor;
  varying vec4 vShadow;
  void main() {
    vec3 n = normalize(vN);
    float sh = shadowAt(vShadow);
    vec3 col = lit(vColor, n, sh);
    // leaves glow a little with the low sun behind them
    col += vColor * uSunColor * 0.22 * pow(max(dot(-n, uSunDir), 0.0), 2.0) * sh;
    gl_FragColor = vec4(haze(col, vWorld), 1.0);
    ${OUTPUT}
  }
`
