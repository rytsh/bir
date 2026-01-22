<script lang="ts">
  import { onMount } from "svelte";
  import {
    STUN_SERVER_PRESETS,
    buildIceServers,
    encodeConnectionData,
    decodeConnectionData,
    generateShareURL,
    parseURLParams,
    splitFileIntoChunks,
    assembleChunks,
    generateFileId,
    formatBytes,
    formatDuration,
    FILE_CHUNK_SIZE,
    type ConnectionData,
    type FileMetadata,
  } from "../../lib/webrtc";

  // API URL from environment
  const API_URL = import.meta.env.PUBLIC_API_URL || "http://127.0.0.1:8080";

  // Types
  type TabType = "connect" | "chat" | "video" | "files";
  type ConnectionState = "disconnected" | "creating" | "waiting" | "connecting" | "connected";
  type ConnectionMode = "quick" | "manual";

  // Signaling message types
  interface SignalMessage {
    type: string;
    payload?: unknown;
  }

  interface ChatMessage {
    id: string;
    text: string;
    sender: "local" | "remote";
    timestamp: Date;
  }

  interface FileTransfer {
    id: string;
    name: string;
    size: number;
    type: string;
    progress: number;
    status: "pending" | "transferring" | "completed" | "error";
    direction: "send" | "receive";
    chunks?: ArrayBuffer[];
    totalChunks?: number;
    blob?: Blob;
  }

  // State
  let activeTab = $state<TabType>("connect");
  let connectionState = $state<ConnectionState>("disconnected");
  let connectionMode = $state<ConnectionMode>("quick");
  let error = $state("");
  let copied = $state(false);
  let copiedField = $state<string | null>(null);

  // Quick Connect (Room Code)
  let eventSource = $state<EventSource | null>(null);
  let roomCode = $state("");
  let joinRoomCode = $state("");
  let isHost = $state(false);

  // STUN server selection
  let selectedStunServers = $state<string[]>([
    STUN_SERVER_PRESETS[0].url,
    STUN_SERVER_PRESETS[1].url,
  ]);
  let customStunServer = $state("");
  let showStunSettings = $state(false);

  // WebRTC
  let peerConnection = $state<RTCPeerConnection | null>(null);
  let dataChannel = $state<RTCDataChannel | null>(null);
  let fileChannel = $state<RTCDataChannel | null>(null);
  let localStream = $state<MediaStream | null>(null);
  let remoteStream = $state<MediaStream | null>(null);
  let iceCandidates = $state<RTCIceCandidate[]>([]);
  let iceGatheringComplete = $state(false);

  // Connection data
  let localConnectionData = $state<ConnectionData | null>(null);
  let remoteConnectionInput = $state("");
  let shareURL = $state("");

  // Chat
  let chatMessages = $state<ChatMessage[]>([]);
  let chatInput = $state("");
  let chatContainer: HTMLDivElement;

  // Renegotiation
  let isNegotiating = $state(false);
  let makingOffer = $state(false);
  let ignoreOffer = $state(false);
  let isPolite = $state(false); // The peer that received the offer is "polite"

  // Video
  let localVideoElement = $state<HTMLVideoElement | null>(null);
  let remoteVideoElement = $state<HTMLVideoElement | null>(null);
  let isAudioMuted = $state(false);
  let isVideoMuted = $state(false);
  let callDuration = $state(0);
  let callTimer: ReturnType<typeof setInterval> | null = null;

  // Files
  let fileTransfers = $state<FileTransfer[]>([]);
  let dragOver = $state(false);

  // Derived
  let isConnected = $derived(connectionState === "connected");
  let canSendMessage = $derived(isConnected && chatInput.trim() !== "");
  let activeIceServers = $derived(buildIceServers(selectedStunServers));
  // Allow access to chat/files tabs if there's history to view (even when disconnected)
  let hasChatHistory = $derived(chatMessages.length > 0);
  let hasFileTransfers = $derived(fileTransfers.length > 0);

  // Sync video streams with video elements reactively
  // This handles the case where ontrack fires before the video element is bound
  $effect(() => {
    if (remoteVideoElement && remoteStream) {
      remoteVideoElement.srcObject = remoteStream;
    }
  });

  $effect(() => {
    if (localVideoElement && localStream) {
      localVideoElement.srcObject = localStream;
    }
  });

  // STUN server management
  function toggleStunServer(url: string) {
    if (selectedStunServers.includes(url)) {
      selectedStunServers = selectedStunServers.filter((s) => s !== url);
    } else {
      selectedStunServers = [...selectedStunServers, url];
    }
  }

  function addCustomStunServer() {
    const url = customStunServer.trim();
    if (!url) return;

    // Basic validation
    if (!url.startsWith("stun:") && !url.startsWith("turn:")) {
      error = "STUN URL must start with stun: or turn:";
      return;
    }

    if (!selectedStunServers.includes(url)) {
      selectedStunServers = [...selectedStunServers, url];
    }
    customStunServer = "";
  }

  function removeStunServer(url: string) {
    selectedStunServers = selectedStunServers.filter((s) => s !== url);
  }

  // Initialize from URL params on mount
  onMount(() => {
    const urlData = parseURLParams(window.location.href);
    if (urlData) {
      if (urlData.type === "offer") {
        handleReceivedOffer(urlData.data);
      }
    }

    // Check for room code in URL (Quick Connect link)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get("room");
    if (roomParam) {
      joinRoomCode = roomParam.toUpperCase();
      connectionMode = "quick";
      // Clear the URL parameter after reading
      window.history.replaceState({}, "", window.location.pathname);
      // Auto-join the room
      joinQuickConnection();
    }

    return () => {
      cleanup();
    };
  });

  function cleanup() {
    stopCallTimer();
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
      });
    }
    if (peerConnection) {
      peerConnection.close();
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  // Quick Connect - HTTP + SSE Signaling Functions
  async function sendSignalMessage(msg: SignalMessage) {
    if (!roomCode) return;

    try {
      const sender = isHost ? "host" : "guest";
      await fetch(`${API_URL}/webrtc/room/${roomCode}/signal?sender=${sender}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
    } catch (err) {
      console.error("Failed to send signal message:", err);
    }
  }

  function connectToEventSource(code: string, role: "host" | "guest") {
    eventSource = new EventSource(`${API_URL}/webrtc/room/${code}/events?role=${role}`);
    let hasConnected = false;

    eventSource.onopen = () => {
      hasConnected = true;
      console.debug("SSE connection opened");
    };

    eventSource.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data) as SignalMessage;
      handleSignalMessage(msg);
    });

    eventSource.addEventListener("connected", () => {
      console.debug("SSE connected event received");
    });

    eventSource.onerror = (e) => {
      console.debug("SSE error", e, "readyState:", eventSource?.readyState, "hasConnected:", hasConnected);
      // Check if connection is permanently closed
      if (eventSource?.readyState === EventSource.CLOSED) {
        console.debug("SSE connection closed");
        // Only show error if we were waiting for a peer (not already connected via WebRTC)
        if (connectionState === "waiting" || connectionState === "connecting") {
          if (!hasConnected) {
            error = "Failed to connect to room. Please check if the server is running.";
          } else {
            error = "Connection to room lost. The room may have expired.";
          }
          connectionState = "disconnected";
          // Clean up
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          roomCode = "";
          joinRoomCode = "";
          isHost = false;
        }
      } else {
        console.debug("SSE error/reconnecting");
      }
    };
  }

  async function handleSignalMessage(msg: SignalMessage) {
    switch (msg.type) {
      case "peer_joined":
        // A peer joined our room, create and send offer
        await createOfferForSignaling();
        break;

      case "offer":
        // Received offer from host
        await handleSignalingOffer(msg.payload as { sdp: string });
        break;

      case "answer":
        // Received answer from guest
        await handleSignalingAnswer(msg.payload as { sdp: string });
        break;

      case "candidate":
        // Received ICE candidate
        await handleSignalingCandidate(msg.payload as RTCIceCandidateInit);
        break;

      case "peer_left":
        // Peer disconnected - the WebRTC connection state change handler will handle UI
        break;
    }
  }

  async function createQuickConnection() {
    try {
      error = "";
      connectionState = "creating";
      isHost = true;

      // Create room via HTTP POST
      const response = await fetch(`${API_URL}/webrtc/room`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to create room");
      }
      const data = await response.json();
      roomCode = data.room;

      // Initialize peer connection
      peerConnection = new RTCPeerConnection({
        iceServers: activeIceServers,
      });

      setupPeerConnectionHandlers();
      setupQuickConnectIceHandler();

      dataChannel = peerConnection.createDataChannel("chat", { ordered: true });
      setupDataChannelHandlers(dataChannel);

      fileChannel = peerConnection.createDataChannel("files", { ordered: true });
      fileChannel.binaryType = "arraybuffer";
      setupFileChannelHandlers(fileChannel);

      // Connect to SSE for receiving messages
      connectToEventSource(roomCode, "host");

      connectionState = "waiting";
    } catch (err) {
      error = `Failed to create connection: ${err}`;
      connectionState = "disconnected";
    }
  }

  async function joinQuickConnection() {
    if (!joinRoomCode.trim()) {
      error = "Please enter a room code";
      return;
    }

    try {
      error = "";
      connectionState = "connecting";
      isHost = false;
      isPolite = true;

      const code = joinRoomCode.trim().toUpperCase();

      // Join room via HTTP POST
      const response = await fetch(`${API_URL}/webrtc/room/${code}/join`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        if (response.status === 404) {
          error = "Room not found. Please check the code and try again.";
        } else if (response.status === 409) {
          error = "Room is full. Only 2 peers can connect.";
        } else {
          error = data.error || "Failed to join room";
        }
        connectionState = "disconnected";
        return;
      }

      roomCode = code;

      // Initialize peer connection
      peerConnection = new RTCPeerConnection({
        iceServers: activeIceServers,
      });

      setupPeerConnectionHandlers();
      setupQuickConnectIceHandler();

      // Connect to SSE for receiving messages
      connectToEventSource(roomCode, "guest");
    } catch (err) {
      error = `Failed to join: ${err}`;
      connectionState = "disconnected";
    }
  }

  function setupQuickConnectIceHandler() {
    if (!peerConnection) return;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalMessage({
          type: "candidate",
          payload: event.candidate.toJSON(),
        });
      }
    };
  }

  async function createOfferForSignaling() {
    if (!peerConnection) return;

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      sendSignalMessage({
        type: "offer",
        payload: { sdp: offer.sdp },
      });
    } catch (err) {
      error = `Failed to create offer: ${err}`;
    }
  }

  async function handleSignalingOffer(payload: { sdp: string }) {
    if (!peerConnection) return;

    try {
      await peerConnection.setRemoteDescription({
        type: "offer",
        sdp: payload.sdp,
      });

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      sendSignalMessage({
        type: "answer",
        payload: { sdp: answer.sdp },
      });
    } catch (err) {
      error = `Failed to handle offer: ${err}`;
    }
  }

  async function handleSignalingAnswer(payload: { sdp: string }) {
    if (!peerConnection) return;

    try {
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: payload.sdp,
      });
    } catch (err) {
      error = `Failed to handle answer: ${err}`;
    }
  }

  async function handleSignalingCandidate(candidate: RTCIceCandidateInit) {
    if (!peerConnection) return;

    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      // Ignore candidate errors - they're often benign
      console.debug("ICE candidate error:", err);
    }
  }

  // Connection Management
  async function createConnection() {
    try {
      error = "";
      connectionState = "creating";
      iceCandidates = [];
      iceGatheringComplete = false;
      isPolite = false; // The initiator (offerer) is NOT polite

      peerConnection = new RTCPeerConnection({
        iceServers: activeIceServers,
      });

      setupPeerConnectionHandlers();

      dataChannel = peerConnection.createDataChannel("chat", { ordered: true });
      setupDataChannelHandlers(dataChannel);

      fileChannel = peerConnection.createDataChannel("files", { ordered: true });
      fileChannel.binaryType = "arraybuffer";
      setupFileChannelHandlers(fileChannel);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await waitForIceGathering();

      localConnectionData = {
        type: "offer",
        sdp: peerConnection.localDescription!.sdp,
        candidates: iceCandidates,
      };

      shareURL = generateShareURL(localConnectionData, window.location.href.split("?")[0]);

      connectionState = "waiting";
    } catch (err) {
      error = `Failed to create connection: ${err}`;
      connectionState = "disconnected";
    }
  }

  async function handleReceivedOffer(offerData: ConnectionData) {
    try {
      error = "";
      connectionState = "connecting";
      iceCandidates = [];
      iceGatheringComplete = false;
      isPolite = true; // The peer that receives the offer IS polite

      peerConnection = new RTCPeerConnection({
        iceServers: activeIceServers,
      });

      setupPeerConnectionHandlers();

      await peerConnection.setRemoteDescription({
        type: "offer",
        sdp: offerData.sdp,
      });

      for (const candidate of offerData.candidates) {
        await peerConnection.addIceCandidate(candidate);
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      await waitForIceGathering();

      localConnectionData = {
        type: "answer",
        sdp: peerConnection.localDescription!.sdp,
        candidates: iceCandidates,
      };

      shareURL = generateShareURL(localConnectionData, window.location.href.split("?")[0]);

      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      error = `Failed to process offer: ${err}`;
      connectionState = "disconnected";
    }
  }

  async function handleReceivedAnswer() {
    if (!peerConnection || !remoteConnectionInput.trim()) return;

    try {
      error = "";
      const answerData = decodeConnectionData(remoteConnectionInput.trim());

      if (!answerData || answerData.type !== "answer") {
        error = "Invalid answer data";
        return;
      }

      connectionState = "connecting";

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerData.sdp,
      });

      for (const candidate of answerData.candidates) {
        await peerConnection.addIceCandidate(candidate);
      }

      remoteConnectionInput = "";
    } catch (err) {
      error = `Failed to process answer: ${err}`;
    }
  }

  async function handlePastedData() {
    if (!remoteConnectionInput.trim()) return;

    try {
      const input = remoteConnectionInput.trim();
      let data: ConnectionData | null = null;

      // Check if input is a URL
      if (input.startsWith("http://") || input.startsWith("https://")) {
        const urlData = parseURLParams(input);
        if (urlData) {
          data = urlData.data;
        }
      }

      // If not a URL or URL parsing failed, try decoding as raw data
      if (!data) {
        data = decodeConnectionData(input);
      }

      if (!data) {
        error = "Invalid connection data or URL";
        return;
      }

      if (data.type === "offer") {
        await handleReceivedOffer(data);
      } else if (data.type === "answer") {
        await handleReceivedAnswer();
      }
    } catch (err) {
      error = `Failed to process data: ${err}`;
    }
  }

  function setupPeerConnectionHandlers() {
    if (!peerConnection) return;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates = [...iceCandidates, event.candidate];

        // If we're connected and renegotiating, send candidates through data channel
        if (connectionState === "connected" && dataChannel && dataChannel.readyState === "open") {
          dataChannel.send(JSON.stringify({
            type: "renegotiate-candidate",
            candidate: event.candidate.toJSON(),
          }));
        }
      }
    };

    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection?.iceGatheringState === "complete") {
        iceGatheringComplete = true;
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection?.connectionState;
      if (state === "connected") {
        connectionState = "connected";
        activeTab = "chat";
        // Close the SSE connection - room signaling is no longer needed
        // once peer-to-peer WebRTC connection is established
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Clear room code since we're now connected peer-to-peer
        roomCode = "";
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        connectionState = "disconnected";
        // Stop video call when peer disconnects
        stopVideoCall();
        // Clean up connection resources but preserve chat messages and file transfers
        // so user can still view chat history and download received files
        if (peerConnection) {
          peerConnection.close();
        }
        peerConnection = null;
        dataChannel = null;
        fileChannel = null;
        remoteStream = null;
        localConnectionData = null;
        shareURL = "";
        remoteConnectionInput = "";
        // Reset renegotiation state
        isNegotiating = false;
        makingOffer = false;
        ignoreOffer = false;
        isPolite = false;
      }
    };

    peerConnection.onsignalingstatechange = () => {
      isNegotiating = peerConnection?.signalingState !== "stable";
    };

    // Handle renegotiation when tracks are added after connection
    peerConnection.onnegotiationneeded = async () => {
      if (!peerConnection || connectionState !== "connected") return;

      try {
        makingOffer = true;
        await peerConnection.setLocalDescription();

        // Send offer through data channel
        if (dataChannel && dataChannel.readyState === "open") {
          dataChannel.send(JSON.stringify({
            type: "renegotiate-offer",
            sdp: peerConnection.localDescription!.sdp,
          }));
        }
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        makingOffer = false;
      }
    };

    peerConnection.ondatachannel = (event) => {
      if (event.channel.label === "chat") {
        dataChannel = event.channel;
        setupDataChannelHandlers(event.channel);
      } else if (event.channel.label === "files") {
        fileChannel = event.channel;
        fileChannel.binaryType = "arraybuffer";
        setupFileChannelHandlers(event.channel);
      }
    };

    peerConnection.ontrack = (event) => {
      // Always create a new MediaStream from the received tracks
      // This ensures we get all tracks even when added via renegotiation
      if (!remoteStream) {
        remoteStream = new MediaStream();
      }
      event.streams[0].getTracks().forEach((track) => {
        if (!remoteStream!.getTracks().includes(track)) {
          remoteStream!.addTrack(track);
        }
      });
      if (remoteVideoElement) {
        remoteVideoElement.srcObject = remoteStream;
      }
    };
  }

  function setupDataChannelHandlers(channel: RTCDataChannel) {
    channel.onmessage = async (event) => {
      const data = event.data;

      // Check if this is a signaling message for renegotiation
      if (typeof data === "string" && data.startsWith("{")) {
        try {
          const message = JSON.parse(data);
          if (message.type === "renegotiate-offer" || message.type === "renegotiate-answer" || message.type === "renegotiate-candidate") {
            await handleRenegotiationMessage(message);
            return;
          }
        } catch {
          // Not JSON, treat as chat message
        }
      }

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        text: data,
        sender: "remote",
        timestamp: new Date(),
      };
      chatMessages = [...chatMessages, message];
      scrollToBottom();
    };
  }

  async function handleRenegotiationMessage(message: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) {
    if (!peerConnection) return;

    try {
      if (message.type === "renegotiate-offer") {
        // Received an offer from the remote peer
        const offerCollision = makingOffer || peerConnection.signalingState !== "stable";

        ignoreOffer = !isPolite && offerCollision;
        if (ignoreOffer) {
          return;
        }

        await peerConnection.setRemoteDescription({ type: "offer", sdp: message.sdp });
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send answer back through data channel
        if (dataChannel && dataChannel.readyState === "open") {
          dataChannel.send(JSON.stringify({
            type: "renegotiate-answer",
            sdp: peerConnection.localDescription!.sdp,
          }));
        }
      } else if (message.type === "renegotiate-answer") {
        // Received an answer to our offer
        await peerConnection.setRemoteDescription({ type: "answer", sdp: message.sdp });
      } else if (message.type === "renegotiate-candidate" && message.candidate) {
        // Received an ICE candidate during renegotiation
        await peerConnection.addIceCandidate(message.candidate);
      }
    } catch (err) {
      console.error("Renegotiation error:", err);
    }
  }

  function setupFileChannelHandlers(channel: RTCDataChannel) {
    channel.onmessage = (event) => {
      handleFileMessage(event.data);
    };
  }

  function waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (peerConnection?.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        resolve();
      }, 5000);

      const checkComplete = () => {
        if (iceGatheringComplete) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }

  async function disconnect() {
    // If using Quick Connect, notify server that we're leaving the room
    if (connectionMode === "quick" && roomCode) {
      try {
        const sender = isHost ? "host" : "guest";
        await fetch(`${API_URL}/webrtc/room/${roomCode}/leave?sender=${sender}`, {
          method: "POST",
        });
      } catch (err) {
        console.debug("Failed to notify server of room exit:", err);
      }
    }

    cleanup();
    peerConnection = null;
    dataChannel = null;
    fileChannel = null;
    localStream = null;
    remoteStream = null;
    localConnectionData = null;
    connectionState = "disconnected";
    shareURL = "";
    remoteConnectionInput = "";
    chatMessages = [];
    fileTransfers = [];
    activeTab = "connect";
    // Reset renegotiation state
    isNegotiating = false;
    makingOffer = false;
    ignoreOffer = false;
    isPolite = false;
    // Reset quick connect state
    roomCode = "";
    joinRoomCode = "";
    isHost = false;
  }

  // Chat
  function sendMessage() {
    if (!canSendMessage || !dataChannel) return;

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      text: chatInput.trim(),
      sender: "local",
      timestamp: new Date(),
    };

    dataChannel.send(message.text);
    chatMessages = [...chatMessages, message];
    chatInput = "";
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 10);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  // Video Call
  async function startVideoCall() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (localVideoElement) {
        localVideoElement.srcObject = localStream;
      }

      if (peerConnection) {
        localStream.getTracks().forEach((track) => {
          peerConnection!.addTrack(track, localStream!);
        });
      }

      startCallTimer();
    } catch (err) {
      error = `Failed to access camera/microphone: ${err}`;
    }
  }

  function stopVideoCall() {
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
      });
      localStream = null;
    }
    stopCallTimer();
  }

  function toggleAudio() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isAudioMuted = !audioTrack.enabled;
      }
    }
  }

  function toggleVideo() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isVideoMuted = !videoTrack.enabled;
      }
    }
  }

  function startCallTimer() {
    callDuration = 0;
    callTimer = setInterval(() => {
      callDuration++;
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimer) {
      clearInterval(callTimer);
      callTimer = null;
    }
    callDuration = 0;
  }

  // File Transfer
  function handleFileDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      sendFile(files[0]);
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      sendFile(input.files[0]);
    }
  }

  async function sendFile(file: File) {
    if (!fileChannel || fileChannel.readyState !== "open") {
      error = "File channel not ready";
      return;
    }

    const fileId = generateFileId();
    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);

    const transfer: FileTransfer = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "transferring",
      direction: "send",
      totalChunks,
    };

    fileTransfers = [...fileTransfers, transfer];

    const metadata: FileMetadata = {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      totalChunks,
    };

    fileChannel.send(JSON.stringify({ type: "metadata", data: metadata }));

    let chunkIndex = 0;
    for await (const chunk of splitFileIntoChunks(file)) {
      while (fileChannel.bufferedAmount > 1024 * 1024) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const chunkData = {
        type: "chunk",
        fileId,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
      };

      fileChannel.send(JSON.stringify(chunkData));
      fileChannel.send(chunk.data);

      chunkIndex++;
      updateTransferProgress(fileId, (chunkIndex / totalChunks) * 100);
    }

    fileChannel.send(JSON.stringify({ type: "complete", fileId }));
    updateTransferStatus(fileId, "completed");
  }

  function handleFileMessage(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data);

        if (message.type === "metadata") {
          const metadata = message.data as FileMetadata;
          const transfer: FileTransfer = {
            id: metadata.id,
            name: metadata.name,
            size: metadata.size,
            type: metadata.type,
            progress: 0,
            status: "transferring",
            direction: "receive",
            chunks: [],
            totalChunks: metadata.totalChunks,
          };
          fileTransfers = [...fileTransfers, transfer];
        } else if (message.type === "complete") {
          const transfer = fileTransfers.find((t) => t.id === message.fileId);
          if (transfer && transfer.chunks) {
            const blob = assembleChunks(transfer.chunks, {
              id: transfer.id,
              name: transfer.name,
              type: transfer.type,
              size: transfer.size,
              totalChunks: transfer.totalChunks!,
            });
            transfer.blob = blob;
            updateTransferStatus(message.fileId, "completed");
          }
        }
      } catch {
        // Ignore parse errors
      }
    } else {
      const lastPendingTransfer = fileTransfers.find(
        (t) => t.direction === "receive" && t.status === "transferring"
      );
      if (lastPendingTransfer && lastPendingTransfer.chunks) {
        lastPendingTransfer.chunks.push(data);
        const progress = (lastPendingTransfer.chunks.length / lastPendingTransfer.totalChunks!) * 100;
        updateTransferProgress(lastPendingTransfer.id, progress);
      }
    }
  }

  function updateTransferProgress(fileId: string, progress: number) {
    fileTransfers = fileTransfers.map((t) => (t.id === fileId ? { ...t, progress } : t));
  }

  function updateTransferStatus(fileId: string, status: FileTransfer["status"]) {
    fileTransfers = fileTransfers.map((t) => (t.id === fileId ? { ...t, status, progress: 100 } : t));
  }

  function downloadFile(transfer: FileTransfer) {
    if (!transfer.blob) return;

    const url = URL.createObjectURL(transfer.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = transfer.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clipboard
  function handleCopy(field: string, value: string) {
    navigator.clipboard.writeText(value);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  }
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Peer-to-peer communication using WebRTC. Share the link to connect with another device for chat, video calls, and file transfer.
    </p>
  </header>

  <!-- Connection Status -->
  <div class="mb-4 p-3 bg-(--color-bg-alt) border border-(--color-border) flex items-center gap-3">
    <div class="w-3 h-3 {connectionState === 'connected'
      ? 'bg-green-500'
      : connectionState === 'connecting' || connectionState === 'creating' || connectionState === 'waiting'
        ? 'bg-yellow-500 animate-pulse'
        : 'bg-gray-500'}"></div>
    <span class="text-sm text-(--color-text)">
      {#if connectionState === "disconnected"}
        Not connected
      {:else if connectionState === "creating"}
        Creating offer...
      {:else if connectionState === "waiting"}
        Waiting for peer...
      {:else if connectionState === "connecting"}
        Connecting...
      {:else}
        Connected{#if connectionMode === "quick" && roomCode} (Room: {roomCode}){/if}
      {/if}
    </span>
    {#if isConnected}
      <button
        onclick={disconnect}
        class="ml-auto text-xs text-(--color-error-text) hover:underline"
      >
        {connectionMode === "quick" ? "Exit Room" : "Disconnect"}
      </button>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="flex gap-0 mb-4 border-b border-(--color-border)">
    {#each [{ id: "connect", label: "Connect" }, { id: "chat", label: "Chat" }, { id: "video", label: "Video" }, { id: "files", label: "Files" }] as tab}
      {@const isTabEnabled = tab.id === "connect" ||
        isConnected ||
        (tab.id === "chat" && hasChatHistory) ||
        (tab.id === "files" && hasFileTransfers)}
      <button
        onclick={() => (activeTab = tab.id as TabType)}
        disabled={!isTabEnabled}
        class="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed {activeTab === tab.id
          ? 'text-(--color-text) border-b-2 border-(--color-accent)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm">
      {error}
      <button onclick={() => (error = "")} class="ml-2 underline">Dismiss</button>
    </div>
  {/if}

  <!-- Tab Content -->
  <div class="flex-1 overflow-auto">
    {#if activeTab === "connect"}
      {#if connectionState === "disconnected"}
        <div class="space-y-4">
          <!-- Connection Mode Toggle -->
          <div class="flex gap-2 p-1 bg-(--color-bg-alt) border border-(--color-border)">
            <button
              onclick={() => (connectionMode = "quick")}
              class="flex-1 px-4 py-2 text-sm font-medium transition-colors {connectionMode === 'quick'
                ? 'bg-(--color-accent) text-(--color-btn-text)'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              Quick Connect
            </button>
            <button
              onclick={() => (connectionMode = "manual")}
              class="flex-1 px-4 py-2 text-sm font-medium transition-colors {connectionMode === 'manual'
                ? 'bg-(--color-accent) text-(--color-btn-text)'
                : 'text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              Manual
            </button>
          </div>

          {#if connectionMode === "quick"}
            <!-- Quick Connect Mode -->
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">Create Room</h2>
              <p class="text-xs text-(--color-text-muted) mb-3">Create a room and share the code with your peer.</p>
              <button
                onclick={createQuickConnection}
                disabled={selectedStunServers.length === 0}
                class="w-full px-4 py-3 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
              >
                Create Room
              </button>
              {#if selectedStunServers.length === 0}
                <p class="mt-2 text-xs text-(--color-error-text)">Please configure STUN servers below</p>
              {/if}
            </div>

            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">Join Room</h2>
              <p class="text-xs text-(--color-text-muted) mb-3">Enter the room code shared by your peer.</p>
              <div class="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  bind:value={joinRoomCode}
                  placeholder="Enter room code (e.g., ABC123)"
                  maxlength="6"
                  class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm text-center tracking-widest uppercase focus:border-(--color-text-light) outline-none"
                  onkeydown={(e) => e.key === "Enter" && joinQuickConnection()}
                />
                <button
                  onclick={joinQuickConnection}
                  disabled={!joinRoomCode.trim() || selectedStunServers.length === 0}
                  class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          {:else}
            <!-- Manual Mode - Original UI -->
            <!-- Create Connection -->
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">Create Connection</h2>
              <button
                onclick={createConnection}
                disabled={selectedStunServers.length === 0}
                class="w-full px-4 py-3 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
              >
                Create New Connection
              </button>
              {#if selectedStunServers.length === 0}
                <p class="mt-2 text-xs text-(--color-error-text)">Please select at least one STUN server</p>
              {/if}
            </div>

            <!-- Join Connection -->
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">Join Existing Connection</h2>
              <div class="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  bind:value={remoteConnectionInput}
                  placeholder="Paste connection data or URL..."
                  class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
                />
                <button
                  onclick={handlePastedData}
                  disabled={!remoteConnectionInput.trim() || selectedStunServers.length === 0}
                  class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
            </div>
          {/if}

          <!-- STUN Server Settings -->
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <button
              onclick={() => (showStunSettings = !showStunSettings)}
              class="flex items-center justify-between w-full text-left"
            >
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium">STUN Servers</h2>
              <span class="text-xs text-(--color-text-muted)">
                {selectedStunServers.length} selected {showStunSettings ? "▲" : "▼"}
              </span>
            </button>

            {#if showStunSettings}
              <div class="mt-4 space-y-3">
                <!-- Preset servers -->
                <div>
                  <label class="block text-xs text-(--color-text-muted) mb-2">Preset Servers</label>
                  <div class="flex flex-wrap gap-2">
                    {#each STUN_SERVER_PRESETS as preset}
                      <button
                        onclick={() => toggleStunServer(preset.url)}
                        class="px-3 py-1.5 text-xs border transition-colors {selectedStunServers.includes(preset.url)
                          ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                          : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:border-(--color-text-light)'}"
                      >
                        {preset.name}
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Custom server input -->
                <div>
                  <label class="block text-xs text-(--color-text-muted) mb-2">Custom Server</label>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      bind:value={customStunServer}
                      placeholder="stun:your-server.com:3478"
                      class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
                      onkeydown={(e) => e.key === "Enter" && addCustomStunServer()}
                    />
                    <button
                      onclick={addCustomStunServer}
                      disabled={!customStunServer.trim()}
                      class="px-4 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) text-sm hover:text-(--color-text) hover:border-(--color-text-light) transition-colors disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <!-- Selected servers list -->
                {#if selectedStunServers.length > 0}
                  <div>
                    <label class="block text-xs text-(--color-text-muted) mb-2">Active Servers</label>
                    <div class="space-y-1">
                      {#each selectedStunServers as server}
                        <div class="flex items-center justify-between px-3 py-2 bg-(--color-bg) border border-(--color-border)">
                          <span class="text-xs font-mono text-(--color-text) truncate">{server}</span>
                          <button
                            onclick={() => removeStunServer(server)}
                            class="text-xs text-(--color-text-muted) hover:text-(--color-error-text) ml-2"
                          >
                            Remove
                          </button>
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <p class="text-xs text-(--color-text-muted)">No STUN servers selected. NAT traversal may not work.</p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {:else if connectionState === "waiting" || connectionState === "connecting"}
        <div class="space-y-4">
          {#if connectionMode === "quick" && roomCode}
            <!-- Quick Connect - Room Code Display -->
            <div class="p-6 bg-(--color-bg-alt) border border-(--color-border) text-center">
              <h2 class="text-sm tracking-wider text-(--color-text-muted) font-medium mb-2">Room Code</h2>
              <div class="flex items-center justify-center gap-3">
                <span class="text-4xl font-mono font-bold tracking-widest text-(--color-text)">{roomCode}</span>
                <button
                  onclick={() => handleCopy("room", roomCode)}
                  class="px-3 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) text-xs hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                >
                  {copiedField === "room" ? "Copied!" : "Copy Code"}
                </button>
                <button
                  onclick={() => handleCopy("roomLink", `${window.location.origin}${window.location.pathname}?room=${roomCode}`)}
                  class="px-3 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) text-xs hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                >
                  {copiedField === "roomLink" ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <p class="text-sm text-(--color-text-muted) mt-4">Share the code or link with your peer</p>
              <div class="flex items-center justify-center gap-2 mt-2">
                <div class="w-2 h-2 bg-yellow-500 animate-pulse rounded-full"></div>
                <span class="text-xs text-(--color-text-muted)">Waiting for peer to join...</span>
              </div>
            </div>
          {:else if connectionMode === "quick" && !isHost}
            <!-- Quick Connect - Joining -->
            <div class="p-6 bg-(--color-bg-alt) border border-(--color-border) text-center">
              <div class="flex items-center justify-center gap-2">
                <div class="w-3 h-3 bg-yellow-500 animate-pulse rounded-full"></div>
                <span class="text-sm text-(--color-text)">Connecting to room...</span>
              </div>
            </div>
          {:else}
            <!-- Manual Mode - Share Connection -->
            <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
              <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">
                {#if localConnectionData?.type === "offer"}
                  Share With Peer
                {:else}
                  Share Answer With Initiator
                {/if}
              </h2>

              <!-- Share URL -->
              <div class="mb-4">
                <label class="block text-xs text-(--color-text-muted) mb-2">Share Link</label>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={shareURL}
                    readonly
                    class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm"
                  />
                  <button
                    onclick={() => handleCopy("url", shareURL)}
                    class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
                  >
                    {copiedField === "url" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <!-- Raw data -->
              {#if localConnectionData}
                <div>
                  <label class="block text-xs text-(--color-text-muted) mb-2">Or Copy Raw Data</label>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      value={encodeConnectionData(localConnectionData)}
                      readonly
                      class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm"
                    />
                    <button
                      onclick={() => handleCopy("data", encodeConnectionData(localConnectionData!))}
                      class="px-4 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) text-sm font-medium hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
                    >
                      {copiedField === "data" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            {#if localConnectionData?.type === "offer"}
              <!-- Paste Answer -->
              <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
                <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">Paste Peer's Answer</h2>
                <div class="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    bind:value={remoteConnectionInput}
                    placeholder="Paste answer data..."
                    class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none"
                  />
                  <button
                    onclick={handleReceivedAnswer}
                    disabled={!remoteConnectionInput.trim()}
                    class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
              </div>
            {/if}
          {/if}

          <button
            onclick={disconnect}
            class="w-full px-4 py-2 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) text-sm hover:text-(--color-text) hover:border-(--color-text-light) transition-colors"
          >
            Cancel
          </button>
        </div>
      {:else if connectionState === "connected"}
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-3 h-3 bg-green-500"></div>
            <span class="text-lg font-medium text-(--color-text)">Connected</span>
            {#if connectionMode === "quick" && roomCode}
              <span class="text-sm text-(--color-text-muted)">(Room: {roomCode})</span>
            {/if}
          </div>
          <p class="text-sm text-(--color-text-muted) mb-4">
            You can now use Chat, Video, and File transfer tabs.
          </p>
          <button
            onclick={disconnect}
            class="w-full px-4 py-2 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) text-sm hover:opacity-80 transition-colors"
          >
            {connectionMode === "quick" ? "Exit Room" : "Disconnect"}
          </button>
        </div>
      {/if}

    {:else if activeTab === "chat"}
      <div class="h-full flex flex-col gap-4 min-h-0">
        <!-- Messages -->
        <div
          bind:this={chatContainer}
          class="flex-1 overflow-y-auto p-4 bg-(--color-bg-alt) border border-(--color-border) min-h-0 max-h-96"
        >
          {#if chatMessages.length === 0}
            <p class="text-center text-(--color-text-muted) text-sm py-8">No messages yet. Start chatting!</p>
          {:else}
            <div class="space-y-3">
              {#each chatMessages as message}
                <div class="flex {message.sender === 'local' ? 'justify-end' : 'justify-start'}">
                  <div class="max-w-xs p-3 {message.sender === 'local'
                    ? 'bg-(--color-accent) text-(--color-btn-text)'
                    : 'bg-(--color-bg) border border-(--color-border) text-(--color-text)'}">
                    <p class="text-sm break-words">{message.text}</p>
                    <p class="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Input -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          {#if isConnected}
            <div class="flex gap-3">
              <input
                type="text"
                bind:value={chatInput}
                onkeydown={handleKeyDown}
                placeholder="Type a message..."
                class="flex-1 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none"
              />
              <button
                onclick={sendMessage}
                disabled={!canSendMessage}
                class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          {:else}
            <p class="text-sm text-(--color-text-muted) text-center">Connection closed. Chat history preserved above.</p>
          {/if}
        </div>
      </div>

    {:else if activeTab === "video"}
      <div class="space-y-4">
        <!-- Video Streams -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <h2 class="text-xs tracking-wider text-(--color-text-muted) font-medium mb-2">You</h2>
            <video
              bind:this={localVideoElement}
              autoplay
              muted
              playsinline
              class="w-full aspect-video bg-black"
            ></video>
          </div>
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <h2 class="text-xs tracking-wider text-(--color-text-muted) font-medium mb-2">Peer</h2>
            <video
              bind:this={remoteVideoElement}
              autoplay
              playsinline
              class="w-full aspect-video bg-black"
            ></video>
          </div>
        </div>

        <!-- Controls -->
        <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
          {#if localStream}
            <div class="flex items-center justify-center gap-4">
              <span class="text-sm text-(--color-text-muted) font-mono">{formatDuration(callDuration)}</span>
              <button
                onclick={toggleAudio}
                class="p-3 border border-(--color-border) hover:border-(--color-text-light) transition-colors {isAudioMuted ? 'bg-(--color-error-bg) text-(--color-error-text)' : 'bg-(--color-bg)'}"
                title={isAudioMuted ? "Unmute" : "Mute"}
              >
                {isAudioMuted ? "🔇" : "🔊"}
              </button>
              <button
                onclick={toggleVideo}
                class="p-3 border border-(--color-border) hover:border-(--color-text-light) transition-colors {isVideoMuted ? 'bg-(--color-error-bg) text-(--color-error-text)' : 'bg-(--color-bg)'}"
                title={isVideoMuted ? "Turn on camera" : "Turn off camera"}
              >
                {isVideoMuted ? "📷" : "📹"}
              </button>
              <button
                onclick={stopVideoCall}
                class="p-3 bg-(--color-error-bg) border border-(--color-error-border) text-(--color-error-text) hover:opacity-80 transition-colors"
                title="End call"
              >
                End
              </button>
            </div>
          {:else}
            <div class="text-center">
              <button
                onclick={startVideoCall}
                class="px-6 py-3 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
              >
                Start Video Call
              </button>
            </div>
          {/if}
        </div>
      </div>

    {:else if activeTab === "files"}
      <div class="space-y-4">
        <!-- Drop Zone -->
        {#if isConnected}
          <div
            class="p-8 bg-(--color-bg-alt) border-2 border-dashed transition-colors text-center {dragOver
              ? 'border-(--color-accent) bg-(--color-accent)/10'
              : 'border-(--color-border)'}"
            ondragover={(e) => {
              e.preventDefault();
              dragOver = true;
            }}
            ondragleave={() => (dragOver = false)}
            ondrop={handleFileDrop}
          >
            <p class="text-(--color-text-muted) mb-2">Drag and drop a file here</p>
            <p class="text-(--color-text-muted) text-xs mb-4">or</p>
            <label class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm cursor-pointer hover:bg-(--color-accent-hover) transition-colors">
              Select File
              <input type="file" class="hidden" onchange={handleFileSelect} />
            </label>
          </div>
        {:else}
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <p class="text-sm text-(--color-text-muted) text-center">Connection closed. You can still download received files below.</p>
          </div>
        {/if}

        <!-- Transfers -->
        {#if fileTransfers.length > 0}
          <div class="p-4 bg-(--color-bg-alt) border border-(--color-border)">
            <h2 class="text-sm tracking-wider text-(--color-text-light) font-medium mb-3">Transfers</h2>
            <div class="space-y-3">
              {#each fileTransfers as transfer}
                <div class="p-3 bg-(--color-bg) border border-(--color-border)">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-(--color-text-muted)">{transfer.direction === "send" ? "↑" : "↓"}</span>
                      <span class="text-sm font-medium text-(--color-text) truncate max-w-xs">{transfer.name}</span>
                      <span class="text-xs text-(--color-text-muted)">{formatBytes(transfer.size)}</span>
                    </div>
                    {#if transfer.status === "completed" && transfer.direction === "receive" && transfer.blob}
                      <button
                        onclick={() => downloadFile(transfer)}
                        class="text-xs text-(--color-accent) hover:underline"
                      >
                        Download
                      </button>
                    {/if}
                  </div>
                  <div class="w-full h-2 bg-(--color-bg-alt)">
                    <div
                      class="h-2 transition-all {transfer.status === 'completed'
                        ? 'bg-green-500'
                        : transfer.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-(--color-accent)'}"
                      style="width: {transfer.progress}%"
                    ></div>
                  </div>
                  <div class="flex justify-between mt-1">
                    <span class="text-xs text-(--color-text-muted)">{Math.round(transfer.progress)}%</span>
                    <span class="text-xs text-(--color-text-muted) capitalize">{transfer.status}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Info Section -->
  <div class="mt-4 p-3 bg-(--color-bg-alt) border border-(--color-border) text-sm text-(--color-text-muted)">
    <strong class="text-(--color-text)">About WebRTC:</strong>
    All communication is peer-to-peer and encrypted (DTLS/SRTP). No server stores your messages, calls, or files.
    Connection data is exchanged once during setup, then all traffic flows directly between devices.
  </div>
</div>
