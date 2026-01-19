package whois

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/likexian/whois"
)

type WhoisResponse struct {
	Domain      string   `json:"domain"`
	Registrar   string   `json:"registrar,omitempty"`
	CreatedDate string   `json:"createdDate,omitempty"`
	UpdatedDate string   `json:"updatedDate,omitempty"`
	ExpiryDate  string   `json:"expiryDate,omitempty"`
	Nameservers []string `json:"nameservers,omitempty"`
	Status      []string `json:"status,omitempty"`
	DomainAge   string   `json:"domainAge,omitempty"`
	Raw         string   `json:"raw,omitempty"`
	Error       string   `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, WhoisResponse{Error: message})
}

// Whois handles WHOIS lookup requests
func Whois(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(r.URL.Query().Get("domain"))

	if domain == "" {
		writeError(w, http.StatusBadRequest, "domain parameter is required")
		return
	}

	// Clean domain
	domain = cleanDomain(domain)

	if !isValidDomain(domain) {
		writeError(w, http.StatusBadRequest, "invalid domain format")
		return
	}

	// Perform WHOIS lookup
	raw, err := whois.Whois(domain)
	if err != nil && strings.Contains(err.Error(), "no whois server") {
		raw, err = whois.Whois(domain, "whois.iana.org")
	}
	if err != nil {
		writeJSON(w, http.StatusOK, WhoisResponse{
			Domain: domain,
			Error:  simplifyError(err),
		})
		return
	}

	// Parse the raw WHOIS response
	response := parseWhoisResponse(domain, raw)
	writeJSON(w, http.StatusOK, response)
}

func getTLD(domain string) string {
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return ""
	}
	return parts[len(parts)-1]
}

func cleanDomain(domain string) string {
	// Remove protocol
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	// Remove path
	if idx := strings.Index(domain, "/"); idx != -1 {
		domain = domain[:idx]
	}
	// Remove port
	if idx := strings.Index(domain, ":"); idx != -1 {
		domain = domain[:idx]
	}
	// Remove www prefix for cleaner lookup
	domain = strings.TrimPrefix(domain, "www.")
	return strings.ToLower(strings.TrimSpace(domain))
}

func isValidDomain(domain string) bool {
	if domain == "" || len(domain) > 253 {
		return false
	}
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 63 {
			return false
		}
	}
	return true
}

func parseWhoisResponse(domain, raw string) WhoisResponse {
	response := WhoisResponse{
		Domain: domain,
		Raw:    raw,
	}

	lines := strings.Split(raw, "\n")

	// Common patterns for WHOIS fields
	registrarPatterns := []string{
		"Registrar:",
		"Registrar Name:",
		"registrar:",
		"Sponsoring Registrar:",
	}

	createdPatterns := []string{
		"Creation Date:",
		"Created Date:",
		"Created:",
		"created:",
		"Registration Date:",
		"Domain Registration Date:",
		"Created On:",
	}

	updatedPatterns := []string{
		"Updated Date:",
		"Last Updated:",
		"Updated:",
		"updated:",
		"changed:",
		"Last Modified:",
		"Domain Last Updated Date:",
	}

	expiryPatterns := []string{
		"Registry Expiry Date:",
		"Expiration Date:",
		"Expiry Date:",
		"Expires:",
		"expires:",
		"Domain Expiration Date:",
		"Registrar Registration Expiration Date:",
	}

	nsPatterns := []string{
		"Name Server:",
		"Nameserver:",
		"nserver:",
		"Name Servers:",
	}

	statusPatterns := []string{
		"Domain Status:",
		"Status:",
		"status:",
	}

	nameservers := make([]string, 0)
	statuses := make([]string, 0)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Check for registrar
		if response.Registrar == "" {
			for _, pattern := range registrarPatterns {
				if strings.HasPrefix(line, pattern) {
					response.Registrar = strings.TrimSpace(strings.TrimPrefix(line, pattern))
					break
				}
			}
		}

		// Check for created date
		if response.CreatedDate == "" {
			for _, pattern := range createdPatterns {
				if strings.HasPrefix(line, pattern) {
					dateStr := strings.TrimSpace(strings.TrimPrefix(line, pattern))
					response.CreatedDate = normalizeDate(dateStr)
					break
				}
			}
		}

		// Check for updated date
		if response.UpdatedDate == "" {
			for _, pattern := range updatedPatterns {
				if strings.HasPrefix(line, pattern) {
					dateStr := strings.TrimSpace(strings.TrimPrefix(line, pattern))
					response.UpdatedDate = normalizeDate(dateStr)
					break
				}
			}
		}

		// Check for expiry date
		if response.ExpiryDate == "" {
			for _, pattern := range expiryPatterns {
				if strings.HasPrefix(line, pattern) {
					dateStr := strings.TrimSpace(strings.TrimPrefix(line, pattern))
					response.ExpiryDate = normalizeDate(dateStr)
					break
				}
			}
		}

		// Check for nameservers (multiple)
		for _, pattern := range nsPatterns {
			if strings.HasPrefix(line, pattern) {
				ns := strings.TrimSpace(strings.TrimPrefix(line, pattern))
				ns = strings.ToLower(ns)
				if ns != "" && !containsString(nameservers, ns) {
					nameservers = append(nameservers, ns)
				}
				break
			}
		}

		// Check for status (multiple)
		for _, pattern := range statusPatterns {
			if strings.HasPrefix(line, pattern) {
				status := strings.TrimSpace(strings.TrimPrefix(line, pattern))
				// Clean up status (remove URL part if present)
				if idx := strings.Index(status, " "); idx != -1 {
					status = status[:idx]
				}
				if status != "" && !containsString(statuses, status) {
					statuses = append(statuses, status)
				}
				break
			}
		}
	}

	if len(nameservers) > 0 {
		response.Nameservers = nameservers
	}

	if len(statuses) > 0 {
		response.Status = statuses
	}

	// Calculate domain age
	if response.CreatedDate != "" {
		response.DomainAge = calculateDomainAge(response.CreatedDate)
	}

	return response
}

func normalizeDate(dateStr string) string {
	// Try to parse various date formats and return ISO format
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05-07:00",
		"2006-01-02 15:04:05",
		"2006-01-02",
		"02-Jan-2006",
		"January 02 2006",
		"2006/01/02",
		"02/01/2006",
		"01/02/2006",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}

	// Return original if can't parse
	return dateStr
}

func calculateDomainAge(createdDate string) string {
	t, err := time.Parse(time.RFC3339, createdDate)
	if err != nil {
		return ""
	}

	now := time.Now()
	years := now.Year() - t.Year()
	months := int(now.Month()) - int(t.Month())
	days := now.Day() - t.Day()

	if days < 0 {
		months--
		days += 30
	}
	if months < 0 {
		years--
		months += 12
	}

	parts := make([]string, 0)
	if years > 0 {
		if years == 1 {
			parts = append(parts, "1 year")
		} else {
			parts = append(parts, fmt.Sprintf("%d years", years))
		}
	}
	if months > 0 {
		if months == 1 {
			parts = append(parts, "1 month")
		} else {
			parts = append(parts, fmt.Sprintf("%d months", months))
		}
	}
	if len(parts) == 0 && days > 0 {
		if days == 1 {
			parts = append(parts, "1 day")
		} else {
			parts = append(parts, fmt.Sprintf("%d days", days))
		}
	}

	if len(parts) == 0 {
		return "Less than a day"
	}

	return strings.Join(parts, ", ")
}

func containsString(slice []string, str string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}

func simplifyError(err error) string {
	errStr := err.Error()
	if strings.Contains(errStr, "timeout") {
		return "WHOIS server timed out"
	}
	if strings.Contains(errStr, "no such host") {
		return "WHOIS server not found"
	}
	if strings.Contains(errStr, "connection refused") {
		return "WHOIS server refused connection"
	}
	if strings.Contains(errStr, "no whois server") {
		return "No WHOIS server is known for this TLD. This may be a newer or less common domain extension."
	}
	return "WHOIS lookup failed: " + errStr
}
