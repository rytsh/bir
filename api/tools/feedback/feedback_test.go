package feedback

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	altcha "github.com/altcha-org/altcha-lib-go/v2"
	"github.com/rakunlabs/ada"
)

// solvePayload creates a challenge, solves it, and returns the base64 payload
// the browser widget would submit.
func solvePayload(t *testing.T, h *Handler) string {
	t.Helper()

	counter := 1500
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
		t.Fatalf("CreateChallenge: %v", err)
	}

	solution, err := altcha.SolveChallenge(altcha.SolveChallengeOptions{
		Challenge: challenge,
		DeriveKey: h.deriveKey,
	})
	if err != nil || solution == nil {
		t.Fatalf("SolveChallenge: %v", err)
	}

	raw, err := json.Marshal(altcha.Payload{Challenge: challenge, Solution: *solution})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	return base64.StdEncoding.EncodeToString(raw)
}

// TestSubmitForwardsToDiscord runs the full submit flow against a mock webhook.
func TestSubmitForwardsToDiscord(t *testing.T) {
	var received discordPayload
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&received)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer mock.Close()

	h := New(Config{HMACKey: "test-secret", DiscordWebhookURL: mock.URL})

	payload := solvePayload(t, h)
	body, _ := json.Marshal(submitRequest{
		Name:    "Ray",
		Message: "Hello\nfrom the test",
		Page:    "https://1.tools/feedback",
		Altcha:  payload,
	})

	req := httptest.NewRequest(http.MethodPost, "/feedback", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")
	req.Header.Set("Origin", "https://1.tools")
	req.Header.Set("CF-IPCountry", "TR")

	rec := httptest.NewRecorder()
	if err := h.Submit(ada.NewContext(rec, req)); err != nil {
		t.Fatalf("Submit returned error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	if len(received.Embeds) != 1 {
		t.Fatalf("expected 1 embed, got %d", len(received.Embeds))
	}
	embed := received.Embeds[0]
	if !strings.Contains(embed.Description, "> Hello") {
		t.Fatalf("message not block-quoted: %q", embed.Description)
	}
	if embed.Fields[0].Value != "Ray" {
		t.Fatalf("sender field = %q", embed.Fields[0].Value)
	}
	// Metadata spoiler should include parsed UA + country, but never an IP.
	meta := embed.Fields[len(embed.Fields)-1].Value
	if !strings.Contains(meta, "Country: TR") || !strings.Contains(meta, "Browser: Chrome") {
		t.Fatalf("metadata missing expected values: %q", meta)
	}
}

func TestSubmitRejectsBadCaptcha(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("discord webhook must not be called for invalid captcha")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer mock.Close()

	h := New(Config{HMACKey: "test-secret", DiscordWebhookURL: mock.URL})

	body, _ := json.Marshal(submitRequest{Name: "Ray", Message: "hello there", Altcha: "bogus"})
	req := httptest.NewRequest(http.MethodPost, "/feedback", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	_ = h.Submit(ada.NewContext(rec, req))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", rec.Code, rec.Body.String())
	}
}

// TestCaptchaRoundtrip ensures a challenge created by the handler can be solved
// and then verified, matching what the browser widget does.
func TestCaptchaRoundtrip(t *testing.T) {
	h := New(Config{HMACKey: "test-secret", DiscordWebhookURL: "https://example.com"})

	counter := 1500
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
		t.Fatalf("CreateChallenge: %v", err)
	}

	solution, err := altcha.SolveChallenge(altcha.SolveChallengeOptions{
		Challenge: challenge,
		DeriveKey: h.deriveKey,
	})
	if err != nil {
		t.Fatalf("SolveChallenge: %v", err)
	}
	if solution == nil {
		t.Fatal("SolveChallenge returned nil solution")
	}

	payload := altcha.Payload{Challenge: challenge, Solution: *solution}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	field := base64.StdEncoding.EncodeToString(raw)

	ok, err := h.verifyCaptcha(field)
	if err != nil {
		t.Fatalf("verifyCaptcha: %v", err)
	}
	if !ok {
		t.Fatal("expected captcha to verify")
	}

	// A tampered payload must fail.
	if ok, _ := h.verifyCaptcha("not-base64-$$$"); ok {
		t.Fatal("expected invalid payload to fail")
	}
	if ok, _ := h.verifyCaptcha(""); ok {
		t.Fatal("expected empty payload to fail")
	}
}

func TestNormalizeMessage(t *testing.T) {
	got := normalizeMessage("  hello \r\nworld  \r\n\r\n")
	want := "hello\nworld"
	if got != want {
		t.Fatalf("normalizeMessage = %q, want %q", got, want)
	}
}

func TestNormalizeName(t *testing.T) {
	if got := normalizeName("  John    Doe  "); got != "John Doe" {
		t.Fatalf("normalizeName = %q", got)
	}
}
