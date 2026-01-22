package webrtc

import (
	"crypto/rand"
	"encoding/json"
	"log/slog"
	"math/big"
	"net/http"
	"sync"
	"time"
)

const (
	// Room code length
	codeLength = 6
	// Timeout for rooms with no connections (10 seconds)
	emptyRoomTimeout = 10 * time.Second
	// Maximum room lifetime (10 minutes)
	roomTimeout = 10 * time.Minute
	// Characters used for room codes (uppercase letters and numbers)
	codeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

// SignalMessage represents a signaling message
type SignalMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Room represents a signaling room
type Room struct {
	Code      string
	CreatedAt time.Time
	// Channels for SSE subscribers
	HostChan  chan SignalMessage
	GuestChan chan SignalMessage
	HasHost   bool
	HasGuest  bool
	mu        sync.Mutex
}

// RoomManager manages all active rooms
type RoomManager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

var manager = &RoomManager{
	rooms: make(map[string]*Room),
}

func init() {
	// Start cleanup goroutine
	go manager.cleanupLoop()
}

// generateCode creates a random room code
func generateCode() string {
	code := make([]byte, codeLength)
	for i := range code {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(codeChars))))
		code[i] = codeChars[n.Int64()]
	}
	return string(code)
}

// CreateRoom creates a new room with a unique code
func (m *RoomManager) CreateRoom() *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Generate unique code
	var code string
	for {
		code = generateCode()
		if _, exists := m.rooms[code]; !exists {
			break
		}
	}

	room := &Room{
		Code:      code,
		CreatedAt: time.Now(),
		HostChan:  make(chan SignalMessage, 10),
		GuestChan: make(chan SignalMessage, 10),
	}
	m.rooms[code] = room

	slog.Debug("room created", "code", code, "tools", "webrtc")
	return room
}

// GetRoom returns a room by code
func (m *RoomManager) GetRoom(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[code]
}

// DeleteRoom removes a room
func (m *RoomManager) DeleteRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, exists := m.rooms[code]; exists {
		close(room.HostChan)
		close(room.GuestChan)
		delete(m.rooms, code)
		slog.Debug("room deleted", "code", code, "tools", "webrtc")
	}
}

// cleanupLoop removes expired rooms
func (m *RoomManager) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		m.mu.Lock()
		now := time.Now()
		for code, room := range m.rooms {
			room.mu.Lock()
			shouldDelete := false
			reason := ""

			// Delete room if no one is connected and 10 seconds have passed
			if !room.HasHost && !room.HasGuest && now.Sub(room.CreatedAt) > emptyRoomTimeout {
				shouldDelete = true
				reason = "no connections"
			}

			// Delete room if it has existed for more than 10 minutes (safety net)
			if now.Sub(room.CreatedAt) > roomTimeout {
				shouldDelete = true
				reason = "max lifetime exceeded"
			}

			if shouldDelete {
				close(room.HostChan)
				close(room.GuestChan)
				delete(m.rooms, code)
				slog.Debug("room expired", "code", code, "reason", reason, "tools", "webrtc")
			}
			room.mu.Unlock()
		}
		m.mu.Unlock()
	}
}

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// CreateRoomHandler handles POST /webrtc/room - creates a new room
func CreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	room := manager.CreateRoom()

	writeJSON(w, http.StatusOK, map[string]string{
		"room": room.Code,
	})
}

// JoinRoomHandler handles POST /webrtc/room/{code}/join - joins an existing room
func JoinRoomHandler(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "Invalid room code")
		return
	}

	room := manager.GetRoom(code)
	if room == nil {
		writeError(w, http.StatusNotFound, "Room not found")
		return
	}

	room.mu.Lock()
	if room.HasGuest {
		room.mu.Unlock()
		writeError(w, http.StatusConflict, "Room is full")
		return
	}
	room.HasGuest = true
	room.mu.Unlock()

	// Notify host that a peer joined
	select {
	case room.HostChan <- SignalMessage{Type: "peer_joined"}:
	default:
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "joined",
	})
}

// SignalHandler handles POST /webrtc/room/{code}/signal - sends a signaling message
func SignalHandler(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "Invalid room code")
		return
	}

	room := manager.GetRoom(code)
	if room == nil {
		writeError(w, http.StatusNotFound, "Room not found")
		return
	}

	var msg SignalMessage
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid message format")
		return
	}

	// Determine sender from query param
	sender := r.URL.Query().Get("sender")

	room.mu.Lock()
	defer room.mu.Unlock()

	// Route message to the other peer
	var targetChan chan SignalMessage
	if sender == "host" {
		targetChan = room.GuestChan
	} else {
		targetChan = room.HostChan
	}

	select {
	case targetChan <- msg:
		writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
	default:
		writeError(w, http.StatusServiceUnavailable, "Peer not connected")
	}
}

// EventsHandler handles GET /webrtc/room/{code}/events - SSE endpoint
func EventsHandler(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "Invalid room code")
		return
	}

	room := manager.GetRoom(code)
	if room == nil {
		writeError(w, http.StatusNotFound, "Room not found")
		return
	}

	// Determine if this is host or guest from query param
	role := r.URL.Query().Get("role")
	var msgChan chan SignalMessage

	room.mu.Lock()
	if role == "host" {
		msgChan = room.HostChan
		room.HasHost = true
	} else {
		msgChan = room.GuestChan
		room.HasGuest = true
	}
	room.mu.Unlock()

	// Set CORS headers for SSE
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "Streaming not supported")
		return
	}

	// Send initial connection event
	w.Write([]byte("event: connected\ndata: {}\n\n"))
	flusher.Flush()

	// Stream messages
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			// Client disconnected
			room.mu.Lock()
			if role == "host" {
				room.HasHost = false
				// Notify guest
				select {
				case room.GuestChan <- SignalMessage{Type: "peer_left"}:
				default:
				}
			} else {
				room.HasGuest = false
				// Notify host
				select {
				case room.HostChan <- SignalMessage{Type: "peer_left"}:
				default:
				}
			}
			room.mu.Unlock()

			// Delete room if both peers are gone
			room.mu.Lock()
			bothGone := !room.HasHost && !room.HasGuest
			room.mu.Unlock()
			if bothGone {
				manager.DeleteRoom(code)
			}
			return

		case msg, ok := <-msgChan:
			if !ok {
				// Channel closed, room deleted
				return
			}

			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}

			w.Write([]byte("event: message\ndata: "))
			w.Write(data)
			w.Write([]byte("\n\n"))
			flusher.Flush()
		}
	}
}
