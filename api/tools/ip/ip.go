package ip

import (
	"encoding/json"
	"net/http"
	"strings"
)

type Response struct {
	IP string `json:"ip"`
}

// getClientIP extracts the client IP address from the request,
// checking various headers that proxies might set.
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (comma-separated list, first is client)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			ip := strings.TrimSpace(ips[0])
			if ip != "" {
				return ip
			}
		}
	}

	// Check X-Real-IP header (commonly set by Nginx)
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// Check CF-Connecting-IP header (Cloudflare)
	if cfIP := r.Header.Get("CF-Connecting-IP"); cfIP != "" {
		return strings.TrimSpace(cfIP)
	}

	// Check True-Client-IP header (Akamai, Cloudflare Enterprise)
	if tcIP := r.Header.Get("True-Client-IP"); tcIP != "" {
		return strings.TrimSpace(tcIP)
	}

	// Check X-Client-IP header
	if xcIP := r.Header.Get("X-Client-IP"); xcIP != "" {
		return strings.TrimSpace(xcIP)
	}

	// Fall back to RemoteAddr (strip port if present)
	remoteAddr := r.RemoteAddr
	if idx := strings.LastIndex(remoteAddr, ":"); idx != -1 {
		// Check if it's an IPv6 address with brackets
		if strings.Contains(remoteAddr, "[") {
			if bracketIdx := strings.LastIndex(remoteAddr, "]"); bracketIdx != -1 {
				return remoteAddr[1:bracketIdx]
			}
		}
		return remoteAddr[:idx]
	}

	return remoteAddr
}

func IP(w http.ResponseWriter, r *http.Request) {
	ip := getClientIP(r)

	resp := Response{
		IP: ip,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
