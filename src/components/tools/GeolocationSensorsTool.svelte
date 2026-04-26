<script lang="ts">
  // Geolocation
  let geoPos = $state<GeolocationPosition | null>(null);
  let geoError = $state("");
  let geoWatching = $state(false);
  let watchId: number | null = null;

  // Device orientation
  let orientationSupported = $state<boolean | null>(null);
  let alpha = $state<number | null>(null);
  let beta = $state<number | null>(null);
  let gamma = $state<number | null>(null);
  let absolute = $state(false);
  let needsPermission = $state(false);

  // Device motion
  let motionSupported = $state<boolean | null>(null);
  let accel = $state<{ x: number | null; y: number | null; z: number | null }>({ x: null, y: null, z: null });
  let accelG = $state<{ x: number | null; y: number | null; z: number | null }>({ x: null, y: null, z: null });
  let rotation = $state<{ alpha: number | null; beta: number | null; gamma: number | null }>({ alpha: null, beta: null, gamma: null });

  // Ambient light (rare, but Generic Sensor API)
  let lightSupported = $state<boolean | null>(null);
  let illuminance = $state<number | null>(null);

  function startGeo() {
    if (!navigator.geolocation) {
      geoError = "Geolocation API not supported";
      return;
    }
    geoError = "";
    geoWatching = true;
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        geoPos = p;
      },
      (err) => {
        geoError = err.message;
        geoWatching = false;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  function stopGeo() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    geoWatching = false;
  }

  async function requestOrientationPermission() {
    const ev = (DeviceOrientationEvent as unknown) as { requestPermission?: () => Promise<string> };
    if (typeof ev.requestPermission === "function") {
      try {
        const result = await ev.requestPermission();
        if (result === "granted") {
          needsPermission = false;
          attachOrientation();
        }
      } catch (e) {
        console.warn("orientation permission failed", e);
      }
    } else {
      attachOrientation();
    }
  }

  function attachOrientation() {
    const handler = (e: DeviceOrientationEvent) => {
      orientationSupported = true;
      alpha = e.alpha;
      beta = e.beta;
      gamma = e.gamma;
      absolute = e.absolute;
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }

  async function requestMotionPermission() {
    const ev = (DeviceMotionEvent as unknown) as { requestPermission?: () => Promise<string> };
    if (typeof ev.requestPermission === "function") {
      try {
        const result = await ev.requestPermission();
        if (result === "granted") attachMotion();
      } catch (e) {
        console.warn("motion permission failed", e);
      }
    } else {
      attachMotion();
    }
  }

  function attachMotion() {
    const handler = (e: DeviceMotionEvent) => {
      motionSupported = true;
      accel = { x: e.acceleration?.x ?? null, y: e.acceleration?.y ?? null, z: e.acceleration?.z ?? null };
      accelG = { x: e.accelerationIncludingGravity?.x ?? null, y: e.accelerationIncludingGravity?.y ?? null, z: e.accelerationIncludingGravity?.z ?? null };
      rotation = { alpha: e.rotationRate?.alpha ?? null, beta: e.rotationRate?.beta ?? null, gamma: e.rotationRate?.gamma ?? null };
    };
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }

  function startLightSensor() {
    try {
      const W = window as unknown as { AmbientLightSensor?: new () => { illuminance: number; addEventListener(t: string, h: () => void): void; start(): void; stop(): void } };
      if (!W.AmbientLightSensor) {
        lightSupported = false;
        return;
      }
      const sensor = new W.AmbientLightSensor();
      sensor.addEventListener("reading", () => {
        lightSupported = true;
        illuminance = sensor.illuminance;
      });
      sensor.start();
    } catch {
      lightSupported = false;
    }
  }

  $effect(() => {
    // Detect orientation availability
    if ("DeviceOrientationEvent" in window) {
      const ev = (DeviceOrientationEvent as unknown) as { requestPermission?: () => Promise<string> };
      if (typeof ev.requestPermission === "function") {
        needsPermission = true;
      } else {
        const cleanup = attachOrientation();
        const motionCleanup = ("DeviceMotionEvent" in window) ? attachMotion() : null;
        return () => {
          cleanup?.();
          motionCleanup?.();
        };
      }
    } else {
      orientationSupported = false;
    }
    if (!("DeviceMotionEvent" in window)) motionSupported = false;
  });

  function fmt(v: number | null | undefined, digits = 2): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    return v.toFixed(digits);
  }
</script>

