package feedback

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type metadata struct {
	browser string
	country string
	device  string
	origin  string
	os      string
}

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type discordEmbed struct {
	Color       int            `json:"color"`
	Description string         `json:"description"`
	Fields      []discordField `json:"fields"`
	Timestamp   string         `json:"timestamp"`
	Title       string         `json:"title"`
}

type discordPayload struct {
	AllowedMentions map[string][]string `json:"allowed_mentions"`
	Embeds          []discordEmbed      `json:"embeds"`
	Username        string              `json:"username"`
}

func (h *Handler) sendDiscord(ctx context.Context, payload discordPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.DiscordWebhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord webhook returned status %d", resp.StatusCode)
	}

	return nil
}

func buildDiscordPayload(name, message, page string, meta metadata) discordPayload {
	fields := []discordField{
		{Name: "Sender", Value: name, Inline: true},
		{Name: "Page", Value: orUnknown(page)},
		{Name: "Metadata (click to reveal)", Value: metadataSpoiler(meta)},
	}

	embed := discordEmbed{
		Color:       discordEmbedColor,
		Description: formatDiscordMessage(message),
		Fields:      fields,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Title:       "New feedback from 1.tools",
	}

	return discordPayload{
		AllowedMentions: map[string][]string{"parse": {}},
		Embeds:          []discordEmbed{embed},
		Username:        "1.tools feedback",
	}
}

// formatDiscordMessage renders the message as a Discord block quote.
func formatDiscordMessage(message string) string {
	lines := strings.Split(message, "\n")
	for i, line := range lines {
		if line == "" {
			lines[i] = "> \u200b"
		} else {
			lines[i] = "> " + line
		}
	}

	return strings.Join(lines, "\n")
}

func metadataSpoiler(m metadata) string {
	return fmt.Sprintf(
		"||Country: %s\nDevice: %s\nBrowser: %s\nOS: %s\nOrigin: %s||",
		orUnknown(m.country), orUnknown(m.device), orUnknown(m.browser), orUnknown(m.os), orUnknown(m.origin),
	)
}

func orUnknown(value string) string {
	if value == "" {
		return "unknown"
	}

	return value
}

func getRequestMetadata(r *http.Request) metadata {
	userAgent := trimHeader(r.Header.Get("User-Agent"), 220)

	return metadata{
		browser: detectBrowser(userAgent),
		country: trimHeader(r.Header.Get("CF-IPCountry"), 80),
		device:  detectDevice(userAgent),
		origin:  trimHeader(r.Header.Get("Origin"), 220),
		os:      detectOS(userAgent),
	}
}

func trimHeader(value string, maxLength int) string {
	if value == "" {
		return ""
	}

	runes := []rune(value)
	if len(runes) > maxLength {
		return string(runes[:maxLength])
	}

	return value
}

func detectBrowser(userAgent string) string {
	switch {
	case strings.Contains(userAgent, "Edg/"):
		return "Edge"
	case strings.Contains(userAgent, "OPR/"):
		return "Opera"
	case strings.Contains(userAgent, "SamsungBrowser/"):
		return "Samsung Internet"
	case strings.Contains(userAgent, "CriOS/"), strings.Contains(userAgent, "Chrome/"):
		return "Chrome"
	case strings.Contains(userAgent, "FxiOS/"), strings.Contains(userAgent, "Firefox/"):
		return "Firefox"
	case strings.Contains(userAgent, "Safari/"):
		return "Safari"
	default:
		return "unknown"
	}
}

func detectOS(userAgent string) string {
	switch {
	case strings.Contains(userAgent, "Android"):
		return "Android"
	case strings.Contains(userAgent, "iPhone"), strings.Contains(userAgent, "iPad"), strings.Contains(userAgent, "iPod"):
		return "iOS"
	case strings.Contains(userAgent, "Windows NT"):
		return "Windows"
	case strings.Contains(userAgent, "Mac OS X"):
		return "macOS"
	case strings.Contains(userAgent, "Linux"):
		return "Linux"
	default:
		return "unknown"
	}
}

func detectDevice(userAgent string) string {
	lower := strings.ToLower(userAgent)

	switch {
	case strings.Contains(lower, "bot"), strings.Contains(lower, "crawler"), strings.Contains(lower, "spider"):
		return "bot"
	case strings.Contains(lower, "ipad"), strings.Contains(lower, "tablet"), strings.Contains(lower, "kindle"), strings.Contains(lower, "silk"):
		return "tablet"
	case strings.Contains(lower, "mobi"), strings.Contains(lower, "iphone"), strings.Contains(lower, "android"):
		return "phone"
	default:
		return "desktop"
	}
}
