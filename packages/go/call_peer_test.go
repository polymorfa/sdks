package polymorfa

import (
	"encoding/json"
	"testing"
)

func TestCallRecordDecodesPeerAndKeepsLegacyPseudonym(t *testing.T) {
	var current, legacy CallRecord
	if err := json.Unmarshal([]byte(`{"callId":"c","peer":{"id":"15550100","phoneNumber":"+15550100"},"peerRef":null}`), &current); err != nil {
		t.Fatal(err)
	}
	if current.Peer == nil || current.Peer.PhoneNumber == nil || *current.Peer.PhoneNumber != "+15550100" || current.Peer.ID == nil || *current.Peer.ID != "15550100" || current.PeerRef != nil {
		t.Fatalf("peer = %+v, peerRef = %v", current.Peer, current.PeerRef)
	}
	if err := json.Unmarshal([]byte(`{"callId":"c","peer":null,"peerRef":"old"}`), &legacy); err != nil {
		t.Fatal(err)
	}
	if legacy.Peer != nil || legacy.PeerRef == nil || *legacy.PeerRef != "old" {
		t.Fatalf("legacy peer = %+v, peerRef = %v", legacy.Peer, legacy.PeerRef)
	}
}
