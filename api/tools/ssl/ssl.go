package ssl

import (
	"crypto/tls"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type CertificateInfo struct {
	Subject            string   `json:"subject"`
	CommonName         string   `json:"commonName"`
	Issuer             string   `json:"issuer"`
	IssuerOrg          string   `json:"issuerOrg"`
	NotBefore          string   `json:"notBefore"`
	NotAfter           string   `json:"notAfter"`
	SerialNumber       string   `json:"serialNumber"`
	SignatureAlgorithm string   `json:"signatureAlgorithm"`
	PublicKeyAlgorithm string   `json:"publicKeyAlgorithm"`
	SANs               []string `json:"sans"`
	DNSNames           []string `json:"dnsNames"`
	IPAddresses        []string `json:"ipAddresses"`
	EmailAddresses     []string `json:"emailAddresses"`
	IsCA               bool     `json:"isCA"`
	Version            int      `json:"version"`
	PEM                string   `json:"pem,omitempty"`
}

type ChainCertificate struct {
	Subject   string `json:"subject"`
	Issuer    string `json:"issuer"`
	NotBefore string `json:"notBefore"`
	NotAfter  string `json:"notAfter"`
	IsCA      bool   `json:"isCA"`
	PEM       string `json:"pem,omitempty"`
}

type SSLResponse struct {
	Domain          string             `json:"domain"`
	Port            int                `json:"port"`
	Certificate     *CertificateInfo   `json:"certificate,omitempty"`
	Chain           []ChainCertificate `json:"chain,omitempty"`
	Protocol        string             `json:"protocol"`
	CipherSuite     string             `json:"cipherSuite"`
	Valid           bool               `json:"valid"`
	DaysUntilExpiry int                `json:"daysUntilExpiry"`
	Expired         bool               `json:"expired"`
	Error           string             `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, SSLResponse{Error: message})
}

// SSL handles SSL/TLS certificate checking requests
func SSL(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(r.URL.Query().Get("domain"))
	portStr := strings.TrimSpace(r.URL.Query().Get("port"))

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

	// Parse port
	port := 443
	if portStr != "" {
		var err error
		port, err = strconv.Atoi(portStr)
		if err != nil || port < 1 || port > 65535 {
			writeError(w, http.StatusBadRequest, "invalid port number")
			return
		}
	}

	// Connect and get certificate
	address := fmt.Sprintf("%s:%d", domain, port)

	dialer := &net.Dialer{
		Timeout: 10 * time.Second,
	}

	conn, err := tls.DialWithDialer(dialer, "tcp", address, &tls.Config{
		InsecureSkipVerify: true, // We want to inspect even invalid certs
		ServerName:         domain,
	})
	if err != nil {
		writeJSON(w, http.StatusOK, SSLResponse{
			Domain: domain,
			Port:   port,
			Valid:  false,
			Error:  fmt.Sprintf("connection failed: %s", simplifyTLSError(err)),
		})
		return
	}
	defer conn.Close()

	state := conn.ConnectionState()

	if len(state.PeerCertificates) == 0 {
		writeJSON(w, http.StatusOK, SSLResponse{
			Domain: domain,
			Port:   port,
			Valid:  false,
			Error:  "no certificates received",
		})
		return
	}

	// Get the leaf certificate
	leafCert := state.PeerCertificates[0]

	// Calculate days until expiry
	now := time.Now()
	daysUntilExpiry := int(leafCert.NotAfter.Sub(now).Hours() / 24)
	expired := now.After(leafCert.NotAfter) || now.Before(leafCert.NotBefore)

	// Check if certificate is valid for this domain
	valid := leafCert.VerifyHostname(domain) == nil && !expired

	// Build certificate info
	certInfo := &CertificateInfo{
		Subject:            leafCert.Subject.String(),
		CommonName:         leafCert.Subject.CommonName,
		Issuer:             leafCert.Issuer.String(),
		IssuerOrg:          getFirstOrEmpty(leafCert.Issuer.Organization),
		NotBefore:          leafCert.NotBefore.UTC().Format(time.RFC3339),
		NotAfter:           leafCert.NotAfter.UTC().Format(time.RFC3339),
		SerialNumber:       leafCert.SerialNumber.String(),
		SignatureAlgorithm: leafCert.SignatureAlgorithm.String(),
		PublicKeyAlgorithm: leafCert.PublicKeyAlgorithm.String(),
		DNSNames:           leafCert.DNSNames,
		EmailAddresses:     leafCert.EmailAddresses,
		IsCA:               leafCert.IsCA,
		Version:            leafCert.Version,
	}

	// IP addresses as strings
	certInfo.IPAddresses = make([]string, len(leafCert.IPAddresses))
	for i, ip := range leafCert.IPAddresses {
		certInfo.IPAddresses[i] = ip.String()
	}

	// Build SANs list (combined DNS names and IPs)
	certInfo.SANs = append(certInfo.DNSNames, certInfo.IPAddresses...)

	// Encode leaf certificate as PEM
	certInfo.PEM = encodeCertToPEM(leafCert.Raw)

	// Build certificate chain
	chain := make([]ChainCertificate, 0, len(state.PeerCertificates))
	for _, cert := range state.PeerCertificates {
		chain = append(chain, ChainCertificate{
			Subject:   cert.Subject.String(),
			Issuer:    cert.Issuer.String(),
			NotBefore: cert.NotBefore.UTC().Format(time.RFC3339),
			NotAfter:  cert.NotAfter.UTC().Format(time.RFC3339),
			IsCA:      cert.IsCA,
			PEM:       encodeCertToPEM(cert.Raw),
		})
	}

	response := SSLResponse{
		Domain:          domain,
		Port:            port,
		Certificate:     certInfo,
		Chain:           chain,
		Protocol:        tlsVersionString(state.Version),
		CipherSuite:     tls.CipherSuiteName(state.CipherSuite),
		Valid:           valid,
		DaysUntilExpiry: daysUntilExpiry,
		Expired:         expired,
	}

	writeJSON(w, http.StatusOK, response)
}

func cleanDomain(domain string) string {
	// Remove protocol
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	// Remove path
	if idx := strings.Index(domain, "/"); idx != -1 {
		domain = domain[:idx]
	}
	// Remove port (we use the port parameter instead)
	if idx := strings.Index(domain, ":"); idx != -1 {
		domain = domain[:idx]
	}
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

func tlsVersionString(version uint16) string {
	switch version {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("Unknown (0x%04x)", version)
	}
}

func getFirstOrEmpty(slice []string) string {
	if len(slice) > 0 {
		return slice[0]
	}
	return ""
}

func simplifyTLSError(err error) string {
	errStr := err.Error()
	if strings.Contains(errStr, "connection refused") {
		return "connection refused"
	}
	if strings.Contains(errStr, "no route to host") {
		return "host unreachable"
	}
	if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "deadline exceeded") {
		return "connection timed out"
	}
	if strings.Contains(errStr, "no such host") {
		return "domain not found"
	}
	if strings.Contains(errStr, "handshake failure") {
		return "TLS handshake failed"
	}
	return errStr
}

func encodeCertToPEM(certDER []byte) string {
	block := &pem.Block{
		Type:  "CERTIFICATE",
		Bytes: certDER,
	}
	return string(pem.EncodeToMemory(block))
}
