package database

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHTunnelConfig struct {
	Enabled              bool
	Host                 string
	Port                 string
	User                 string
	Password             string
	PrivateKeyPath       string
	PrivateKeyPassphrase string
	LocalAddr            string
	RemoteAddr           string
}

type SSHTunnel struct {
	client   *ssh.Client
	listener net.Listener
	done     chan struct{}
	once     sync.Once
}

func StartSSHTunnel(ctx context.Context, cfg SSHTunnelConfig) (*SSHTunnel, error) {
	if !cfg.Enabled {
		return nil, nil
	}
	if strings.TrimSpace(cfg.Host) == "" || strings.TrimSpace(cfg.User) == "" || strings.TrimSpace(cfg.RemoteAddr) == "" {
		return nil, fmt.Errorf("ssh tunnel requires host, user, and remote addr")
	}
	auth, err := sshAuthMethods(cfg)
	if err != nil {
		return nil, err
	}
	if len(auth) == 0 {
		return nil, fmt.Errorf("ssh tunnel requires password or private key")
	}
	sshAddr := net.JoinHostPort(strings.TrimSpace(cfg.Host), firstNonEmpty(strings.TrimSpace(cfg.Port), "22"))
	sshClient, err := ssh.Dial("tcp", sshAddr, &ssh.ClientConfig{
		User:            strings.TrimSpace(cfg.User),
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("connect ssh tunnel: %w", err)
	}
	localAddr := firstNonEmpty(strings.TrimSpace(cfg.LocalAddr), "127.0.0.1:0")
	listener, err := net.Listen("tcp", localAddr)
	if err != nil {
		sshClient.Close()
		return nil, fmt.Errorf("listen ssh tunnel local addr: %w", err)
	}
	tunnel := &SSHTunnel{
		client:   sshClient,
		listener: listener,
		done:     make(chan struct{}),
	}
	go tunnel.serve(strings.TrimSpace(cfg.RemoteAddr))
	go func() {
		select {
		case <-ctx.Done():
			tunnel.Close()
		case <-tunnel.done:
		}
	}()
	return tunnel, nil
}

func (t *SSHTunnel) LocalAddr() string {
	if t == nil || t.listener == nil {
		return ""
	}
	return t.listener.Addr().String()
}

func (t *SSHTunnel) Close() error {
	if t == nil {
		return nil
	}
	var err error
	t.once.Do(func() {
		close(t.done)
		if t.listener != nil {
			err = t.listener.Close()
		}
		if t.client != nil {
			_ = t.client.Close()
		}
	})
	return err
}

func (t *SSHTunnel) serve(remoteAddr string) {
	for {
		localConn, err := t.listener.Accept()
		if err != nil {
			select {
			case <-t.done:
				return
			default:
				continue
			}
		}
		go t.forward(localConn, remoteAddr)
	}
}

func (t *SSHTunnel) forward(localConn net.Conn, remoteAddr string) {
	defer localConn.Close()
	remoteConn, err := t.client.Dial("tcp", remoteAddr)
	if err != nil {
		return
	}
	defer remoteConn.Close()
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(remoteConn, localConn)
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(localConn, remoteConn)
	}()
	wg.Wait()
}

func DatabaseURLForTunnel(databaseURL string, localAddr string) (string, error) {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return "", err
	}
	host, port, err := net.SplitHostPort(localAddr)
	if err != nil {
		return "", err
	}
	if host == "" || host == "::" {
		host = "127.0.0.1"
	}
	parsed.Host = net.JoinHostPort(host, port)
	return parsed.String(), nil
}

func DatabaseRemoteAddr(databaseURL string, fallback string) (string, error) {
	if strings.TrimSpace(fallback) != "" {
		return strings.TrimSpace(fallback), nil
	}
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return "", err
	}
	host := parsed.Hostname()
	port := parsed.Port()
	if port == "" {
		port = "5432"
	}
	if host == "" {
		return "", fmt.Errorf("database url host is empty")
	}
	return net.JoinHostPort(host, port), nil
}

func ParseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on", "enabled":
		return true
	default:
		return false
	}
}

func sshAuthMethods(cfg SSHTunnelConfig) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if strings.TrimSpace(cfg.Password) != "" {
		methods = append(methods, ssh.Password(cfg.Password))
	}
	if strings.TrimSpace(cfg.PrivateKeyPath) != "" {
		key, err := os.ReadFile(strings.TrimSpace(cfg.PrivateKeyPath))
		if err != nil {
			return nil, fmt.Errorf("read ssh private key: %w", err)
		}
		var signer ssh.Signer
		if strings.TrimSpace(cfg.PrivateKeyPassphrase) != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(key, []byte(cfg.PrivateKeyPassphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(key)
		}
		if err != nil {
			return nil, fmt.Errorf("parse ssh private key: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	return methods, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func NormalizePort(value string) string {
	port := strings.TrimSpace(value)
	if port == "" {
		return "22"
	}
	if _, err := strconv.Atoi(port); err != nil {
		return "22"
	}
	return port
}
