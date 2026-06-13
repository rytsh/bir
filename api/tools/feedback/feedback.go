// Package feedback implements the /feedback endpoints: an ALTCHA (v2,
// SHA-256 proof-of-work) challenge generator and a submit handler that
// forwards validated feedback to a Discord channel webhook.
//
// Only coarse, non-identifying metadata is forwarded (country, device,
// browser, OS, origin). No IP address or raw user-agent is sent.
package feedback

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	altcha "github.com/altcha-org/altcha-lib-go/v2"
	"github.com/rakunlabs/ada"
)

const (
	maxNameLength    = 80
	minMessageLength = 2
	maxMessageLength = 800

	// challengeTTL is how long a captcha challenge stays valid.
	challengeTTL = 10 * time.Minute

	// PoW tuning: the solver tries counters up to the chosen one, each with
	// Cost iterations. Kept small so the browser solves it in well under a
	// second while still adding friction for bots.
	challengeCost       = 1000
	challengeCounterMin = 1000
	challengeCounterMax = 5000

	discordEmbedColor = 0x79cd88
)

// Config holds the feedback handler configuration, loaded from env via chu.
type Config struct {
	// DiscordWebhookURL is the Discord channel webhook the feedback is sent to.
	DiscordWebhookURL string `cfg:"discord_webhook_url"`
	// HMACKey is the secret used to sign and verify ALTCHA challenges.
	// It can be any sufficiently random string (e.g. `openssl rand -hex 32`).
	HMACKey string `cfg:"hmac_key"`
}

// Handler serves the feedback endpoints.
type Handler struct {
	cfg        Config
	hmacKey    string
	deriveKey  altcha.DeriveKeyFunc
	httpClient *http.Client
}

// New builds a feedback Handler from the given config.
//
// The configured HMAC key can be any arbitrary string: it is normalized through
// SHA-256 into a fixed-length (32-byte) hex secret used to sign/verify ALTCHA
// challenges. This way any value works and length/charset don't matter.
func New(cfg Config) *Handler {
	return &Handler{
		cfg:        cfg,
		hmacKey:    deriveHMACKey(cfg.HMACKey),
		deriveKey:  altcha.DeriveKeySHA(),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// deriveHMACKey turns any input into a stable 32-byte hex secret via SHA-256.
// An empty input yields an empty key (treated as "not configured").
func deriveHMACKey(raw string) string {
	if raw == "" {
		return ""
	}

	sum := sha256.Sum256([]byte(raw))

	return hex.EncodeToString(sum[:])
}

// Challenge handles GET /feedback/challenge and returns a fresh ALTCHA
// challenge for the widget to solve.
func (h *Handler) Challenge(c *ada.Context) error {
	if h.cfg.HMACKey == "" {
		return c.SetStatus(http.StatusServiceUnavailable).SendJSON(errBody("captcha is not configured"))
	}

	counter := challengeCounterMin + rand.IntN(challengeCounterMax-challengeCounterMin)
	expires := time.Now().Add(challengeTTL)

	challenge, err := altcha.CreateChallenge(altcha.CreateChallengeOptions{
		Algorithm:           "SHA-256",
		DeriveKey:           h.deriveKey,
		HMACSignatureSecret: h.hmacKey,
		Cost:                challengeCost,
		KeyLength:           32,
		Counter:             &counter,
		ExpiresAt:           &expires,
	})
	if err != nil {
		slog.Error("feedback: failed to create captcha challenge", "error", err)
		return c.SetStatus(http.StatusInternalServerError).SendJSON(errBody("failed to create challenge"))
	}

	// Avoid caching of challenges by proxies/browsers.
	c.SetHeader("Cache-Control", "no-store")

	return c.SendJSON(challenge)
}

type submitRequest struct {
	Name    string `json:"name"`
	Message string `json:"message"`
	Page    string `json:"page"`
	Altcha  string `json:"altcha"`
}

// Submit handles POST /feedback: validates the payload + captcha and forwards
// the message to Discord.
func (h *Handler) Submit(c *ada.Context) error {
	if h.cfg.DiscordWebhookURL == "" || h.cfg.HMACKey == "" {
		return c.SetStatus(http.StatusServiceUnavailable).SendJSON(errBody("feedback is not configured"))
	}

	var req submitRequest
	if err := c.Bind(&req); err != nil {
		return c.SetStatus(http.StatusBadRequest).SendJSON(errBody("invalid request body"))
	}

	name := normalizeName(req.Name)
	message := normalizeMessage(req.Message)

	if name == "" {
		return c.SetStatus(http.StatusBadRequest).SendJSON(errBody("name is required"))
	}

	if length := len([]rune(message)); length < minMessageLength {
		return c.SetStatus(http.StatusBadRequest).SendJSON(errBody("message is too short"))
	} else if length > maxMessageLength {
		return c.SetStatus(http.StatusBadRequest).SendJSON(errBody(fmt.Sprintf("message must be %d characters or less", maxMessageLength)))
	}

	if ok, err := h.verifyCaptcha(req.Altcha); err != nil || !ok {
		if err != nil {
			slog.Debug("feedback: captcha verify error", "error", err)
		}
		return c.SetStatus(http.StatusBadRequest).SendJSON(errBody("captcha verification failed"))
	}

	meta := getRequestMetadata(c.Request)
	payload := buildDiscordPayload(name, message, req.Page, meta)

	if err := h.sendDiscord(c.Request.Context(), payload); err != nil {
		slog.Error("feedback: failed to deliver to discord", "error", err)
		return c.SetStatus(http.StatusBadGateway).SendJSON(errBody("failed to deliver feedback"))
	}

	return c.SendJSON(map[string]bool{"ok": true})
}

// verifyCaptcha decodes and verifies the base64 ALTCHA payload from the widget.
func (h *Handler) verifyCaptcha(field string) (bool, error) {
	if field == "" {
		return false, nil
	}

	decoded, err := base64.StdEncoding.DecodeString(field)
	if err != nil {
		return false, err
	}

	var payload altcha.Payload
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return false, err
	}

	result, err := altcha.VerifySolution(altcha.VerifySolutionOptions{
		Challenge:           payload.Challenge,
		Solution:            payload.Solution,
		DeriveKey:           h.deriveKey,
		HMACSignatureSecret: h.hmacKey,
	})
	if err != nil {
		return false, err
	}

	if result.Expired {
		return false, nil
	}

	return result.Verified, nil
}

func errBody(msg string) map[string]string {
	return map[string]string{"error": msg}
}

func normalizeName(name string) string {
	name = strings.Join(strings.Fields(name), " ")
	runes := []rune(strings.TrimSpace(name))
	if len(runes) > maxNameLength {
		runes = runes[:maxNameLength]
	}

	return string(runes)
}

func normalizeMessage(message string) string {
	message = strings.ReplaceAll(message, "\r\n", "\n")
	message = strings.ReplaceAll(message, "\r", "\n")

	lines := strings.Split(message, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, "\t ")
	}

	return strings.TrimSpace(strings.Join(lines, "\n"))
}
