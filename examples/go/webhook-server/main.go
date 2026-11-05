package main

import (
	"fmt"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	secret := os.Getenv("POLYMORFA_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("Set POLYMORFA_WEBHOOK_SECRET.")
	}
	handler := polymorfa.WebhookHandler(secret, 1<<20, func(r *http.Request, e polymorfa.WebhookEvent) error {
		payload, known, err := e.TypedPayload()
		if err != nil {
			return err
		}
		fmt.Printf("Verified event %s: %s (%T, known=%t)\n", e.ID, e.Event, payload, known)
		return nil
	})
	server := &http.Server{Addr: "127.0.0.1:8080", Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(server.ListenAndServe())
}
