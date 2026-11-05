package main

import (
	"context"
	"fmt"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	client, err := polymorfa.NewCallsClient(polymorfa.CallsClientConfig{Config: polymorfa.Config{Credential: polymorfa.Credential{Kind: polymorfa.OrganizationAPIKey, Value: os.Getenv("POLYMORFA_API_KEY")}}, Session: os.Getenv("POLYMORFA_SESSION"), Participant: "go-example"})
	if err != nil {
		log.Fatal("Set a valid API key and session: ", err)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	session, err := client.Follow(ctx, polymorfa.CallsFollowOptions{})
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		session.Close(cleanup)
	}()
	for {
		select {
		case <-session.Done():
			return
		case event := <-session.Events():
			if event.Type == "incoming" && event.Call != nil {
				go receive(ctx, event.Call)
			}
			if event.Error != nil {
				fmt.Printf("Calls event: %s\n", event.Type)
			}
		}
	}
}
func receive(ctx context.Context, call *polymorfa.Call) {
	exclusive := true
	if err := call.Answer(ctx, polymorfa.AcceptCallRequest{Exclusive: &exclusive}); err != nil {
		fmt.Println("Call could not be answered.")
		return
	}
	for {
		select {
		case <-call.Done():
			return
		case event := <-call.Events():
			if event.Type == "audio" {
				fmt.Printf("Received %d PCM samples\n", len(event.Audio))
			}
		}
	}
}
