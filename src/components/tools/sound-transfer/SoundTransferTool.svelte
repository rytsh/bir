<script lang="ts">
  import { faker } from "@faker-js/faker";
  import {
    PROTOCOLS,
    SAMPLE_RATE,
    MAX_CHUNK_SIZE,
    initGGWave,
    createInstance,
    freeInstance,
    encode,
    decode,
    createAudioBuffer,
    createWavFile,
    getTransferSpeed,
    estimateTransferTime,
    encryptData,
    decryptData,
    encodeFilePacket,
    decodeFilePacket,
    createChunks,
    parseChunkHeader,
    ChunkCollector,
    type GGWaveInstance,
    type Protocol,
    type ProtocolType,
  } from "./ggwave-wrapper.js";

  // Generate random username: Color + Animal
  function generateUsername(): string {
    const color = faker.color.human();
    const animal = faker.animal.type();
    // Capitalize first letter of each word
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${capitalize(color)}${capitalize(animal)}`;
  }

  // Tab state - Chat is default
  let activeTab = $state<"chat" | "send" | "receive">("chat");

  // ggwave instance
  let ggwaveInstance: GGWaveInstance | null = null;
  let isInitializing = $state(false);
  let initError = $state<string | null>(null);

  // Chat state
  interface ChatMessage {
    id: string;
    username: string;
    text: string;
    timestamp: Date;
    isMine: boolean;
    status: "sending" | "sent" | "received";
  }

  let username = $state(generateUsername());
  let chatMessage = $state("");
  let chatMessages = $state<ChatMessage[]>([]);
  let chatProtocol = $state<Protocol>(PROTOCOLS[1]);
  let isChatListening = $state(false);
  let isChatSending = $state(false);
  let chatError = $state<string | null>(null);
  let chatDecoderState = $state("");
  let messagesContainer: HTMLDivElement | null = null;

  // Chat audio resources
  let chatAudioContext: AudioContext | null = null;
  let chatMediaStream: MediaStream | null = null;
  let chatAnalyserNode: AnalyserNode | null = null;
  let chatScriptProcessor: ScriptProcessorNode | null = null;
  let chatAnimationId: number | null = null;
  let chatAudioSource: AudioBufferSourceNode | null = null;

  // Send state
  let inputMode = $state<"text" | "file">("text");
  let textInput = $state("");
  let fileInput = $state<File | null>(null);
  let fileData = $state<Uint8Array | null>(null);
  let selectedProtocol = $state<Protocol>(PROTOCOLS[1]);
  let sendSecret = $state("");
  let isEncoding = $state(false);
  let isPlaying = $state(false);
  let encodedSamples = $state<Float32Array | null>(null);
  let playProgress = $state(0);
  let estimatedTime = $state(0);
  let copied = $state(false);
  let sendError = $state<string | null>(null);
  // Chunking state for send
  let encodedChunks = $state<string[]>([]);
  let currentChunkIndex = $state(0);
  let totalChunks = $state(0);

  // Receive state
  let isListening = $state(false);
  let listeningError = $state<string | null>(null);
  let receiveProtocol = $state<Protocol>(PROTOCOLS[1]);
  let receiveMode = $state<"text" | "file">("text");
  let receiveSecret = $state("");
  let receivedText = $state("");
  let receivedBytes = $state<Uint8Array | null>(null);
  let receivedFilename = $state<string | null>(null);
  let receiveStatus = $state<"idle" | "waiting" | "receiving" | "complete" | "error">("idle");
  let decoderState = $state("");
  let decryptError = $state<string | null>(null);
  // Store raw received data before decryption
  let rawReceivedData = $state<string | null>(null);
  let isEncryptedData = $state(false);
  let isFileData = $state(false);
  let isDecrypting = $state(false);
  // Chunking state for receive
  let chunkCollector = $state<ChunkCollector | null>(null);
  let receiveProgress = $state(0);
  let chunksReceived = $state(0);
  let chunksTotal = $state(0);

  // Audio resources
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let analyserNode: AnalyserNode | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  let animationId: number | null = null;
  let scriptProcessor: ScriptProcessorNode | null = null;

  // Spectrogram state
  let spectrogramCanvas: HTMLCanvasElement | null = null;
  let chatSpectrogramCanvas: HTMLCanvasElement | null = null;
  const SPECTROGRAM_HEIGHT = 100;
  const SPECTROGRAM_WIDTH = 400;
  const FFT_SIZE = 2048;

  // Calculate data size
  const dataSize = $derived.by(() => {
    if (inputMode === "text") {
      return new TextEncoder().encode(textInput).length;
    }
    return fileData?.length ?? 0;
  });

  // Update estimated time when data or protocol changes
  $effect(() => {
    if (dataSize > 0) {
      estimatedTime = estimateTransferTime(selectedProtocol.id, dataSize);
    } else {
      estimatedTime = 0;
    }
  });

  // Auto-scroll chat messages
  $effect(() => {
    if (messagesContainer && chatMessages.length > 0) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  // Initialize ggwave on mount - but defer actual loading
  $effect(() => {
    // Don't auto-initialize - wait for user interaction
    // This prevents blocking the page on load
    return () => {
      cleanup();
    };
  });

  async function initializeGGWave() {
    if (ggwaveInstance || isInitializing) return;

    isInitializing = true;
    initError = null;

    try {
      await initGGWave();
      ggwaveInstance = await createInstance("both");
    } catch (err) {
      console.error("Failed to initialize ggwave:", err);
      initError = "Failed to load audio codec. Please refresh the page.";
    } finally {
      isInitializing = false;
    }
  }

  // Ensure ggwave is initialized before any action
  async function ensureInitialized(): Promise<boolean> {
    if (ggwaveInstance) return true;
    await initializeGGWave();
    return ggwaveInstance !== null;
  }

  function cleanup() {
    stopPlayback();
    stopListening();
    stopChatListening();
    if (ggwaveInstance) {
      freeInstance(ggwaveInstance);
      ggwaveInstance = null;
    }
  }

  // Initialize audio context
  const initAudio = () => {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    return audioContext;
  };

  const initChatAudio = () => {
    if (!chatAudioContext) {
      chatAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    return chatAudioContext;
  };

  // ==================== CHAT FUNCTIONS ====================

  const generateMessageId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const formatChatMessage = (user: string, text: string): string => {
    return `[${user}]: ${text}`;
  };

  const parseChatMessage = (raw: string): { username: string; text: string } | null => {
    const match = raw.match(/^\[([^\]]+)\]:\s*(.*)$/);
    if (match) {
      return { username: match[1], text: match[2] };
    }
    return { username: "Unknown", text: raw };
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim() || isChatSending) return;
    
    // Ensure ggwave is initialized
    if (!await ensureInitialized()) {
      chatError = "Failed to initialize audio codec";
      return;
    }
    if (!ggwaveInstance) return;

    const messageText = chatMessage.trim();
    const formattedMessage = formatChatMessage(username, messageText);

    const newMessage: ChatMessage = {
      id: generateMessageId(),
      username: username,
      text: messageText,
      timestamp: new Date(),
      isMine: true,
      status: "sending",
    };
    chatMessages = [...chatMessages, newMessage];
    chatMessage = "";

    isChatSending = true;
    chatError = null;

    try {
      const waveform = encode(ggwaveInstance, formattedMessage, chatProtocol.id, 10);

      const ctx = initChatAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const buffer = createAudioBuffer(ctx, waveform);
      chatAudioSource = ctx.createBufferSource();
      chatAudioSource.buffer = buffer;
      chatAudioSource.connect(ctx.destination);

      chatAudioSource.onended = () => {
        chatMessages = chatMessages.map((m) =>
          m.id === newMessage.id ? { ...m, status: "sent" as const } : m
        );
        isChatSending = false;
        chatAudioSource = null;
      };

      chatAudioSource.start();
    } catch (err) {
      console.error("Chat send error:", err);
      chatError = "Failed to send message";
      chatMessages = chatMessages.map((m) =>
        m.id === newMessage.id ? { ...m, status: "sent" as const } : m
      );
      isChatSending = false;
    }
  };

  const retryChatMessage = async (msg: ChatMessage) => {
    if (isChatSending) return;
    
    // Ensure ggwave is initialized
    if (!await ensureInitialized()) {
      chatError = "Failed to initialize audio codec";
      return;
    }
    if (!ggwaveInstance) return;

    // Update message status to sending
    chatMessages = chatMessages.map((m) =>
      m.id === msg.id ? { ...m, status: "sending" as const, timestamp: new Date() } : m
    );

    isChatSending = true;
    chatError = null;

    const formattedMessage = formatChatMessage(msg.username, msg.text);

    try {
      const waveform = encode(ggwaveInstance, formattedMessage, chatProtocol.id, 10);

      const ctx = initChatAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const buffer = createAudioBuffer(ctx, waveform);
      chatAudioSource = ctx.createBufferSource();
      chatAudioSource.buffer = buffer;
      chatAudioSource.connect(ctx.destination);

      chatAudioSource.onended = () => {
        chatMessages = chatMessages.map((m) =>
          m.id === msg.id ? { ...m, status: "sent" as const } : m
        );
        isChatSending = false;
        chatAudioSource = null;
      };

      chatAudioSource.start();
    } catch (err) {
      console.error("Chat retry error:", err);
      chatError = "Failed to send message";
      chatMessages = chatMessages.map((m) =>
        m.id === msg.id ? { ...m, status: "sent" as const } : m
      );
      isChatSending = false;
    }
  };

  const startChatListening = async () => {
    if (isChatListening) {
      stopChatListening();
      return;
    }

    // Ensure ggwave is initialized
    if (!await ensureInitialized()) {
      chatError = "Failed to initialize audio codec";
      return;
    }
    if (!ggwaveInstance) {
      chatError = "Audio codec not initialized";
      return;
    }

    chatError = null;

    try {
      chatMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: SAMPLE_RATE,
        },
      });

      const ctx = initChatAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      chatAnalyserNode = ctx.createAnalyser();
      chatAnalyserNode.fftSize = FFT_SIZE;
      chatAnalyserNode.smoothingTimeConstant = 0.3;

      const source = ctx.createMediaStreamSource(chatMediaStream);
      source.connect(chatAnalyserNode);

      const bufferSize = 1024;
      chatScriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);
      isChatListening = true;

      chatScriptProcessor.onaudioprocess = (event) => {
        if (!isChatListening || !ggwaveInstance) return;

        const samples = new Float32Array(event.inputBuffer.getChannelData(0));
        
        try {
          const result = decode(ggwaveInstance, samples);
          chatDecoderState = result ? "Receiving..." : "Listening";

          if (result && result.length > 0) {
            const parsed = parseChatMessage(result);
            if (parsed && parsed.username !== username) {
              const receivedMessage: ChatMessage = {
                id: generateMessageId(),
                username: parsed.username,
                text: parsed.text,
                timestamp: new Date(),
                isMine: false,
                status: "received",
              };
              chatMessages = [...chatMessages, receivedMessage];
            }
          }
        } catch (err) {
          // Decoding error, ignore
        }
      };

      source.connect(chatScriptProcessor);
      chatScriptProcessor.connect(ctx.destination);

      updateChatSpectrogramLoop();
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          chatError = "Microphone access denied. Please allow microphone access.";
        } else if (err.name === "NotFoundError") {
          chatError = "No microphone found.";
        } else {
          chatError = err.message;
        }
      }
      isChatListening = false;
    }
  };

  const stopChatListening = () => {
    isChatListening = false;

    if (chatAnimationId !== null) {
      cancelAnimationFrame(chatAnimationId);
      chatAnimationId = null;
    }

    if (chatScriptProcessor) {
      chatScriptProcessor.disconnect();
      chatScriptProcessor.onaudioprocess = null;
      chatScriptProcessor = null;
    }

    if (chatMediaStream) {
      for (const track of chatMediaStream.getTracks()) {
        track.stop();
      }
      chatMediaStream = null;
    }

    if (chatAnalyserNode) {
      chatAnalyserNode.disconnect();
      chatAnalyserNode = null;
    }
  };

  const updateChatSpectrogramLoop = () => {
    if (!isChatListening || !chatAnalyserNode) return;

    const freqData = new Uint8Array(chatAnalyserNode.frequencyBinCount);
    chatAnalyserNode.getByteFrequencyData(freqData);
    updateChatSpectrogram(freqData);

    if (isChatListening) {
      chatAnimationId = requestAnimationFrame(updateChatSpectrogramLoop);
    }
  };

  const updateChatSpectrogram = (freqData: Uint8Array) => {
    if (!chatSpectrogramCanvas) return;

    const ctx = chatSpectrogramCanvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(1, 0, SPECTROGRAM_WIDTH - 1, SPECTROGRAM_HEIGHT);
    ctx.putImageData(imageData, 0, 0);

    const sliceHeight = SPECTROGRAM_HEIGHT / freqData.length;

    for (let i = 0; i < freqData.length / 4; i++) {
      const value = freqData[i];
      const y = SPECTROGRAM_HEIGHT - (i * 4 * SPECTROGRAM_HEIGHT) / freqData.length;
      const hue = 240 - (value / 255) * 240;
      const lightness = 10 + (value / 255) * 40;
      ctx.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
      ctx.fillRect(SPECTROGRAM_WIDTH - 1, y - sliceHeight * 4, 1, sliceHeight * 4);
    }
  };

  const clearChatSpectrogram = () => {
    if (!chatSpectrogramCanvas) return;
    const ctx = chatSpectrogramCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, SPECTROGRAM_WIDTH, SPECTROGRAM_HEIGHT);
    }
  };

  const clearChat = () => {
    chatMessages = [];
  };

  const formatMessageTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // ==================== SEND/RECEIVE FUNCTIONS ====================

  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      fileInput = file;
      const buffer = await file.arrayBuffer();
      fileData = new Uint8Array(buffer);
    }
  };

  const handleFileDrop = async (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      fileInput = file;
      const buffer = await file.arrayBuffer();
      fileData = new Uint8Array(buffer);
    }
  };

  const handleEncode = async () => {
    const data = inputMode === "text" ? textInput : fileData;
    if (!data || (typeof data === "string" && !data.trim())) return;

    // Ensure ggwave is initialized
    if (!await ensureInitialized()) {
      return;
    }
    if (!ggwaveInstance) return;

    isEncoding = true;
    sendError = null;
    encodedChunks = [];
    currentChunkIndex = 0;
    totalChunks = 0;

    try {
      let payload: Uint8Array;

      if (inputMode === "file" && fileInput && fileData) {
        // File mode: create file packet with filename
        payload = encodeFilePacket(fileInput.name, fileData);
      } else {
        // Text mode: just encode the text
        payload = new TextEncoder().encode(typeof data === "string" ? data : "");
      }

      // Encrypt if secret provided
      if (sendSecret.trim()) {
        payload = await encryptData(payload, sendSecret.trim());
      }

      // Add type prefix before chunking
      // E = Encrypted, P = Plain
      // F = File, T = Text
      const prefix = (sendSecret.trim() ? "E:" : "P:") + (inputMode === "file" ? "F:" : "T:");
      const prefixBytes = new TextEncoder().encode(prefix);
      
      // Combine prefix with payload
      const fullPayload = new Uint8Array(prefixBytes.length + payload.length);
      fullPayload.set(prefixBytes, 0);
      fullPayload.set(payload, prefixBytes.length);

      // Create chunks for transmission
      const chunks = await createChunks(fullPayload);
      encodedChunks = chunks;
      totalChunks = chunks.length;
      currentChunkIndex = 0;

      // Encode first chunk for immediate playback
      if (chunks.length > 0) {
        const waveform = encode(ggwaveInstance, chunks[0], selectedProtocol.id, 10);
        encodedSamples = waveform;
      }

      if (chunks.length > 1) {
        sendError = null; // Will show chunk info in UI instead
      }
    } catch (err) {
      console.error("Encode error:", err);
      sendError = err instanceof Error ? err.message : "Failed to encode";
    } finally {
      isEncoding = false;
    }
  };

  const handlePlay = async () => {
    if (!encodedSamples && encodedChunks.length === 0) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    const ctx = initAudio();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // If we have multiple chunks, play them sequentially
    if (encodedChunks.length > 1) {
      await playAllChunks(ctx);
      return;
    }

    // Single chunk playback
    if (!encodedSamples) return;
    
    const buffer = createAudioBuffer(ctx, encodedSamples);
    audioSourceNode = ctx.createBufferSource();
    audioSourceNode.buffer = buffer;
    audioSourceNode.connect(ctx.destination);

    const duration = buffer.duration;
    const startTime = ctx.currentTime;

    audioSourceNode.onended = () => {
      isPlaying = false;
      playProgress = 0;
    };

    audioSourceNode.start();
    isPlaying = true;

    const updateProgress = () => {
      if (!isPlaying || !audioContext) return;
      const elapsed = audioContext.currentTime - startTime;
      playProgress = Math.min(1, elapsed / duration);
      if (isPlaying) {
        requestAnimationFrame(updateProgress);
      }
    };
    requestAnimationFrame(updateProgress);
  };

  const playAllChunks = async (ctx: AudioContext) => {
    if (!ggwaveInstance) return;

    isPlaying = true;
    currentChunkIndex = 0;

    const playNextChunk = async () => {
      if (!isPlaying || currentChunkIndex >= encodedChunks.length || !ggwaveInstance) {
        isPlaying = false;
        playProgress = 0;
        currentChunkIndex = 0;
        return;
      }

      const chunk = encodedChunks[currentChunkIndex];
      const waveform = encode(ggwaveInstance, chunk, selectedProtocol.id, 10);
      const buffer = createAudioBuffer(ctx, waveform);

      audioSourceNode = ctx.createBufferSource();
      audioSourceNode.buffer = buffer;
      audioSourceNode.connect(ctx.destination);

      // Update progress
      playProgress = currentChunkIndex / encodedChunks.length;

      audioSourceNode.onended = () => {
        currentChunkIndex++;
        if (currentChunkIndex < encodedChunks.length && isPlaying) {
          // Small delay between chunks for receiver to process
          setTimeout(playNextChunk, 500);
        } else {
          isPlaying = false;
          playProgress = 0;
          currentChunkIndex = 0;
        }
      };

      audioSourceNode.start();
    };

    await playNextChunk();
  };

  const stopPlayback = () => {
    if (audioSourceNode) {
      audioSourceNode.stop();
      audioSourceNode.disconnect();
      audioSourceNode = null;
    }
    isPlaying = false;
    playProgress = 0;
  };

  const handleDownloadWav = () => {
    if (!encodedSamples) return;
    const blob = createWavFile(encodedSamples);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sound-transfer-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Process received transmission data
  // Process received transmission - handles both single and chunked transmissions
  const processReceivedData = async (rawText: string) => {
    decryptError = null;
    receivedFilename = null;

    // Check if this is a chunked transmission
    const chunkParsed = parseChunkHeader(rawText);
    
    if (chunkParsed) {
      // Chunked transmission
      if (!chunkCollector) {
        chunkCollector = new ChunkCollector();
      }

      receiveStatus = "receiving";
      const result = await chunkCollector.addChunk(rawText);
      
      // Update progress
      receiveProgress = result.progress;
      const state = chunkCollector.getState();
      chunksReceived = state.received;
      chunksTotal = state.total;
      decoderState = `Chunk ${chunksReceived}/${chunksTotal}`;

      if (result.error) {
        decryptError = result.error;
        receiveStatus = "error";
        return;
      }

      if (!result.complete) {
        // Not done yet, keep listening for more chunks
        return;
      }

      // Complete! Process the assembled data
      if (result.data) {
        await processAssembledData(result.data);
      }
      return;
    }

    // Non-chunked transmission (legacy support)
    rawReceivedData = rawText;
    await processLegacyData(rawText);
  };

  // Process assembled data from chunks (has E:/P: F:/T: prefix)
  const processAssembledData = async (data: Uint8Array) => {
    // Data format: "E:F:" or "P:T:" prefix (4 bytes) + actual payload
    const prefixStr = new TextDecoder().decode(data.slice(0, 4));
    const match = prefixStr.match(/^([EP]):([TF]):$/);
    
    if (!match) {
      // Try legacy format
      await processLegacyData(new TextDecoder().decode(data));
      return;
    }

    const [, encryptFlag, typeFlag] = match;
    isEncryptedData = encryptFlag === "E";
    isFileData = typeFlag === "F";
    
    // Remove prefix
    const payload = data.slice(4);
    receivedBytes = payload;
    
    if (isEncryptedData) {
      // Wait for user to decrypt
      receivedText = "";
      receiveStatus = "complete";
      return;
    }

    // Not encrypted - process directly
    if (isFileData) {
      try {
        const { filename, data: fileData } = decodeFilePacket(payload);
        receivedFilename = filename;
        receivedBytes = fileData;
        receivedText = "";
      } catch (e) {
        console.error("File packet decode error:", e);
        decryptError = "Failed to decode file packet. Data may be corrupted.";
        receiveStatus = "error";
        return;
      }
    } else {
      receivedText = new TextDecoder("utf-8").decode(payload);
      receivedBytes = payload;
    }
    
    receiveStatus = "complete";
  };

  // Process legacy non-chunked format
  const processLegacyData = async (rawText: string) => {
    try {
      // Check for packet format: [E|P]:[T|F]:base64data
      const match = rawText.match(/^([EP]):([TF]):(.+)$/);
      
      if (!match) {
        // Plain text (no packet format)
        receivedText = rawText;
        receivedBytes = new TextEncoder().encode(rawText);
        isEncryptedData = false;
        isFileData = false;
        receiveStatus = "complete";
        return;
      }

      const [, encryptFlag, typeFlag, base64Data] = match;
      isEncryptedData = encryptFlag === "E";
      isFileData = typeFlag === "F";

      // Decode base64
      let payload: Uint8Array;
      try {
        payload = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      } catch (e) {
        console.error("Base64 decode error:", e);
        decryptError = `Failed to decode data (${base64Data.length} chars). Try using a slower protocol.`;
        receiveStatus = "error";
        return;
      }

      receivedBytes = payload;

      if (isEncryptedData) {
        receivedText = "";
        receiveStatus = "complete";
        return;
      }

      // Not encrypted - process directly
      if (isFileData) {
        try {
          const { filename, data } = decodeFilePacket(payload);
          receivedFilename = filename;
          receivedBytes = data;
          receivedText = "";
        } catch (e) {
          console.error("File packet decode error:", e);
          decryptError = "Failed to decode file packet. Data may be corrupted.";
          receiveStatus = "error";
          return;
        }
      } else {
        receivedText = new TextDecoder("utf-8").decode(payload);
        receivedBytes = payload;
      }
      
      receiveStatus = "complete";
    } catch (err) {
      console.error("Process received data error:", err);
      decryptError = "Failed to process received data";
      receiveStatus = "error";
    }
  };

  // Decrypt received data with the provided secret
  const handleDecrypt = async () => {
    if (!receivedBytes || !receiveSecret.trim()) return;

    isDecrypting = true;
    decryptError = null;

    try {
      const decrypted = await decryptData(receivedBytes, receiveSecret.trim());

      // Now process the decrypted data
      if (isFileData) {
        try {
          const { filename, data } = decodeFilePacket(decrypted);
          receivedFilename = filename;
          receivedBytes = data;
          receivedText = "";
          isEncryptedData = false; // Mark as decrypted
        } catch (e) {
          console.error("File packet decode error:", e);
          decryptError = "Decrypted but failed to decode file. Wrong secret?";
          return;
        }
      } else {
        receivedText = new TextDecoder("utf-8").decode(decrypted);
        receivedBytes = decrypted;
        isEncryptedData = false; // Mark as decrypted
      }
    } catch (err) {
      console.error("Decryption error:", err);
      decryptError = "Decryption failed. Check your secret and try again.";
    } finally {
      isDecrypting = false;
    }
  };

  const startListening = async () => {
    if (isListening) {
      stopListening();
      return;
    }

    // Ensure ggwave is initialized
    if (!await ensureInitialized()) {
      listeningError = "Failed to initialize audio codec";
      return;
    }
    if (!ggwaveInstance) {
      listeningError = "Audio codec not initialized";
      return;
    }

    listeningError = null;
    decryptError = null;
    receivedText = "";
    receivedBytes = null;
    receivedFilename = null;
    receiveStatus = "waiting";
    // Reset chunk collector for new reception
    chunkCollector = null;
    receiveProgress = 0;
    chunksReceived = 0;
    chunksTotal = 0;
    isEncryptedData = false;
    isFileData = false;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: SAMPLE_RATE,
        },
      });

      const ctx = initAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = FFT_SIZE;
      analyserNode.smoothingTimeConstant = 0.3;

      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);

      const bufferSize = 1024;
      scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);
      isListening = true;

      scriptProcessor.onaudioprocess = (event) => {
        if (!isListening || !ggwaveInstance) return;

        const samples = new Float32Array(event.inputBuffer.getChannelData(0));
        
        try {
          const result = decode(ggwaveInstance, samples);
          
          if (result && result.length > 0) {
            // Check if this is a chunked transmission
            const chunkParsed = parseChunkHeader(result);
            
            if (chunkParsed) {
              // Multi-chunk transmission - keep listening
              decoderState = `Chunk ${chunkParsed.header.seq + 1}/${chunkParsed.header.total}`;
              processReceivedData(result).then(() => {
                // Only stop if complete or error
                if (receiveStatus === "complete" || receiveStatus === "error") {
                  stopListening();
                }
              });
            } else {
              // Single transmission - stop after receiving
              decoderState = "Received!";
              processReceivedData(result).then(() => {
                if (receiveStatus !== "error") {
                  receiveStatus = "complete";
                }
              });
              stopListening();
            }
          } else {
            // No data yet
            if (receiveStatus === "receiving") {
              decoderState = `Waiting for chunk... (${chunksReceived}/${chunksTotal})`;
            } else {
              decoderState = "Listening";
            }
          }
        } catch (err) {
          // Decoding error, ignore
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(ctx.destination);

      updateSpectrogramLoop();
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          listeningError = "Microphone access denied. Please allow microphone access.";
        } else if (err.name === "NotFoundError") {
          listeningError = "No microphone found.";
        } else {
          listeningError = err.message;
        }
      }
      receiveStatus = "idle";
    }
  };

  const stopListening = () => {
    isListening = false;

    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor.onaudioprocess = null;
      scriptProcessor = null;
    }

    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = null;
    }

    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }

    if (receiveStatus !== "complete") {
      receiveStatus = "idle";
    }
  };

  const updateSpectrogramLoop = () => {
    if (!isListening || !analyserNode) return;

    const freqData = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(freqData);
    updateSpectrogram(freqData);

    if (isListening) {
      animationId = requestAnimationFrame(updateSpectrogramLoop);
    }
  };

  const updateSpectrogram = (freqData: Uint8Array) => {
    if (!spectrogramCanvas) return;

    const ctx = spectrogramCanvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(1, 0, SPECTROGRAM_WIDTH - 1, SPECTROGRAM_HEIGHT);
    ctx.putImageData(imageData, 0, 0);

    const sliceHeight = SPECTROGRAM_HEIGHT / freqData.length;

    for (let i = 0; i < freqData.length / 4; i++) {
      const value = freqData[i];
      const y = SPECTROGRAM_HEIGHT - (i * 4 * SPECTROGRAM_HEIGHT) / freqData.length;
      const hue = 240 - (value / 255) * 240;
      const lightness = 10 + (value / 255) * 40;
      ctx.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
      ctx.fillRect(SPECTROGRAM_WIDTH - 1, y - sliceHeight * 4, 1, sliceHeight * 4);
    }
  };

  const clearSpectrogram = () => {
    if (!spectrogramCanvas) return;
    const ctx = spectrogramCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, SPECTROGRAM_WIDTH, SPECTROGRAM_HEIGHT);
    }
  };

  const handleCopyReceived = () => {
    if (receivedText) {
      navigator.clipboard.writeText(receivedText);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  };

  const handleDownloadReceived = () => {
    if (!receivedBytes) return;
    
    // Determine MIME type based on filename extension
    let mimeType = "application/octet-stream";
    const filename = receivedFilename || `received-${Date.now()}.bin`;
    const ext = filename.split(".").pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      txt: "text/plain",
      json: "application/json",
      html: "text/html",
      css: "text/css",
      js: "text/javascript",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      zip: "application/zip",
    };
    
    if (ext && mimeTypes[ext]) {
      mimeType = mimeTypes[ext];
    }
    
    const blob = new Blob([new Uint8Array(receivedBytes)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearSend = () => {
    textInput = "";
    fileInput = null;
    fileData = null;
    encodedSamples = null;
    sendError = null;
    // Reset chunk state
    encodedChunks = [];
    currentChunkIndex = 0;
    totalChunks = 0;
  };

  const handleClearReceive = () => {
    receivedText = "";
    receivedBytes = null;
    receivedFilename = null;
    rawReceivedData = null;
    isEncryptedData = false;
    isFileData = false;
    receiveStatus = "idle";
    listeningError = null;
    decryptError = null;
    // Reset chunk state
    chunkCollector = null;
    receiveProgress = 0;
    chunksReceived = 0;
    chunksTotal = 0;
    clearSpectrogram();
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    textInput = text;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `~${mins}m ${secs}s`;
  };

  // Initialize spectrograms
  $effect(() => {
    if (spectrogramCanvas && activeTab === "receive") {
      clearSpectrogram();
    }
    if (chatSpectrogramCanvas && activeTab === "chat") {
      clearChatSpectrogram();
    }
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Transfer data between devices using sound. Chat with nearby devices or send files.
      Uses ggwave for cross-platform compatibility.
    </p>
  </header>

  <!-- Error State -->
  {#if initError}
    <div class="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
      {initError}
    </div>
  {/if}

  <!-- Loading Overlay -->
  {#if isInitializing}
    <div class="flex items-center justify-center py-4 mb-4 bg-(--color-bg-alt) border border-(--color-border)">
      <div class="flex items-center gap-3 text-(--color-text-muted)">
        <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>Loading audio codec...</span>
      </div>
    </div>
  {/if}

  <!-- Tab Toggle -->
    <div class="mb-4 flex flex-wrap items-center gap-4">
      <div class="p-1 bg-(--color-border) inline-flex gap-1">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'chat'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (activeTab = "chat")}
        >
          Chat
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'send'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (activeTab = "send")}
        >
          Send
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'receive'
            ? 'bg-(--color-text) text-(--color-btn-text)'
            : 'text-(--color-text-muted) hover:text-(--color-text)'}"
          onclick={() => (activeTab = "receive")}
        >
          Receive
        </button>
      </div>
    </div>

    {#if activeTab === "chat"}
      <!-- CHAT TAB -->
      <div class="flex flex-col gap-4 flex-1">
        <!-- Chat Settings -->
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-1">
            <span class="text-xs text-(--color-text-muted)">Username:</span>
            <input
              type="text"
              bind:value={username}
              placeholder="Your name"
              maxlength="20"
              class="w-36 px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            />
            <button
              onclick={() => (username = generateUsername())}
              class="p-1 text-(--color-text-muted) hover:text-(--color-accent) transition-colors"
              title="Generate new username"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2v6h-6"></path>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                <path d="M3 22v-6h6"></path>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </svg>
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Protocol:</span>
            <select
              bind:value={chatProtocol}
              class="px-2 py-1 text-xs border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
            >
              {#each PROTOCOLS as proto}
                <option value={proto}>{proto.name}</option>
              {/each}
            </select>
          </div>
          <button
            onclick={startChatListening}
            class="px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1 {isChatListening
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-(--color-border) text-(--color-text) hover:bg-(--color-text) hover:text-(--color-btn-text)'}"
          >
            {#if isChatListening}
              <span class="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              Listening
            {:else}
              Start Listening
            {/if}
          </button>
        </div>

        <!-- Error -->
        {#if chatError}
          <div class="p-2 bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            {chatError}
          </div>
        {/if}

        <!-- Mini Spectrogram -->
        {#if isChatListening}
          <div>
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs text-(--color-text-muted)">
                Audio Monitor
                {#if chatDecoderState}
                  <span class="font-mono">- {chatDecoderState}</span>
                {/if}
              </span>
            </div>
            <canvas
              bind:this={chatSpectrogramCanvas}
              width={SPECTROGRAM_WIDTH}
              height={SPECTROGRAM_HEIGHT}
              class="w-full h-[100px] border border-(--color-border) bg-[#1a1a2e]"
            ></canvas>
          </div>
        {/if}

        <!-- Chat Messages -->
        <div class="flex-1 flex flex-col">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Messages
            </span>
            <button
              onclick={clearChat}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
          <div
            bind:this={messagesContainer}
            class="flex-1 max-h-96 overflow-y-auto border border-(--color-border) bg-(--color-bg) p-3 space-y-3"
          >
            {#if chatMessages.length === 0}
              <div class="text-center text-sm text-(--color-text-muted) py-8">
                <p>No messages yet.</p>
                <p class="mt-1 text-xs">Start listening and send a message to chat!</p>
              </div>
            {:else}
              {#each chatMessages as msg (msg.id)}
                <div class="flex flex-col {msg.isMine ? 'items-end' : 'items-start'}">
                  <div
                    class="max-w-[80%] px-3 py-2 text-sm {msg.isMine
                      ? 'bg-(--color-accent) text-(--color-btn-text)'
                      : 'bg-(--color-border) text-(--color-text)'}"
                  >
                    {#if !msg.isMine}
                      <div class="text-xs font-medium mb-1 opacity-75">{msg.username}</div>
                    {/if}
                    <div>{msg.text}</div>
                  </div>
                  <div class="text-xs text-(--color-text-muted) mt-1 flex items-center gap-2">
                    <span>{formatMessageTime(msg.timestamp)}</span>
                    {#if msg.isMine}
                      {#if msg.status === "sending"}
                        <span class="text-yellow-500">Sending...</span>
                      {:else if msg.status === "sent"}
                        <span class="text-green-500">Sent</span>
                        <button
                          onclick={() => retryChatMessage(msg)}
                          disabled={isChatSending}
                          class="text-(--color-text-muted) hover:text-(--color-accent) transition-colors disabled:opacity-50 flex items-center gap-1"
                          title="Resend message"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 2v6h-6"></path>
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                            <path d="M3 22v-6h6"></path>
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                          </svg>
                          Resend
                        </button>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Message Input -->
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={chatMessage}
            placeholder="Type a message..."
            disabled={isChatSending}
            onkeydown={(e) => e.key === "Enter" && sendChatMessage()}
            class="flex-1 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) disabled:opacity-50"
          />
          <button
            onclick={sendChatMessage}
            disabled={!chatMessage.trim() || isChatSending}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if isChatSending}
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            {/if}
            Send
          </button>
        </div>

        <p class="text-xs text-(--color-text-muted)">
          Tip: Enable "Listening" on all devices to receive messages. Keep devices within hearing distance.
        </p>
      </div>

    {:else if activeTab === "send"}
      <!-- SEND TAB -->
      <div class="flex flex-col gap-4">
        <!-- Protocol Selection -->
        <div class="flex flex-wrap items-center gap-4">
          <span class="text-xs text-(--color-text-muted)">Protocol:</span>
          <div class="p-1 bg-(--color-border) inline-flex gap-1 flex-wrap">
            {#each PROTOCOLS as proto}
              <button
                class="px-2 py-1 text-xs font-medium transition-colors {selectedProtocol.id === proto.id
                  ? 'bg-(--color-text) text-(--color-btn-text)'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'}"
                onclick={() => (selectedProtocol = proto)}
                title={proto.description}
              >
                {proto.name}
              </button>
            {/each}
          </div>
          <span class="text-xs text-(--color-text-muted)">
            {getTransferSpeed(selectedProtocol.id)} bytes/sec
            {#if selectedProtocol.isUltrasonic}
              <span class="text-(--color-accent)">(inaudible)</span>
            {/if}
          </span>
        </div>

        <!-- Secret (optional encryption) -->
        <div class="flex flex-wrap items-center gap-4">
          <span class="text-xs text-(--color-text-muted)">Secret (optional):</span>
          <input
            type="password"
            bind:value={sendSecret}
            placeholder="Enter to encrypt"
            class="w-48 px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
          />
          {#if sendSecret.trim()}
            <span class="text-xs text-green-500 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
              </svg>
              Encrypted
            </span>
          {/if}
        </div>

        <!-- Input Mode Toggle -->
        <div class="flex flex-wrap items-center gap-4">
          <div class="p-1 bg-(--color-border) inline-flex gap-1">
            <button
              class="px-3 py-1 text-sm font-medium transition-colors {inputMode === 'text'
                ? 'bg-(--color-text) text-(--color-btn-text)'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              onclick={() => (inputMode = "text")}
            >
              Text
            </button>
            <button
              class="px-3 py-1 text-sm font-medium transition-colors {inputMode === 'file'
                ? 'bg-(--color-text) text-(--color-btn-text)'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              onclick={() => (inputMode = "file")}
            >
              File
            </button>
          </div>
        </div>

        <!-- Input Area -->
        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
              {inputMode === "text" ? "Text Input" : "File Input"}
            </span>
            <div class="flex gap-3">
              {#if inputMode === "text"}
                <button
                  onclick={handlePaste}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
                >
                  Paste
                </button>
              {/if}
              <button
                onclick={handleClearSend}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {#if inputMode === "text"}
            <textarea
              bind:value={textInput}
              placeholder="Enter text to transmit..."
              class="w-full h-32 p-3 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) font-mono text-sm resize-none focus:outline-none focus:border-(--color-accent)"
            ></textarea>
          {:else}
            <div
              class="w-full h-32 border-2 border-dashed border-(--color-border) bg-(--color-bg-alt) flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-(--color-accent) transition-colors"
              ondrop={handleFileDrop}
              ondragover={(e) => e.preventDefault()}
              onclick={() => document.getElementById("file-input")?.click()}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === "Enter" && document.getElementById("file-input")?.click()}
            >
              <input
                type="file"
                id="file-input"
                class="hidden"
                onchange={handleFileSelect}
              />
              {#if fileInput}
                <span class="text-sm text-(--color-text)">{fileInput.name}</span>
                <span class="text-xs text-(--color-text-muted)">{formatSize(fileInput.size)}</span>
              {:else}
                <span class="text-sm text-(--color-text-muted)">Drop a file here or click to select</span>
                <span class="text-xs text-(--color-text-muted)">Small files recommended (&lt;100KB)</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Stats -->
        {#if dataSize > 0}
          <div class="flex flex-wrap items-center gap-4 text-xs text-(--color-text-muted)">
            <span>Size: <span class="text-(--color-text)">{formatSize(dataSize)}</span></span>
            <span>Est. time: <span class="text-(--color-text)">{formatTime(estimatedTime)}</span></span>
            {#if sendSecret.trim()}
              <span class="text-(--color-text-muted)">(+28 bytes for encryption)</span>
            {/if}
            {#if dataSize > 10000}
              <span class="text-yellow-500">Large data may take a while to transfer</span>
            {/if}
          </div>
        {/if}

        <!-- Error -->
        {#if sendError}
          <div class="p-2 bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            {sendError}
          </div>
        {/if}

        <!-- Encode Button -->
        <div class="flex flex-wrap items-center gap-4">
          <button
            onclick={handleEncode}
            disabled={dataSize === 0 || isEncoding}
            class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isEncoding}
              Encoding...
            {:else}
              Encode
            {/if}
          </button>

          {#if encodedSamples || encodedChunks.length > 0}
            <button
              onclick={handlePlay}
              class="px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors flex items-center gap-2"
            >
              {#if isPlaying}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Stop
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play {totalChunks > 1 ? `(${totalChunks} chunks)` : ""}
              {/if}
            </button>

            <button
              onclick={handleDownloadWav}
              disabled={totalChunks > 1}
              class="px-4 py-2 text-sm font-medium border border-(--color-border) text-(--color-text) hover:bg-(--color-border) transition-colors disabled:opacity-50"
              title={totalChunks > 1 ? "WAV download not available for multi-chunk transfers" : "Download as WAV file"}
            >
              Download .wav
            </button>
          {/if}
        </div>

        <!-- Play Progress -->
        {#if isPlaying}
          <div class="flex items-center gap-2">
            <div class="flex-1 h-2 bg-(--color-border) overflow-hidden">
              <div
                class="h-full bg-(--color-accent) transition-all duration-100"
                style="width: {playProgress * 100}%"
              ></div>
            </div>
            <span class="text-xs text-(--color-text-muted)">
              {#if totalChunks > 1}
                Chunk {currentChunkIndex + 1}/{totalChunks}
              {:else}
                {Math.round(playProgress * 100)}%
              {/if}
            </span>
          </div>
        {/if}

        <!-- Chunk Info -->
        {#if totalChunks > 1 && !isPlaying}
          <div class="p-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
            Data will be sent in {totalChunks} chunks. Receiver must stay in listening mode until all chunks are received.
          </div>
        {/if}
      </div>

    {:else}
      <!-- RECEIVE TAB -->
      <div class="flex flex-col gap-4">
        <!-- Protocol Selection -->
        <div class="flex flex-wrap items-center gap-4">
          <span class="text-xs text-(--color-text-muted)">Protocol:</span>
          <div class="p-1 bg-(--color-border) inline-flex gap-1 flex-wrap">
            {#each PROTOCOLS as proto}
              <button
                class="px-2 py-1 text-xs font-medium transition-colors {receiveProtocol.id === proto.id
                  ? 'bg-(--color-text) text-(--color-btn-text)'
                  : 'text-(--color-text-muted) hover:text-(--color-text)'}"
                onclick={() => (receiveProtocol = proto)}
              >
                {proto.name}
              </button>
            {/each}
          </div>
        </div>

        <!-- Listen Button -->
        <div class="flex flex-wrap items-center gap-4">
          <button
            onclick={startListening}
            class="px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 {isListening
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover)'}"
          >
            {#if isListening}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Stop Listening
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
              Start Listening
            {/if}
          </button>

          <div class="flex items-center gap-2">
            <span class="text-xs text-(--color-text-muted)">Status:</span>
            <span class="text-xs font-medium {receiveStatus === 'receiving' ? 'text-green-500 animate-pulse' : receiveStatus === 'complete' ? 'text-green-500' : 'text-(--color-text)'}">
              {#if receiveStatus === "idle"}
                Idle
              {:else if receiveStatus === "waiting"}
                Waiting for signal...
              {:else if receiveStatus === "receiving"}
                {#if chunksTotal > 0}
                  Receiving chunk {chunksReceived}/{chunksTotal}...
                {:else}
                  Receiving data...
                {/if}
              {:else}
                Complete!
              {/if}
            </span>
            {#if isListening && decoderState}
              <span class="text-xs text-(--color-text-muted) font-mono">
                [{decoderState}]
              </span>
            {/if}
          </div>
        </div>

        <!-- Error -->
        {#if listeningError}
          <div class="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm whitespace-pre-line">
            {listeningError}
          </div>
        {/if}

        <!-- Chunk Progress -->
        {#if receiveStatus === "receiving" && chunksTotal > 1}
          <div class="flex items-center gap-2">
            <div class="flex-1 h-2 bg-(--color-border) overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-100"
                style="width: {receiveProgress * 100}%"
              ></div>
            </div>
            <span class="text-xs text-(--color-text-muted)">{chunksReceived}/{chunksTotal}</span>
          </div>
        {/if}

        <!-- Spectrogram -->
        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Live Spectrogram
            </span>
            <button
              onclick={clearSpectrogram}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Clear
            </button>
          </div>
          <canvas
            bind:this={spectrogramCanvas}
            width={SPECTROGRAM_WIDTH}
            height={150}
            class="w-full h-[150px] border border-(--color-border) bg-[#1a1a2e]"
          ></canvas>
          <div class="flex justify-between text-xs text-(--color-text-muted) mt-1">
            <span>0 Hz</span>
            <span>{(SAMPLE_RATE / 4).toLocaleString()} Hz</span>
          </div>
        </div>

        <!-- Received Data -->
        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
              Received Data
              {#if receivedBytes && receivedBytes.length > 0}
                <span class="text-(--color-text-muted) font-normal">({formatSize(receivedBytes.length)})</span>
              {/if}
            </span>
            <div class="flex gap-3">
              {#if receiveMode === "text"}
                <button
                  onclick={handleCopyReceived}
                  disabled={!receivedText}
                  class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              {/if}
              <button
                onclick={handleDownloadReceived}
                disabled={!receivedBytes || isEncryptedData}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors disabled:opacity-50"
              >
                Download
              </button>
              <button
                onclick={handleClearReceive}
                class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            class="w-full min-h-32 p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) font-mono text-sm whitespace-pre-wrap break-words"
          >
            {#if decryptError}
              <div class="text-red-500 mb-3">{decryptError}</div>
              {#if isEncryptedData && receivedBytes}
                <div class="flex flex-col items-center gap-3">
                  <div class="flex items-center gap-2">
                    <input
                      type="password"
                      bind:value={receiveSecret}
                      placeholder="Enter secret"
                      class="w-48 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                      onkeydown={(e) => e.key === "Enter" && handleDecrypt()}
                    />
                    <button
                      onclick={handleDecrypt}
                      disabled={!receiveSecret.trim() || isDecrypting}
                      class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
                    >
                      {isDecrypting ? "..." : "Retry"}
                    </button>
                  </div>
                </div>
              {/if}
            {:else if isEncryptedData && receivedBytes && receivedBytes.length > 0}
              <!-- Encrypted data received, waiting for decryption -->
              <div class="flex flex-col items-center justify-center py-4 gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                </svg>
                <div class="text-center">
                  <div class="font-medium text-(--color-text)">Encrypted {isFileData ? "File" : "Text"} Received</div>
                  <div class="text-xs text-(--color-text-muted)">{formatSize(receivedBytes.length)} (encrypted)</div>
                </div>
                <div class="flex items-center gap-2 mt-2">
                  <input
                    type="password"
                    bind:value={receiveSecret}
                    placeholder="Enter secret"
                    class="w-48 px-3 py-2 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
                    onkeydown={(e) => e.key === "Enter" && handleDecrypt()}
                  />
                  <button
                    onclick={handleDecrypt}
                    disabled={!receiveSecret.trim() || isDecrypting}
                    class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
                  >
                    {isDecrypting ? "..." : "Decrypt"}
                  </button>
                </div>
              </div>
            {:else if receiveMode === "text" && receivedText}
              {receivedText}
            {:else if (receiveMode === "file" || isFileData) && receivedBytes && receivedBytes.length > 0 && !isEncryptedData}
              <div class="flex flex-col items-center justify-center py-4 gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-(--color-accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <div class="text-center">
                  <div class="font-medium text-(--color-text)">{receivedFilename || "received-file"}</div>
                  <div class="text-xs text-(--color-text-muted)">{formatSize(receivedBytes.length)}</div>
                </div>
                <button
                  onclick={handleDownloadReceived}
                  class="px-4 py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors"
                >
                  Download File
                </button>
              </div>
            {:else if receivedBytes && receivedBytes.length > 0 && !isEncryptedData}
              <span class="text-(--color-text-muted)">[Data received: {formatSize(receivedBytes.length)}]</span>
            {:else}
              <span class="text-(--color-text-muted)">
                {#if isListening}
                  Listening for incoming transmission...
                {:else}
                  Click "Start Listening" to receive data
                {/if}
              </span>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Protocol Reference -->
    <div class="mt-6 border-t border-(--color-border) pt-4">
      <details>
        <summary class="text-xs text-(--color-text-muted) cursor-pointer hover:text-(--color-text) select-none">
          Protocol Reference
        </summary>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr class="bg-(--color-bg-alt)">
                <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Protocol</th>
                <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Speed</th>
                <th class="border border-(--color-border) px-2 py-1 text-left font-medium text-(--color-text-muted)">Notes</th>
              </tr>
            </thead>
            <tbody>
              {#each PROTOCOLS as proto}
                <tr>
                  <td class="border border-(--color-border) px-2 py-1 font-medium text-(--color-text)">{proto.name}</td>
                  <td class="border border-(--color-border) px-2 py-1 text-(--color-text-muted)">{getTransferSpeed(proto.id)} B/s</td>
                  <td class="border border-(--color-border) px-2 py-1 text-(--color-text-muted)">{proto.description}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-(--color-text-muted)">
          Powered by <a href="https://github.com/ggerganov/ggwave" target="_blank" class="text-(--color-accent) hover:underline">ggwave</a> -
          cross-platform data-over-sound library with Reed-Solomon error correction.
        </p>
      </details>
    </div>
</div>
