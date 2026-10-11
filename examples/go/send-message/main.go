package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	polymorfa "github.com/polymorfa/sdks/packages/go"
)

func main() {
	client, err := polymorfa.NewMessagingClient(polymorfa.Config{Credential: polymorfa.Credential{Kind: polymorfa.OrganizationAPIKey, Value: os.Getenv("POLYMORFA_API_KEY")}})
	if err != nil {
		fail(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	session, phone := os.Getenv("POLYMORFA_SESSION"), os.Getenv("POLYMORFA_PHONE")
	if session == "" || phone == "" {
		fmt.Fprintln(os.Stderr, "Set POLYMORFA_SESSION and POLYMORFA_PHONE before sending.")
		os.Exit(1)
	}
	text := "Hello from Go"
	result, err := client.Messages().Send(ctx, session, polymorfa.SendMessageRequest{Conversation: polymorfa.ConversationReference{PhoneNumber: phone}, Content: polymorfa.MessageContent{Text: &text}})
	if err != nil {
		fail(err)
	}
	fmt.Printf("Message accepted: %s (request %s)\n", result.Data.Data.ID, result.Metadata.RequestID)
}
func fail(err error) {
	var api *polymorfa.Error
	if errors.As(err, &api) {
		fmt.Fprintf(os.Stderr, "%s: %s (request %s)\n", api.Kind, api.Message, api.RequestID)
	} else {
		fmt.Fprintln(os.Stderr, "The request failed.")
	}
	os.Exit(1)
}
