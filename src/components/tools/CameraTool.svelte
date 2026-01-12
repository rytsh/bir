<script lang="ts">
  import { onMount } from "svelte";

  type RecState = "idle" | "previewing" | "recording" | "paused" | "stopped";

  let recState = $state<RecState>("idle");
  let videoElement = $state<HTMLVideoElement | null>(null);
  let previewElement: HTMLVideoElement;
  let stream: MediaStream | null = null;
  let pendingStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordedBlob: Blob | null = null;
  let recordedUrl = $state<string | null>(null);
  let error = $state("");
  let duration = $state(0);
  let durationInterval: number | null = null;
  let mounted = $state(false);
  let isSupported = $state(true);
  let requiresHttps = $state(false);

  // Settings
  let selectedVideoDevice = $state("");
  let selectedAudioDevice = $state("");
  let includeAudio = $state(true);
  let videoDevices = $state<MediaDeviceInfo[]>([]);
  let audioDevices = $state<MediaDeviceInfo[]>([]);
  let mirror = $state(true);
  let facingMode = $state<"user" | "environment">("user"); // For mobile camera switching
  let permissionStatus = $state<"unknown" | "granted" | "denied" | "prompt">("unknown");

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const checkMediaDevicesSupport = () => {
    // Check if we're in a secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext;
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    
    if (!isSecureContext && !isLocalhost) {
      requiresHttps = true;
      isSupported = false;
      return false;
    }
    
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isSupported = false;
      return false;
    }
    
    return true;
  };

  const getDevices = async () => {
    if (!checkMediaDevicesSupport()) return;
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter(d => d.kind === "videoinput");
      audioDevices = devices.filter(d => d.kind === "audioinput");
      
      if (videoDevices.length > 0 && !selectedVideoDevice) {
        selectedVideoDevice = videoDevices[0].deviceId;
      }
      if (audioDevices.length > 0 && !selectedAudioDevice) {
        selectedAudioDevice = audioDevices[0].deviceId;
      }
    } catch {
      // Silently fail - devices will be enumerated after permission is granted
    }
  };

  const checkPermissions = async () => {
    if (!checkMediaDevicesSupport()) return;
    
    try {
      // Check camera permission status if the Permissions API is available
      if (navigator.permissions && navigator.permissions.query) {
        const cameraPermission = await navigator.permissions.query({ name: "camera" as PermissionName });
        permissionStatus = cameraPermission.state as "granted" | "denied" | "prompt";
      }
    } catch {
      // Permissions API not fully supported, will request on use
      permissionStatus = "unknown";
    }
  };

  const requestPermission = async () => {
    error = "";
    
    if (!checkMediaDevicesSupport()) {
      if (requiresHttps) {
        error = "Camera access requires HTTPS. Please access this site using https://";
      } else {
        error = "Your browser does not support camera access.";
      }
      return;
    }
    
    try {
      // Request camera and microphone access
      const tempStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      // Permission granted, stop the temporary stream
      tempStream.getTracks().forEach(track => { track.stop(); });
      
      permissionStatus = "granted";
      
      // Now we can get proper device labels
      await getDevices();
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === "NotAllowedError") {
          permissionStatus = "denied";
          error = "Camera access was denied. Please allow camera access in your browser settings and reload the page.";
        } else if (e.name === "NotFoundError") {
          error = "No camera found. Please connect a camera and try again.";
        } else if (e.name === "TypeError") {
          error = "Camera access requires HTTPS. Please access this site using a secure connection.";
          requiresHttps = true;
          isSupported = false;
        } else {
          error = `Failed to access camera: ${e.message}`;
        }
      } else {
        error = "Failed to request camera permission. Make sure you're using HTTPS.";
      }
    }
  };

  // Attach stream to video element when both are available
  $effect(() => {
    if (videoElement && pendingStream) {
      videoElement.srcObject = pendingStream;
      videoElement.play();
      stream = pendingStream;
      pendingStream = null;
    }
  });

  const startPreview = async () => {
    error = "";
    
    if (!checkMediaDevicesSupport()) {
      if (requiresHttps) {
        error = "Camera access requires HTTPS. Please access this site using https://";
      } else {
        error = "Your browser does not support camera access.";
      }
      return;
    }
    
    // Stop existing stream first
    if (stream) {
      stream.getTracks().forEach(track => { track.stop(); });
      stream = null;
    }
    
    try {
      // Build video constraints
      // On mobile, prefer facingMode; on desktop, use deviceId if available
      let videoConstraints: MediaTrackConstraints | boolean;
      
      if (selectedVideoDevice) {
        // User selected a specific device
        videoConstraints = { deviceId: { ideal: selectedVideoDevice } };
      } else {
        // Use facingMode (works better on mobile)
        videoConstraints = { facingMode: { ideal: facingMode } };
      }
      
      const audioConstraints: MediaTrackConstraints | boolean = includeAudio 
        ? (selectedAudioDevice ? { deviceId: { ideal: selectedAudioDevice } } : true)
        : false;

      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: audioConstraints,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Permission was granted
      permissionStatus = "granted";
      
      if (videoElement) {
        // Video element exists, attach directly
        videoElement.srcObject = newStream;
        await videoElement.play();
        stream = newStream;
      } else {
        // Video element not ready yet, store for $effect to handle
        pendingStream = newStream;
      }
      
      recState = "previewing";
      // Re-enumerate devices after permission granted (needed for mobile to get actual device info)
      await getDevices();
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === "NotAllowedError") {
          permissionStatus = "denied";
          error = "Camera access denied. Please allow camera access in your browser settings.";
        } else if (e.name === "NotFoundError") {
          error = "No camera found. Please connect a camera and try again.";
        } else if (e.name === "NotReadableError") {
          error = "Camera is already in use by another application.";
        } else if (e.name === "OverconstrainedError") {
          error = "Could not satisfy camera constraints. Try selecting a different camera.";
        } else if (e.name === "TypeError") {
          error = "Camera access requires HTTPS. Please access this site using a secure connection.";
          requiresHttps = true;
          isSupported = false;
        } else {
          error = `Failed to access camera: ${e.message}`;
        }
      } else {
        error = "Failed to access camera. Make sure you're using HTTPS.";
      }
    }
  };

  const stopPreview = () => {
    if (stream) {
      stream.getTracks().forEach(track => { track.stop(); });
      stream = null;
    }
    if (pendingStream) {
      pendingStream.getTracks().forEach(track => { track.stop(); });
      pendingStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    recState = "idle";
  };

  const startRecording = () => {
    if (!stream) return;

    recordedChunks = [];
    recordedBlob = null;
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";

    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: mimeType });
        recordedUrl = URL.createObjectURL(recordedBlob);
        recState = "stopped";
      };

      mediaRecorder.start(100);
      recState = "recording";
      duration = 0;
      durationInterval = window.setInterval(() => {
        duration += 1;
      }, 1000);
    } catch (e) {
      error = "Failed to start recording";
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      recState = "paused";
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      recState = "recording";
      durationInterval = window.setInterval(() => {
        duration += 1;
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
      mediaRecorder.stop();
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
    }
  };

  const downloadRecording = () => {
    if (!recordedUrl || !recordedBlob) return;

    const a = document.createElement("a");
    a.href = recordedUrl;
    const extension = recordedBlob.type.includes("webm") ? "webm" : "mp4";
    a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const takePhoto = () => {
    if (!videoElement) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Apply mirror if enabled
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoElement, 0, 0);

    // Download the image
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `photo-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const newRecording = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
    recordedBlob = null;
    recordedChunks = [];
    duration = 0;
    recState = "previewing";
  };

  const flipCamera = async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    selectedVideoDevice = ""; // Clear device selection to use facingMode
    mirror = facingMode === "user"; // Auto-mirror for front camera
    await startPreview();
  };

  const restartAll = () => {
    stopPreview();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
    recordedBlob = null;
    recordedChunks = [];
    duration = 0;
  };

  onMount(() => {
    mounted = true;
    checkPermissions();
    getDevices();
    
    return () => {
      mounted = false;
      stopPreview();
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
      if (durationInterval) {
        clearInterval(durationInterval);
      }
    };
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Record video from your webcam. Recordings are processed locally and never uploaded.
    </p>
  </header>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
    </div>
  {/if}

  <!-- Unified Side-by-Side Layout for All States -->
  <div class="flex-1 flex flex-col lg:flex-row gap-4">
    <!-- Left: Video Area -->
    <div class="flex-1 flex flex-col min-w-0">
      <div class="relative bg-black flex-1 min-h-[300px] overflow-hidden">
        <!-- Idle: Placeholder -->
        {#if recState === "idle"}
          <div class="absolute inset-0 flex flex-col items-center justify-center text-(--color-text-muted) p-4">
            <div class="text-6xl mb-4 opacity-50">📹</div>
            {#if !isSupported}
              {#if requiresHttps}
                <p class="text-sm text-center text-(--color-error-text)">HTTPS Required</p>
                <p class="text-xs mt-2 text-center">Camera access only works over secure connections (HTTPS)</p>
              {:else}
                <p class="text-sm text-center text-(--color-error-text)">Not Supported</p>
                <p class="text-xs mt-2 text-center">Your browser does not support camera access</p>
              {/if}
            {:else if permissionStatus === "denied"}
              <p class="text-sm text-center">Camera access is blocked</p>
              <p class="text-xs mt-2 text-center">Check your browser settings to enable camera access</p>
            {:else if permissionStatus !== "granted"}
              <p class="text-sm text-center">Camera permission required</p>
              <p class="text-xs mt-2 text-center">Tap "Allow Camera Access" to get started</p>
            {:else}
              <p class="text-sm">Camera preview will appear here</p>
            {/if}
          </div>
        {/if}

        <!-- Previewing / Recording / Paused: Live Camera -->
        {#if recState === "previewing" || recState === "recording" || recState === "paused"}
          <video
            bind:this={videoElement}
            autoplay
            playsinline
            muted
            class="w-full h-full object-contain"
            style={mirror ? "transform: scaleX(-1);" : ""}
          ></video>
          
          <!-- Recording indicator -->
          {#if recState === "recording"}
            <div class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm font-medium">
              <span class="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              REC {formatDuration(duration)}
            </div>
          {/if}
          
          {#if recState === "paused"}
            <div class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-yellow-600 text-white text-sm font-medium">
              PAUSED {formatDuration(duration)}
            </div>
          {/if}
        {/if}

        <!-- Stopped: Recorded Video Playback -->
        {#if recState === "stopped" && recordedUrl}
          <video
            bind:this={previewElement}
            src={recordedUrl}
            controls
            class="w-full h-full object-contain"
          ></video>
        {/if}
      </div>
    </div>

    <!-- Right: Controls & Settings Panel -->
    <div class="lg:w-72 flex-shrink-0 p-4 border border-(--color-border) bg-(--color-bg-alt)">
      <!-- Idle State: Start Camera Button + Settings -->
      {#if recState === "idle"}
        <div class="flex flex-col gap-3 mb-6">
          {#if !isSupported}
            <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-xs mb-2">
              {#if requiresHttps}
                Camera access requires HTTPS. Please access this site using a secure connection (https://).
              {:else}
                Your browser does not support camera access. Please try a different browser.
              {/if}
            </div>
          {:else if permissionStatus === "denied"}
            <div class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-xs mb-2">
              Camera access is blocked. Please enable it in your browser settings and reload the page.
            </div>
          {:else if permissionStatus !== "granted"}
            <button
              onclick={requestPermission}
              class="w-full px-4 py-2 text-sm font-medium border-2 border-dashed border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-btn-text) transition-colors"
            >
              Allow Camera Access
            </button>
            <p class="text-xs text-(--color-text-muted) text-center">
              Tap to grant camera and microphone permission
            </p>
          {/if}
          <button
            onclick={startPreview}
            disabled={!isSupported || permissionStatus === "denied"}
            class="w-full px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Camera
          </button>
        </div>

        <div class="border-t border-(--color-border) pt-4">
          <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-4">Settings</div>
          <div class="flex flex-col gap-4">
            <div>
              <label for="videoDeviceIdle" class="block text-xs text-(--color-text-muted) mb-1">Camera</label>
              <select
                id="videoDeviceIdle"
                bind:value={selectedVideoDevice}
                class="w-full px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
              >
                {#if videoDevices.length === 0}
                  <option value="">Default Camera</option>
                {:else}
                  {#each videoDevices as device, i}
                    <option value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>
                  {/each}
                {/if}
              </select>
            </div>

            <div>
              <label for="audioDeviceIdle" class="block text-xs text-(--color-text-muted) mb-1">Microphone</label>
              <select
                id="audioDeviceIdle"
                bind:value={selectedAudioDevice}
                disabled={!includeAudio}
                class="w-full px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
              >
                {#if audioDevices.length === 0}
                  <option value="">Default Microphone</option>
                {:else}
                  {#each audioDevices as device, i}
                    <option value={device.deviceId}>{device.label || `Microphone ${i + 1}`}</option>
                  {/each}
                {/if}
              </select>
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={includeAudio}
                  class="w-4 h-4 accent-(--color-accent)"
                />
                <span class="text-sm text-(--color-text)">Include audio</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={mirror}
                  class="w-4 h-4 accent-(--color-accent)"
                />
                <span class="text-sm text-(--color-text)">Mirror preview</span>
              </label>
            </div>
          </div>
        </div>
      {/if}

      <!-- Previewing State: Recording Controls + Settings -->
      {#if recState === "previewing"}
        <div class="flex flex-col gap-3 mb-6">
          <button
            onclick={startRecording}
            class="w-full px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
          >
            <span class="w-3 h-3 bg-white rounded-full"></span>
            Start Recording
          </button>
          <button
            onclick={takePhoto}
            class="w-full px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
          >
            Take Photo
          </button>
          <button
            onclick={flipCamera}
            class="w-full px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:border-(--color-accent) transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/>
              <circle cx="12" cy="12" r="3"/>
              <path d="m18 22-3-3 3-3"/>
              <path d="m6 2 3 3-3 3"/>
            </svg>
            Flip Camera
          </button>
          <button
            onclick={restartAll}
            class="w-full px-4 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors border border-(--color-border)"
          >
            Cancel
          </button>
        </div>

        <div class="border-t border-(--color-border) pt-4">
          <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-4">Settings</div>
          <div class="flex flex-col gap-4">
            {#if videoDevices.length > 1}
              <div>
                <label for="videoDevice" class="block text-xs text-(--color-text-muted) mb-1">Camera</label>
                <select
                  id="videoDevice"
                  bind:value={selectedVideoDevice}
                  onchange={startPreview}
                  class="w-full px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                >
                  {#each videoDevices as device, i}
                    <option value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if audioDevices.length > 0}
              <div>
                <label for="audioDevice" class="block text-xs text-(--color-text-muted) mb-1">Microphone</label>
                <select
                  id="audioDevice"
                  bind:value={selectedAudioDevice}
                  disabled={!includeAudio}
                  onchange={startPreview}
                  class="w-full px-3 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
                >
                  {#each audioDevices as device, i}
                    <option value={device.deviceId}>{device.label || `Microphone ${i + 1}`}</option>
                  {/each}
                </select>
              </div>
            {/if}

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={includeAudio}
                  onchange={startPreview}
                  class="w-4 h-4 accent-(--color-accent)"
                />
                <span class="text-sm text-(--color-text)">Include audio</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={mirror}
                  class="w-4 h-4 accent-(--color-accent)"
                />
                <span class="text-sm text-(--color-text)">Mirror preview</span>
              </label>
            </div>
          </div>
        </div>
      {/if}

      <!-- Recording State: Pause/Stop Controls -->
      {#if recState === "recording"}
        <div class="flex flex-col gap-3 mb-6">
          <div class="text-center text-2xl font-mono text-(--color-text) mb-2">
            {formatDuration(duration)}
          </div>
          <button
            onclick={pauseRecording}
            class="w-full px-4 py-2 text-sm font-medium bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
          >
            Pause
          </button>
          <button
            onclick={stopRecording}
            class="w-full px-4 py-2 text-sm font-medium bg-(--color-text) text-(--color-btn-text) hover:opacity-80 transition-colors"
          >
            Stop Recording
          </button>
          <button
            onclick={restartAll}
            class="w-full px-4 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors border border-(--color-border)"
          >
            Cancel
          </button>
        </div>
      {/if}

      <!-- Paused State: Resume/Stop Controls -->
      {#if recState === "paused"}
        <div class="flex flex-col gap-3 mb-6">
          <div class="text-center text-2xl font-mono text-(--color-text) mb-2">
            {formatDuration(duration)}
          </div>
          <button
            onclick={resumeRecording}
            class="w-full px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Resume
          </button>
          <button
            onclick={stopRecording}
            class="w-full px-4 py-2 text-sm font-medium bg-(--color-text) text-(--color-btn-text) hover:opacity-80 transition-colors"
          >
            Stop Recording
          </button>
          <button
            onclick={restartAll}
            class="w-full px-4 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors border border-(--color-border)"
          >
            Cancel
          </button>
        </div>
      {/if}

      <!-- Stopped State: Download/Record Another -->
      {#if recState === "stopped" && recordedUrl}
        <div class="flex flex-col gap-3 mb-6">
          <button
            onclick={downloadRecording}
            class="w-full px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
          >
            Download Recording
          </button>
          <button
            onclick={newRecording}
            class="w-full px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:border-(--color-accent) transition-colors"
          >
            Record Another
          </button>
          <button
            onclick={restartAll}
            class="w-full px-4 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text) transition-colors border border-(--color-border)"
          >
            Close
          </button>
        </div>

        <div class="border-t border-(--color-border) pt-4">
          <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-4">Recording Info</div>
          <div class="flex flex-col gap-2 text-sm text-(--color-text-muted)">
            <div class="flex justify-between">
              <span>Duration:</span>
              <span class="text-(--color-text)">{formatDuration(duration)}</span>
            </div>
            <div class="flex justify-between">
              <span>Size:</span>
              <span class="text-(--color-text)">{recordedBlob ? (recordedBlob.size / 1024 / 1024).toFixed(2) : 0} MB</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
