package polymorfa

import "encoding/json"

func validLifecycleFrame(f LifecycleFrame) bool {
	switch f.Type {
	case "ready", "pong":
		return true
	case "event":
		return f.Event != "" && f.CallID != "" && f.Timestamp != "" && len(f.Payload) > 0
	case "candidate":
		return f.CallID != "" && f.Candidate != nil && (f.ConnectionID == "" || connectionPattern.MatchString(f.ConnectionID))
	case "error":
		return f.Code != "" && f.Message != ""
	}
	return false
}
func validCallParticipant(p *CallParticipant) bool {
	return p != nil && p.ID != "" && (p.State == "invited" || p.State == "ringing" || p.State == "connected" || p.State == "left")
}
func parseMediaControlFrame(b []byte) (MediaControlFrame, bool) {
	var f MediaControlFrame
	var shape map[string]json.RawMessage
	if json.Unmarshal(b, &shape) != nil || json.Unmarshal(b, &f) != nil {
		return f, false
	}
	switch f.Type {
	case "media_state":
		return f, connectionPattern.MatchString(f.RequestID) && f.AudioMuted != nil && f.VideoEnabled != nil
	case "media_error":
		return f, connectionPattern.MatchString(f.RequestID) && f.Code != ""
	case "remote_media":
		return f, shape["audioMuted"] != nil
	case "ready":
		return f, f.SampleRate > 0 && f.Video != nil
	case "pong", "keyframe_request":
		return f, true
	case "reaction":
		validEmoji := false
		if f.Emoji != nil {
			for _, e := range []string{"", "👍", "❤️", "😂", "😮", "😢", "🙏"} {
				if *f.Emoji == e {
					validEmoji = true
				}
			}
		}
		return f, validEmoji && ((f.Self != nil && *f.Self && f.ParticipantID == "") || (f.Self == nil && groupPattern.MatchString(f.ParticipantID)))
	case "hand_state":
		return f, f.Raised != nil && f.Supported != nil
	case "participant_joined", "participant_state":
		return f, validCallParticipant(f.Participant)
	case "participant_left":
		return f, f.ParticipantID != ""
	case "video_source":
		return f, f.Source > 0 && ((validCallParticipant(f.Participant) && f.ConnectionID == "" && f.ConnectionParticipant == "") || (f.Participant == nil && connectionPattern.MatchString(f.ConnectionID)))
	case "video_source_removed":
		return f, f.Source > 0
	case "error":
		return f, f.Code != ""
	}
	return f, false
}
