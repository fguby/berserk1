package alipay

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"html"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	MethodPagePay = "alipay.trade.page.pay"
	MethodWAPPay  = "alipay.trade.wap.pay"
)

type Config struct {
	AppID           string
	AppPrivateKey   string
	AlipayPublicKey string
	Gateway         string
	NotifyURL       string
	ReturnURL       string
	SellerID        string
}

type Client struct {
	appID      string
	gateway    string
	notifyURL  string
	returnURL  string
	sellerID   string
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
}

type PayRequest struct {
	OutTradeNo  string
	Subject     string
	TotalAmount string
	ProductCode string
	Body        string
	Method      string
}

func NewClient(cfg Config) (*Client, error) {
	appID := strings.TrimSpace(cfg.AppID)
	gateway := strings.TrimRight(strings.TrimSpace(cfg.Gateway), "/")
	if gateway == "" {
		gateway = "https://openapi.alipay.com/gateway.do"
	}
	if appID == "" || strings.TrimSpace(cfg.AppPrivateKey) == "" || strings.TrimSpace(cfg.AlipayPublicKey) == "" {
		return nil, errors.New("missing alipay app id or keys")
	}
	privateKey, err := parsePrivateKey(cfg.AppPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("parse alipay private key: %w", err)
	}
	publicKey, err := parsePublicKey(cfg.AlipayPublicKey)
	if err != nil {
		return nil, fmt.Errorf("parse alipay public key: %w", err)
	}
	return &Client{
		appID:      appID,
		gateway:    gateway,
		notifyURL:  strings.TrimSpace(cfg.NotifyURL),
		returnURL:  strings.TrimSpace(cfg.ReturnURL),
		sellerID:   strings.TrimSpace(cfg.SellerID),
		privateKey: privateKey,
		publicKey:  publicKey,
	}, nil
}

func (c *Client) Ready() bool {
	return c != nil && c.appID != "" && c.privateKey != nil && c.publicKey != nil && c.gateway != ""
}

func (c *Client) AppID() string {
	if c == nil {
		return ""
	}
	return c.appID
}

func (c *Client) SellerID() string {
	if c == nil {
		return ""
	}
	return c.sellerID
}

func (c *Client) PaymentForm(req PayRequest) (string, error) {
	if !c.Ready() {
		return "", errors.New("alipay client is not configured")
	}
	method := strings.TrimSpace(req.Method)
	if method == "" {
		method = MethodPagePay
	}
	productCode := strings.TrimSpace(req.ProductCode)
	if productCode == "" {
		if method == MethodWAPPay {
			productCode = "QUICK_WAP_WAY"
		} else {
			productCode = "FAST_INSTANT_TRADE_PAY"
		}
	}
	bizContent, err := json.Marshal(map[string]string{
		"out_trade_no": strings.TrimSpace(req.OutTradeNo),
		"product_code": productCode,
		"total_amount": strings.TrimSpace(req.TotalAmount),
		"subject":      strings.TrimSpace(req.Subject),
		"body":         strings.TrimSpace(req.Body),
	})
	if err != nil {
		return "", err
	}
	params := map[string]string{
		"app_id":      c.appID,
		"method":      method,
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"biz_content": string(bizContent),
	}
	if c.notifyURL != "" {
		params["notify_url"] = c.notifyURL
	}
	if c.returnURL != "" {
		params["return_url"] = c.returnURL
	}
	sign, err := c.sign(params)
	if err != nil {
		return "", err
	}
	params["sign"] = sign
	return formHTML(c.gateway, params), nil
}

func (c *Client) Verify(params map[string]string) error {
	if !c.Ready() {
		return errors.New("alipay client is not configured")
	}
	sign := strings.TrimSpace(params["sign"])
	if sign == "" {
		return errors.New("missing alipay sign")
	}
	signature, err := base64.StdEncoding.DecodeString(sign)
	if err != nil {
		return err
	}
	content := canonicalString(params, true, true)
	hash := sha256.Sum256([]byte(content))
	return rsa.VerifyPKCS1v15(c.publicKey, crypto.SHA256, hash[:], signature)
}

func (c *Client) sign(params map[string]string) (string, error) {
	content := canonicalString(params, true, false)
	hash := sha256.Sum256([]byte(content))
	signature, err := rsa.SignPKCS1v15(rand.Reader, c.privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

func canonicalString(params map[string]string, omitSign bool, omitSignType bool) string {
	keys := make([]string, 0, len(params))
	for key, value := range params {
		if omitSign && key == "sign" {
			continue
		}
		if omitSignType && key == "sign_type" {
			continue
		}
		if strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+params[key])
	}
	return strings.Join(parts, "&")
}

func formHTML(action string, params map[string]string) string {
	var builder strings.Builder
	builder.WriteString(`<!doctype html><html><head><meta charset="utf-8"><title>支付宝支付</title></head><body>`)
	actionURL := action
	if charset := strings.TrimSpace(params["charset"]); charset != "" {
		separator := "?"
		if strings.Contains(actionURL, "?") {
			separator = "&"
		}
		actionURL += separator + "charset=" + url.QueryEscape(charset)
	}
	builder.WriteString(`<form id="alipay-submit" method="post" accept-charset="utf-8" action="`)
	builder.WriteString(html.EscapeString(actionURL))
	builder.WriteString(`">`)
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		builder.WriteString(`<input type="hidden" name="`)
		builder.WriteString(html.EscapeString(key))
		builder.WriteString(`" value="`)
		builder.WriteString(html.EscapeString(params[key]))
		builder.WriteString(`">`)
	}
	builder.WriteString(`</form><script>document.getElementById("alipay-submit").submit();</script>`)
	builder.WriteString(`</body></html>`)
	return builder.String()
}

func parsePrivateKey(value string) (*rsa.PrivateKey, error) {
	block, err := pemBlock(value, "RSA PRIVATE KEY")
	if err != nil {
		return nil, err
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not RSA")
	}
	return key, nil
}

func parsePublicKey(value string) (*rsa.PublicKey, error) {
	block, err := pemBlock(value, "PUBLIC KEY")
	if err != nil {
		return nil, err
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		if cert, certErr := x509.ParseCertificate(block.Bytes); certErr == nil {
			if key, ok := cert.PublicKey.(*rsa.PublicKey); ok {
				return key, nil
			}
		}
		return nil, err
	}
	key, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("public key is not RSA")
	}
	return key, nil
}

func pemBlock(value string, blockType string) (*pem.Block, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("empty key")
	}
	if strings.Contains(value, "-----BEGIN") {
		block, _ := pem.Decode([]byte(value))
		if block == nil {
			return nil, errors.New("invalid pem")
		}
		return block, nil
	}
	decoded, err := base64.StdEncoding.DecodeString(compactKey(value))
	if err != nil {
		unescaped, unescapeErr := url.QueryUnescape(value)
		if unescapeErr == nil {
			decoded, err = base64.StdEncoding.DecodeString(compactKey(unescaped))
		}
	}
	if err != nil {
		return nil, err
	}
	return &pem.Block{Type: blockType, Bytes: decoded}, nil
}

func compactKey(value string) string {
	replacer := strings.NewReplacer("\n", "", "\r", "", " ", "", "\t", "")
	return replacer.Replace(value)
}
