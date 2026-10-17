// Loopback example; integrate your application's authentication and live
// membership/number authorization before deploying the host.
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"github.com/gin-gonic/gin"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type appSession struct {
	expires time.Time
	userID  string
}
type app struct {
	client                  *polymorfa.MessagingClient
	username, password      [32]byte
	userID, session, origin string
	mu                      sync.Mutex
	sessions                map[string]appSession
}

func (a *app) authenticated(r *http.Request) (string, bool) {
	cookie, err := r.Cookie("polymorfa_example_session")
	if err != nil {
		return "", false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	s, ok := a.sessions[cookie.Value]
	if !ok || !time.Now().Before(s.expires) {
		delete(a.sessions, cookie.Value)
		return "", false
	}
	return s.userID, true
}
func (a *app) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		_, authenticated := a.authenticated(r)
		w.Header().Set("Cache-Control", "no-store")
		if err := page(authenticated).Render(r.Context(), w); err != nil {
			log.Print("Page rendering failed")
		}
	})
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("assets"))))
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("POST /api/polymorfa/token", a.token)
	mux.HandleFunc("GET /api/polymorfa/history/conversations", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := a.authenticated(r); !ok {
			http.Error(w, "Sign in required.", 401)
			return
		}
		writeJSON(w, map[string]any{"data": []any{}, "nextCursor": nil})
	})
	mux.HandleFunc("POST /api/polymorfa/connect", func(w http.ResponseWriter, r *http.Request) {
		if !a.originAllowed(w, r) {
			return
		}
		if _, ok := a.authenticated(r); !ok {
			http.Error(w, "Sign in required.", 401)
			return
		}
		result, err := a.client.QuickLinks().Create(r.Context(), polymorfa.CreateQuickLinkRequest{Purpose: "add_connection", Session: a.session, AddConnection: "linked_devices", ConnectionGoal: "hybrid"})
		if err != nil {
			http.Error(w, "Number connection is unavailable.", 502)
			return
		}
		writeJSON(w, result.Data)
	})
	return mux
}
func (a *app) originAllowed(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("Origin") != a.origin {
		http.Error(w, "Invalid request origin.", 403)
		return false
	}
	return true
}
func (a *app) login(w http.ResponseWriter, r *http.Request) {
	if !a.originAllowed(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Invalid sign-in request.", 400)
		return
	}
	username, password := sha256.Sum256([]byte(r.Form.Get("username"))), sha256.Sum256([]byte(r.Form.Get("password")))
	if subtle.ConstantTimeCompare(username[:], a.username[:])&subtle.ConstantTimeCompare(password[:], a.password[:]) != 1 {
		http.Error(w, "Sign-in failed.", 401)
		return
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		http.Error(w, "Sign-in unavailable.", 503)
		return
	}
	id := base64.RawURLEncoding.EncodeToString(token)
	a.mu.Lock()
	for key, value := range a.sessions {
		if !time.Now().Before(value.expires) {
			delete(a.sessions, key)
		}
	}
	if len(a.sessions) >= 128 {
		a.mu.Unlock()
		http.Error(w, "Too many sessions.", 429)
		return
	}
	a.sessions[id] = appSession{time.Now().Add(30 * time.Minute), a.userID}
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "polymorfa_example_session", Value: id, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 1800, Secure: strings.HasPrefix(a.origin, "https:")})
	a.respondWorkspace(w, r, true)
}
func (a *app) respondWorkspace(w http.ResponseWriter, r *http.Request, authenticated bool) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Header.Get("HX-Request") == "true" {
		if err := workspace(authenticated).Render(r.Context(), w); err != nil {
			log.Print("Workspace rendering failed")
		}
	} else {
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}
func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if !a.originAllowed(w, r) {
		return
	}
	if cookie, err := r.Cookie("polymorfa_example_session"); err == nil {
		a.mu.Lock()
		delete(a.sessions, cookie.Value)
		a.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: "polymorfa_example_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	a.respondWorkspace(w, r, false)
}
func (a *app) token(w http.ResponseWriter, r *http.Request) {
	if !a.originAllowed(w, r) {
		return
	}
	user, ok := a.authenticated(r)
	if !ok {
		http.Error(w, "Sign in required.", 401)
		return
	}
	ttl := 600
	result, err := a.client.ClientTokens().Mint(r.Context(), polymorfa.MintClientTokenRequest{EphemeralID: "example:" + user, Session: a.session, TTLSeconds: &ttl})
	if err != nil {
		http.Error(w, "Browser access is unavailable.", 502)
		return
	}
	token := result.Data.Data
	expiry, err := time.Parse(time.RFC3339, token.ExpiresAt)
	if err != nil || !strings.HasPrefix(token.Token, "pmfa_ct_") {
		http.Error(w, "Invalid browser grant response.", 502)
		return
	}
	writeJSON(w, map[string]any{"value": token.Token, "audience": "browser", "expiresAt": expiry.UnixMilli(), "scopes": []string{"read_messages", "connect_whatsapp"}, "grant": map[string]any{"session": a.session, "conversations": []any{}, "allow": []string{"read_messages", "connect_whatsapp"}}})
}
func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Print("Response serialization failed")
	}
}
func ginHandler(handler http.Handler) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	_ = router.SetTrustedProxies(nil)
	router.Any("/*path", gin.WrapH(handler))
	return router
}
func main() {
	mode := flag.String("framework", "nethttp", "nethttp or gin")
	port := flag.String("port", "8080", "Loopback port")
	flag.Parse()
	username, password, session := os.Getenv("EXAMPLE_APP_USERNAME"), os.Getenv("EXAMPLE_APP_PASSWORD"), os.Getenv("POLYMORFA_SESSION")
	if username == "" || password == "" || session == "" {
		log.Fatal("Configure the example account and authorized number.")
	}
	credential := polymorfa.Credential{Kind: polymorfa.ProjectToken, Value: os.Getenv("POLYMORFA_PROJECT_TOKEN")}
	base := os.Getenv("POLYMORFA_API_BASE_URL")
	if base == "" {
		base = "https://api.polymorfa.com"
	}
	client, err := polymorfa.NewMessagingClient(polymorfa.Config{Credential: credential, BaseURL: base})
	if err != nil {
		log.Fatal("Invalid API configuration.")
	}
	a := &app{client: client, username: sha256.Sum256([]byte(username)), password: sha256.Sum256([]byte(password)), session: session, userID: "local-app-user", origin: "http://127.0.0.1:" + *port, sessions: map[string]appSession{}}
	handler := a.routes()
	if *mode == "gin" {
		handler = ginHandler(handler)
	} else if *mode != "nethttp" {
		log.Fatal("Unknown framework.")
	}
	server := &http.Server{Addr: "127.0.0.1:" + *port, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Print("Open ", a.origin)
	if err = server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