<div class="flex-1 overflow-auto bg-(--color-bg) text-(--color-text) p-6">
  <div class="max-w-5xl mx-auto space-y-6">

    <!-- Geolocation -->
    <section class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-3 border-b border-(--color-border) flex items-center justify-between">
        <h2 class="font-medium">📍 Geolocation</h2>
        {#if geoWatching}
          <button onclick={stopGeo} class="px-3 py-1 text-sm border border-(--color-border) hover:bg-(--color-bg)">Stop</button>
        {:else}
          <button onclick={startGeo} class="px-3 py-1 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Start watching</button>
        {/if}
      </div>
      <div class="p-4">
        {#if geoError}
          <div class="text-red-500 text-sm mb-2">Error: {geoError}</div>
        {/if}
        {#if geoPos}
          <div class="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm font-mono">
            <div><span class="text-(--color-text-light)">Lat:</span> {geoPos.coords.latitude.toFixed(6)}</div>
            <div><span class="text-(--color-text-light)">Lon:</span> {geoPos.coords.longitude.toFixed(6)}</div>
            <div><span class="text-(--color-text-light)">Accuracy:</span> ±{fmt(geoPos.coords.accuracy, 1)} m</div>
            <div><span class="text-(--color-text-light)">Altitude:</span> {fmt(geoPos.coords.altitude)} m</div>
            <div><span class="text-(--color-text-light)">Alt accuracy:</span> {fmt(geoPos.coords.altitudeAccuracy)} m</div>
            <div><span class="text-(--color-text-light)">Heading:</span> {fmt(geoPos.coords.heading)}°</div>
            <div><span class="text-(--color-text-light)">Speed:</span> {fmt(geoPos.coords.speed)} m/s</div>
            <div class="col-span-2"><span class="text-(--color-text-light)">Time:</span> {new Date(geoPos.timestamp).toLocaleString()}</div>
          </div>
          <div class="mt-3">
            <a
              href="https://www.openstreetmap.org/?mlat={geoPos.coords.latitude}&mlon={geoPos.coords.longitude}#map=15/{geoPos.coords.latitude}/{geoPos.coords.longitude}"
              target="_blank" rel="noopener"
              class="text-sm text-(--color-accent) hover:underline"
            >View on OpenStreetMap →</a>
          </div>
        {:else if !geoError}
          <div class="text-sm text-(--color-text-light)">Click "Start watching" to request your location.</div>
        {/if}
      </div>
    </section>

    <!-- Orientation -->
    <section class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-3 border-b border-(--color-border) flex items-center justify-between">
        <h2 class="font-medium">🧭 Device Orientation</h2>
        {#if needsPermission}
          <button onclick={requestOrientationPermission} class="px-3 py-1 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Grant permission</button>
        {/if}
      </div>
      <div class="p-4">
        {#if orientationSupported === false}
          <div class="text-sm text-(--color-text-light)">DeviceOrientationEvent not available.</div>
        {:else if alpha === null && beta === null && gamma === null}
          <div class="text-sm text-(--color-text-light)">Move your device. (No data yet — desktops without sensors won't fire events.)</div>
        {:else}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm font-mono">
            <div><span class="text-(--color-text-light)">α (z):</span> {fmt(alpha)}°</div>
            <div><span class="text-(--color-text-light)">β (x):</span> {fmt(beta)}°</div>
            <div><span class="text-(--color-text-light)">γ (y):</span> {fmt(gamma)}°</div>
            <div><span class="text-(--color-text-light)">absolute:</span> {absolute}</div>
          </div>
          <!-- Visual orientation cube -->
          <div class="mt-4 flex justify-center" style="perspective: 600px;">
            <div
              class="w-32 h-32 border-2 border-(--color-accent) bg-(--color-bg) flex items-center justify-center text-xs"
              style="transform-style: preserve-3d; transform: rotateZ({alpha ?? 0}deg) rotateX({beta ?? 0}deg) rotateY({gamma ?? 0}deg); transition: transform 80ms linear;"
            >TOP</div>
          </div>
        {/if}
      </div>
    </section>

    <!-- Motion -->
    <section class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-3 border-b border-(--color-border) flex items-center justify-between">
        <h2 class="font-medium">📈 Device Motion</h2>
        {#if needsPermission}
          <button onclick={requestMotionPermission} class="px-3 py-1 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Grant permission</button>
        {/if}
      </div>
      <div class="p-4">
        {#if motionSupported === false}
          <div class="text-sm text-(--color-text-light)">DeviceMotionEvent not available.</div>
        {:else if accel.x === null && accelG.x === null && rotation.alpha === null}
          <div class="text-sm text-(--color-text-light)">Shake or move your device.</div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm font-mono">
            <div>
              <div class="text-xs text-(--color-text-light) uppercase mb-1">Acceleration (m/s²)</div>
              <div>x: {fmt(accel.x)}</div>
              <div>y: {fmt(accel.y)}</div>
              <div>z: {fmt(accel.z)}</div>
            </div>
            <div>
              <div class="text-xs text-(--color-text-light) uppercase mb-1">+ Gravity</div>
              <div>x: {fmt(accelG.x)}</div>
              <div>y: {fmt(accelG.y)}</div>
              <div>z: {fmt(accelG.z)}</div>
            </div>
            <div>
              <div class="text-xs text-(--color-text-light) uppercase mb-1">Rotation rate (°/s)</div>
              <div>α: {fmt(rotation.alpha)}</div>
              <div>β: {fmt(rotation.beta)}</div>
              <div>γ: {fmt(rotation.gamma)}</div>
            </div>
          </div>
        {/if}
      </div>
    </section>

    <!-- Ambient light -->
    <section class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="px-4 py-3 border-b border-(--color-border) flex items-center justify-between">
        <h2 class="font-medium">💡 Ambient Light</h2>
        <button onclick={startLightSensor} class="px-3 py-1 text-sm bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)">Start sensor</button>
      </div>
      <div class="p-4 text-sm">
        {#if lightSupported === false}
          <div class="text-(--color-text-light)">AmbientLightSensor not supported in this browser.</div>
        {:else if illuminance !== null}
          <div class="font-mono">{illuminance.toFixed(1)} lux</div>
        {:else}
          <div class="text-(--color-text-light)">Click "Start sensor" to begin reading.</div>
        {/if}
      </div>
    </section>

  </div>
</div>
