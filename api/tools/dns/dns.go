package dns

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/rakunlabs/ada"
)

type MXRecord struct {
	Host     string `json:"host"`
	Priority uint16 `json:"priority"`
}

type SOARecord struct {
	NS      string `json:"ns"`
	Mbox    string `json:"mbox"`
	Serial  uint32 `json:"serial"`
	Refresh uint32 `json:"refresh"`
	Retry   uint32 `json:"retry"`
	Expire  uint32 `json:"expire"`
	MinTTL  uint32 `json:"minTtl"`
}

type DNSResponse struct {
	Domain  string            `json:"domain,omitempty"`
	IP      string            `json:"ip,omitempty"`
	Records *DNSRecords       `json:"records,omitempty"`
	Reverse []string          `json:"reverse,omitempty"`
	Error   string            `json:"error,omitempty"`
	Errors  map[string]string `json:"errors,omitempty"`
}

type DNSRecords struct {
	A     []string   `json:"A,omitempty"`
	AAAA  []string   `json:"AAAA,omitempty"`
	MX    []MXRecord `json:"MX,omitempty"`
	TXT   []string   `json:"TXT,omitempty"`
	CNAME []string   `json:"CNAME,omitempty"`
	NS    []string   `json:"NS,omitempty"`
	SOA   *SOARecord `json:"SOA,omitempty"`
}

// DNS handles DNS lookup requests
func DNS(c *ada.Context) error {
	domain := strings.TrimSpace(c.Request.URL.Query().Get("domain"))
	ip := strings.TrimSpace(c.Request.URL.Query().Get("ip"))

	// Reverse DNS lookup
	if ip != "" {
		return handleReverseLookup(c, ip)
	}

	// Forward DNS lookup
	if domain == "" {
		return c.SetStatus(http.StatusBadRequest).SendJSON(DNSResponse{Error: "domain or ip parameter is required"})
	}

	// Clean domain (remove protocol if present)
	domain = cleanDomain(domain)

	if !isValidDomain(domain) {
		return c.SetStatus(http.StatusBadRequest).SendJSON(DNSResponse{Error: "invalid domain format"})
	}

	return handleForwardLookup(c, domain)
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
	return strings.ToLower(strings.TrimSpace(domain))
}

func isValidDomain(domain string) bool {
	if domain == "" || len(domain) > 253 {
		return false
	}
	// Basic domain validation
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

func handleReverseLookup(c *ada.Context, ip string) error {
	// Validate IP
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return c.SetStatus(http.StatusBadRequest).SendJSON(DNSResponse{Error: "invalid IP address"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resolver := &net.Resolver{}
	names, err := resolver.LookupAddr(ctx, ip)
	if err != nil {
		return c.SetStatus(http.StatusOK).SendJSON(DNSResponse{
			IP:      ip,
			Reverse: []string{},
			Error:   "no PTR records found",
		})
	}

	// Clean trailing dots from hostnames
	cleanNames := make([]string, len(names))
	for i, name := range names {
		cleanNames[i] = strings.TrimSuffix(name, ".")
	}

	return c.SetStatus(http.StatusOK).SendJSON(DNSResponse{
		IP:      ip,
		Reverse: cleanNames,
	})
}

func handleForwardLookup(c *ada.Context, domain string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	resolver := &net.Resolver{}
	records := &DNSRecords{}
	errors := make(map[string]string)

	// A records (IPv4)
	if ips, err := resolver.LookupIP(ctx, "ip4", domain); err == nil {
		records.A = make([]string, len(ips))
		for i, ip := range ips {
			records.A[i] = ip.String()
		}
	} else if !isNotFoundError(err) {
		errors["A"] = simplifyError(err)
	}

	// AAAA records (IPv6)
	if ips, err := resolver.LookupIP(ctx, "ip6", domain); err == nil {
		records.AAAA = make([]string, len(ips))
		for i, ip := range ips {
			records.AAAA[i] = ip.String()
		}
	} else if !isNotFoundError(err) {
		errors["AAAA"] = simplifyError(err)
	}

	// MX records
	if mxs, err := resolver.LookupMX(ctx, domain); err == nil {
		records.MX = make([]MXRecord, len(mxs))
		for i, mx := range mxs {
			records.MX[i] = MXRecord{
				Host:     strings.TrimSuffix(mx.Host, "."),
				Priority: mx.Pref,
			}
		}
	} else if !isNotFoundError(err) {
		errors["MX"] = simplifyError(err)
	}

	// TXT records
	if txts, err := resolver.LookupTXT(ctx, domain); err == nil {
		records.TXT = txts
	} else if !isNotFoundError(err) {
		errors["TXT"] = simplifyError(err)
	}

	// CNAME record
	if cname, err := resolver.LookupCNAME(ctx, domain); err == nil {
		cleanCname := strings.TrimSuffix(cname, ".")
		if cleanCname != domain {
			records.CNAME = []string{cleanCname}
		}
	} else if !isNotFoundError(err) {
		errors["CNAME"] = simplifyError(err)
	}

	// NS records
	if nss, err := resolver.LookupNS(ctx, domain); err == nil {
		records.NS = make([]string, len(nss))
		for i, ns := range nss {
			records.NS[i] = strings.TrimSuffix(ns.Host, ".")
		}
	} else if !isNotFoundError(err) {
		errors["NS"] = simplifyError(err)
	}

	response := DNSResponse{
		Domain:  domain,
		Records: records,
	}

	if len(errors) > 0 {
		response.Errors = errors
	}

	return c.SetStatus(http.StatusOK).SendJSON(response)
}

func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "no such host") ||
		strings.Contains(errStr, "not found") ||
		strings.Contains(errStr, "NXDOMAIN") ||
		strings.Contains(errStr, "NODATA")
}

func simplifyError(err error) string {
	if err == nil {
		return ""
	}
	errStr := err.Error()
	if strings.Contains(errStr, "timeout") {
		return "lookup timed out"
	}
	if strings.Contains(errStr, "no such host") {
		return "domain not found"
	}
	return "lookup failed"
}
